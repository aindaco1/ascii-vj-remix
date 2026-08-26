use crate::{
    crash_reporter::{
        capture_crash_report, discard_crash_reports, get_crash_report_state, submit_crash_reports,
        CrashReportInput,
    },
    native_output::NativeOutputState,
};
use serde::Serialize;
use serde_json::json;
use std::{
    env, fs, process,
    sync::mpsc,
    thread,
    time::{Duration, Instant},
};
use tauri::{App, Emitter, Listener, Manager};
use tauri_plugin_updater::UpdaterExt;

#[derive(Serialize)]
struct SmokeReport {
    ok: bool,
    kind: String,
    mode: String,
    package_version: String,
    expected_version: Option<String>,
    found_update: bool,
    update_version: Option<String>,
    current_version: Option<String>,
    target: Option<String>,
    download_url: Option<String>,
    downloaded_bytes: Option<usize>,
    install_started: bool,
    install_finished: bool,
    forced_update: bool,
    forced_from_version: Option<String>,
    backend: Option<String>,
    media_url: Option<String>,
    elapsed_ms: u128,
    error: Option<String>,
}

#[derive(Serialize)]
struct UpdaterUiSmokeReport {
    ok: bool,
    kind: String,
    package_version: String,
    update_control_present: bool,
    update_control_visible: bool,
    update_status_present: bool,
    reports_control_present: bool,
    reports_control_visible: bool,
    reports_control_label: String,
    backend_status_absent: bool,
    elapsed_ms: u128,
    error: Option<String>,
}

#[derive(Serialize)]
struct CrashRelaySmokeReport {
    ok: bool,
    kind: String,
    mode: String,
    package_version: String,
    pending_before: usize,
    pending_after_capture: usize,
    pending_after_submit: usize,
    attempted: usize,
    submitted: usize,
    failed: usize,
    relay_result: Option<serde_json::Value>,
    elapsed_ms: u128,
    error: Option<String>,
}

impl SmokeReport {
    fn launch(package_version: String, elapsed_ms: u128) -> Self {
        Self {
            ok: true,
            kind: "launch".to_string(),
            mode: "launch".to_string(),
            package_version,
            expected_version: None,
            found_update: false,
            update_version: None,
            current_version: None,
            target: None,
            download_url: None,
            downloaded_bytes: None,
            install_started: false,
            install_finished: false,
            forced_update: false,
            forced_from_version: None,
            backend: None,
            media_url: None,
            elapsed_ms,
            error: None,
        }
    }
}

pub fn maybe_spawn(app: &App) {
    if env::var_os("ASCILINE_CRASH_REPORT_SMOKE").is_some() {
        spawn_crash_relay_smoke(app);
    } else if env::var_os("ASCILINE_UPDATER_SMOKE").is_some() {
        spawn_updater_smoke(app);
    } else if env::var_os("ASCILINE_UI_PERF_SMOKE").is_some() {
        spawn_ui_perf_smoke(app);
    } else if env::var_os("ASCILINE_NATIVE_OUTPUT_SMOKE").is_some() {
        spawn_native_output_smoke(app);
    } else if matches!(
        env::var("ASCILINE_DESKTOP_SMOKE").as_deref(),
        Ok("updater-ui")
    ) {
        spawn_updater_ui_smoke(app);
    } else if matches!(env::var("ASCILINE_DESKTOP_SMOKE").as_deref(), Ok("launch")) {
        spawn_launch_smoke(app);
    }
}

fn spawn_crash_relay_smoke(app: &App) {
    let handle = app.handle().clone();
    let package_version = app.package_info().version.to_string();
    let mode = env::var("ASCILINE_CRASH_REPORT_SMOKE").unwrap_or_default();

    tauri::async_runtime::spawn(async move {
        let start = Instant::now();
        let result = run_crash_relay_smoke(handle, package_version.clone(), mode.clone()).await;
        match result {
            Ok(mut report) => {
                report.elapsed_ms = start.elapsed().as_millis();
                finish(report, 0);
            }
            Err(error) => finish(
                CrashRelaySmokeReport {
                    ok: false,
                    kind: "crash-relay".to_string(),
                    mode,
                    package_version,
                    pending_before: 0,
                    pending_after_capture: 0,
                    pending_after_submit: 0,
                    attempted: 0,
                    submitted: 0,
                    failed: 0,
                    relay_result: None,
                    elapsed_ms: start.elapsed().as_millis(),
                    error: Some(error),
                },
                1,
            ),
        }
    });
}

async fn run_crash_relay_smoke(
    handle: tauri::AppHandle,
    package_version: String,
    mode: String,
) -> Result<CrashRelaySmokeReport, String> {
    if mode != "submit" {
        return Err("ASCILINE_CRASH_REPORT_SMOKE must be set to submit".to_string());
    }

    let before = get_crash_report_state(handle.clone())?;
    if !before.production {
        return Err("Crash relay submission smoke requires a production build".to_string());
    }
    if before.preference == "off" {
        return Err("Crash reporting preference is off".to_string());
    }
    if before.pending_count != 0 {
        return Err(format!(
            "Crash relay submission smoke refuses to run with {} existing pending report(s)",
            before.pending_count
        ));
    }

    let captured = capture_crash_report(
        handle.clone(),
        CrashReportInput {
            kind: Some("frontend-error".to_string()),
            surface: Some("startup".to_string()),
            message: Some("ASCII VJ Remix production crash relay acceptance canary".to_string()),
            stack: Some("synthetic acceptance canary".to_string()),
            context: Some(json!({
                "errorCode": "ASCILINE_CRASH_CANARY",
                "sourceMode": "synthetic",
                "backend": "canary",
                "nativeOutputActive": false
            })),
        },
    )?;
    if captured.pending_count != 1 {
        let _ = discard_crash_reports(handle.clone());
        return Err(format!(
            "Crash relay canary capture produced {} pending reports instead of one",
            captured.pending_count
        ));
    }

    let submitted_state = match submit_crash_reports(handle.clone()).await {
        Ok(state) => state,
        Err(error) => {
            let _ = discard_crash_reports(handle);
            return Err(error);
        }
    };
    let summary = submitted_state
        .last_result
        .as_ref()
        .ok_or_else(|| "Crash relay submission returned no summary".to_string())?;
    if summary.attempted != 1 || summary.submitted != 1 || summary.failed != 0 {
        let _ = discard_crash_reports(handle);
        return Err(format!(
            "Crash relay canary submission was incomplete: attempted={}, submitted={}, failed={}",
            summary.attempted, summary.submitted, summary.failed
        ));
    }
    if submitted_state.pending_count != 0 {
        let _ = discard_crash_reports(handle);
        return Err(format!(
            "Crash relay canary left {} pending reports",
            submitted_state.pending_count
        ));
    }

    Ok(CrashRelaySmokeReport {
        ok: true,
        kind: "crash-relay".to_string(),
        mode,
        package_version,
        pending_before: before.pending_count,
        pending_after_capture: captured.pending_count,
        pending_after_submit: submitted_state.pending_count,
        attempted: summary.attempted,
        submitted: summary.submitted,
        failed: summary.failed,
        relay_result: summary.results.first().cloned(),
        elapsed_ms: 0,
        error: None,
    })
}

fn spawn_updater_ui_smoke(app: &App) {
    let handle = app.handle().clone();
    let package_version = app.package_info().version.to_string();
    let delay_ms = env::var("ASCILINE_DESKTOP_SMOKE_DELAY_MS")
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(1200);
    let (sender, receiver) = mpsc::channel();
    let listener_id = handle.listen("asciline-updater-ui-smoke-result", move |event| {
        let _ = sender.send(event.payload().to_string());
    });

    thread::spawn(move || {
        let start = Instant::now();
        thread::sleep(Duration::from_millis(delay_ms));
        if handle.get_webview_window("main").is_none() {
            finish(
                UpdaterUiSmokeReport {
                    ok: false,
                    kind: "updater-ui".to_string(),
                    package_version,
                    update_control_present: false,
                    update_control_visible: false,
                    update_status_present: false,
                    reports_control_present: false,
                    reports_control_visible: false,
                    reports_control_label: String::new(),
                    backend_status_absent: false,
                    elapsed_ms: start.elapsed().as_millis(),
                    error: Some("main webview window was unavailable".to_string()),
                },
                1,
            );
        }

        let deadline = Instant::now() + Duration::from_secs(12);
        let mut last = (false, false, false, false, false, String::new(), false);

        while Instant::now() < deadline {
            let _ = handle.emit_to("main", "asciline-updater-ui-smoke", ());
            if let Ok(payload) = receiver.recv_timeout(Duration::from_millis(150)) {
                if let Ok(value) = serde_json::from_str::<serde_json::Value>(&payload) {
                    last = (
                        value["updateControlPresent"].as_bool().unwrap_or(false),
                        value["updateControlVisible"].as_bool().unwrap_or(false),
                        value["updateStatusPresent"].as_bool().unwrap_or(false),
                        value["reportsControlPresent"].as_bool().unwrap_or(false),
                        value["reportsControlVisible"].as_bool().unwrap_or(false),
                        value["reportsControlLabel"]
                            .as_str()
                            .unwrap_or_default()
                            .to_string(),
                        value["backendStatusAbsent"].as_bool().unwrap_or(false),
                    );
                }
                if last.0
                    && last.1
                    && last.2
                    && last.3
                    && last.4
                    && (last.5 == "Reports" || last.5.starts_with("Reports "))
                    && last.6
                {
                    handle.unlisten(listener_id);
                    finish(
                        UpdaterUiSmokeReport {
                            ok: true,
                            kind: "updater-ui".to_string(),
                            package_version,
                            update_control_present: true,
                            update_control_visible: true,
                            update_status_present: true,
                            reports_control_present: true,
                            reports_control_visible: true,
                            reports_control_label: last.5,
                            backend_status_absent: true,
                            elapsed_ms: start.elapsed().as_millis(),
                            error: None,
                        },
                        0,
                    );
                }
            }
        }

        handle.unlisten(listener_id);
        finish(
            UpdaterUiSmokeReport {
                ok: false,
                kind: "updater-ui".to_string(),
                package_version,
                update_control_present: last.0,
                update_control_visible: last.1,
                update_status_present: last.2,
                reports_control_present: last.3,
                reports_control_visible: last.4,
                reports_control_label: last.5,
                backend_status_absent: last.6,
                elapsed_ms: start.elapsed().as_millis(),
                error: Some(
                    "Top-bar updater/reports contract was incomplete after launch".to_string(),
                ),
            },
            1,
        );
    });
}

fn spawn_launch_smoke(app: &App) {
    let package_version = app.package_info().version.to_string();
    let delay_ms = env::var("ASCILINE_DESKTOP_SMOKE_DELAY_MS")
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(2500);

    thread::spawn(move || {
        let start = Instant::now();
        thread::sleep(Duration::from_millis(delay_ms));
        finish(
            SmokeReport::launch(package_version, start.elapsed().as_millis()),
            0,
        );
    });
}

fn spawn_updater_smoke(app: &App) {
    let handle = app.handle().clone();
    let package_version = app.package_info().version.to_string();
    let mode = env::var("ASCILINE_UPDATER_SMOKE").unwrap_or_else(|_| "check".to_string());
    let expected_version = env::var("ASCILINE_UPDATER_EXPECT_VERSION").ok();
    let forced_from_version = env::var("ASCILINE_UPDATER_SMOKE_FORCE_FROM_VERSION").ok();
    let forced_update = env::var_os("ASCILINE_UPDATER_SMOKE_FORCE_UPDATE").is_some()
        || forced_from_version.is_some();

    tauri::async_runtime::spawn(async move {
        let start = Instant::now();
        let result = run_updater_smoke(
            handle,
            package_version.clone(),
            mode.clone(),
            expected_version.clone(),
            forced_update,
            forced_from_version.clone(),
        )
        .await;

        match result {
            Ok(mut report) => {
                report.elapsed_ms = start.elapsed().as_millis();
                finish(report, 0);
            }
            Err(error) => finish(
                SmokeReport {
                    ok: false,
                    kind: "updater".to_string(),
                    mode,
                    package_version,
                    expected_version,
                    found_update: false,
                    update_version: None,
                    current_version: None,
                    target: None,
                    download_url: None,
                    downloaded_bytes: None,
                    install_started: false,
                    install_finished: false,
                    forced_update,
                    forced_from_version,
                    backend: None,
                    media_url: None,
                    elapsed_ms: start.elapsed().as_millis(),
                    error: Some(error),
                },
                1,
            ),
        }
    });
}

async fn run_updater_smoke(
    handle: tauri::AppHandle,
    package_version: String,
    mode: String,
    expected_version: Option<String>,
    forced_update: bool,
    forced_from_version: Option<String>,
) -> Result<SmokeReport, String> {
    let mut builder = handle.updater_builder().timeout(Duration::from_secs(90));

    if forced_update {
        builder = builder.version_comparator(|_current, _remote| true);
    }
    if env::var_os("ASCILINE_UPDATER_SMOKE_SILENT_INSTALL").is_some() {
        builder = builder.installer_args(["/qn", "/norestart"]);
    }

    let updater = builder.build().map_err(|error| error.to_string())?;
    let update = updater.check().await.map_err(|error| error.to_string())?;
    let Some(update) = update else {
        if expected_version.is_some() {
            return Err("expected an update, but updater reported no update".to_string());
        }
        return Ok(SmokeReport {
            ok: true,
            kind: "updater".to_string(),
            mode,
            package_version,
            expected_version,
            found_update: false,
            update_version: None,
            current_version: None,
            target: None,
            download_url: None,
            downloaded_bytes: None,
            install_started: false,
            install_finished: false,
            forced_update,
            forced_from_version,
            backend: None,
            media_url: None,
            elapsed_ms: 0,
            error: None,
        });
    };

    if let Some(expected) = expected_version.as_deref() {
        if update.version != expected {
            return Err(format!(
                "updater reported version {}, expected {}",
                update.version, expected
            ));
        }
    }

    let install_mode = matches!(mode.as_str(), "install" | "download-and-install" | "hop");
    let mut downloaded_bytes = None;
    let mut downloaded_package = None;
    if matches!(
        mode.as_str(),
        "download" | "download-only" | "install" | "download-and-install" | "hop"
    ) {
        let bytes = update
            .download(|_, _| {}, || {})
            .await
            .map_err(|error| error.to_string())?;
        if bytes.is_empty() {
            return Err("updater downloaded an empty package".to_string());
        }
        downloaded_bytes = Some(bytes.len());
        downloaded_package = Some(bytes);
    }

    let mut report = SmokeReport {
        ok: true,
        kind: "updater".to_string(),
        mode,
        package_version,
        expected_version,
        found_update: true,
        update_version: Some(update.version.clone()),
        current_version: Some(update.current_version.clone()),
        target: Some(update.target.clone()),
        download_url: Some(update.download_url.to_string()),
        downloaded_bytes,
        install_started: install_mode,
        install_finished: false,
        forced_update,
        forced_from_version,
        backend: None,
        media_url: None,
        elapsed_ms: 0,
        error: None,
    };

    if install_mode {
        emit_report(&report, 0);
        let bytes = downloaded_package
            .ok_or_else(|| "install mode did not download an updater package".to_string())?;
        update.install(bytes).map_err(|error| error.to_string())?;
        report.install_finished = true;
    }

    Ok(report)
}

fn spawn_native_output_smoke(app: &App) {
    let handle = app.handle().clone();
    let package_version = app.package_info().version.to_string();
    let state = app.state::<NativeOutputState>().inner().clone();
    let media_url = env::var("ASCILINE_NATIVE_OUTPUT_SMOKE_MEDIA")
        .unwrap_or_else(|_| "media/point-click-test-30s.mp4".to_string());
    let delay_ms = env::var("ASCILINE_NATIVE_OUTPUT_SMOKE_DELAY_MS")
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(750);
    let duration_ms = env::var("ASCILINE_NATIVE_OUTPUT_SMOKE_DURATION_MS")
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(7000);

    tauri::async_runtime::spawn(async move {
        let start = Instant::now();
        thread::sleep(Duration::from_millis(delay_ms));
        let result =
            crate::native_output::open_native_output_smoke(handle.clone(), &state, &media_url)
                .await;

        match result {
            Ok(output) if output.opened => {
                let reactive = env::var("ASCILINE_NATIVE_OUTPUT_SMOKE_REACTIVE")
                    .map(|value| value != "0")
                    .unwrap_or(true);
                if reactive {
                    let deadline = Instant::now() + Duration::from_millis(duration_ms);
                    let mut step = 0u64;
                    while Instant::now() < deadline {
                        let _ = crate::native_output::update_native_output_smoke_params(
                            handle.clone(),
                            &state,
                            &media_url,
                            step,
                        )
                        .await;
                        step = step.wrapping_add(1);
                        thread::sleep(Duration::from_millis(16));
                    }
                } else {
                    thread::sleep(Duration::from_millis(duration_ms));
                }
                finish(
                    SmokeReport {
                        ok: true,
                        kind: "native-output".to_string(),
                        mode: "perf".to_string(),
                        package_version,
                        expected_version: None,
                        found_update: false,
                        update_version: None,
                        current_version: None,
                        target: None,
                        download_url: None,
                        downloaded_bytes: None,
                        install_started: false,
                        install_finished: false,
                        forced_update: false,
                        forced_from_version: None,
                        backend: Some(output.backend),
                        media_url: Some(media_url),
                        elapsed_ms: start.elapsed().as_millis(),
                        error: None,
                    },
                    0,
                );
            }
            Ok(output) => finish(
                SmokeReport {
                    ok: false,
                    kind: "native-output".to_string(),
                    mode: "perf".to_string(),
                    package_version,
                    expected_version: None,
                    found_update: false,
                    update_version: None,
                    current_version: None,
                    target: None,
                    download_url: None,
                    downloaded_bytes: None,
                    install_started: false,
                    install_finished: false,
                    forced_update: false,
                    forced_from_version: None,
                    backend: Some(output.backend),
                    media_url: Some(media_url),
                    elapsed_ms: start.elapsed().as_millis(),
                    error: output.reason,
                },
                1,
            ),
            Err(error) => finish(
                SmokeReport {
                    ok: false,
                    kind: "native-output".to_string(),
                    mode: "perf".to_string(),
                    package_version,
                    expected_version: None,
                    found_update: false,
                    update_version: None,
                    current_version: None,
                    target: None,
                    download_url: None,
                    downloaded_bytes: None,
                    install_started: false,
                    install_finished: false,
                    forced_update: false,
                    forced_from_version: None,
                    backend: None,
                    media_url: Some(media_url),
                    elapsed_ms: start.elapsed().as_millis(),
                    error: Some(error),
                },
                1,
            ),
        }
    });
}

fn spawn_ui_perf_smoke(app: &App) {
    let handle = app.handle().clone();
    let package_version = app.package_info().version.to_string();
    let media_url = env::var("ASCILINE_UI_PERF_SMOKE_MEDIA")
        .unwrap_or_else(|_| "media/point-click-test-30s.mp4".to_string());
    let backend = env::var("ASCILINE_UI_PERF_SMOKE_BACKEND").unwrap_or_else(|_| "auto".to_string());
    let delay_ms = env::var("ASCILINE_UI_PERF_SMOKE_DELAY_MS")
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(1200);
    let duration_ms = env::var("ASCILINE_UI_PERF_SMOKE_DURATION_MS")
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(9000);
    let sample_ms = env::var("ASCILINE_UI_PERF_SMOKE_SAMPLE_MS")
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(500);

    thread::spawn(move || {
        let start = Instant::now();
        thread::sleep(Duration::from_millis(delay_ms));
        let payload = json!({
            "mediaUrl": media_url,
            "backend": backend,
            "durationMs": duration_ms,
            "sampleMs": sample_ms
        });
        for _ in 0..12 {
            let _ = handle.emit_to("main", "asciline-ui-perf-smoke", payload.clone());
            thread::sleep(Duration::from_millis(250));
        }
        // Allow source startup, Pop Out creation, backend rebuilds, and a loaded
        // machine to finish reporting before the CI-smoke process exits.
        thread::sleep(Duration::from_millis(duration_ms + 15_000));
        finish(
            SmokeReport {
                ok: true,
                kind: "ui-perf".to_string(),
                mode: "perf".to_string(),
                package_version,
                expected_version: None,
                found_update: false,
                update_version: None,
                current_version: None,
                target: None,
                download_url: None,
                downloaded_bytes: None,
                install_started: false,
                install_finished: false,
                forced_update: false,
                forced_from_version: None,
                backend: None,
                media_url: Some(media_url),
                elapsed_ms: start.elapsed().as_millis(),
                error: None,
            },
            0,
        );
    });
}

fn emit_report<T: Serialize>(report: &T, code: i32) {
    let payload = serde_json::to_string_pretty(&report)
        .unwrap_or_else(|error| format!("{{\"ok\":false,\"error\":\"{}\"}}", error));

    if let Ok(path) = env::var("ASCILINE_SMOKE_REPORT") {
        let _ = fs::write(path, format!("{payload}\n"));
    }
    if let Ok(path) = env::var("ASCILINE_UPDATER_SMOKE_REPORT") {
        let _ = fs::write(path, format!("{payload}\n"));
    }
    if let Ok(path) = env::var("ASCILINE_DESKTOP_SMOKE_REPORT") {
        let _ = fs::write(path, format!("{payload}\n"));
    }

    if code == 0 {
        println!("ASCILINE_SMOKE_REPORT {payload}");
    } else {
        eprintln!("ASCILINE_SMOKE_REPORT {payload}");
    }
}

fn finish<T: Serialize>(report: T, code: i32) -> ! {
    emit_report(&report, code);
    process::exit(code);
}
