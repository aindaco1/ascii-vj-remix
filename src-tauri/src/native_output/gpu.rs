use super::{
    native_glyph_atlas_page_bytes, native_glyph_ramp_ids, native_grid_dimensions,
    native_render_uses_glyphs, native_dither_matrix, native_palette_index,
    DecodedRgbFrame, NativeRenderParams,
    DEFAULT_OUTPUT_HEIGHT, DEFAULT_OUTPUT_WIDTH,
    NATIVE_GLYPH_ATLAS_PAGE_COUNT, NATIVE_GLYPH_ATLAS_PAGE_GLYPHS,
    NATIVE_GLYPH_ATLAS_PAGE_SIZE, NATIVE_GLYPH_RAMP_BUFFER_BYTES,
    NATIVE_GLYPH_TILE_HEIGHT, NATIVE_GLYPH_TILE_WIDTH,
};
use std::borrow::Cow;
use std::collections::hash_map::DefaultHasher;
#[cfg(target_os = "macos")]
use std::ffi::c_void;
#[cfg(not(target_os = "macos"))]
use std::sync::mpsc;
use std::time::{Duration, Instant};
use std::hash::{Hash, Hasher};
use tauri::{PhysicalSize, Window};

const PALETTE_LUT_EDGE: usize = 32;
const PALETTE_LUT_SIZE: usize = PALETTE_LUT_EDGE * PALETTE_LUT_EDGE * PALETTE_LUT_EDGE;
const FEATURE_BUFFER_SIZE: usize = 16 * 16 + 64 * std::mem::size_of::<f32>();

const CELL_PASS_WGSL: &str = r#"
struct Params {
    srcW: u32,
    srcH: u32,
    cols: u32,
    rows: u32,
    cellW: u32,
    cellH: u32,
    saturationBoost: f32,
    contrastBoost: f32,
    brightness: f32,
    gamma: f32,
    bgBlend: f32,
    quantizeBits: u32,
    jitterAmount: f32,
    jitterSpeed: f32,
    sampleX: f32,
    sampleY: f32,
    time: f32,
    mirrorX: u32,
    paletteCount: u32,
    ditherSize: u32,
    ditherStrength: f32,
    ditherScale: u32,
    ditherBias: f32,
    ditherInvert: u32,
};

struct FeatureData {
    paletteColors: array<vec4<f32>, 16>,
    ditherValues: array<f32, 64>,
};

@group(0) @binding(0) var srcTex: texture_2d<f32>;
@group(0) @binding(1) var colorOut: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> params: Params;
@group(0) @binding(3) var<storage, read> paletteLut: array<u32>;
@group(0) @binding(4) var<storage, read> features: FeatureData;

fn hash(p: vec2<f32>) -> f32 {
    var p3 = fract(vec3<f32>(p.x, p.y, p.x) * 0.1031);
    p3 += dot(p3, vec3<f32>(p3.y + 33.33, p3.z + 33.33, p3.x + 33.33));
    return fract((p3.x + p3.y) * p3.z);
}

fn processColor(c: vec3<f32>, cx: u32, cy: u32) -> vec3<f32> {
    let avg = (c.r + c.g + c.b) * 0.333333333;
    var outColor = vec3<f32>(
        clamp(avg + (c.r - avg) * params.saturationBoost, 0.0, 1.0),
        clamp(avg + (c.g - avg) * params.saturationBoost, 0.0, 1.0),
        clamp(avg + (c.b - avg) * params.saturationBoost, 0.0, 1.0)
    );
    outColor = clamp((outColor - vec3<f32>(0.5)) * params.contrastBoost + vec3<f32>(0.5), vec3<f32>(0.0), vec3<f32>(1.0));
    outColor = clamp(pow(outColor * params.brightness, vec3<f32>(1.0 / max(0.01, params.gamma))), vec3<f32>(0.0), vec3<f32>(1.0));
    if (params.quantizeBits > 0u) {
        let quantum = pow(2.0, f32(params.quantizeBits));
        outColor = floor(outColor * 255.0 / quantum) * quantum / 255.0;
    }
    var result = mix(outColor, vec3<f32>(3.0 / 255.0, 4.0 / 255.0, 5.0 / 255.0), clamp(params.bgBlend, 0.0, 1.0));
    if (params.ditherSize > 0u) {
        let scale = max(1u, params.ditherScale);
        let mx = (cx / scale) % params.ditherSize;
        let my = (cy / scale) % params.ditherSize;
        var threshold = features.ditherValues[my * params.ditherSize + mx];
        if (params.ditherInvert != 0u) { threshold = -threshold; }
        let delta = threshold * params.ditherStrength * (64.0 / 255.0) + params.ditherBias * (32.0 / 255.0);
        result = clamp(result + vec3<f32>(delta), vec3<f32>(0.0), vec3<f32>(1.0));
    }
    if (params.paletteCount > 0u) {
        let q = vec3<u32>(clamp(floor(result * 255.0 / 8.0), vec3<f32>(0.0), vec3<f32>(31.0)));
        let lutIndex = (q.r << 10u) | (q.g << 5u) | q.b;
        let paletteIndex = min(paletteLut[lutIndex], params.paletteCount - 1u);
        result = features.paletteColors[paletteIndex].rgb;
    }
    return result;
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let cx = gid.x;
    let cy = gid.y;
    if (cx >= params.cols || cy >= params.rows) { return; }

    let cellW = f32(params.srcW) / f32(params.cols);
    let cellH = f32(params.srcH) / f32(params.rows);
    let seed = vec2<f32>(f32(cx) + params.time * params.jitterSpeed * 7.13, f32(cy) + params.time * params.jitterSpeed * 11.71);
    let jitterX = (hash(seed) - 0.5) * cellW * params.jitterAmount;
    let jitterY = (hash(seed + vec2<f32>(37.0, 91.0)) - 0.5) * cellH * params.jitterAmount;
    let cellCenterX = (f32(cx) + params.sampleX) * f32(params.srcW) / f32(params.cols);
    let cellCenterY = (f32(cy) + params.sampleY) * f32(params.srcH) / f32(params.rows);
    var sampleX = clamp(i32(cellCenterX + jitterX), 0, i32(params.srcW) - 1);
    if (params.mirrorX != 0u) {
        sampleX = i32(params.srcW) - 1 - sampleX;
    }
    let sampleY = clamp(i32(cellCenterY + jitterY), 0, i32(params.srcH) - 1);

    let c = textureLoad(srcTex, vec2<i32>(sampleX, sampleY), 0);
    let processed = processColor(c.rgb, cx, cy);
    let luma = dot(processed, vec3<f32>(0.2126, 0.7152, 0.0722));
    textureStore(colorOut, vec2<i32>(i32(cx), i32(cy)), vec4<f32>(processed, luma));
}
"#;

const RENDER_PASS_WGSL: &str = r#"
struct VertexOutput {
    @builtin(position) position: vec4<f32>,
};

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var positions = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -3.0),
        vec2<f32>(-1.0, 1.0),
        vec2<f32>(3.0, 1.0)
    );

    var output: VertexOutput;
    output.position = vec4<f32>(positions[vertexIndex], 0.0, 1.0);
    return output;
}

struct RenderParams {
    cols: u32,
    rows: u32,
    cellW: u32,
    cellH: u32,
    surfaceW: u32,
    surfaceH: u32,
    glyphMode: u32,
    glyphCount: u32,
    glyphTileW: u32,
    glyphTileH: u32,
    glyphColorMode: u32,
    glyphColor: u32,
    backgroundColor: u32,
    _pad0: u32,
    _pad1: u32,
    _pad2: u32,
};

@group(0) @binding(0) var cellColorTex: texture_2d<f32>;
@group(0) @binding(1) var<uniform> params: RenderParams;
@group(0) @binding(2) var glyphAtlasTex: texture_2d_array<f32>;
@group(0) @binding(3) var<storage, read> glyphRamp: array<u32>;

fn unpackColor(value: u32) -> vec3<f32> {
    return vec3<f32>(
        f32(value & 255u),
        f32((value >> 8u) & 255u),
        f32((value >> 16u) & 255u)
    ) / 255.0;
}

@fragment
fn fragmentMain(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
    let renderW = f32(params.cols * params.cellW);
    let renderH = f32(params.rows * params.cellH);
    let surfaceW = f32(params.surfaceW);
    let surfaceH = f32(params.surfaceH);
    let scale = max(surfaceW / renderW, surfaceH / renderH);
    let offsetX = (surfaceW - renderW * scale) * 0.5;
    let offsetY = (surfaceH - renderH * scale) * 0.5;
    let renderX = (position.x - offsetX) / scale;
    let renderY = (position.y - offsetY) / scale;

    if (renderX < 0.0 || renderY < 0.0 || renderX >= renderW || renderY >= renderH) {
        return vec4<f32>(unpackColor(params.backgroundColor), 1.0);
    }

    let cellX = u32(renderX) / params.cellW;
    let cellY = u32(renderY) / params.cellH;
    let cx = min(cellX, params.cols - 1u);
    let cy = min(cellY, params.rows - 1u);
    let cell = textureLoad(cellColorTex, vec2<i32>(i32(cx), i32(cy)), 0);
    if (params.glyphMode == 0u || params.glyphCount == 0u) {
        return vec4<f32>(cell.rgb, 1.0);
    }

    let localX = renderX - f32(cellX * params.cellW);
    let localY = renderY - f32(cellY * params.cellH);
    let glyphX = min(u32(localX / f32(max(params.cellW, 1u)) * f32(params.glyphTileW)), params.glyphTileW - 1u);
    let glyphY = min(u32(localY / f32(max(params.cellH, 1u)) * f32(params.glyphTileH)), params.glyphTileH - 1u);
    let rampX = min(u32(clamp(cell.a, 0.0, 0.99999) * f32(params.glyphCount)), params.glyphCount - 1u);
    let glyphIndex = glyphRamp[rampX];
    let glyphPage = glyphIndex / 4096u;
    let glyphSlot = glyphIndex % 4096u;
    let atlasX = (glyphSlot % 64u) * params.glyphTileW + glyphX;
    let atlasY = (glyphSlot / 64u) * params.glyphTileH + glyphY;
    let alpha = textureLoad(
        glyphAtlasTex,
        vec2<i32>(i32(atlasX), i32(atlasY)),
        i32(glyphPage),
        0
    ).r;
    if (alpha <= 0.5) {
        return vec4<f32>(unpackColor(params.backgroundColor), 1.0);
    }
    let foreground = select(cell.rgb, unpackColor(params.glyphColor), params.glyphColorMode == 1u);
    return vec4<f32>(foreground, 1.0);
}
"#;

#[cfg(target_os = "macos")]
unsafe extern "C" {
    fn asciline_native_output_install_metal_view(host_view: *mut c_void) -> *mut c_void;
    fn asciline_native_output_metal_layer(output_view: *mut c_void) -> *mut c_void;
    fn asciline_native_output_resize_metal_view(output_view: *mut c_void);
    fn asciline_native_output_release_metal_view(output_view: *mut c_void);
}

#[cfg(target_os = "macos")]
struct NativeMetalView {
    view: usize,
    layer: usize,
}

#[cfg(target_os = "macos")]
unsafe impl Send for NativeMetalView {}

#[cfg(target_os = "macos")]
impl NativeMetalView {
    fn install(window: &Window) -> Result<Self, String> {
        let host_window = window
            .ns_window()
            .map_err(|error| format!("native Metal host window unavailable: {error}"))?;
        if host_window.is_null() {
            return Err("native Metal host window is null".to_string());
        }

        let output_view = unsafe { asciline_native_output_install_metal_view(host_window.cast()) };
        if output_view.is_null() {
            return Err("native Metal output view creation failed".to_string());
        }

        let layer = unsafe { asciline_native_output_metal_layer(output_view) };
        if layer.is_null() {
            unsafe {
                asciline_native_output_release_metal_view(output_view);
            }
            return Err("native Metal output view did not expose a CAMetalLayer".to_string());
        }

        Ok(Self {
            view: output_view as usize,
            layer: layer as usize,
        })
    }

    fn layer(&self) -> *mut c_void {
        self.layer as *mut c_void
    }

    fn resize(&self) {
        unsafe {
            asciline_native_output_resize_metal_view(self.view as *mut c_void);
        }
    }
}

#[cfg(target_os = "macos")]
impl Drop for NativeMetalView {
    fn drop(&mut self) {
        unsafe {
            asciline_native_output_release_metal_view(self.view as *mut c_void);
        }
    }
}

pub(super) struct NativeGpuPresenter {
    surface: wgpu::Surface<'static>,
    device: wgpu::Device,
    queue: wgpu::Queue,
    config: wgpu::SurfaceConfiguration,
    compute_pipeline: wgpu::ComputePipeline,
    render_pipeline: wgpu::RenderPipeline,
    params_buffer: wgpu::Buffer,
    render_params_buffer: wgpu::Buffer,
    palette_lut_buffer: wgpu::Buffer,
    feature_buffer: wgpu::Buffer,
    feature_key: u64,
    glyph_key: u64,
    glyph_ramp_len: u32,
    source_texture: Option<wgpu::Texture>,
    source_view: Option<wgpu::TextureView>,
    source_size: (u32, u32),
    uploaded_source_version: Option<u64>,
    cell_texture: Option<wgpu::Texture>,
    cell_view: Option<wgpu::TextureView>,
    cell_size: (u32, u32),
    _glyph_atlas_texture: wgpu::Texture,
    glyph_atlas_view: wgpu::TextureView,
    glyph_ramp_buffer: wgpu::Buffer,
    loaded_glyph_pages: [bool; NATIVE_GLYPH_ATLAS_PAGE_COUNT as usize],
    compute_bind_group: Option<wgpu::BindGroup>,
    render_bind_group: Option<wgpu::BindGroup>,
    rgba_frame: Vec<u8>,
    #[cfg(target_os = "macos")]
    metal_view: Option<NativeMetalView>,
}

#[derive(Debug, Clone, Copy)]
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub(super) struct NativeGpuFrameOutcome {
    pub(super) surface_status: &'static str,
    pub(super) presented: bool,
    pub(super) source_uploaded: bool,
    pub(super) timing: NativeGpuFrameTiming,
}

#[derive(Debug, Clone, Copy, Default)]
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub(super) struct NativeGpuFrameTiming {
    pub(super) prep_ns: u64,
    pub(super) acquire_ns: u64,
    pub(super) encode_ns: u64,
    pub(super) submit_ns: u64,
    pub(super) present_ns: u64,
    pub(super) total_ns: u64,
}

fn source_frame_needs_upload(
    uploaded_source_version: Option<u64>,
    source_frame_version: Option<u64>,
) -> bool {
    source_frame_version.is_none() || uploaded_source_version != source_frame_version
}

impl NativeGpuPresenter {
    #[cfg(not(target_os = "macos"))]
    pub(super) fn new(window: &Window) -> Result<Self, String> {
        let (instance, surface) = create_surface_on_main_thread(window)?;
        Self::new_with_surface(window, instance, surface, wgpu::PresentMode::AutoNoVsync)
    }

    #[cfg(target_os = "macos")]
    pub(super) fn new_with_metal_view_on_current_thread(window: &Window) -> Result<Self, String> {
        let metal_view = NativeMetalView::install(window)?;
        let instance = wgpu::Instance::default();
        let surface = unsafe {
            instance.create_surface_unsafe(wgpu::SurfaceTargetUnsafe::CoreAnimationLayer(
                metal_view.layer(),
            ))
        }
        .map_err(|error| format!("native Metal layer surface creation failed: {error}"))?;
        let mut presenter =
            Self::new_with_surface(window, instance, surface, wgpu::PresentMode::AutoNoVsync)?;
        presenter.metal_view = Some(metal_view);
        Ok(presenter)
    }

    fn new_with_surface(
        window: &Window,
        instance: wgpu::Instance,
        surface: wgpu::Surface<'static>,
        present_mode: wgpu::PresentMode,
    ) -> Result<Self, String> {
        let size = window
            .inner_size()
            .unwrap_or_else(|_| PhysicalSize::new(DEFAULT_OUTPUT_WIDTH, DEFAULT_OUTPUT_HEIGHT));
        let width = size.width.max(1);
        let height = size.height.max(1);

        let adapter = pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: wgpu::PowerPreference::HighPerformance,
            compatible_surface: Some(&surface),
            force_fallback_adapter: false,
        }))
        .map_err(|error| format!("native GPU adapter unavailable: {error}"))?;
        let (device, queue) = pollster::block_on(adapter.request_device(&wgpu::DeviceDescriptor {
            label: Some("ASCILINE native GPU device"),
            ..Default::default()
        }))
        .map_err(|error| format!("native GPU device unavailable: {error}"))?;

        let mut config = surface
            .get_default_config(&adapter, width, height)
            .ok_or_else(|| "native GPU surface is not supported by adapter".to_string())?;
        config.present_mode = present_mode;
        config.desired_maximum_frame_latency = 3;
        surface.configure(&device, &config);

        let compute_module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("ASCILINE native GPU cell pass"),
            source: wgpu::ShaderSource::Wgsl(Cow::Borrowed(CELL_PASS_WGSL)),
        });
        let render_module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("ASCILINE native GPU render pass"),
            source: wgpu::ShaderSource::Wgsl(Cow::Borrowed(RENDER_PASS_WGSL)),
        });
        let compute_pipeline = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
            label: Some("ASCILINE native GPU cell pipeline"),
            layout: None,
            module: &compute_module,
            entry_point: Some("main"),
            compilation_options: Default::default(),
            cache: None,
        });
        let render_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("ASCILINE native GPU render pipeline"),
            layout: None,
            vertex: wgpu::VertexState {
                module: &render_module,
                entry_point: Some("vertexMain"),
                buffers: &[],
                compilation_options: Default::default(),
            },
            primitive: wgpu::PrimitiveState::default(),
            depth_stencil: None,
            multisample: wgpu::MultisampleState::default(),
            fragment: Some(wgpu::FragmentState {
                module: &render_module,
                entry_point: Some("fragmentMain"),
                targets: &[Some(wgpu::ColorTargetState {
                    format: config.format,
                    blend: None,
                    write_mask: wgpu::ColorWrites::ALL,
                })],
                compilation_options: Default::default(),
            }),
            multiview_mask: None,
            cache: None,
        });
        let params_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("ASCILINE native GPU params"),
            size: 96,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let render_params_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("ASCILINE native GPU render params"),
            size: 64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let palette_lut_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("ASCILINE native GPU palette LUT"),
            size: (PALETTE_LUT_SIZE * std::mem::size_of::<u32>()) as u64,
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let feature_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("ASCILINE native GPU palette and dither features"),
            size: FEATURE_BUFFER_SIZE as u64,
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let glyph_atlas_texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("ASCILINE native GPU glyph atlas"),
            size: wgpu::Extent3d {
                width: NATIVE_GLYPH_ATLAS_PAGE_SIZE,
                height: NATIVE_GLYPH_ATLAS_PAGE_SIZE,
                depth_or_array_layers: NATIVE_GLYPH_ATLAS_PAGE_COUNT,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::R8Unorm,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        });
        let glyph_atlas_view = glyph_atlas_texture.create_view(&wgpu::TextureViewDescriptor {
            label: Some("ASCILINE native GPU glyph atlas array view"),
            dimension: Some(wgpu::TextureViewDimension::D2Array),
            ..Default::default()
        });
        let glyph_ramp_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("ASCILINE native GPU glyph ramp"),
            size: NATIVE_GLYPH_RAMP_BUFFER_BYTES as u64,
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        Ok(Self {
            surface,
            device,
            queue,
            config,
            compute_pipeline,
            render_pipeline,
            params_buffer,
            render_params_buffer,
            palette_lut_buffer,
            feature_buffer,
            feature_key: u64::MAX,
            glyph_key: u64::MAX,
            glyph_ramp_len: 0,
            source_texture: None,
            source_view: None,
            source_size: (0, 0),
            uploaded_source_version: None,
            cell_texture: None,
            cell_view: None,
            cell_size: (0, 0),
            _glyph_atlas_texture: glyph_atlas_texture,
            glyph_atlas_view,
            glyph_ramp_buffer,
            loaded_glyph_pages: [false; NATIVE_GLYPH_ATLAS_PAGE_COUNT as usize],
            compute_bind_group: None,
            render_bind_group: None,
            rgba_frame: Vec::new(),
            #[cfg(target_os = "macos")]
            metal_view: None,
        })
    }

    #[cfg(not(target_os = "macos"))]
    pub(super) fn render_frame(
        &mut self,
        window: &Window,
        frame: &DecodedRgbFrame,
        params: &NativeRenderParams,
        frame_index: usize,
    ) -> Result<(), String> {
        self.render_frame_with_source_version(window, frame, params, frame_index, None)
            .map(|_| ())
    }

    pub(super) fn render_frame_with_source_version(
        &mut self,
        window: &Window,
        frame: &DecodedRgbFrame,
        params: &NativeRenderParams,
        frame_index: usize,
        source_frame_version: Option<u64>,
    ) -> Result<NativeGpuFrameOutcome, String> {
        let total_started_at = Instant::now();
        let prep_started_at = Instant::now();
        let surface_size = window
            .inner_size()
            .unwrap_or_else(|_| PhysicalSize::new(DEFAULT_OUTPUT_WIDTH, DEFAULT_OUTPUT_HEIGHT));
        let width = surface_size.width.max(1);
        let height = surface_size.height.max(1);
        #[cfg(target_os = "macos")]
        if self.metal_view.is_some() && (self.config.width != width || self.config.height != height)
        {
            if let Some(metal_view) = self.metal_view.as_ref() {
                metal_view.resize();
            }
        }
        self.configure_surface(width, height);

        // Acquire before scheduling queue writes. When the output is occluded,
        // wgpu has no render submission to retire write_texture staging buffers;
        // uploading first would therefore retain one decoded frame per source
        // tick for as long as the window stayed hidden.
        let acquire_started_at = Instant::now();
        let (output, surface_status) = self.current_surface_texture()?;
        let acquire_ns = duration_ns_u64(acquire_started_at.elapsed());
        let Some(output) = output else {
            return Ok(NativeGpuFrameOutcome {
                surface_status,
                presented: false,
                source_uploaded: false,
                timing: NativeGpuFrameTiming {
                    acquire_ns,
                    total_ns: duration_ns_u64(total_started_at.elapsed()),
                    ..Default::default()
                },
            });
        };

        let (cols, rows) = native_grid_dimensions(params, frame.width, frame.height);
        let source_uploaded = self.ensure_source_texture(frame, source_frame_version)?;
        self.ensure_cell_texture(cols, rows);
        self.ensure_feature_resources(params);
        self.ensure_glyph_resources(params);

        let source_view = self
            .source_view
            .as_ref()
            .ok_or_else(|| "native GPU source texture is unavailable".to_string())?;
        let cell_view = self
            .cell_view
            .as_ref()
            .ok_or_else(|| "native GPU cell texture is unavailable".to_string())?;
        if self.compute_bind_group.is_none() {
            self.compute_bind_group =
                Some(self.device.create_bind_group(&wgpu::BindGroupDescriptor {
                    label: Some("ASCILINE native GPU compute bind group"),
                    layout: &self.compute_pipeline.get_bind_group_layout(0),
                    entries: &[
                        wgpu::BindGroupEntry {
                            binding: 0,
                            resource: wgpu::BindingResource::TextureView(source_view),
                        },
                        wgpu::BindGroupEntry {
                            binding: 1,
                            resource: wgpu::BindingResource::TextureView(cell_view),
                        },
                        wgpu::BindGroupEntry {
                            binding: 2,
                            resource: self.params_buffer.as_entire_binding(),
                        },
                        wgpu::BindGroupEntry {
                            binding: 3,
                            resource: self.palette_lut_buffer.as_entire_binding(),
                        },
                        wgpu::BindGroupEntry {
                            binding: 4,
                            resource: self.feature_buffer.as_entire_binding(),
                        },
                    ],
                }));
        }
        if self.render_bind_group.is_none() {
            self.render_bind_group =
                Some(self.device.create_bind_group(&wgpu::BindGroupDescriptor {
                    label: Some("ASCILINE native GPU render bind group"),
                    layout: &self.render_pipeline.get_bind_group_layout(0),
                    entries: &[
                        wgpu::BindGroupEntry {
                            binding: 0,
                            resource: wgpu::BindingResource::TextureView(cell_view),
                        },
                        wgpu::BindGroupEntry {
                            binding: 1,
                            resource: self.render_params_buffer.as_entire_binding(),
                        },
                        wgpu::BindGroupEntry {
                            binding: 2,
                            resource: wgpu::BindingResource::TextureView(&self.glyph_atlas_view),
                        },
                        wgpu::BindGroupEntry {
                            binding: 3,
                            resource: self.glyph_ramp_buffer.as_entire_binding(),
                        },
                    ],
                }));
        }

        self.queue.write_buffer(
            &self.params_buffer,
            0,
            &cell_params_bytes(frame, params, cols, rows, frame_index),
        );
        self.queue.write_buffer(
            &self.render_params_buffer,
            0,
            &render_params_bytes(
                params,
                cols,
                rows,
                self.config.width,
                self.config.height,
                self.glyph_ramp_len,
            ),
        );
        let prep_ns = duration_ns_u64(prep_started_at.elapsed());

        let encode_started_at = Instant::now();
        let output_view = output
            .texture
            .create_view(&wgpu::TextureViewDescriptor::default());
        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("ASCILINE native GPU frame"),
            });

        {
            let mut pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
                label: Some("ASCILINE native GPU cell pass"),
                timestamp_writes: None,
            });
            pass.set_pipeline(&self.compute_pipeline);
            pass.set_bind_group(0, self.compute_bind_group.as_ref().unwrap(), &[]);
            pass.dispatch_workgroups(cols.div_ceil(8), rows.div_ceil(8), 1);
        }
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("ASCILINE native GPU render pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &output_view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color {
                            r: 3.0 / 255.0,
                            g: 4.0 / 255.0,
                            b: 5.0 / 255.0,
                            a: 1.0,
                        }),
                        store: wgpu::StoreOp::Store,
                    },
                    depth_slice: None,
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });
            pass.set_pipeline(&self.render_pipeline);
            pass.set_bind_group(0, self.render_bind_group.as_ref().unwrap(), &[]);
            pass.draw(0..3, 0..1);
        }
        let encode_ns = duration_ns_u64(encode_started_at.elapsed());

        let submit_started_at = Instant::now();
        self.queue.submit(Some(encoder.finish()));
        let submit_ns = duration_ns_u64(submit_started_at.elapsed());
        let present_started_at = Instant::now();
        output.present();
        let present_ns = duration_ns_u64(present_started_at.elapsed());
        // Reclaim completed queue-write staging resources without blocking the
        // display-link callback. Native wgpu devices are not driven by a browser
        // event loop, so regular polling is part of their steady-state upkeep.
        let _ = self.device.poll(wgpu::PollType::Poll);
        Ok(NativeGpuFrameOutcome {
            surface_status,
            presented: true,
            source_uploaded,
            timing: NativeGpuFrameTiming {
                prep_ns,
                acquire_ns,
                encode_ns,
                submit_ns,
                present_ns,
                total_ns: duration_ns_u64(total_started_at.elapsed()),
            },
        })
    }

    fn current_surface_texture(
        &mut self,
    ) -> Result<(Option<wgpu::SurfaceTexture>, &'static str), String> {
        match self.surface.get_current_texture() {
            wgpu::CurrentSurfaceTexture::Success(texture) => Ok((Some(texture), "success")),
            wgpu::CurrentSurfaceTexture::Suboptimal(texture) => Ok((Some(texture), "suboptimal")),
            wgpu::CurrentSurfaceTexture::Timeout => Ok((None, "timeout")),
            wgpu::CurrentSurfaceTexture::Occluded => Ok((None, "occluded")),
            wgpu::CurrentSurfaceTexture::Outdated => {
                self.surface.configure(&self.device, &self.config);
                match self.surface.get_current_texture() {
                    wgpu::CurrentSurfaceTexture::Success(texture) => {
                        Ok((Some(texture), "outdated-success"))
                    }
                    wgpu::CurrentSurfaceTexture::Suboptimal(texture) => {
                        Ok((Some(texture), "outdated-suboptimal"))
                    }
                    wgpu::CurrentSurfaceTexture::Timeout => Ok((None, "outdated-timeout")),
                    wgpu::CurrentSurfaceTexture::Occluded => Ok((None, "outdated-occluded")),
                    status => Err(format!("native GPU surface frame unavailable: {status:?}")),
                }
            }
            status => Err(format!("native GPU surface frame unavailable: {status:?}")),
        }
    }

    fn configure_surface(&mut self, width: u32, height: u32) {
        if self.config.width == width && self.config.height == height {
            return;
        }
        self.config.width = width;
        self.config.height = height;
        self.surface.configure(&self.device, &self.config);
    }

    fn ensure_source_texture(
        &mut self,
        frame: &DecodedRgbFrame,
        source_frame_version: Option<u64>,
    ) -> Result<bool, String> {
        if self.source_size != (frame.width, frame.height) {
            let texture = self.device.create_texture(&wgpu::TextureDescriptor {
                label: Some("ASCILINE native GPU source texture"),
                size: wgpu::Extent3d {
                    width: frame.width,
                    height: frame.height,
                    depth_or_array_layers: 1,
                },
                mip_level_count: 1,
                sample_count: 1,
                dimension: wgpu::TextureDimension::D2,
                format: wgpu::TextureFormat::Rgba8Unorm,
                usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
                view_formats: &[],
            });
            self.source_view = Some(texture.create_view(&wgpu::TextureViewDescriptor::default()));
            self.source_texture = Some(texture);
            self.source_size = (frame.width, frame.height);
            self.uploaded_source_version = None;
            self.compute_bind_group = None;
        }

        let expected_rgb_len = frame.width as usize * frame.height as usize * 3;
        if frame.data.len() < expected_rgb_len {
            return Err("native GPU source frame has too few RGB bytes".to_string());
        }
        if !source_frame_needs_upload(self.uploaded_source_version, source_frame_version) {
            return Ok(false);
        }
        let expected_rgba_len = frame.width as usize * frame.height as usize * 4;
        if self.rgba_frame.len() != expected_rgba_len {
            self.rgba_frame.resize(expected_rgba_len, 255);
        }
        for (rgb, rgba) in frame.data[..expected_rgb_len]
            .chunks_exact(3)
            .zip(self.rgba_frame.chunks_exact_mut(4))
        {
            rgba[0] = rgb[0];
            rgba[1] = rgb[1];
            rgba[2] = rgb[2];
            rgba[3] = 255;
        }

        let texture = self
            .source_texture
            .as_ref()
            .ok_or_else(|| "native GPU source texture is unavailable".to_string())?;
        self.queue.write_texture(
            wgpu::TexelCopyTextureInfo {
                texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            &self.rgba_frame,
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
        self.uploaded_source_version = source_frame_version;
        Ok(true)
    }

    fn ensure_feature_resources(&mut self, params: &NativeRenderParams) {
        let key = palette_feature_key(params);
        if self.feature_key == key {
            return;
        }
        self.feature_key = key;
        self.queue.write_buffer(
            &self.palette_lut_buffer,
            0,
            &palette_lut_bytes(params),
        );
        self.queue.write_buffer(
            &self.feature_buffer,
            0,
            &palette_dither_feature_bytes(params),
        );
    }

    fn ensure_glyph_resources(&mut self, params: &NativeRenderParams) {
        let key = glyph_feature_key(params);
        if self.glyph_key == key {
            return;
        }
        self.glyph_key = key;
        let ramp = native_glyph_ramp_ids(params);
        self.glyph_ramp_len = ramp.len() as u32;

        let mut requested = [false; NATIVE_GLYPH_ATLAS_PAGE_COUNT as usize];
        if native_render_uses_glyphs(params) {
            for glyph_id in ramp.iter().copied() {
                let page = (glyph_id / NATIVE_GLYPH_ATLAS_PAGE_GLYPHS) as usize;
                if page < requested.len() {
                    requested[page] = true;
                }
            }
        }
        for (page, needed) in requested.into_iter().enumerate() {
            if !needed || self.loaded_glyph_pages[page] {
                continue;
            }
            self.queue.write_texture(
                wgpu::TexelCopyTextureInfo {
                    texture: &self._glyph_atlas_texture,
                    mip_level: 0,
                    origin: wgpu::Origin3d {
                        x: 0,
                        y: 0,
                        z: page as u32,
                    },
                    aspect: wgpu::TextureAspect::All,
                },
                native_glyph_atlas_page_bytes(page as u32),
                wgpu::TexelCopyBufferLayout {
                    offset: 0,
                    bytes_per_row: Some(NATIVE_GLYPH_ATLAS_PAGE_SIZE),
                    rows_per_image: Some(NATIVE_GLYPH_ATLAS_PAGE_SIZE),
                },
                wgpu::Extent3d {
                    width: NATIVE_GLYPH_ATLAS_PAGE_SIZE,
                    height: NATIVE_GLYPH_ATLAS_PAGE_SIZE,
                    depth_or_array_layers: 1,
                },
            );
            self.loaded_glyph_pages[page] = true;
        }

        let mut bytes = [0; NATIVE_GLYPH_RAMP_BUFFER_BYTES];
        for (index, glyph_id) in ramp.into_iter().enumerate() {
            let offset = index * std::mem::size_of::<u32>();
            bytes[offset..offset + 4].copy_from_slice(&glyph_id.to_le_bytes());
        }
        self.queue.write_buffer(&self.glyph_ramp_buffer, 0, &bytes);
    }

    fn ensure_cell_texture(&mut self, cols: u32, rows: u32) {
        if self.cell_size == (cols, rows) {
            return;
        }
        let texture = self.device.create_texture(&wgpu::TextureDescriptor {
            label: Some("ASCILINE native GPU cell color texture"),
            size: wgpu::Extent3d {
                width: cols,
                height: rows,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::STORAGE_BINDING,
            view_formats: &[],
        });
        self.cell_view = Some(texture.create_view(&wgpu::TextureViewDescriptor::default()));
        self.cell_texture = Some(texture);
        self.cell_size = (cols, rows);
        self.compute_bind_group = None;
        self.render_bind_group = None;
    }
}

#[cfg(not(target_os = "macos"))]
fn create_surface_on_main_thread(
    window: &Window,
) -> Result<(wgpu::Instance, wgpu::Surface<'static>), String> {
    let (tx, rx) = mpsc::sync_channel(1);
    let window_for_surface = window.clone();
    window
        .run_on_main_thread(move || {
            let result = (|| {
                let instance = wgpu::Instance::default();
                let surface = instance
                    .create_surface(window_for_surface)
                    .map_err(|error| format!("native GPU surface unavailable: {error}"))?;
                Ok((instance, surface))
            })();
            let _ = tx.send(result);
        })
        .map_err(|error| error.to_string())?;
    rx.recv_timeout(Duration::from_secs(3))
        .map_err(|error| format!("native GPU surface init timed out: {error}"))?
}

fn duration_ns_u64(duration: Duration) -> u64 {
    duration.as_nanos().min(u128::from(u64::MAX)) as u64
}

fn palette_feature_key(params: &NativeRenderParams) -> u64 {
    let mut hasher = DefaultHasher::new();
    params.palette_id.hash(&mut hasher);
    params.palette_mapping.hash(&mut hasher);
    params.palette_colors.hash(&mut hasher);
    params.dither_mode.hash(&mut hasher);
    hasher.finish()
}

fn glyph_feature_key(params: &NativeRenderParams) -> u64 {
    let mut hasher = DefaultHasher::new();
    params.glyph_mode.hash(&mut hasher);
    params.solid_mode.hash(&mut hasher);
    params.pixel.hash(&mut hasher);
    params.charset.hash(&mut hasher);
    params.charset_ramp.hash(&mut hasher);
    params.glyph_depth.hash(&mut hasher);
    params.glyph_offset.hash(&mut hasher);
    params.glyph_reverse.hash(&mut hasher);
    hasher.finish()
}

fn palette_lut_bytes(params: &NativeRenderParams) -> Vec<u8> {
    let mut bytes = vec![0; PALETTE_LUT_SIZE * std::mem::size_of::<u32>()];
    if params.palette_colors.is_empty() {
        return bytes;
    }
    for r in 0..PALETTE_LUT_EDGE {
        for g in 0..PALETTE_LUT_EDGE {
            for b in 0..PALETTE_LUT_EDGE {
                let index = (r << 10) | (g << 5) | b;
                let palette_index = native_palette_index(
                    [(r * 8 + 4) as u8, (g * 8 + 4) as u8, (b * 8 + 4) as u8],
                    params,
                ) as u32;
                put_u32(&mut bytes, index * 4, palette_index);
            }
        }
    }
    bytes
}

fn palette_dither_feature_bytes(params: &NativeRenderParams) -> Vec<u8> {
    let mut bytes = vec![0; FEATURE_BUFFER_SIZE];
    for (index, color) in params.palette_colors.iter().copied().take(16).enumerate() {
        let offset = index * 16;
        put_f32(&mut bytes, offset, f32::from(color[0]) / 255.0);
        put_f32(&mut bytes, offset + 4, f32::from(color[1]) / 255.0);
        put_f32(&mut bytes, offset + 8, f32::from(color[2]) / 255.0);
        put_f32(&mut bytes, offset + 12, 1.0);
    }
    let (size, values) = native_dither_matrix(&params.dither_mode);
    let area = size * size;
    if area > 0 {
        for (index, value) in values.iter().copied().enumerate() {
            let threshold = (f32::from(value) + 0.5) / area as f32 - 0.5;
            put_f32(&mut bytes, 16 * 16 + index * 4, threshold);
        }
    }
    bytes
}

fn cell_params_bytes(
    frame: &DecodedRgbFrame,
    params: &NativeRenderParams,
    cols: u32,
    rows: u32,
    frame_index: usize,
) -> [u8; 96] {
    let mut bytes = [0u8; 96];
    put_u32(&mut bytes, 0, frame.width);
    put_u32(&mut bytes, 4, frame.height);
    put_u32(&mut bytes, 8, cols);
    put_u32(&mut bytes, 12, rows);
    put_u32(&mut bytes, 16, (frame.width / cols.max(1)).max(1));
    put_u32(&mut bytes, 20, (frame.height / rows.max(1)).max(1));
    put_f32(&mut bytes, 24, params.saturation_boost as f32);
    put_f32(&mut bytes, 28, params.contrast_boost as f32);
    put_f32(&mut bytes, 32, params.brightness as f32);
    put_f32(&mut bytes, 36, params.gamma as f32);
    put_f32(&mut bytes, 40, params.bg_blend as f32);
    put_u32(&mut bytes, 44, params.quantize_bits);
    put_f32(&mut bytes, 48, params.jitter_amount as f32);
    put_f32(&mut bytes, 52, params.jitter_speed as f32);
    put_f32(&mut bytes, 56, params.sample_x as f32);
    put_f32(&mut bytes, 60, params.sample_y as f32);
    put_f32(
        &mut bytes,
        64,
        (frame_index as f64 / params.fps.max(1.0)) as f32,
    );
    put_u32(&mut bytes, 68, u32::from(params.mirror_x));
    put_u32(&mut bytes, 72, params.palette_colors.len().min(16) as u32);
    put_u32(&mut bytes, 76, native_dither_matrix(&params.dither_mode).0);
    put_f32(&mut bytes, 80, params.dither_strength as f32);
    put_u32(&mut bytes, 84, params.dither_scale);
    put_f32(&mut bytes, 88, params.dither_bias as f32);
    put_u32(&mut bytes, 92, u32::from(params.dither_invert));
    bytes
}

fn render_params_bytes(
    params: &NativeRenderParams,
    cols: u32,
    rows: u32,
    surface_width: u32,
    surface_height: u32,
    glyph_ramp_len: u32,
) -> [u8; 64] {
    let mut bytes = [0u8; 64];
    put_u32(&mut bytes, 0, cols);
    put_u32(&mut bytes, 4, rows);
    put_u32(&mut bytes, 8, params.cell_width.max(1));
    put_u32(&mut bytes, 12, params.cell_height.max(1));
    put_u32(&mut bytes, 16, surface_width.max(1));
    put_u32(&mut bytes, 20, surface_height.max(1));
    put_u32(&mut bytes, 24, u32::from(native_render_uses_glyphs(params)));
    put_u32(&mut bytes, 28, glyph_ramp_len);
    put_u32(&mut bytes, 32, NATIVE_GLYPH_TILE_WIDTH);
    put_u32(&mut bytes, 36, NATIVE_GLYPH_TILE_HEIGHT);
    put_u32(&mut bytes, 40, u32::from(params.glyph_color_mode == "fixed"));
    put_u32(&mut bytes, 44, pack_rgb(params.glyph_color));
    put_u32(&mut bytes, 48, pack_rgb(params.background_color));
    bytes
}

fn pack_rgb(color: [u8; 3]) -> u32 {
    color[0] as u32 | ((color[1] as u32) << 8) | ((color[2] as u32) << 16)
}

fn put_u32(bytes: &mut [u8], offset: usize, value: u32) {
    bytes[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
}

fn put_f32(bytes: &mut [u8], offset: usize, value: f32) {
    bytes[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn source_upload_version_skips_only_identical_versioned_frames() {
        assert!(source_frame_needs_upload(None, Some(1)));
        assert!(!source_frame_needs_upload(Some(1), Some(1)));
        assert!(source_frame_needs_upload(Some(1), Some(2)));
        assert!(source_frame_needs_upload(Some(2), None));
    }

    #[test]
    fn cell_params_match_webgpu_uniform_layout() {
        let params = NativeRenderParams {
            loop_media: true,
            cols: 80,
            rows: 0,
            auto_rows: true,
            fps: 24.0,
            saturation_boost: 1.4,
            contrast_boost: 1.2,
            brightness: 1.0,
            gamma: 1.0,
            bg_blend: 0.3,
            quantize_bits: 2,
            palette_id: "none".to_string(),
            palette_mapping: "nearest".to_string(),
            palette_colors: Vec::new(),
            dither_mode: "none".to_string(),
            dither_strength: 0.45,
            dither_scale: 1,
            dither_bias: 0.0,
            dither_invert: false,
            jitter_amount: 0.6,
            jitter_speed: 1.0,
            sample_x: 0.5,
            sample_y: 0.5,
            cell_width: 2,
            cell_height: 3,
            aspect_correction: 1.0,
            mirror_x: true,
            pixel: false,
            solid_mode: false,
            glyph_mode: true,
            charset: "point-click".to_string(),
            charset_ramp: String::new(),
            glyph_depth: 96,
            glyph_offset: 0,
            glyph_reverse: false,
            glyph_color_mode: "source".to_string(),
            glyph_color: [255, 255, 255],
            background_color: [3, 4, 5],
            atlas_style: "neutral".to_string(),
            font_family: "Courier New".to_string(),
            min_glyph_intensity: 180,
            native_wtf_active: false,
            audio_reactive_active: false,
            audio_reactive_source: String::new(),
            audio_reactive_preset: "pulse-reactor".to_string(),
            audio_reactive_sensitivity: 9.0,
            audio_reactive_beat_amount: 2.05,
            audio_reactive_bass_amount: 1.48,
            audio_reactive_mid_amount: 1.34,
            audio_reactive_treble_amount: 1.38,
            audio_reactive_flux_amount: 1.52,
            audio_reactive_presence_amount: 1.28,
            audio_reactive_density_dampening: 0.14,
            audio_reactive_noise_floor: 0.005,
        };
        let frame = DecodedRgbFrame {
            index: 0,
            width: 640,
            height: 360,
            data: vec![0; 640 * 360 * 3],
        };
        let bytes = cell_params_bytes(&frame, &params, 80, 45, 12);

        assert_eq!(u32::from_le_bytes(bytes[0..4].try_into().unwrap()), 640);
        assert_eq!(u32::from_le_bytes(bytes[8..12].try_into().unwrap()), 80);
        assert_eq!(u32::from_le_bytes(bytes[44..48].try_into().unwrap()), 2);
        assert_eq!(u32::from_le_bytes(bytes[68..72].try_into().unwrap()), 1);
        assert_eq!(bytes.len(), 96);

        let glyph_ramp_len = native_glyph_ramp_ids(&params).len() as u32;
        let glyph_key = glyph_feature_key(&params);
        let mut live_only_change = params.clone();
        live_only_change.brightness = 1.7;
        assert_eq!(glyph_feature_key(&live_only_change), glyph_key);
        let mut glyph_change = params.clone();
        glyph_change.glyph_depth = 12;
        assert_ne!(glyph_feature_key(&glyph_change), glyph_key);
        let render_bytes = render_params_bytes(&params, 80, 45, 1920, 1080, glyph_ramp_len);
        assert_eq!(
            u32::from_le_bytes(render_bytes[24..28].try_into().unwrap()),
            1
        );
        assert_eq!(
            u32::from_le_bytes(render_bytes[28..32].try_into().unwrap()),
            glyph_ramp_len
        );
        assert_eq!(
            u32::from_le_bytes(render_bytes[32..36].try_into().unwrap()),
            16
        );
        assert_eq!(
            u32::from_le_bytes(render_bytes[36..40].try_into().unwrap()),
            16
        );
        assert_eq!(render_bytes.len(), 64);
    }
}
