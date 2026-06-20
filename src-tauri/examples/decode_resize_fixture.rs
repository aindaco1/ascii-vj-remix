use asciline_remix_lib::media_engine::ffmpeg::{
    decode_rgb_preview, probe_video, DecodeConfig, FfmpegBinaries,
};
use asciline_remix_lib::media_engine::frame_prep::{
    prepare_ascii_color_frame, prepare_pixel_frame, RenderMode, RgbFrame,
};
use serde::Serialize;
use std::env;
use std::error::Error;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct FixtureMeta {
    generator: &'static str,
    video: PathBuf,
    width: u32,
    height: u32,
    requested_frames: usize,
    frames: usize,
    rgb_frame_bytes: usize,
    ascii_frame_bytes: usize,
    source_fps: Option<f64>,
    source_width: u32,
    source_height: u32,
}

fn main() -> Result<(), Box<dyn Error>> {
    let mut args = env::args().skip(1);
    let Some(video) = args.next().map(PathBuf::from) else {
        eprintln!(
            "usage: cargo run --manifest-path src-tauri/Cargo.toml --example decode_resize_fixture -- <video> <width> <height> <frames> <out-dir>"
        );
        std::process::exit(2);
    };
    let Some(width) = args.next().map(|value| value.parse::<u32>()).transpose()? else {
        eprintln!("missing width");
        std::process::exit(2);
    };
    let Some(height) = args.next().map(|value| value.parse::<u32>()).transpose()? else {
        eprintln!("missing height");
        std::process::exit(2);
    };
    let Some(frames) = args
        .next()
        .map(|value| value.parse::<usize>())
        .transpose()?
    else {
        eprintln!("missing frames");
        std::process::exit(2);
    };
    let Some(out) = args.next().map(PathBuf::from) else {
        eprintln!("missing output directory");
        std::process::exit(2);
    };

    write_outputs(&video, width, height, frames, &out)?;
    println!("{}", out.display());
    Ok(())
}

fn write_outputs(
    video: &Path,
    width: u32,
    height: u32,
    frames: usize,
    out: &Path,
) -> Result<(), Box<dyn Error>> {
    fs::create_dir_all(out)?;
    let binaries = FfmpegBinaries::from_env();
    let probe = probe_video(&binaries, video)?;
    let decode = DecodeConfig::new(width, height, frames)?;
    let decoded = decode_rgb_preview(&binaries, video, &decode)?;
    let mut rgb = Vec::new();
    let mut pixel = Vec::new();
    let mut ascii = Vec::new();

    for frame in &decoded {
        let rgb_frame = RgbFrame::new(frame.width, frame.height, frame.data.clone())?;
        rgb.extend_from_slice(&frame.data);
        pixel.extend_from_slice(&prepare_pixel_frame(&rgb_frame).data);
        ascii
            .extend_from_slice(&prepare_ascii_color_frame(&rgb_frame, RenderMode::TrueColor)?.data);
    }

    fs::write(out.join("rgb.bin"), rgb)?;
    fs::write(out.join("pixel.bin"), pixel)?;
    fs::write(out.join("ascii_m5.bin"), ascii)?;
    fs::write(
        out.join("meta.json"),
        serde_json::to_string_pretty(&FixtureMeta {
            generator: "rust-ffmpeg",
            video: video.to_path_buf(),
            width,
            height,
            requested_frames: frames,
            frames: decoded.len(),
            rgb_frame_bytes: width as usize * height as usize * 3,
            ascii_frame_bytes: width as usize * height as usize * 4,
            source_fps: probe.fps,
            source_width: probe.width,
            source_height: probe.height,
        })? + "\n",
    )?;
    Ok(())
}
