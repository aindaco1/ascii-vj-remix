pub mod ci_smoke;
pub mod desktop_bridge;
pub mod media_engine;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(desktop_bridge::MediaRegistry::default())
        .manage(desktop_bridge::MediaSessions::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            ci_smoke::maybe_spawn(app);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            desktop_bridge::select_media_file,
            desktop_bridge::list_media_files,
            desktop_bridge::forget_media_file,
            desktop_bridge::probe_registered_media,
            desktop_bridge::preview_registered_media,
            desktop_bridge::start_registered_media_session,
            desktop_bridge::read_media_session_frame,
            desktop_bridge::read_media_session_frames,
            desktop_bridge::stop_media_session,
            desktop_bridge::list_media_sessions,
        ])
        .run(tauri::generate_context!())
        .expect("error while running ASCILINE Remix");
}
