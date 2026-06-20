use asciline_remix_lib::media_engine::frame_prep::{
    prepare_ascii_color_frame, prepare_pixel_frame, prepare_text_frame, RenderMode, RgbFrame,
};
use serde::Serialize;
use std::env;
use std::error::Error;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct FixtureMeta {
    width: u32,
    height: u32,
    generator: &'static str,
}

fn main() -> Result<(), Box<dyn Error>> {
    let mut args = env::args().skip(1);
    let Some(input) = args.next().map(PathBuf::from) else {
        eprintln!(
            "usage: cargo run --manifest-path src-tauri/Cargo.toml --example frame_prep_fixture -- <input.rgb> <width> <height> <out-dir>"
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
    let Some(out) = args.next().map(PathBuf::from) else {
        eprintln!("missing output directory");
        std::process::exit(2);
    };

    write_outputs(&input, width, height, &out)?;
    println!("{}", out.display());
    Ok(())
}

fn write_outputs(input: &Path, width: u32, height: u32, out: &Path) -> Result<(), Box<dyn Error>> {
    fs::create_dir_all(out)?;
    let rgb = RgbFrame::new(width, height, fs::read(input)?)?;

    fs::write(out.join("pixel.bin"), prepare_pixel_frame(&rgb).data)?;
    fs::write(out.join("text.txt"), prepare_text_frame(&rgb))?;

    for mode in [
        RenderMode::Color512,
        RenderMode::Color32k,
        RenderMode::Color262k,
        RenderMode::TrueColor,
    ] {
        let prepared = prepare_ascii_color_frame(&rgb, mode)?;
        fs::write(
            out.join(format!("ascii_m{}.bin", mode as u8)),
            prepared.data,
        )?;
    }

    let meta = FixtureMeta {
        width,
        height,
        generator: "rust-frame-prep",
    };
    fs::write(
        out.join("meta.json"),
        serde_json::to_string_pretty(&meta)? + "\n",
    )?;
    Ok(())
}
