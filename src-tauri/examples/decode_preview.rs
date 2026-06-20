use asciline_remix_lib::media_engine::ffmpeg::{
    decode_rgb_preview, probe_video, DecodeConfig, FfmpegBinaries,
};
use asciline_remix_lib::media_engine::frame_prep::{
    prepare_ascii_color_frame, prepare_pixel_frame, RenderMode, RgbFrame,
};
use serde::Serialize;
use std::env;
use std::error::Error;
use std::path::PathBuf;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct FrameSummary {
    index: usize,
    bytes: usize,
    checksum: String,
    ascii_color_bytes: usize,
    ascii_color_checksum: String,
    pixel_bytes: usize,
    pixel_checksum: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PreviewSummary {
    source: PathBuf,
    ffmpeg: PathBuf,
    ffprobe: PathBuf,
    probe: asciline_remix_lib::media_engine::ffmpeg::VideoProbe,
    decode: DecodeConfig,
    frame_count: usize,
    frames: Vec<FrameSummary>,
}

fn main() -> Result<(), Box<dyn Error>> {
    let mut args = env::args().skip(1);
    let Some(source) = args.next().map(PathBuf::from) else {
        eprintln!(
            "usage: cargo run --manifest-path src-tauri/Cargo.toml --example decode_preview -- <video> [width] [height] [frames]"
        );
        std::process::exit(2);
    };

    let width = parse_optional(args.next(), 160)?;
    let height = parse_optional(args.next(), 90)?;
    let max_frames = parse_optional(args.next(), 3)?;
    let decode = DecodeConfig::new(width, height, max_frames)?;
    let binaries = FfmpegBinaries::from_env();

    let probe = probe_video(&binaries, &source)?;
    let frames = decode_rgb_preview(&binaries, &source, &decode)?;
    let summary = PreviewSummary {
        source,
        ffmpeg: binaries.ffmpeg,
        ffprobe: binaries.ffprobe,
        probe,
        decode,
        frame_count: frames.len(),
        frames: frames
            .iter()
            .map(|frame| {
                let rgb = RgbFrame::new(frame.width, frame.height, frame.data.clone())
                    .expect("validated by decoder");
                let ascii = prepare_ascii_color_frame(&rgb, RenderMode::TrueColor)
                    .expect("true-color prep is valid");
                let pixel = prepare_pixel_frame(&rgb);
                FrameSummary {
                    index: frame.index,
                    bytes: frame.data.len(),
                    checksum: checksum_hex(&frame.data),
                    ascii_color_bytes: ascii.data.len(),
                    ascii_color_checksum: checksum_hex(&ascii.data),
                    pixel_bytes: pixel.data.len(),
                    pixel_checksum: checksum_hex(&pixel.data),
                }
            })
            .collect(),
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

fn checksum_hex(bytes: &[u8]) -> String {
    let mut hash = 0xcbf2_9ce4_8422_2325u64;
    for byte in bytes {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("{hash:016x}")
}
