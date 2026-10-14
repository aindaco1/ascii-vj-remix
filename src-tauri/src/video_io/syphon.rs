use super::frame::frame_len;
use objc2::{rc::Retained, runtime::ProtocolObject};
use objc2_metal::{MTLTexture, MTLTextureType};
use serde::Deserialize;
use std::{
    ffi::{c_char, c_void, CStr, CString},
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};

extern "C" {
    fn av_syphon_load(path: *const c_char) -> bool;
    fn av_syphon_sources() -> *mut c_char;
    fn av_syphon_free_string(text: *mut c_char);
    fn av_syphon_sender_create(name: *const c_char, device: *mut c_void) -> *mut c_void;
    fn av_syphon_sender_id(sender: *mut c_void) -> *mut c_char;
    fn av_syphon_publish(
        sender: *mut c_void,
        texture: *mut c_void,
        completed: extern "C" fn(*mut c_void),
        context: *mut c_void,
    );
    fn av_syphon_receiver_create(uuid: *const c_char, device: *mut c_void) -> *mut c_void;
    fn av_syphon_receive(
        receiver: *mut c_void,
        after: u64,
        sequence: *mut u64,
        width: *mut u32,
        height: *mut u32,
        format: *mut u32,
    ) -> *mut c_void;
    fn av_syphon_release(object: *mut c_void);
}

pub fn load(path: &Path) -> Result<(), String> {
    let path = CString::new(path.to_string_lossy().as_bytes())
        .map_err(|_| "Invalid Syphon bundle path")?;
    if unsafe { av_syphon_load(path.as_ptr()) } {
        Ok(())
    } else {
        Err("The bundled Syphon framework could not be loaded".into())
    }
}
unsafe fn owned_text(raw: *mut c_char) -> String {
    if raw.is_null() {
        return String::new();
    }
    let text = CStr::from_ptr(raw).to_string_lossy().into_owned();
    av_syphon_free_string(raw);
    text
}
#[derive(Debug, Deserialize)]
pub struct Source {
    pub id: String,
    pub name: String,
    pub app: String,
}
pub fn sources() -> Result<Vec<Source>, String> {
    let text = unsafe { owned_text(av_syphon_sources()) };
    serde_json::from_str(&text).map_err(|_| "Syphon discovery returned invalid data".into())
}
fn metal_device(device: &wgpu::Device) -> Result<*mut c_void, String> {
    let native = unsafe { device.as_hal::<wgpu::hal::api::Metal>() }
        .ok_or("Syphon needs the Metal backend")?;
    Ok(Retained::as_ptr(native.raw_device()) as *mut c_void)
}

struct NativeSender(usize);
unsafe impl Send for NativeSender {}
unsafe impl Sync for NativeSender {} // Kept alive until every publication completes.
impl Drop for NativeSender {
    fn drop(&mut self) {
        unsafe {
            av_syphon_release(self.0 as *mut c_void);
        }
    }
}
struct ExportSlot {
    texture: wgpu::Texture,
    busy: Arc<AtomicBool>,
}
pub struct Publisher {
    sender: Arc<NativeSender>,
    pub id: String,
    slots: Vec<ExportSlot>,
    size: (u32, u32, wgpu::TextureFormat),
}
struct Pending {
    _sender: Arc<NativeSender>,
    _texture: wgpu::Texture,
    busy: Arc<AtomicBool>,
}
extern "C" fn published(context: *mut c_void) {
    let pending = unsafe { Box::from_raw(context as *mut Pending) };
    pending.busy.store(false, Ordering::Release);
}
impl Publisher {
    pub fn new(device: &wgpu::Device, name: &str) -> Result<Self, String> {
        let name = CString::new(name).map_err(|_| "Invalid output name")?;
        let ptr = unsafe { av_syphon_sender_create(name.as_ptr(), metal_device(device)?) };
        if ptr.is_null() {
            return Err("Syphon output could not start".into());
        }
        let id = unsafe { owned_text(av_syphon_sender_id(ptr)) };
        Ok(Self {
            sender: Arc::new(NativeSender(ptr as usize)),
            id,
            slots: vec![],
            size: (0, 0, wgpu::TextureFormat::Rgba8Unorm),
        })
    }
    pub fn publish(
        &mut self,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        source: &wgpu::Texture,
    ) -> bool {
        let size = (source.width(), source.height(), source.format());
        if self.size != size {
            self.slots = (0..3)
                .map(|_| ExportSlot {
                    texture: device.create_texture(&wgpu::TextureDescriptor {
                        label: Some("Syphon retained export frame"),
                        size: source.size(),
                        mip_level_count: 1,
                        sample_count: 1,
                        dimension: wgpu::TextureDimension::D2,
                        format: source.format(),
                        usage: wgpu::TextureUsages::COPY_DST | wgpu::TextureUsages::TEXTURE_BINDING,
                        view_formats: &[],
                    }),
                    busy: Arc::new(AtomicBool::new(false)),
                })
                .collect();
            self.size = size;
        }
        let Some(slot) = self
            .slots
            .iter()
            .find(|s| !s.busy.swap(true, Ordering::AcqRel))
        else {
            return false;
        };
        let Some(native) = (unsafe { slot.texture.as_hal::<wgpu::hal::api::Metal>() }) else {
            slot.busy.store(false, Ordering::Release);
            return false;
        };
        let raw = native.raw_handle() as *const _ as usize;
        let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("Syphon export copy"),
        });
        encoder.copy_texture_to_texture(
            source.as_image_copy(),
            slot.texture.as_image_copy(),
            source.size(),
        );
        queue.submit([encoder.finish()]);
        let sender = self.sender.clone();
        let texture = slot.texture.clone();
        let busy = slot.busy.clone();
        // The extra queue only reads after wgpu finishes. Its completion keeps the
        // isolated export slot unavailable until Syphon has completed its copy.
        queue.on_submitted_work_done(move || {
            let ptr = sender.0;
            let context = Box::into_raw(Box::new(Pending {
                _sender: sender,
                _texture: texture,
                busy,
            }));
            unsafe {
                av_syphon_publish(
                    ptr as *mut c_void,
                    raw as *mut c_void,
                    published,
                    context as *mut c_void,
                );
            }
        });
        true
    }
}

pub struct Receiver {
    pointer: usize,
    sequence: u64,
}
unsafe impl Send for Receiver {} // Single render-worker ownership.
impl Receiver {
    pub fn new(device: &wgpu::Device, id: &str) -> Result<Self, String> {
        let id = CString::new(id).map_err(|_| "Invalid Syphon source")?;
        let pointer = unsafe { av_syphon_receiver_create(id.as_ptr(), metal_device(device)?) };
        if pointer.is_null() {
            return Err("The Syphon source is no longer available".into());
        }
        Ok(Self {
            pointer: pointer as usize,
            sequence: 0,
        })
    }
    pub fn receive(
        &mut self,
        device: &wgpu::Device,
    ) -> Result<Option<(u64, wgpu::Texture)>, String> {
        let (mut sequence, mut width, mut height, mut format) = (0, 0, 0, 0);
        let raw = unsafe {
            av_syphon_receive(
                self.pointer as *mut c_void,
                self.sequence,
                &mut sequence,
                &mut width,
                &mut height,
                &mut format,
            )
        };
        if raw.is_null() {
            return Ok(None);
        }
        let texture: Retained<ProtocolObject<dyn MTLTexture>> =
            unsafe { Retained::from_raw(raw.cast()) }.ok_or("Invalid Syphon texture")?;
        frame_len(width, height)?;
        let format = match format {
            70 => wgpu::TextureFormat::Rgba8Unorm,
            71 => wgpu::TextureFormat::Rgba8UnormSrgb,
            80 => wgpu::TextureFormat::Bgra8Unorm,
            81 => wgpu::TextureFormat::Bgra8UnormSrgb,
            _ => return Err("Syphon input requires an 8-bit RGBA/BGRA texture".into()),
        };
        let desc = wgpu::TextureDescriptor {
            label: Some("Syphon received GPU frame"),
            size: wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_SRC,
            view_formats: &[],
        };
        let hal = unsafe {
            wgpu::hal::metal::Device::texture_from_raw(
                texture,
                format,
                MTLTextureType::Type2D,
                1,
                1,
                wgpu::hal::CopyExtent {
                    width,
                    height,
                    depth: 1,
                },
            )
        };
        let imported =
            unsafe { device.create_texture_from_hal::<wgpu::hal::api::Metal>(hal, &desc) };
        self.sequence = sequence;
        Ok(Some((sequence, imported)))
    }
}
impl Drop for Receiver {
    fn drop(&mut self) {
        unsafe {
            av_syphon_release(self.pointer as *mut c_void);
        }
    }
}
