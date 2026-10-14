use super::{
    frame::{frame_len, LatestFrame, VideoFrame},
    gpu, ndi,
};
use crate::native_output::{
    gpu::NativeGpuPresenter, NativeOutputPayload, NativeOutputWindowRequest,
};
use serde::{Deserialize, Serialize};
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Arc, Mutex,
    },
    thread,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager, State};

pub const SOURCE_HOLD: Duration = Duration::from_secs(2);
const RECONNECT: Duration = Duration::from_secs(2);
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Protocol {
    Ndi,
    Syphon,
}
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Source {
    pub id: String,
    pub name: String,
    pub protocol: Protocol,
    #[serde(skip)]
    pub url: String,
}
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
pub struct Input {
    pub protocol: Protocol,
    pub id: String,
}
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Config {
    pub input: Option<Input>,
    pub ndi: bool,
    pub syphon: bool,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub mirror: bool,
    pub source_revision: u64,
}
impl Default for Config {
    fn default() -> Self {
        Self {
            input: None,
            ndi: false,
            syphon: false,
            name: "ASCII VJ Remix".into(),
            width: 1920,
            height: 1080,
            fps: 60,
            mirror: false,
            source_revision: 0,
        }
    }
}
impl Config {
    fn validate(&self) -> Result<(), String> {
        if ![(1280, 720), (1920, 1080)].contains(&(self.width, self.height))
            || ![30, 60].contains(&self.fps)
        {
            return Err("Choose 720p or 1080p at 30 or 60 fps".into());
        }
        if self.name.trim().is_empty()
            || self.name.len() > 128
            || self.name.chars().any(char::is_control)
        {
            return Err("Output name must contain 1–128 printable bytes".into());
        }
        if !cfg!(target_os = "macos")
            && (self.syphon
                || self
                    .input
                    .as_ref()
                    .is_some_and(|s| s.protocol == Protocol::Syphon))
        {
            return Err("Syphon is available on macOS".into());
        }
        Ok(())
    }
}
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub popout: bool,
    pub ndi_available: bool,
    pub syphon_available: bool,
    pub input: String,
    pub ndi: String,
    pub syphon: String,
    pub error: Option<String>,
    pub frames: u64,
    pub dropped: u64,
    pub generation: u64,
}
struct Control {
    config: Config,
    payload: Option<NativeOutputPayload>,
    generation: u64,
    sources: Vec<Source>,
    own_ndi: String,
    own_syphon: String,
    popout: Option<tauri::Window>,
    status: Status,
}
pub struct Shared {
    control: Mutex<Control>,
    pub preview: LatestFrame,
    pub pixels: LatestFrame,
    stop: AtomicBool,
    started: AtomicBool,
}
pub struct VideoIoState(pub Arc<Shared>);
impl Default for VideoIoState {
    fn default() -> Self {
        Self(Arc::new(Shared {
            control: Mutex::new(Control {
                config: Config::default(),
                payload: None,
                generation: 1,
                sources: vec![],
                own_ndi: String::new(),
                own_syphon: String::new(),
                popout: None,
                status: Status::default(),
            }),
            preview: LatestFrame::default(),
            pixels: LatestFrame::default(),
            stop: AtomicBool::new(false),
            started: AtomicBool::new(false),
        }))
    }
}
impl Drop for VideoIoState {
    fn drop(&mut self) {
        self.0.stop.store(true, Ordering::Release);
    }
}
fn runtime_dir(app: &AppHandle) -> PathBuf {
    let target = if cfg!(target_os = "macos") {
        "macos-aarch64"
    } else if cfg!(target_os = "windows") {
        "windows-x86_64"
    } else {
        "linux-x86_64"
    };
    let resource = app
        .path()
        .resource_dir()
        .unwrap_or_default()
        .join("resources/video-io")
        .join(target);
    if resource.is_dir() {
        return resource;
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources/video-io")
        .join(target)
}
fn ndi_path(app: &AppHandle) -> PathBuf {
    if cfg!(target_os = "macos") {
        let bundled = app
            .path()
            .resource_dir()
            .unwrap_or_default()
            .join("../Frameworks/libndi.dylib");
        if bundled.is_file() {
            return bundled;
        }
        return PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("frameworks/libndi.dylib");
    }
    runtime_dir(app).join(if cfg!(target_os = "windows") {
        "Processing.NDI.Lib.x64.dll"
    } else {
        "libndi.so.6"
    })
}
#[cfg(target_os = "macos")]
fn syphon_path(app: &AppHandle) -> PathBuf {
    let bundled = app
        .path()
        .resource_dir()
        .unwrap_or_default()
        .join("../Frameworks/Syphon.framework");
    if bundled.is_dir() {
        bundled
    } else {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("frameworks/Syphon.framework")
    }
}
#[cfg(target_os = "macos")]
fn load_syphon(app: &AppHandle) -> Result<(), String> {
    super::syphon::load(&syphon_path(app))
}
fn start(app: &AppHandle, state: &VideoIoState) {
    if state.0.started.swap(true, Ordering::AcqRel) {
        return;
    }
    let shared = state.0.clone();
    let app = app.clone();
    thread::Builder::new()
        .name("video-io".into())
        .spawn(move || {
            if let Err(error) = run(&app, &shared) {
                if let Ok(mut c) = shared.control.lock() {
                    c.status.error = Some(error);
                }
            }
            shared.started.store(false, Ordering::Release);
        })
        .expect("video I/O worker");
}
#[tauri::command]
pub fn get_video_io_status(
    app: AppHandle,
    state: State<'_, VideoIoState>,
) -> Result<Status, String> {
    let c = state
        .0
        .control
        .lock()
        .map_err(|_| "Video state unavailable")?;
    let mut status = c.status.clone();
    status.generation = c.generation;
    status.popout = c.popout.is_some();
    status.ndi_available = ndi_path(&app).is_file();
    #[cfg(target_os = "macos")]
    {
        status.syphon_available = syphon_path(&app).is_dir();
    }
    Ok(status)
}
#[tauri::command]
pub async fn discover_video_sources(
    app: AppHandle,
    state: State<'_, VideoIoState>,
    protocol: Protocol,
) -> Result<Vec<Source>, String> {
    let shared = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let sources = match protocol {
            Protocol::Ndi => {
                let api = ndi::Api::load(&ndi_path(&app))?;
                let mut finder = ndi::Finder::new(api)?;
                finder
                    .sources(800)
                    .into_iter()
                    .map(|s| Source {
                        id: format!("{}\n{}", s.name, s.url),
                        name: s.name,
                        protocol: Protocol::Ndi,
                        url: s.url,
                    })
                    .collect::<Vec<_>>()
            }
            Protocol::Syphon => {
                #[cfg(target_os = "macos")]
                {
                    load_syphon(&app)?;
                    super::syphon::sources()?
                        .into_iter()
                        .map(|s| Source {
                            id: s.id,
                            name: format!("{} — {}", s.app, s.name),
                            protocol: Protocol::Syphon,
                            url: String::new(),
                        })
                        .collect()
                }
                #[cfg(not(target_os = "macos"))]
                {
                    return Err("Syphon is available on macOS".into());
                }
            }
        };
        let mut c = shared
            .control
            .lock()
            .map_err(|_| "Video state unavailable")?;
        let sources: Vec<_> = sources
            .into_iter()
            .filter(|s| match s.protocol {
                Protocol::Ndi => s.name != c.own_ndi,
                Protocol::Syphon => s.id != c.own_syphon,
            })
            .collect();
        let selected = c.config.input.clone();
        // Keep the selected identity while a sender is absent or changes its
        // transient address/UUID. Refresh must not invalidate a live session.
        c.sources.retain(|s| {
            s.protocol != protocol
                || selected.as_ref().is_some_and(|i| {
                    i.protocol == s.protocol
                        && i.id == s.id
                        && !sources.iter().any(|next| next.id == s.id)
                })
        });
        c.sources.extend(sources.clone());
        Ok(sources)
    })
    .await
    .map_err(|_| "Discovery worker failed")?
}
#[tauri::command]
pub fn configure_video_io(
    app: AppHandle,
    state: State<'_, VideoIoState>,
    config: Config,
) -> Result<u64, String> {
    config.validate()?;
    let generation = {
        let mut c = state
            .0
            .control
            .lock()
            .map_err(|_| "Video state unavailable")?;
        if let Some(input) = &config.input {
            if !c
                .sources
                .iter()
                .any(|s| s.id == input.id && s.protocol == input.protocol)
            {
                return Err("Refresh and select an available source".into());
            }
        }
        if c.config.input != config.input || c.config.source_revision != config.source_revision {
            c.generation += 1;
            state.0.preview.clear();
            state.0.pixels.clear();
        }
        if c.config.mirror != config.mirror {
            state.0.pixels.clear();
        }
        c.config = config;
        c.status.error = None;
        c.generation
    };
    start(&app, &state);
    Ok(generation)
}
#[tauri::command]
pub fn update_video_io_params(
    state: State<'_, VideoIoState>,
    payload: NativeOutputPayload,
) -> Result<(), String> {
    state
        .0
        .control
        .lock()
        .map_err(|_| "Video state unavailable")?
        .payload = Some(payload);
    Ok(())
}
#[tauri::command]
pub fn write_video_io_frame(
    state: State<'_, VideoIoState>,
    request: tauri::ipc::Request<'_>,
) -> Result<(), String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("Expected binary video frame".into());
    };
    if bytes.len() < 40 || &bytes[..4] != b"AVIO" {
        return Err("Invalid video packet".into());
    }
    let u32_at = |i| u32::from_le_bytes(bytes[i..i + 4].try_into().unwrap());
    let generation = u64::from_le_bytes(bytes[32..40].try_into().unwrap());
    let c = state
        .0
        .control
        .lock()
        .map_err(|_| "Video state unavailable")?;
    if generation != c.generation || (u32_at(24) != 0) != c.config.mirror {
        return Ok(());
    }
    let (w, h) = (u32_at(8), u32_at(12));
    if u32_at(4) != 1 || bytes.len() != 40 + frame_len(w, h)? {
        return Err("Invalid video packet length".into());
    }
    state
        .0
        .pixels
        .set(VideoFrame::new(w, h, bytes[40..].to_vec())?);
    Ok(())
}
#[tauri::command]
pub fn read_video_io_frame(
    state: State<'_, VideoIoState>,
    generation: u64,
    after: u64,
) -> Result<tauri::ipc::Response, String> {
    let c = state
        .0
        .control
        .lock()
        .map_err(|_| "Video state unavailable")?;
    let packet = if generation == c.generation {
        state
            .0
            .preview
            .get(after)
            .map(|(seq, frame)| frame.binary(seq))
            .unwrap_or_default()
    } else {
        vec![]
    };
    Ok(tauri::ipc::Response::new(packet))
}
#[tauri::command]
pub async fn open_video_io_popout(
    app: AppHandle,
    state: State<'_, VideoIoState>,
    request: NativeOutputWindowRequest,
) -> Result<(), String> {
    // Existing output ownership is ended before installing the shared presentation target.
    app.state::<crate::native_output::NativeOutputState>()
        .stop_and_destroy();
    let window = crate::native_output::ensure_native_window(&app, &request)?;
    let shared = state.0.clone();
    let id = window.clone();
    window.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::Destroyed) {
            if let Ok(mut c) = shared.control.lock() {
                if c.popout.as_ref().is_some_and(|w| w == &id) {
                    c.popout = None;
                }
            }
        }
    });
    state
        .0
        .control
        .lock()
        .map_err(|_| "Video state unavailable")?
        .popout = Some(window);
    start(&app, &state);
    Ok(())
}

struct Worker {
    stop: Arc<AtomicBool>,
    handle: Option<thread::JoinHandle<()>>,
}
impl Drop for Worker {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Release);
        if let Some(handle) = self.handle.take() {
            let _ = handle.join();
        }
    }
}
fn receiver_worker(
    api: Arc<ndi::Api>,
    source: ndi::DiscoveredSource,
    slot: Arc<LatestFrame>,
) -> Result<Worker, String> {
    let mut receiver = ndi::Receiver::new(api.clone(), &source)?;
    let stop = Arc::new(AtomicBool::new(false));
    let quit = stop.clone();
    let handle = thread::spawn(move || {
        let mut last = Instant::now();
        while !quit.load(Ordering::Acquire) {
            match receiver.receive(50) {
                Ok(Some(frame)) => {
                    last = Instant::now();
                    slot.set(frame);
                }
                Ok(None) => {}
                Err(_) => thread::sleep(Duration::from_millis(50)),
            }
            // A restarted sender can keep its name but change network address.
            // Rediscovery stays on this worker so output cadence is unaffected.
            if last.elapsed() > SOURCE_HOLD + RECONNECT {
                last = Instant::now();
                if let Ok(mut finder) = ndi::Finder::new(api.clone()) {
                    let matches: Vec<_> = finder
                        .sources(500)
                        .into_iter()
                        .filter(|s| s.name == source.name)
                        .collect();
                    if matches.len() == 1 {
                        if let Ok(next) = ndi::Receiver::new(api.clone(), &matches[0]) {
                            receiver = next;
                        }
                    }
                }
            }
        }
    });
    Ok(Worker {
        stop,
        handle: Some(handle),
    })
}
fn sender_worker(
    api: Arc<ndi::Api>,
    name: &str,
    slot: Arc<LatestFrame>,
) -> Result<(Worker, String), String> {
    let mut sender = ndi::Sender::new(api, name)?;
    let identity = sender.source().name;
    let stop = Arc::new(AtomicBool::new(false));
    let quit = stop.clone();
    let handle = thread::spawn(move || {
        let mut seq = 0;
        while !quit.load(Ordering::Acquire) {
            if let Some((version, frame)) = slot.get(seq) {
                seq = version;
                sender.send(&frame);
            } else {
                thread::sleep(Duration::from_millis(2));
            }
        }
    });
    Ok((
        Worker {
            stop,
            handle: Some(handle),
        },
        identity,
    ))
}

fn run(app: &AppHandle, shared: &Arc<Shared>) -> Result<(), String> {
    let mut renderer = NativeGpuPresenter::offscreen(1920, 1080)?;
    let device = renderer.device.clone();
    let queue = renderer.queue.clone();
    let in_flight = Arc::new(AtomicUsize::new(0));
    let mut busy_drops = 0;
    let blitter = gpu::Blitter::new(&device, wgpu::TextureFormat::Rgba8Unorm);
    let mut input_texture = None;
    let mut output = gpu::texture(&device, 1920, 1080);
    let mut rendered = gpu::texture(&device, 1920, 1080);
    let incoming = Arc::new(LatestFrame::default());
    let outgoing = Arc::new(LatestFrame::default());
    let mut ndi_input: Option<Worker> = None;
    let mut ndi_output: Option<Worker> = None;
    #[cfg(target_os = "macos")]
    let mut syphon_input: Option<super::syphon::Receiver> = None;
    #[cfg(target_os = "macos")]
    let mut syphon_output: Option<super::syphon::Publisher> = None;
    let mut active = Config::default();
    let mut generation = 0;
    let mut sequence = 0;
    let mut pixels_sequence = 0;
    let mut input_readback = gpu::Readback::default();
    let mut output_readback = gpu::Readback::default();
    #[cfg(target_os = "macos")]
    let mut preview_texture = None;
    let mut mirror_texture = None;
    let mut ndi_retry = Instant::now();
    let mut syphon_retry = Instant::now();
    let clock = Instant::now();
    let mut last_received = Instant::now() - SOURCE_HOLD;
    let mut next_retry = Instant::now();
    let mut frame_index = 0;
    let mut window_target: Option<(tauri::Window, NativeGpuPresenter, gpu::Blitter)> = None;
    while !shared.stop.load(Ordering::Acquire) {
        let tick = Instant::now();
        let (config, payload, gen, source, window) = {
            let c = shared
                .control
                .lock()
                .map_err(|_| "Video state unavailable")?;
            (
                c.config.clone(),
                c.payload.clone(),
                c.generation,
                c.config
                    .input
                    .as_ref()
                    .and_then(|i| {
                        c.sources
                            .iter()
                            .find(|s| s.id == i.id && s.protocol == i.protocol)
                    })
                    .cloned(),
                c.popout.clone(),
            )
        };
        if gen != generation {
            ndi_input = None;
            #[cfg(target_os = "macos")]
            {
                syphon_input = None;
            }
            renderer.reset_history();
            input_texture = None;
            mirror_texture = None;
            input_readback = gpu::Readback::default();
            output_readback = gpu::Readback::default();
            outgoing.clear();
            #[cfg(target_os = "macos")]
            {
                preview_texture = None;
            }
            incoming.clear();
            sequence = 0;
            pixels_sequence = 0;
            last_received = Instant::now() - SOURCE_HOLD;
            next_retry = Instant::now();
            generation = gen;
        }
        if config.input.is_some() && Instant::now() >= next_retry {
            next_retry = Instant::now() + RECONNECT;
            if let Some(source) = &source {
                let result = match source.protocol {
                    Protocol::Ndi if ndi_input.is_none() => ndi::Api::load(&ndi_path(app))
                        .and_then(|api| {
                            receiver_worker(
                                api,
                                ndi::DiscoveredSource {
                                    name: source.name.clone(),
                                    url: source.url.clone(),
                                },
                                incoming.clone(),
                            )
                        })
                        .map(|worker| ndi_input = Some(worker)),
                    Protocol::Syphon => {
                        #[cfg(target_os = "macos")]
                        {
                            if syphon_input.is_none()
                                || last_received.elapsed() > SOURCE_HOLD + RECONNECT
                            {
                                load_syphon(app)
                                    .and_then(|_| {
                                        let available = super::syphon::sources()?;
                                        let candidates: Vec<_> = available
                                            .iter()
                                            .filter(|s| {
                                                s.id == source.id
                                                    || format!("{} — {}", s.app, s.name)
                                                        == source.name
                                            })
                                            .collect();
                                        let id = available
                                            .iter()
                                            .find(|s| s.id == source.id)
                                            .or_else(|| {
                                                if candidates.len() == 1 {
                                                    Some(candidates[0])
                                                } else {
                                                    None
                                                }
                                            })
                                            .ok_or("Syphon source unavailable")?;
                                        super::syphon::Receiver::new(&device, &id.id)
                                    })
                                    .map(|r| syphon_input = Some(r))
                            } else {
                                Ok(())
                            }
                        }
                        #[cfg(not(target_os = "macos"))]
                        {
                            Err("Syphon is available on macOS".into())
                        }
                    }
                    _ => Ok(()),
                };
                if result.is_err() {
                    shared.control.lock().unwrap().status.error =
                        Some("Live input is unavailable; reconnecting".into());
                }
            }
        }
        if config.mirror != active.mirror {
            mirror_texture = None;
        }
        if config.name != active.name {
            ndi_retry = Instant::now();
            syphon_retry = Instant::now();
            ndi_output = None;
            #[cfg(target_os = "macos")]
            {
                syphon_output = None;
            }
        }
        if !config.ndi {
            ndi_output = None;
            ndi_retry = Instant::now();
        } else if ndi_output.is_none() && Instant::now() >= ndi_retry {
            ndi_retry = Instant::now() + RECONNECT;
            outgoing.clear();
            match ndi::Api::load(&ndi_path(app))
                .and_then(|api| sender_worker(api, &config.name, outgoing.clone()))
            {
                Ok((worker, name)) => {
                    ndi_output = Some(worker);
                    shared.control.lock().unwrap().own_ndi = name;
                }
                Err(e) => {
                    shared.control.lock().unwrap().status.error = Some(e);
                }
            }
        }
        #[cfg(target_os = "macos")]
        {
            if !config.syphon {
                syphon_output = None;
                syphon_retry = Instant::now();
            } else if syphon_output.is_none() && Instant::now() >= syphon_retry {
                syphon_retry = Instant::now() + RECONNECT;
                match load_syphon(app)
                    .and_then(|_| super::syphon::Publisher::new(&device, &config.name))
                {
                    Ok(p) => {
                        shared.control.lock().unwrap().own_syphon = p.id.clone();
                        syphon_output = Some(p);
                    }
                    Err(e) => shared.control.lock().unwrap().status.error = Some(e),
                }
            }
        }
        let new_window = window
            .as_ref()
            .is_some_and(|w| window_target.as_ref().is_none_or(|(old, _, _)| old != w));
        if window.is_none() {
            window_target = None;
        }
        if new_window {
            let window = window.clone().unwrap();
            #[cfg(target_os = "macos")]
            let result = {
                let main_window = window.clone();
                let (tx, rx) = std::sync::mpsc::sync_channel(1);
                app.run_on_main_thread(move || {
                    let _ = tx.send(NativeGpuPresenter::new_with_metal_view_on_current_thread(
                        &main_window,
                    ));
                })
                .map_err(|_| "Output window unavailable")?;
                rx.recv_timeout(Duration::from_secs(5))
                    .map_err(|_| "Output window timed out")?
            };
            #[cfg(not(target_os = "macos"))]
            let result = NativeGpuPresenter::new(&window);
            if let Ok(p) = result {
                if p.device == device {
                    let b = gpu::Blitter::new(&p.device, p.surface_format());
                    window_target = Some((window, p, b));
                }
            }
        }
        active = config.clone();
        let _ = device.poll(wgpu::PollType::Poll);
        if in_flight.load(Ordering::Acquire) >= 3 {
            busy_drops += 1;
            shared.control.lock().unwrap().status.dropped =
                busy_drops + output_readback.dropped + input_readback.dropped;
            thread::sleep(Duration::from_secs_f64(1.0 / config.fps as f64));
            continue;
        }
        if let Some(frame) = input_readback.take(false) {
            shared.preview.set(frame);
        }
        if let Some(mut frame) = output_readback.take(false) {
            frame.rate_n = config.fps;
            outgoing.set(frame);
        }
        if let Some((seq, frame)) = incoming.get(sequence) {
            sequence = seq;
            last_received = frame.received_at;
            gpu::upload(&device, &queue, &mut input_texture, &frame);
            shared.preview.set((*frame).clone());
        }
        #[cfg(target_os = "macos")]
        if let Some(receiver) = &mut syphon_input {
            if let Ok(Some((_, texture))) = receiver.receive(&device) {
                last_received = Instant::now();
                if preview_texture.as_ref().is_none_or(|t: &wgpu::Texture| {
                    (t.width(), t.height()) != (texture.width(), texture.height())
                }) {
                    preview_texture =
                        Some(gpu::texture(&device, texture.width(), texture.height()));
                }
                let preview = preview_texture.as_ref().unwrap();
                blitter.draw(
                    &device,
                    &queue,
                    &texture,
                    &preview.create_view(&Default::default()),
                    false,
                    false,
                );
                input_readback.schedule(&device, &queue, preview);
                input_texture = Some(texture);
            }
        }
        if let Some((seq, frame)) = shared.pixels.get(pixels_sequence) {
            pixels_sequence = seq;
            if config.mirror {
                gpu::upload(&device, &queue, &mut mirror_texture, &frame);
            } else if config.input.is_none() {
                gpu::upload(&device, &queue, &mut input_texture, &frame);
                last_received = frame.received_at;
            }
        }
        let connected = config.input.is_some() && last_received.elapsed() <= SOURCE_HOLD;
        if config.input.is_some()
            && !connected
            && input_texture.as_ref().is_none_or(|t| t.width() != 1)
        {
            let blank = VideoFrame::new(1, 1, vec![0; 4])?;
            gpu::upload(&device, &queue, &mut input_texture, &blank);
            shared.preview.set(blank);
        }
        let has_outputs = config.ndi || config.syphon || window_target.is_some();
        if has_outputs {
            if (output.width(), output.height()) != (config.width, config.height) {
                output = gpu::texture(&device, config.width, config.height);
                rendered = gpu::texture(&device, config.width, config.height);
            }
            let mut ready = false;
            if config.input.is_some() && !connected {
                if let Some(source) = &input_texture {
                    blitter.draw(
                        &device,
                        &queue,
                        source,
                        &output.create_view(&Default::default()),
                        false,
                        false,
                    );
                    ready = true;
                }
            } else if config.mirror {
                if let Some(source) = &mirror_texture {
                    blitter.draw(
                        &device,
                        &queue,
                        source,
                        &output.create_view(&Default::default()),
                        false,
                        false,
                    );
                    ready = true;
                }
            } else if let (Some(source), Some(payload)) = (&input_texture, &payload) {
                let visual_frame = (clock.elapsed().as_secs_f64()
                    * payload.params.fps.unwrap_or(24.0).max(1.0))
                    as usize;
                renderer.render_texture(source, &rendered, payload, visual_frame)?;
                blitter.draw(
                    &device,
                    &queue,
                    &rendered,
                    &output.create_view(&Default::default()),
                    true,
                    false,
                );
                ready = true;
            }
            if ready {
                if ndi_output.is_some() {
                    output_readback.schedule(&device, &queue, &output);
                }
                #[cfg(target_os = "macos")]
                if let Some(publisher) = &mut syphon_output {
                    publisher.publish(&device, &queue, &output);
                }
                if let Some((window, presenter, blitter)) = &mut window_target {
                    let _ = presenter.present_texture(window, blitter, &output);
                }
                frame_index += 1;
            }
        }
        {
            let mut c = shared.control.lock().unwrap();
            c.status.input = if config.input.is_none() {
                "off"
            } else if connected {
                "connected"
            } else {
                "disconnected"
            }
            .into();
            c.status.ndi = if ndi_output.is_some() {
                "sending"
            } else {
                "off"
            }
            .into();
            #[cfg(target_os = "macos")]
            {
                c.status.syphon = if syphon_output.is_some() {
                    "sharing"
                } else {
                    "off"
                }
                .into();
            }
            if (config.input.is_none() || connected) && (!config.ndi || ndi_output.is_some()) {
                #[cfg(target_os = "macos")]
                let outputs_ok = !config.syphon || syphon_output.is_some();
                #[cfg(not(target_os = "macos"))]
                let outputs_ok = true;
                if outputs_ok {
                    c.status.error = None;
                }
            }
            c.status.frames = frame_index as u64;
            c.status.dropped = busy_drops + output_readback.dropped + input_readback.dropped;
        }
        if has_outputs || config.input.is_some() {
            in_flight.fetch_add(1, Ordering::AcqRel);
            let pending = in_flight.clone();
            queue.on_submitted_work_done(move || {
                pending.fetch_sub(1, Ordering::Release);
            });
        }
        let period = if has_outputs || config.input.is_some() {
            Duration::from_secs_f64(1.0 / config.fps as f64)
        } else {
            Duration::from_millis(100)
        };
        if let Some(wait) = period.checked_sub(tick.elapsed()) {
            thread::sleep(wait);
        }
    }
    drop(ndi_input);
    drop(ndi_output);
    let _ = device.poll(wgpu::PollType::wait_indefinitely());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn configuration_is_bounded_and_defaults_to_no_sharing() {
        let mut c = Config::default();
        assert!(c.validate().is_ok());
        assert!(!c.ndi && !c.syphon && c.input.is_none());
        c.width = 4096;
        assert!(c.validate().is_err());
        c.width = 1920;
        c.name = "bad\nname".into();
        assert!(c.validate().is_err());
        c.name = "Test".into();
        c.fps = 1000;
        assert!(c.validate().is_err());
    }
}
