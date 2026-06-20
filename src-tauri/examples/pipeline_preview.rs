use asciline_remix_lib::media_engine::ffmpeg::{DecodeConfig, FfmpegBinaries};
use asciline_remix_lib::media_engine::frame_prep::RenderMode;
use asciline_remix_lib::media_engine::pipeline::{run_stream_pipeline, StreamPipelineConfig};
use std::env;
use std::error::Error;
use std::path::PathBuf;

fn main() -> Result<(), Box<dyn Error>> {
    let mut args = env::args().skip(1);
    let Some(source) = args.next().map(PathBuf::from) else {
        eprintln!(
            "usage: cargo run --manifest-path src-tauri/Cargo.toml --example pipeline_preview -- <video> [width] [height] [frames] [mode] [pixel]"
        );
        std::process::exit(2);
    };

    let width = parse_optional(args.next(), 160)?;
    let height = parse_optional(args.next(), 90)?;
    let max_frames = parse_optional(args.next(), 12)?;
    let mode_u8 = parse_optional(args.next(), 5u8)?;
    let pixel = parse_bool(args.next())?;
    let mode = RenderMode::from_u8(mode_u8)?;
    if mode == RenderMode::Text && !pixel {
        return Err("pipeline_preview requires color mode 2-5 unless pixel=true".into());
    }

    let binaries = FfmpegBinaries::from_env();
    let decode = DecodeConfig::new(width, height, max_frames)?;
    let config = StreamPipelineConfig::new(source, decode, mode, pixel)?;
    let summary = run_stream_pipeline(&binaries, &config)?;

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
