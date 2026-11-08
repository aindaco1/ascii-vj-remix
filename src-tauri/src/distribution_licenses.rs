use std::io::Read;
use tauri::{AppHandle, Manager};

/// A fixed bundled document only; no caller-supplied path or network access.
#[tauri::command]
pub fn read_distribution_licenses(app: AppHandle) -> Result<String, String> {
    let path = app.path().resource_dir().map_err(|_| "License resources unavailable")?
        .join("resources/licenses/index.html");
    let file = std::fs::File::open(path).map_err(|_| "License document unavailable")?;
    let mut html = String::new();
    file.take(32 * 1024 * 1024 + 1).read_to_string(&mut html)
        .map_err(|_| "License document unreadable")?;
    if html.len() > 32 * 1024 * 1024 { return Err("License document exceeds limit".into()); }
    Ok(html)
}
