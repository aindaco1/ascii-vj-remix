//! Opt-in private updates. Installed rendering/media never consult this module.
//! The release build pins the endpoint; keys and tokens stay out of web storage.
use reqwest::{
    header::{HeaderMap, HeaderValue, AUTHORIZATION},
    Url,
};
use serde::{Deserialize, Serialize};
use std::{sync::Mutex, time::Duration};
use tauri::{Emitter, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};

#[cfg(target_os = "macos")]
static KEYCHAIN_ACCESS: Mutex<()> = Mutex::new(());

#[derive(Default)]
pub struct LicensingState(pub Mutex<Option<Update>>);
#[derive(Serialize, Deserialize)]
struct Credential {
    installation: String,
    token: Option<String>,
    endpoint: String,
}
#[derive(Serialize)]
pub struct LicenseStatus {
    pub enabled: bool,
    pub activated: bool,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrivateUpdate {
    version: String,
    current_version: String,
    body: Option<String>,
}

fn validate_endpoint(value: &str, development: bool) -> Result<Url, String> {
    let url = Url::parse(value).map_err(|_| "Invalid licensing endpoint")?;
    let loopback = matches!(url.host_str(), Some("127.0.0.1" | "localhost" | "[::1]"));
    if !(url.scheme() == "https" || (development && loopback && url.scheme() == "http"))
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || url.path() != "/"
    {
        return Err("Invalid licensing endpoint".into());
    }
    Ok(url)
}
fn endpoint() -> Result<Option<Url>, String> {
    if !cfg!(target_os = "macos") {
        return Ok(None);
    }
    option_env!("ASCII_LICENSING_ENDPOINT")
        .filter(|v| !v.is_empty())
        .map(|v| validate_endpoint(v, cfg!(debug_assertions)))
        .transpose()
}
fn service(app: &tauri::AppHandle) -> String {
    format!("{}.software-licensing", app.config().identifier)
}
#[cfg(target_os = "macos")]
fn load(app: &tauri::AppHandle, interactive: bool) -> Result<Option<Credential>, String> {
    let _serial = KEYCHAIN_ACCESS
        .lock()
        .map_err(|_| "Keychain is unavailable")?;
    // Startup/update checks must not open a Keychain prompt. Only the explicit
    // Activate action may request interaction. Serialize our Keychain calls
    // while the process-local interaction guard is active.
    let _interaction = if !interactive
        && security_framework::os::macos::keychain::SecKeychain::user_interaction_allowed()
            .map_err(|_| "Keychain is unavailable")?
    {
        Some(
            security_framework::os::macos::keychain::SecKeychain::disable_user_interaction()
                .map_err(|_| "Keychain is unavailable")?,
        )
    } else {
        None
    };
    match security_framework::passwords::get_generic_password(&service(app), "installation") {
        Ok(bytes) => serde_json::from_slice(&bytes)
            .map(Some)
            .map_err(|_| "Stored license could not be read".into()),
        Err(error) if error.code() == -25300 => Ok(None),
        Err(error) => {
            #[cfg(debug_assertions)]
            eprintln!("Software licensing Keychain read failed ({})", error.code());
            Err("Keychain is unavailable".into())
        }
    }
}
#[cfg(not(target_os = "macos"))]
fn load(_: &tauri::AppHandle, _: bool) -> Result<Option<Credential>, String> {
    Ok(None)
}
#[cfg(target_os = "macos")]
fn save(app: &tauri::AppHandle, credential: &Credential) -> Result<(), String> {
    let _serial = KEYCHAIN_ACCESS
        .lock()
        .map_err(|_| "Keychain is unavailable")?;
    let bytes = serde_json::to_vec(credential).map_err(|_| "License could not be saved")?;
    security_framework::passwords::set_generic_password(&service(app), "installation", &bytes)
        .map_err(|_| "Keychain is unavailable".into())
}
#[cfg(not(target_os = "macos"))]
fn save(_: &tauri::AppHandle, _: &Credential) -> Result<(), String> {
    Err("Private licensing is not enabled on this platform".into())
}
fn new_installation() -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        let mut bytes = [0u8; 24];
        security_framework::random::SecRandom::default()
            .copy_bytes(&mut bytes)
            .map_err(|_| "Installation ID unavailable")?;
        Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err("Private licensing is not enabled on this platform".into())
    }
}
async fn activate(endpoint: &Url, key: &str, installation: &str) -> Result<String, String> {
    if key.len() < 32 || key.len() > 256 {
        return Err("Enter a valid license key".into());
    }
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|_| "License connection unavailable")?;
    let mut response = client
        .post(
            endpoint
                .join("v1/activate")
                .map_err(|_| "Invalid licensing endpoint")?,
        )
        .json(&serde_json::json!({"key":key,"installation":installation}))
        .send()
        .await
        .map_err(|_| "Could not reach the licensing service. Your installed app still works.")?;
    if !response.status().is_success() {
        return Err(if response.status().as_u16() == 409 {
            "This license has no available installation seats"
        } else {
            "Activation was not accepted. Check your key and try again."
        }
        .into());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "Activation response unavailable")?
    {
        if bytes.len() + chunk.len() > 16384 {
            return Err("Invalid activation response".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    #[derive(Deserialize)]
    struct Receipt {
        token: String,
    }
    let receipt: Receipt =
        serde_json::from_slice(&bytes).map_err(|_| "Invalid activation response")?;
    if !valid_activation_receipt(&receipt.token, installation) {
        return Err("Invalid activation response".into());
    }
    Ok(receipt.token)
}

fn valid_activation_receipt(token: &str, installation: &str) -> bool {
    let parts: Vec<_> = token.split('.').collect();
    // Legacy, device-revision and signing-key-version receipts remain opaque.
    token.len() <= 512
        && [4, 5, 6].contains(&parts.len())
        && parts.iter().all(|part| !part.is_empty())
        && parts[1] == installation
        && token.bytes().all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b))
}
#[tauri::command]
pub async fn software_license_status(app: tauri::AppHandle) -> Result<LicenseStatus, String> {
    let endpoint = endpoint()?;
    let activated = if let Some(url) = endpoint.clone() {
        // An explicit activation may be waiting on the OS Keychain prompt.
        // Never let its serialization lock block the WebView's main thread.
        tauri::async_runtime::spawn_blocking(move || {
            load(&app, false)
                .ok()
                .flatten()
                .is_some_and(|c| c.endpoint == url.as_str() && c.token.is_some())
        })
        .await
        .map_err(|_| "License status unavailable")?
    } else {
        false
    };
    Ok(LicenseStatus {
        enabled: endpoint.is_some(),
        activated,
    })
}
#[tauri::command]
pub async fn activate_software_license(
    app: tauri::AppHandle,
    key: String,
) -> Result<LicenseStatus, String> {
    let endpoint = endpoint()?.ok_or("Private licensing is not enabled in this build")?;
    let mut credential = match load(&app, true)? {
        Some(c) if c.endpoint == endpoint.as_str() => c,
        _ => Credential {
            installation: new_installation()?,
            token: None,
            endpoint: endpoint.to_string(),
        },
    };
    // Persist identity first. A lost response must retry the same installation.
    save(&app, &credential)?;
    credential.token = Some(activate(&endpoint, key.trim(), &credential.installation).await?);
    save(&app, &credential)?;
    *app.state::<LicensingState>()
        .0
        .lock()
        .map_err(|_| "Updater unavailable")? = None;
    Ok(LicenseStatus {
        enabled: true,
        activated: true,
    })
}
fn same_download_origin(endpoint: &Url, download: &Url) -> bool {
    endpoint.origin() == download.origin()
        && download.username().is_empty()
        && download.password().is_none()
        && download.query().is_none()
        && download.fragment().is_none()
        && download.path().starts_with("/v1/releases/")
}
pub async fn private_update(app: &tauri::AppHandle) -> Result<Option<Update>, String> {
    let endpoint = endpoint()?.ok_or("Private licensing is not enabled in this build")?;
    let credential = load(app, false)?.filter(|c| c.endpoint == endpoint.as_str());
    let Some(token) = credential.and_then(|c| c.token) else {
        return Ok(None);
    };
    let feed = endpoint
        .join(&format!(
            "v1/updates/ascii-vj-remix/darwin-{}/{}",
            std::env::consts::ARCH,
            app.package_info().version
        ))
        .map_err(|_| "Invalid updater endpoint")?;
    let mut headers = HeaderMap::new();
    let mut authorization =
        HeaderValue::from_str(&format!("Bearer {token}")).map_err(|_| "Invalid stored license")?;
    authorization.set_sensitive(true);
    headers.insert(AUTHORIZATION, authorization);
    let updater = app
        .updater_builder()
        .endpoints(vec![feed])
        .map_err(|_| "Invalid updater endpoint")?
        .headers(headers)
        .timeout(Duration::from_secs(15))
        .configure_client(|client| client.redirect(reqwest_updater::redirect::Policy::none()))
        .build()
        .map_err(|_| "Updater unavailable")?;
    let mut update = updater
        .check()
        .await
        .map_err(|_| "Could not check covered updates. Your installed app still works.")?;
    if update
        .as_ref()
        .is_some_and(|u| !same_download_origin(&endpoint, &u.download_url))
    {
        return Err("Update points outside the licensing service".into());
    }
    if let Some(ref mut pending) = update {
        pending.timeout = Some(Duration::from_secs(300));
    }
    Ok(update)
}
#[tauri::command]
pub async fn check_private_update(app: tauri::AppHandle) -> Result<Option<PrivateUpdate>, String> {
    let update = private_update(&app).await?;
    let view = update.as_ref().map(|u| PrivateUpdate {
        version: u.version.clone(),
        current_version: u.current_version.clone(),
        body: u.body.clone(),
    });
    *app.state::<LicensingState>()
        .0
        .lock()
        .map_err(|_| "Updater unavailable")? = update;
    Ok(view)
}
#[tauri::command]
pub async fn install_private_update(app: tauri::AppHandle, version: String) -> Result<(), String> {
    let update = app
        .state::<LicensingState>()
        .0
        .lock()
        .map_err(|_| "Updater unavailable")?
        .take()
        .filter(|u| u.version == version)
        .ok_or("Check for this update again before installing")?;
    let handle = app.clone();
    update.download_and_install(move |chunk,total| {
        let _=handle.emit_to("main","software-license-update-progress",serde_json::json!({"event":"Progress","data":{"chunkLength":chunk,"contentLength":total}}));
    },||{}).await.map_err(|_|"Update could not be installed. Please try again.".into())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn activation_receipts_survive_server_key_rotation() {
        for token in ["grant.mac.1.signature", "grant.mac.1.0.signature", "grant.mac.1.0.november.signature"] {
            assert!(valid_activation_receipt(token, "mac"));
            assert!(!valid_activation_receipt(token, "another-mac"));
        }
        for token in ["", "grant.mac.1", "grant.mac.1..signature", "grant.mac.1.0.key.signature.extra", "grant.mac.1.bad\nheader", "grant.mac.1.💥"] {
            assert!(!valid_activation_receipt(token, "mac"));
        }
        assert!(!valid_activation_receipt(&format!("grant.mac.1.{}", "x".repeat(513)), "mac"));
    }
    #[test]
    fn endpoints_and_downloads_cannot_redirect_credentials() {
        for value in [
            "http://example.com/",
            "https://user:pass@example.com/",
            "https://example.com/?key=x",
            "https://example.com/path",
            "https://example.com/#token",
        ] {
            assert!(validate_endpoint(value, false).is_err());
        }
        assert!(validate_endpoint("http://127.0.0.1:8787/", true).is_ok());
        assert!(validate_endpoint("http://127.0.0.1:8787/", false).is_err());
        let endpoint = validate_endpoint("https://licensing.example/", false).unwrap();
        assert!(same_download_origin(
            &endpoint,
            &endpoint.join("v1/releases/build-1").unwrap()
        ));
        for value in [
            "https://other.example/v1/releases/build-1",
            "https://licensing.example/v1/releases/build-1?token=secret",
            "https://licensing.example/anything",
        ] {
            assert!(!same_download_origin(
                &endpoint,
                &Url::parse(value).unwrap()
            ));
        }
    }
    #[test]
    fn unconfigured_build_is_offline() {
        if option_env!("ASCII_LICENSING_ENDPOINT").is_none() {
            assert!(endpoint().unwrap().is_none());
        }
    }
}
