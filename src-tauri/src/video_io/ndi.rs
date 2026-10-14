//! Minimal bindings to the documented NDI C ABI. No SDK headers are redistributed.
use super::frame::{frame_len, VideoFrame, MAX_FRAME_BYTES};
use libloading::Library;
use std::ffi::{c_char, c_void, CStr, CString};
use std::path::Path;
use std::sync::{Arc, Mutex, OnceLock};

#[repr(C)]
struct Source {
    name: *const c_char,
    url: *const c_char,
}
#[repr(C)]
struct FindSettings {
    local: bool,
    groups: *const c_char,
    ips: *const c_char,
}
#[repr(C)]
struct ReceiveSettings {
    source: Source,
    color: i32,
    bandwidth: i32,
    fields: bool,
    name: *const c_char,
}
#[repr(C)]
struct SendSettings {
    name: *const c_char,
    groups: *const c_char,
    video_clock: bool,
    audio_clock: bool,
}
#[repr(C)]
#[derive(Default)]
struct Frame {
    width: i32,
    height: i32,
    fourcc: u32,
    rate_n: i32,
    rate_d: i32,
    aspect: f32,
    format: i32,
    timecode: i64,
    data: *mut u8,
    stride: i32,
    metadata: *const c_char,
    timestamp: i64,
}
type Handle = *mut c_void;

pub struct Api {
    _library: Library,
    initialized: bool,
    destroy: unsafe extern "C" fn(),
    version: unsafe extern "C" fn() -> *const c_char,
    find_create: unsafe extern "C" fn(*const FindSettings) -> Handle,
    find_destroy: unsafe extern "C" fn(Handle),
    find_wait: unsafe extern "C" fn(Handle, u32) -> bool,
    find_sources: unsafe extern "C" fn(Handle, *mut u32) -> *const Source,
    recv_create: unsafe extern "C" fn(*const ReceiveSettings) -> Handle,
    recv_destroy: unsafe extern "C" fn(Handle),
    recv_capture: unsafe extern "C" fn(Handle, *mut Frame, *mut c_void, *mut c_void, u32) -> i32,
    recv_free: unsafe extern "C" fn(Handle, *const Frame),
    send_create: unsafe extern "C" fn(*const SendSettings) -> Handle,
    send_destroy: unsafe extern "C" fn(Handle),
    send_video: unsafe extern "C" fn(Handle, *const Frame),
    send_source: unsafe extern "C" fn(Handle) -> *const Source,
    send_connections: unsafe extern "C" fn(Handle, u32) -> i32,
}

impl Api {
    pub fn load(path: &Path) -> Result<Arc<Self>, String> {
        // Keep the initialized SDK for this process. Networking belongs to
        // finder/receiver/sender handles, all of which stop when disabled. This
        // also serializes global initialization against concurrent discovery.
        static CURRENT: OnceLock<Mutex<Option<Arc<Api>>>> = OnceLock::new();
        let mut current = CURRENT
            .get_or_init(|| Mutex::new(None))
            .lock()
            .map_err(|_| "NDI runtime lock unavailable")?;
        if let Some(api) = current.as_ref() {
            return Ok(api.clone());
        }
        // Only the application-owned, checked runtime path is passed by callers.
        unsafe {
            let library = Library::new(path).map_err(|_| {
                "NDI runtime could not be loaded. Reinstall this build.".to_string()
            })?;
            macro_rules! symbol {
                ($name:literal) => {
                    *library
                        .get(concat!($name, "\0").as_bytes())
                        .map_err(|_| concat!("NDI runtime is missing ", $name))?
                };
            }
            let initialize: unsafe extern "C" fn() -> bool = symbol!("NDIlib_initialize");
            let mut api = Self {
                initialized: false,
                destroy: symbol!("NDIlib_destroy"),
                version: symbol!("NDIlib_version"),
                find_create: symbol!("NDIlib_find_create_v2"),
                find_destroy: symbol!("NDIlib_find_destroy"),
                find_wait: symbol!("NDIlib_find_wait_for_sources"),
                find_sources: symbol!("NDIlib_find_get_current_sources"),
                recv_create: symbol!("NDIlib_recv_create_v3"),
                recv_destroy: symbol!("NDIlib_recv_destroy"),
                recv_capture: symbol!("NDIlib_recv_capture_v3"),
                recv_free: symbol!("NDIlib_recv_free_video_v2"),
                send_create: symbol!("NDIlib_send_create"),
                send_destroy: symbol!("NDIlib_send_destroy"),
                send_video: symbol!("NDIlib_send_send_video_v2"),
                send_source: symbol!("NDIlib_send_get_source_name"),
                send_connections: symbol!("NDIlib_send_get_no_connections"),
                _library: library,
            };
            if !initialize() {
                return Err("NDI initialization failed on this system".into());
            }
            api.initialized = true;
            let api = Arc::new(api);
            *current = Some(api.clone());
            Ok(api)
        }
    }
    pub fn version(&self) -> String {
        unsafe { text((self.version)()) }
    }
}
impl Drop for Api {
    fn drop(&mut self) {
        unsafe {
            if self.initialized {
                (self.destroy)();
            }
        }
    }
}

unsafe fn text(p: *const c_char) -> String {
    if p.is_null() {
        String::new()
    } else {
        CStr::from_ptr(p).to_string_lossy().into_owned()
    }
}
fn string(value: &str) -> Result<CString, String> {
    if value.len() > 1024 {
        return Err("NDI source identifier is too long".into());
    }
    CString::new(value).map_err(|_| "Invalid NDI source identifier".into())
}

#[derive(Debug, Clone)]
pub struct DiscoveredSource {
    pub name: String,
    pub url: String,
}
pub struct Finder {
    api: Arc<Api>,
    handle: Handle,
}
unsafe impl Send for Finder {} // A finder is used by one serialized worker.
impl Finder {
    pub fn new(api: Arc<Api>) -> Result<Self, String> {
        let settings = FindSettings {
            local: true,
            groups: std::ptr::null(),
            ips: std::ptr::null(),
        };
        let handle = unsafe { (api.find_create)(&settings) };
        if handle.is_null() {
            return Err("NDI discovery could not start".into());
        }
        Ok(Self { api, handle })
    }
    pub fn sources(&mut self, wait_ms: u32) -> Vec<DiscoveredSource> {
        unsafe {
            (self.api.find_wait)(self.handle, wait_ms.min(1000));
            let mut count = 0;
            let entries = (self.api.find_sources)(self.handle, &mut count);
            if entries.is_null() {
                return Vec::new();
            }
            std::slice::from_raw_parts(entries, count.min(512) as usize)
                .iter()
                .map(|s| DiscoveredSource {
                    name: text(s.name),
                    url: text(s.url),
                })
                .collect()
        }
    }
}
impl Drop for Finder {
    fn drop(&mut self) {
        unsafe {
            (self.api.find_destroy)(self.handle);
        }
    }
}

pub struct Receiver {
    api: Arc<Api>,
    handle: Handle,
}
unsafe impl Send for Receiver {} // Owned and called by a single receive worker.
impl Receiver {
    pub fn new(api: Arc<Api>, source: &DiscoveredSource) -> Result<Self, String> {
        let name = string(&source.name)?;
        let url = string(&source.url)?;
        let settings = ReceiveSettings {
            source: Source {
                name: name.as_ptr(),
                url: if source.url.is_empty() {
                    std::ptr::null()
                } else {
                    url.as_ptr()
                },
            },
            color: 2,
            bandwidth: 100,
            fields: false,
            name: c"ASCII VJ Remix video input".as_ptr(),
        };
        let handle = unsafe { (api.recv_create)(&settings) };
        if handle.is_null() {
            return Err("NDI receiver could not start".into());
        }
        Ok(Self { api, handle })
    }
    pub fn receive(&mut self, timeout_ms: u32) -> Result<Option<VideoFrame>, String> {
        let mut raw = Frame::default();
        let kind = unsafe {
            (self.api.recv_capture)(
                self.handle,
                &mut raw,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                timeout_ms.min(100),
            )
        };
        if kind != 1 {
            return if kind == -1 {
                Err("NDI source disconnected".into())
            } else {
                Ok(None)
            };
        }
        // Free the SDK buffer even if validation/conversion fails.
        let result = self.copy_frame(&raw);
        unsafe {
            (self.api.recv_free)(self.handle, &raw);
        }
        result.map(Some)
    }
    fn copy_frame(&self, f: &Frame) -> Result<VideoFrame, String> {
        let width = u32::try_from(f.width).map_err(|_| "Invalid NDI width")?;
        let height = u32::try_from(f.height).map_err(|_| "Invalid NDI height")?;
        frame_len(width, height)?;
        let rgba = u32::from_le_bytes(*b"RGBA");
        let rgbx = u32::from_le_bytes(*b"RGBX");
        let bgra = u32::from_le_bytes(*b"BGRA");
        let bgrx = u32::from_le_bytes(*b"BGRX");
        if ![rgba, rgbx, bgra, bgrx].contains(&f.fourcc) {
            return Err("NDI returned an unsupported pixel format".into());
        }
        let stride = if f.stride == 0 {
            width as usize * 4
        } else {
            usize::try_from(f.stride).map_err(|_| "Invalid NDI stride")?
        };
        let len = stride
            .checked_mul(height as usize)
            .filter(|n| *n <= MAX_FRAME_BYTES)
            .ok_or("NDI frame exceeds memory limit")?;
        if f.data.is_null() || stride < width as usize * 4 {
            return Err("Invalid NDI frame data".into());
        }
        let bytes = unsafe { std::slice::from_raw_parts(f.data, len) };
        let mut frame = VideoFrame::from_rows(
            width,
            height,
            stride,
            bytes,
            f.fourcc == bgra || f.fourcc == bgrx,
            f.fourcc == rgbx || f.fourcc == bgrx,
        )?;
        frame.rate_n = u32::try_from(f.rate_n)
            .ok()
            .filter(|n| *n > 0 && *n <= 240_000)
            .unwrap_or(60);
        frame.rate_d = u32::try_from(f.rate_d)
            .ok()
            .filter(|n| *n > 0 && *n <= 10_000)
            .unwrap_or(1);
        frame.timecode = f.timecode;
        Ok(frame)
    }
}
impl Drop for Receiver {
    fn drop(&mut self) {
        unsafe {
            (self.api.recv_destroy)(self.handle);
        }
    }
}

pub struct Sender {
    api: Arc<Api>,
    handle: Handle,
}
unsafe impl Send for Sender {} // Native send calls are serialized by its owner.
impl Sender {
    pub fn new(api: Arc<Api>, name: &str) -> Result<Self, String> {
        let name = string(name)?;
        let settings = SendSettings {
            name: name.as_ptr(),
            groups: std::ptr::null(),
            video_clock: false,
            audio_clock: false,
        };
        let handle = unsafe { (api.send_create)(&settings) };
        if handle.is_null() {
            return Err("NDI sender could not start".into());
        }
        Ok(Self { api, handle })
    }
    pub fn source(&self) -> DiscoveredSource {
        unsafe {
            let s = (self.api.send_source)(self.handle);
            if s.is_null() {
                return DiscoveredSource {
                    name: String::new(),
                    url: String::new(),
                };
            }
            DiscoveredSource {
                name: text((*s).name),
                url: text((*s).url),
            }
        }
    }
    pub fn connections(&self) -> i32 {
        unsafe { (self.api.send_connections)(self.handle, 0) }
    }
    pub fn send(&mut self, f: &VideoFrame) {
        let raw = Frame {
            width: f.width as i32,
            height: f.height as i32,
            fourcc: u32::from_le_bytes(*b"RGBA"),
            rate_n: f.rate_n as i32,
            rate_d: f.rate_d as i32,
            aspect: f.width as f32 / f.height as f32,
            format: 1,
            timecode: f.timecode,
            data: f.rgba.as_ptr() as *mut u8,
            stride: (f.width * 4) as i32,
            metadata: std::ptr::null(),
            timestamp: 0,
        };
        // Synchronous call: the frame stays owned until compression has finished.
        unsafe {
            (self.api.send_video)(self.handle, &raw);
        }
    }
}
impl Drop for Sender {
    fn drop(&mut self) {
        unsafe {
            (self.api.send_destroy)(self.handle);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn c_abi_layout_matches_sdk_64_bit_headers() {
        assert_eq!(std::mem::size_of::<Frame>(), 72);
        assert_eq!(std::mem::offset_of!(Frame, timecode), 32);
        assert_eq!(std::mem::offset_of!(Frame, data), 40);
        assert_eq!(std::mem::size_of::<ReceiveSettings>(), 40);
        assert_eq!(std::mem::size_of::<SendSettings>(), 24);
        assert_eq!(std::mem::size_of::<FindSettings>(), 24);
    }
}
