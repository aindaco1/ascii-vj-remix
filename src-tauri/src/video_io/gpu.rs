//! Shared, bounded texture upload/readback and presentation. No transport owns a renderer.
use super::frame::{frame_len, unpremultiply, VideoFrame};
use std::sync::{
    atomic::{AtomicU8, Ordering},
    Arc,
};

pub fn texture(device: &wgpu::Device, width: u32, height: u32) -> wgpu::Texture {
    device.create_texture(&wgpu::TextureDescriptor {
        label: Some("Video I/O frame"),
        size: wgpu::Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Rgba8Unorm,
        usage: wgpu::TextureUsages::COPY_DST
            | wgpu::TextureUsages::COPY_SRC
            | wgpu::TextureUsages::TEXTURE_BINDING
            | wgpu::TextureUsages::RENDER_ATTACHMENT,
        view_formats: &[],
    })
}
pub fn upload(
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    target: &mut Option<wgpu::Texture>,
    frame: &VideoFrame,
) {
    if target
        .as_ref()
        .is_none_or(|t| (t.width(), t.height()) != (frame.width, frame.height))
    {
        *target = Some(texture(device, frame.width, frame.height));
    }
    queue.write_texture(
        target.as_ref().unwrap().as_image_copy(),
        &frame.rgba,
        wgpu::TexelCopyBufferLayout {
            offset: 0,
            bytes_per_row: Some(frame.width * 4),
            rows_per_image: Some(frame.height),
        },
        wgpu::Extent3d {
            width: frame.width,
            height: frame.height,
            depth_or_array_layers: 1,
        },
    );
}

struct ReadSlot {
    buffer: wgpu::Buffer,
    state: Arc<AtomicU8>,
    sequence: u64,
}
pub struct Readback {
    slots: Vec<ReadSlot>,
    size: (u32, u32),
    stride: u32,
    next: u64,
    delivered: u64,
    pub dropped: u64,
}
impl Default for Readback {
    fn default() -> Self {
        Self {
            slots: vec![],
            size: (0, 0),
            stride: 0,
            next: 0,
            delivered: 0,
            dropped: 0,
        }
    }
}
impl Readback {
    pub fn schedule(&mut self, device: &wgpu::Device, queue: &wgpu::Queue, source: &wgpu::Texture) {
        let size = (source.width(), source.height());
        if size != self.size {
            self.size = size;
            self.stride = (size.0 * 4).div_ceil(256) * 256;
            self.slots = (0..3)
                .map(|_| ReadSlot {
                    buffer: device.create_buffer(&wgpu::BufferDescriptor {
                        label: Some("Video I/O bounded readback"),
                        size: u64::from(self.stride) * u64::from(size.1),
                        usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
                        mapped_at_creation: false,
                    }),
                    state: Arc::new(AtomicU8::new(0)),
                    sequence: 0,
                })
                .collect();
        }
        let Some(slot) = self
            .slots
            .iter_mut()
            .find(|s| s.state.load(Ordering::Acquire) == 0)
        else {
            self.dropped += 1;
            return;
        };
        self.next += 1;
        slot.sequence = self.next;
        slot.state.store(1, Ordering::Release);
        let mut encoder = device.create_command_encoder(&Default::default());
        encoder.copy_texture_to_buffer(
            source.as_image_copy(),
            wgpu::TexelCopyBufferInfo {
                buffer: &slot.buffer,
                layout: wgpu::TexelCopyBufferLayout {
                    offset: 0,
                    bytes_per_row: Some(self.stride),
                    rows_per_image: Some(size.1),
                },
            },
            source.size(),
        );
        queue.submit([encoder.finish()]);
        let state = slot.state.clone();
        slot.buffer
            .map_async(wgpu::MapMode::Read, .., move |result| {
                state.store(if result.is_ok() { 2 } else { 3 }, Ordering::Release);
            });
    }
    pub fn take(&mut self, premultiplied: bool) -> Option<VideoFrame> {
        let mut latest = None;
        for slot in &mut self.slots {
            match slot.state.load(Ordering::Acquire) {
                2 => {
                    if slot.sequence > self.delivered {
                        let bytes = slot.buffer.get_mapped_range(..);
                        if let Ok(mut frame) = VideoFrame::from_rows(
                            self.size.0,
                            self.size.1,
                            self.stride as usize,
                            &bytes,
                            false,
                            false,
                        ) {
                            if premultiplied {
                                unpremultiply(&mut frame.rgba);
                            }
                            latest = Some(frame);
                            self.delivered = slot.sequence;
                        }
                    }
                    slot.buffer.unmap();
                    slot.state.store(0, Ordering::Release);
                }
                3 => {
                    slot.buffer.unmap();
                    slot.state.store(0, Ordering::Release);
                    self.dropped += 1;
                }
                _ => {}
            }
        }
        latest
    }
}

pub struct Blitter {
    pipeline: wgpu::RenderPipeline,
    sampler: wgpu::Sampler,
    uniform: wgpu::Buffer,
}
impl Blitter {
    pub fn new(device: &wgpu::Device, format: wgpu::TextureFormat) -> Self {
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Video I/O presentation"),
            source: wgpu::ShaderSource::Wgsl(
                r#"
struct Vertex { @builtin(position) p: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) i:u32) -> Vertex {
    let uv = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
    return Vertex(vec4f(uv * vec2f(2.,-2.) + vec2f(-1.,1.),0.,1.),uv);
}
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var smp: sampler;
@group(0) @binding(2) var<uniform> options: vec4f;
@group(0) @binding(3) var second: texture_2d<f32>;
@fragment fn fs(v:Vertex) -> @location(0) vec4f {
    var c = textureSample(source,smp,v.uv);
    if(options.z > 0.5) { c = mix(c, textureSample(second,smp,v.uv), options.w); }
    if(options.x > 0.5) { c = vec4f(select(vec3f(0.), c.rgb / max(c.a, 0.00001), c.a > 0.), c.a); }
    if(options.y > 0.5) { c = vec4f(c.rgb * c.a + vec3f(3./255.,4./255.,5./255.) * (1.-c.a), 1.); }
    return c;
}
"#
                .into(),
            ),
        });
        let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("Video I/O blit"),
            layout: None,
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: Some("vs"),
                compilation_options: Default::default(),
                buffers: &[],
            },
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: Some("fs"),
                compilation_options: Default::default(),
                targets: &[Some(wgpu::ColorTargetState {
                    format,
                    blend: None,
                    write_mask: wgpu::ColorWrites::ALL,
                })],
            }),
            primitive: Default::default(),
            depth_stencil: None,
            multisample: Default::default(),
            multiview_mask: None,
            cache: None,
        });
        let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            ..Default::default()
        });
        let uniform = device.create_buffer(&wgpu::BufferDescriptor {
            label: None,
            size: 16,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        Self {
            pipeline,
            sampler,
            uniform,
        }
    }
    pub fn draw(
        &self,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        source: &wgpu::Texture,
        target: &wgpu::TextureView,
        unpremultiply: bool,
        flatten: bool,
    ) {
        self.draw_inner(
            device,
            queue,
            source,
            source,
            target,
            [
                if unpremultiply { 1f32 } else { 0. },
                if flatten { 1f32 } else { 0. },
                0.,
                0.,
            ],
        );
    }
    pub fn mix(
        &self,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        a: &wgpu::Texture,
        b: &wgpu::Texture,
        target: &wgpu::TextureView,
        amount: f32,
    ) {
        self.draw_inner(
            device,
            queue,
            a,
            b,
            target,
            [0., 0., 1., amount.clamp(0., 1.)],
        );
    }
    fn draw_inner(
        &self,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        source: &wgpu::Texture,
        second: &wgpu::Texture,
        target: &wgpu::TextureView,
        flags: [f32; 4],
    ) {
        let bytes: Vec<u8> = flags.iter().flat_map(|f| f.to_le_bytes()).collect();
        queue.write_buffer(&self.uniform, 0, &bytes);
        let view = source.create_view(&Default::default());
        let second_view = second.create_view(&Default::default());
        let bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: None,
            layout: &self.pipeline.get_bind_group_layout(0),
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(&view),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::Sampler(&self.sampler),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: self.uniform.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 3,
                    resource: wgpu::BindingResource::TextureView(&second_view),
                },
            ],
        });
        let mut encoder = device.create_command_encoder(&Default::default());
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: None,
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: target,
                    depth_slice: None,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });
            pass.set_pipeline(&self.pipeline);
            pass.set_bind_group(0, &bind, &[]);
            pass.draw(0..3, 0..1);
        }
        queue.submit([encoder.finish()]);
    }
}

pub fn validate_texture(width: u32, height: u32) -> Result<(), String> {
    frame_len(width, height).map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    #[ignore = "Requires a native GPU; run for installed-platform acceptance"]
    fn native_gpu_coverage_and_bounded_readback() {
        use crate::native_output::{
            gpu::NativeGpuPresenter, NativeOutputParams, NativeOutputPayload,
        };
        let mut renderer = NativeGpuPresenter::offscreen(64, 32).unwrap();
        let device = renderer.device.clone();
        let queue = renderer.queue.clone();
        let output = texture(&device, 64, 32);
        let mut source = None;
        let mut params = NativeOutputParams::default();
        params.cols = Some(8.);
        params.cell_width = Some(1.);
        params.cell_height = Some(1.);
        let payload = NativeOutputPayload {
            output_mode: None,
            label: None,
            native_source_id: None,
            params,
            media_state: None,
            transition: None,
        };
        let mut readback = Readback::default();
        for alpha in [0, 128, 255] {
            let pixels = [0, 0, 0, alpha].repeat(64 * 32);
            upload(
                &device,
                &queue,
                &mut source,
                &VideoFrame::new(64, 32, pixels).unwrap(),
            );
            renderer
                .render_texture(source.as_ref().unwrap(), &output, &payload, 0)
                .unwrap();
            for _ in 0..8 {
                readback.schedule(&device, &queue, &output);
            }
            assert!(
                readback.dropped >= 5,
                "in-flight queue must stay bounded at three"
            );
            device.poll(wgpu::PollType::wait_indefinitely()).unwrap();
            let frame = readback.take(true).expect("GPU frame");
            assert!(
                frame
                    .rgba
                    .chunks_exact(4)
                    .all(|p| p[3].abs_diff(alpha) <= 1),
                "coverage must survive glyph and background composition: {alpha}"
            );
        }
        let mut fade = payload.clone();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs_f64()
            * 1000.;
        fade.transition = Some(crate::native_output::NativeOutputTransition {
            kind: Some("crossfade".into()),
            start_at_unix_ms: Some(now - 5000.),
            duration_ms: Some(10000.),
            from_params: fade.params.clone(),
        });
        upload(
            &device,
            &queue,
            &mut source,
            &VideoFrame::new(64, 32, [80, 120, 180, 128].repeat(64 * 32)).unwrap(),
        );
        renderer
            .render_texture(source.as_ref().unwrap(), &output, &fade, 0)
            .unwrap();
        readback.schedule(&device, &queue, &output);
        device.poll(wgpu::PollType::wait_indefinitely()).unwrap();
        assert!(
            readback
                .take(true)
                .unwrap()
                .rgba
                .chunks_exact(4)
                .all(|p| p[3].abs_diff(128) <= 1),
            "Crossfade must not increase partial coverage"
        );
    }
}
