use crate::media_engine::codec::{CodecError, Decoder, Encoder, DEFAULT_LEVEL};
use crate::media_engine::ffmpeg::{
    probe_video, spawn_rgb_reader, DecodeConfig, DecodedRgbFrame, FfmpegBinaries, FfmpegError,
    FfmpegRgbFrameReader, VideoProbe,
};
use crate::media_engine::frame_prep::{
    prepare_ascii_color_frame, prepare_pixel_frame, FramePrepError, PreparedFrame, RenderMode,
    RgbFrame,
};
use serde::Serialize;
use std::fmt;
use std::path::PathBuf;

#[derive(Debug)]
pub enum MediaPipelineError {
    Ffmpeg(FfmpegError),
    FramePrep(FramePrepError),
    Codec(CodecError),
    TextModeUnsupported,
    DecodeVerificationFailed { frame_index: usize },
}

impl fmt::Display for MediaPipelineError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Ffmpeg(error) => write!(f, "{error}"),
            Self::FramePrep(error) => write!(f, "{error}"),
            Self::Codec(error) => write!(f, "{error}"),
            Self::TextModeUnsupported => {
                write!(
                    f,
                    "stream pipeline requires color mode 2-5 unless pixel=true"
                )
            }
            Self::DecodeVerificationFailed { frame_index } => {
                write!(f, "encoded frame {frame_index} failed decode verification")
            }
        }
    }
}

impl std::error::Error for MediaPipelineError {}

impl From<FfmpegError> for MediaPipelineError {
    fn from(error: FfmpegError) -> Self {
        Self::Ffmpeg(error)
    }
}

impl From<FramePrepError> for MediaPipelineError {
    fn from(error: FramePrepError) -> Self {
        Self::FramePrep(error)
    }
}

impl From<CodecError> for MediaPipelineError {
    fn from(error: CodecError) -> Self {
        Self::Codec(error)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StreamPipelineConfig {
    pub source: PathBuf,
    pub decode: DecodeConfig,
    pub mode: RenderMode,
    pub pixel: bool,
    pub codec_level: u32,
    pub codec_tolerance: u8,
    pub verify_decode: bool,
}

impl StreamPipelineConfig {
    pub fn new(
        source: impl Into<PathBuf>,
        decode: DecodeConfig,
        mode: RenderMode,
        pixel: bool,
    ) -> Result<Self, MediaPipelineError> {
        if mode == RenderMode::Text && !pixel {
            return Err(MediaPipelineError::TextModeUnsupported);
        }

        Ok(Self {
            source: source.into(),
            decode,
            mode,
            pixel,
            codec_level: DEFAULT_LEVEL,
            codec_tolerance: 0,
            verify_decode: true,
        })
    }

    pub fn cell_bytes(&self) -> usize {
        if self.pixel {
            3
        } else {
            4
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EncodedFrameSummary {
    pub index: usize,
    pub raw_bytes: usize,
    pub adaptive_bytes: usize,
    pub tag: u8,
    pub prepared_checksum: String,
    pub message_checksum: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EncodedStreamFrame {
    pub index: usize,
    pub raw_bytes: usize,
    pub tag: u8,
    pub prepared_checksum: String,
    pub message: Vec<u8>,
}

#[derive(Debug)]
pub struct StreamPipelineReader {
    config: StreamPipelineConfig,
    reader: FfmpegRgbFrameReader,
    encoder: Encoder,
    decoder: Option<Decoder>,
}

impl StreamPipelineReader {
    pub fn new(
        config: StreamPipelineConfig,
        reader: FfmpegRgbFrameReader,
    ) -> Result<Self, MediaPipelineError> {
        let cell_bytes = config.cell_bytes();
        let encoder =
            Encoder::with_options(cell_bytes, config.codec_level, config.codec_tolerance)?;
        let decoder = if config.verify_decode {
            Some(Decoder::new(cell_bytes)?)
        } else {
            None
        };

        Ok(Self {
            config,
            reader,
            encoder,
            decoder,
        })
    }

    pub fn read_next_encoded_frame(
        &mut self,
    ) -> Result<Option<EncodedStreamFrame>, MediaPipelineError> {
        let Some(frame) = self.reader.read_next_frame()? else {
            return Ok(None);
        };
        encode_decoded_frame(
            &self.config,
            &mut self.encoder,
            self.decoder.as_mut(),
            &frame,
        )
        .map(Some)
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamPipelineSummary {
    pub source: PathBuf,
    pub ffmpeg: PathBuf,
    pub ffprobe: PathBuf,
    pub probe: VideoProbe,
    pub decode: DecodeConfig,
    pub mode: u8,
    pub pixel: bool,
    pub cell_bytes: usize,
    pub frame_count: usize,
    pub legacy_bytes: usize,
    pub adaptive_bytes: usize,
    pub adaptive_percent_of_legacy: f64,
    pub frames: Vec<EncodedFrameSummary>,
}

pub fn prepare_stream_frame(
    frame: &RgbFrame,
    mode: RenderMode,
    pixel: bool,
) -> Result<PreparedFrame, MediaPipelineError> {
    if pixel {
        Ok(prepare_pixel_frame(frame))
    } else {
        Ok(prepare_ascii_color_frame(frame, mode)?)
    }
}

pub fn run_stream_pipeline(
    binaries: &FfmpegBinaries,
    config: &StreamPipelineConfig,
) -> Result<StreamPipelineSummary, MediaPipelineError> {
    let probe = probe_video(binaries, &config.source)?;
    let reader = spawn_rgb_reader(binaries, &config.source, &config.decode)?;
    let mut pipeline = StreamPipelineReader::new(config.clone(), reader)?;
    let mut frames = Vec::new();

    while let Some(frame) = pipeline.read_next_encoded_frame()? {
        frames.push(frame);
    }

    Ok(summary_from_encoded_frames(binaries, config, probe, frames))
}

pub fn summarize_decoded_frames(
    binaries: &FfmpegBinaries,
    config: &StreamPipelineConfig,
    probe: VideoProbe,
    frames: Vec<DecodedRgbFrame>,
) -> Result<StreamPipelineSummary, MediaPipelineError> {
    let mut encoder = Encoder::with_options(
        config.cell_bytes(),
        config.codec_level,
        config.codec_tolerance,
    )?;
    let mut decoder = if config.verify_decode {
        Some(Decoder::new(config.cell_bytes())?)
    } else {
        None
    };
    let mut encoded_frames = Vec::with_capacity(frames.len());

    for frame in &frames {
        encoded_frames.push(encode_decoded_frame(
            config,
            &mut encoder,
            decoder.as_mut(),
            frame,
        )?);
    }

    Ok(summary_from_encoded_frames(
        binaries,
        config,
        probe,
        encoded_frames,
    ))
}

fn encode_decoded_frame(
    config: &StreamPipelineConfig,
    encoder: &mut Encoder,
    decoder: Option<&mut Decoder>,
    frame: &DecodedRgbFrame,
) -> Result<EncodedStreamFrame, MediaPipelineError> {
    let rgb = RgbFrame::new(frame.width, frame.height, frame.data.clone())?;
    let prepared = prepare_stream_frame(&rgb, config.mode, config.pixel)?;
    let message = encoder.encode(&prepared.data, frame.index as u32)?;

    if let Some(decoder) = decoder {
        let decoded = decoder.decode(&message)?;
        if decoded.frame != prepared.data {
            return Err(MediaPipelineError::DecodeVerificationFailed {
                frame_index: frame.index,
            });
        }
    }

    Ok(EncodedStreamFrame {
        index: frame.index,
        raw_bytes: 4 + prepared.data.len(),
        tag: message[4],
        prepared_checksum: checksum_hex(&prepared.data),
        message,
    })
}

fn summary_from_encoded_frames(
    binaries: &FfmpegBinaries,
    config: &StreamPipelineConfig,
    probe: VideoProbe,
    frames: Vec<EncodedStreamFrame>,
) -> StreamPipelineSummary {
    let legacy_bytes = frames.iter().map(|frame| frame.raw_bytes).sum();
    let adaptive_bytes = frames.iter().map(|frame| frame.message.len()).sum();
    let summaries = frames
        .iter()
        .map(|frame| EncodedFrameSummary {
            index: frame.index,
            raw_bytes: frame.raw_bytes,
            adaptive_bytes: frame.message.len(),
            tag: frame.tag,
            prepared_checksum: frame.prepared_checksum.clone(),
            message_checksum: checksum_hex(&frame.message),
        })
        .collect::<Vec<_>>();

    StreamPipelineSummary {
        source: config.source.clone(),
        ffmpeg: binaries.ffmpeg.clone(),
        ffprobe: binaries.ffprobe.clone(),
        probe,
        decode: config.decode.clone(),
        mode: config.mode as u8,
        pixel: config.pixel,
        cell_bytes: config.cell_bytes(),
        frame_count: summaries.len(),
        legacy_bytes,
        adaptive_bytes,
        adaptive_percent_of_legacy: if legacy_bytes == 0 {
            0.0
        } else {
            100.0 * adaptive_bytes as f64 / legacy_bytes as f64
        },
        frames: summaries,
    }
}

pub fn checksum_hex(bytes: &[u8]) -> String {
    let mut hash = 0xcbf2_9ce4_8422_2325u64;
    for byte in bytes {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("{hash:016x}")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rgb_frame(index: usize, rgb: &[u8]) -> DecodedRgbFrame {
        DecodedRgbFrame {
            index,
            width: 2,
            height: 1,
            data: rgb.to_vec(),
        }
    }

    #[test]
    fn rejects_text_mode_without_pixel_mode() {
        let decode = DecodeConfig::new(2, 1, 1).unwrap();
        let err =
            StreamPipelineConfig::new("demo.mp4", decode, RenderMode::Text, false).unwrap_err();
        assert!(matches!(err, MediaPipelineError::TextModeUnsupported));
    }

    #[test]
    fn summarizes_ascii_color_frames_and_verifies_codec() {
        let decode = DecodeConfig::new(2, 1, 2).unwrap();
        let config =
            StreamPipelineConfig::new("demo.mp4", decode, RenderMode::TrueColor, false).unwrap();
        let probe = VideoProbe {
            path: PathBuf::from("demo.mp4"),
            width: 2,
            height: 1,
            fps: Some(24.0),
            duration_seconds: Some(1.0),
            codec_name: Some("fixture".to_string()),
            pixel_format: Some("rgb24".to_string()),
        };
        let summary = summarize_decoded_frames(
            &FfmpegBinaries::with_paths("ffmpeg", "ffprobe"),
            &config,
            probe,
            vec![
                rgb_frame(0, &[0, 0, 0, 255, 255, 255]),
                rgb_frame(1, &[0, 0, 0, 252, 252, 252]),
            ],
        )
        .unwrap();

        assert_eq!(summary.cell_bytes, 4);
        assert_eq!(summary.frame_count, 2);
        assert_eq!(summary.legacy_bytes, 24);
        assert!(summary.adaptive_bytes > 0);
        assert_eq!(summary.frames.len(), 2);
    }

    #[test]
    fn summarizes_pixel_frames() {
        let decode = DecodeConfig::new(2, 1, 1).unwrap();
        let config = StreamPipelineConfig::new("demo.mp4", decode, RenderMode::Text, true).unwrap();
        let probe = VideoProbe {
            path: PathBuf::from("demo.mp4"),
            width: 2,
            height: 1,
            fps: Some(24.0),
            duration_seconds: Some(1.0),
            codec_name: Some("fixture".to_string()),
            pixel_format: Some("rgb24".to_string()),
        };
        let summary = summarize_decoded_frames(
            &FfmpegBinaries::with_paths("ffmpeg", "ffprobe"),
            &config,
            probe,
            vec![rgb_frame(0, &[1, 2, 3, 10, 20, 30])],
        )
        .unwrap();

        assert_eq!(summary.cell_bytes, 3);
        assert_eq!(summary.legacy_bytes, 10);
    }
}
