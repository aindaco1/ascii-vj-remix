use asciline_remix_lib::media_engine::codec::Decoder;
use serde::Deserialize;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VectorMeta {
    cell_bytes: usize,
    nframes: usize,
    legacy_bytes: usize,
    adaptive_bytes: usize,
}

fn read_chunks(bytes: &[u8]) -> Result<Vec<&[u8]>, String> {
    let mut chunks = Vec::new();
    let mut offset = 0;

    while offset + 4 <= bytes.len() {
        let len = u32::from_be_bytes([
            bytes[offset],
            bytes[offset + 1],
            bytes[offset + 2],
            bytes[offset + 3],
        ]) as usize;
        offset += 4;
        if offset + len > bytes.len() {
            return Err(format!(
                "chunk length {len} at offset {offset} exceeds file length {}",
                bytes.len()
            ));
        }
        chunks.push(&bytes[offset..offset + len]);
        offset += len;
    }

    if offset != bytes.len() {
        return Err(format!(
            "trailing {} byte(s) after final chunk",
            bytes.len() - offset
        ));
    }

    Ok(chunks)
}

fn check_vector_dir(dir: &Path) -> Result<bool, String> {
    let meta_path = dir.join("meta.json");
    let adaptive_path = dir.join("adaptive.bin");
    let truth_path = dir.join("truth.bin");
    let name = dir
        .file_name()
        .and_then(|entry| entry.to_str())
        .unwrap_or("<unknown>");

    let meta: VectorMeta =
        serde_json::from_slice(&fs::read(&meta_path).map_err(|error| {
            format!("{}: failed to read meta.json: {error}", meta_path.display())
        })?)
        .map_err(|error| {
            format!(
                "{}: failed to parse meta.json: {error}",
                meta_path.display()
            )
        })?;

    let adaptive_bytes = fs::read(&adaptive_path).map_err(|error| {
        format!(
            "{}: failed to read adaptive.bin: {error}",
            adaptive_path.display()
        )
    })?;
    let truth_bytes = fs::read(&truth_path).map_err(|error| {
        format!(
            "{}: failed to read truth.bin: {error}",
            truth_path.display()
        )
    })?;
    let messages = read_chunks(&adaptive_bytes)?;
    let truth = read_chunks(&truth_bytes)?;

    if messages.len() != truth.len() {
        return Err(format!(
            "{name}: message count {} did not match truth count {}",
            messages.len(),
            truth.len()
        ));
    }
    if meta.nframes != messages.len() {
        return Err(format!(
            "{name}: meta nframes {} did not match message count {}",
            meta.nframes,
            messages.len()
        ));
    }

    let mut decoder = Decoder::new(meta.cell_bytes).map_err(|error| error.to_string())?;
    let mut mismatches = 0usize;
    let mut first_bad: Option<String> = None;

    for (idx, (message, expected)) in messages.iter().zip(truth.iter()).enumerate() {
        let decoded = decoder
            .decode(message)
            .map_err(|error| format!("{name}: frame {idx}: {error}"))?;
        if decoded.frame.len() != expected.len() {
            mismatches += 1;
            first_bad.get_or_insert_with(|| {
                format!(
                    "frame={idx} len expected={} got={}",
                    expected.len(),
                    decoded.frame.len()
                )
            });
            continue;
        }

        if let Some(byte) = decoded
            .frame
            .iter()
            .zip(expected.iter())
            .position(|(actual, wanted)| actual != wanted)
        {
            mismatches += 1;
            first_bad.get_or_insert_with(|| {
                format!(
                    "frame={idx} byte={byte} expected={} got={}",
                    expected[byte], decoded.frame[byte]
                )
            });
        }
    }

    let pct = 100.0 * meta.adaptive_bytes as f64 / meta.legacy_bytes as f64;
    let status = if mismatches == 0 {
        "PASS bit-exact".to_string()
    } else {
        format!("FAIL ({mismatches})")
    };
    println!(
        "{name:<20} {:>3} frames  {status:<16} wire {pct:.1}% of legacy{}",
        messages.len(),
        first_bad
            .as_ref()
            .map(|bad| format!("  firstBad={bad}"))
            .unwrap_or_default()
    );

    Ok(mismatches == 0)
}

fn vector_dirs(root: &Path) -> Result<Vec<PathBuf>, String> {
    let mut dirs = Vec::new();
    for entry in fs::read_dir(root).map_err(|error| {
        format!(
            "{}: failed to read vector directory: {error}",
            root.display()
        )
    })? {
        let path = entry
            .map_err(|error| {
                format!(
                    "{}: failed to read directory entry: {error}",
                    root.display()
                )
            })?
            .path();
        if path.is_dir() && path.join("meta.json").is_file() {
            dirs.push(path);
        }
    }
    dirs.sort();
    Ok(dirs)
}

fn main() {
    let root = std::env::args()
        .nth(1)
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("experiments/vectors"));

    let dirs = match vector_dirs(&root) {
        Ok(dirs) if !dirs.is_empty() => dirs,
        Ok(_) => {
            eprintln!(
                "{} does not contain vector fixtures. Run experiments/gen_vectors.py first.",
                root.display()
            );
            std::process::exit(2);
        }
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(2);
        }
    };

    println!("Decoding with Rust codec example, comparing to ground truth:\n");
    let mut all_pass = true;
    for dir in dirs {
        match check_vector_dir(&dir) {
            Ok(pass) => all_pass = pass && all_pass,
            Err(error) => {
                eprintln!("{error}");
                all_pass = false;
            }
        }
    }

    println!(
        "\n{}",
        if all_pass {
            "ALL VECTORS BIT-EXACT"
        } else {
            "SOME VECTORS FAILED"
        }
    );
    std::process::exit(if all_pass { 0 } else { 1 });
}
