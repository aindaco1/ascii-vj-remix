use ascii_vj_remix_lib::media_engine::codec::Decoder;
use ascii_vj_remix_lib::media_engine::ffmpeg::{
    probe_video, spawn_rgb_reader, DecodeConfig, FfmpegBinaries, VideoProbe,
};
use ascii_vj_remix_lib::media_engine::frame_prep::RenderMode;
use ascii_vj_remix_lib::media_engine::pipeline::{
    checksum_hex, StreamPipelineConfig, StreamPipelineReader,
};
use serde::Serialize;
use std::env;
use std::error::Error;
use std::path::PathBuf;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeSessionPreviewSummary {
    source: PathBuf,
    probe: VideoProbe,
    decode: DecodeConfig,
    mode: u8,
    pixel: bool,
    cell_bytes: usize,
    requested_batch_size: usize,
    batch_count: usize,
    frame_count: usize,
    legacy_bytes: usize,
    adaptive_bytes: usize,
    adaptive_percent_of_legacy: f64,
    batches: Vec<NativeSessionBatchSummary>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeSessionBatchSummary {
    index: usize,
    frame_count: usize,
    first_frame: Option<usize>,
    last_frame: Option<usize>,
    adaptive_bytes: usize,
}

fn main() -> Result<(), Box<dyn Error>> {
    let mut args = env::args().skip(1);
    let Some(source) = args.next().map(PathBuf::from) else {
        eprintln!(
            "usage: cargo run --manifest-path src-tauri/Cargo.toml --example native_session_preview -- <video> [width] [height] [frames] [mode] [pixel] [batch]"
        );
        std::process::exit(2);
    };

    let width = parse_optional(args.next(), 160)?;
    let height = parse_optional(args.next(), 90)?;
    let max_frames = parse_optional(args.next(), 24)?;
    let mode_u8 = parse_optional(args.next(), 5u8)?;
    let pixel = parse_bool(args.next())?;
    let batch_size = parse_optional(args.next(), 4usize)?.clamp(1, 12);
    let mode = RenderMode::from_u8(mode_u8)?;
    if mode == RenderMode::Text && !pixel {
        return Err("native_session_preview requires color mode 2-5 unless pixel=true".into());
    }

    let binaries = FfmpegBinaries::from_env();
    let probe = probe_video(&binaries, &source)?;
    let decode = DecodeConfig::new(width, height, max_frames)?;
    let mut config = StreamPipelineConfig::new(source.clone(), decode.clone(), mode, pixel)?;
    config.verify_decode = false;

    let reader = spawn_rgb_reader(&binaries, &source, &decode)?;
    let mut pipeline = StreamPipelineReader::new(config.clone(), reader)?;
    let mut decoder = Decoder::new(config.cell_bytes())?;
    let mut batches = Vec::new();
    let mut frame_count = 0usize;
    let mut legacy_bytes = 0usize;
    let mut adaptive_bytes = 0usize;
    let mut expected_index = 0u32;

    loop {
        let mut batch_first = None;
        let mut batch_last = None;
        let mut batch_frames = 0usize;
        let mut batch_adaptive_bytes = 0usize;

        for _ in 0..batch_size {
            let Some(frame) = pipeline.read_next_encoded_frame()? else {
                break;
            };
            let decoded = decoder.decode(&frame.message)?;
            if decoded.frame_index != expected_index {
                return Err(format!(
                    "expected frame index {expected_index}, got {}",
                    decoded.frame_index
                )
                .into());
            }
            if checksum_hex(&decoded.frame) != frame.prepared_checksum {
                return Err(format!("decoded frame {} checksum mismatch", frame.index).into());
            }

            batch_first.get_or_insert(frame.index);
            batch_last = Some(frame.index);
            batch_frames += 1;
            batch_adaptive_bytes += frame.message.len();
            frame_count += 1;
            legacy_bytes += frame.raw_bytes;
            adaptive_bytes += frame.message.len();
            expected_index += 1;
        }

        if batch_frames == 0 {
            break;
        }

        batches.push(NativeSessionBatchSummary {
            index: batches.len(),
            frame_count: batch_frames,
            first_frame: batch_first,
            last_frame: batch_last,
            adaptive_bytes: batch_adaptive_bytes,
        });
    }

    let summary = NativeSessionPreviewSummary {
        source,
        probe,
        decode,
        mode: mode_u8,
        pixel,
        cell_bytes: config.cell_bytes(),
        requested_batch_size: batch_size,
        batch_count: batches.len(),
        frame_count,
        legacy_bytes,
        adaptive_bytes,
        adaptive_percent_of_legacy: if legacy_bytes == 0 {
            0.0
        } else {
            100.0 * adaptive_bytes as f64 / legacy_bytes as f64
        },
        batches,
    };

    println!("{}", serde_json::to_string_pretty(&summary)?);
    Ok(())
}

fn parse_optional<T>(value: Option<String>, default: T) -> Result<T, Box<dyn Error>>
where
    T: std::str::FromStr,
    T::Err: Error + 'static,
{
    value
        .map(|value| value.parse::<T>())
        .transpose()
        .map(|value| value.unwrap_or(default))
        .map_err(Into::into)
}

fn parse_bool(value: Option<String>) -> Result<bool, Box<dyn Error>> {
    match value.as_deref().map(str::to_ascii_lowercase).as_deref() {
        None | Some("0") | Some("false") | Some("no") | Some("off") => Ok(false),
        Some("1") | Some("true") | Some("yes") | Some("on") | Some("pixel") => Ok(true),
        Some(value) => Err(format!("invalid boolean value: {value}").into()),
    }
}
