use serde::Serialize;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, Runtime};

const PNG_SIGNATURE: &[u8; 8] = b"\x89PNG\r\n\x1a\n";
const MAX_SCREENSHOT_BYTES: usize = 48 * 1024 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotSaveResult {
    pub file_name: String,
}

fn validate_png(bytes: &[u8]) -> Result<(), String> {
    if bytes.len() < PNG_SIGNATURE.len() || &bytes[..PNG_SIGNATURE.len()] != PNG_SIGNATURE {
        return Err("Screenshot data is not a PNG".to_string());
    }
    if bytes.len() > MAX_SCREENSHOT_BYTES {
        return Err("Screenshot is larger than the 48 MB limit".to_string());
    }
    Ok(())
}

fn screenshot_stem() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_millis());
    format!("ASCII VJ Remix Screenshot {millis}")
}

fn write_unique_png(desktop_dir: &Path, bytes: &[u8]) -> Result<PathBuf, String> {
    validate_png(bytes)?;
    let stem = screenshot_stem();
    for suffix in 0..1000 {
        let file_name = if suffix == 0 {
            format!("{stem}.png")
        } else {
            format!("{stem} {suffix}.png")
        };
        let path = desktop_dir.join(file_name);
        match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(mut file) => {
                file.write_all(bytes)
                    .map_err(|error| format!("Could not write screenshot: {error}"))?;
                file.sync_all()
                    .map_err(|error| format!("Could not finish screenshot: {error}"))?;
                return Ok(path);
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(format!("Could not create screenshot: {error}")),
        }
    }
    Err("Could not choose a unique screenshot name".to_string())
}

#[tauri::command]
pub fn save_screenshot_to_desktop<R: Runtime>(
    app: AppHandle<R>,
    png_bytes: Vec<u8>,
) -> Result<ScreenshotSaveResult, String> {
    let desktop_dir = app
        .path()
        .desktop_dir()
        .map_err(|error| format!("Could not resolve the Desktop folder: {error}"))?;
    let path = write_unique_png(&desktop_dir, &png_bytes)?;
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("ASCII VJ Remix Screenshot.png")
        .to_string();
    Ok(ScreenshotSaveResult { file_name })
}

#[cfg(test)]
mod tests {
    use super::{validate_png, write_unique_png, MAX_SCREENSHOT_BYTES, PNG_SIGNATURE};
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn accepts_bounded_png_data() {
        let mut bytes = PNG_SIGNATURE.to_vec();
        bytes.extend_from_slice(b"test");
        assert!(validate_png(&bytes).is_ok());
    }

    #[test]
    fn rejects_non_png_and_oversized_data() {
        assert!(validate_png(b"not png").is_err());
        let mut bytes = vec![0; MAX_SCREENSHOT_BYTES + 1];
        bytes[..PNG_SIGNATURE.len()].copy_from_slice(PNG_SIGNATURE);
        assert!(validate_png(&bytes).is_err());
    }

    #[test]
    fn writes_unique_png_files_without_overwriting() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |duration| duration.as_nanos());
        let dir = std::env::temp_dir().join(format!("asciline-screenshot-test-{nonce}"));
        fs::create_dir_all(&dir).expect("create screenshot test directory");
        let mut bytes = PNG_SIGNATURE.to_vec();
        bytes.extend_from_slice(b"test");

        let first = write_unique_png(&dir, &bytes).expect("write first screenshot");
        let second = write_unique_png(&dir, &bytes).expect("write second screenshot");

        assert_ne!(first, second);
        assert_eq!(fs::read(first).expect("read first screenshot"), bytes);
        assert_eq!(fs::read(second).expect("read second screenshot"), bytes);
        fs::remove_dir_all(dir).expect("remove screenshot test directory");
    }
}
