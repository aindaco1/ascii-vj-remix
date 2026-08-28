/**
 * WebGPU ASCII Renderer
 * GPU-accelerated ASCII rendering supporting both video and image sources.
 *
 * Video: uses importExternalTexture() per-frame
 * Image: uploads once via copyExternalImageToTexture(), samples texture_2d<f32>
 */

import {
    DITHER_MATRICES,
    PALETTE_LUT_SIZE,
    buildPaletteLut,
    paletteById
} from '../../../../shared/palettes.js';
import {
    GLYPH_ATLAS_PAGE_COUNT,
    GLYPH_ATLAS_PAGE_SIZE,
    GLYPH_RAMP_LIMIT,
    glyphAtlasPagesForRamp,
    glyphRampCodePoints,
    loadGlyphAtlasPage
} from '../../../../shared/glyph-atlas.js';

// Compute shader for VIDEO sources (texture_external)
const CELL_PASS_VIDEO_WGSL = `
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

@group(0) @binding(0) var srcTex: texture_external;
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

    let c = textureLoad(srcTex, vec2<i32>(sampleX, sampleY));
    let boosted = processColor(c.rgb, cx, cy);

    let luma = dot(boosted, vec3<f32>(0.2126, 0.7152, 0.0722));
    textureStore(colorOut, vec2<i32>(i32(cx), i32(cy)), vec4<f32>(boosted, luma));
}
`;

// Compute shader for IMAGE sources (texture_2d<f32>)
// Adds a time-based jitter to the sample point so the image animates like a living ASCII display
const CELL_PASS_IMAGE_WGSL = `
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

// Simple hash for per-cell pseudo-random jitter
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

    // Per-cell jitter: offset sample point within the cell each frame
    let cellW = f32(params.srcW) / f32(params.cols);
    let cellH = f32(params.srcH) / f32(params.rows);
    let seed = vec2<f32>(f32(cx) + params.time * params.jitterSpeed * 7.13, f32(cy) + params.time * params.jitterSpeed * 11.71);
    let jitterX = (hash(seed) - 0.5) * cellW * params.jitterAmount;
    let jitterY = (hash(seed + vec2<f32>(37.0, 91.0)) - 0.5) * cellH * params.jitterAmount;

    let baseCenterX = (f32(cx) + params.sampleX) * f32(params.srcW) / f32(params.cols);
    let baseCenterY = (f32(cy) + params.sampleY) * f32(params.srcH) / f32(params.rows);
    var sampleX = clamp(i32(baseCenterX + jitterX), 0, i32(params.srcW) - 1);
    if (params.mirrorX != 0u) {
        sampleX = i32(params.srcW) - 1 - sampleX;
    }
    let sampleY = clamp(i32(baseCenterY + jitterY), 0, i32(params.srcH) - 1);

    let c = textureLoad(srcTex, vec2<i32>(sampleX, sampleY), 0);

    let boosted = processColor(c.rgb, cx, cy);

    let luma = dot(boosted, vec3<f32>(0.2126, 0.7152, 0.0722));
    textureStore(colorOut, vec2<i32>(i32(cx), i32(cy)), vec4<f32>(boosted, luma));
}
`;

// Render pass (shared for both video and image)
const RENDER_PASS_WGSL = `
struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) texCoord: vec2<f32>,
};

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var positions = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -3.0),
        vec2<f32>(-1.0, 1.0),
        vec2<f32>(3.0, 1.0)
    );
    var texCoords = array<vec2<f32>, 3>(
        vec2<f32>(0.0, 2.0),
        vec2<f32>(0.0, 0.0),
        vec2<f32>(2.0, 0.0)
    );

    var output: VertexOutput;
    output.position = vec4<f32>(positions[vertexIndex], 0.0, 1.0);
    output.texCoord = texCoords[vertexIndex];
    return output;
}

struct RenderParams {
    cols: u32,
    rows: u32,
    cellW: u32,
    cellH: u32,
    canvasW: u32,
    canvasH: u32,
    glyphMode: u32,
    glyphCount: u32,
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
fn fragmentMain(@location(0) texCoord: vec2<f32>) -> @location(0) vec4<f32> {
    let pixelX = texCoord.x * f32(params.canvasW);
    let pixelY = texCoord.y * f32(params.canvasH);

    let cellX = u32(pixelX) / params.cellW;
    let cellY = u32(pixelY) / params.cellH;
    let cx = min(cellX, params.cols - 1u);
    let cy = min(cellY, params.rows - 1u);

    let cell = textureLoad(cellColorTex, vec2<i32>(i32(cx), i32(cy)), 0);
    if (params.glyphMode == 0u || params.glyphCount == 0u) {
        return vec4<f32>(cell.rgb, 1.0);
    }
    let localX = pixelX - f32(cellX * params.cellW);
    let localY = pixelY - f32(cellY * params.cellH);
    let glyphX = min(u32(localX / f32(max(params.cellW, 1u)) * 16.0), 15u);
    let glyphY = min(u32(localY / f32(max(params.cellH, 1u)) * 16.0), 15u);
    let rampIndex = min(u32(clamp(cell.a, 0.0, 0.99999) * f32(params.glyphCount)), params.glyphCount - 1u);
    let glyphId = glyphRamp[rampIndex];
    let glyphPage = glyphId / 16384u;
    let glyphSlot = glyphId % 16384u;
    let atlasX = (glyphSlot % 128u) * 16u + glyphX;
    let atlasY = (glyphSlot / 128u) * 16u + glyphY;
    let alpha = textureLoad(glyphAtlasTex, vec2<i32>(i32(atlasX), i32(atlasY)), i32(glyphPage), 0).r;
    if (alpha <= 0.5) {
        return vec4<f32>(unpackColor(params.backgroundColor), 1.0);
    }
    let foreground = select(cell.rgb, unpackColor(params.glyphColor), params.glyphColorMode == 1u);
    return vec4<f32>(foreground, 1.0);
}
`;

function packedColor(value, fallback = '#030405') {
    const match = /^#([0-9a-f]{6})$/i.exec(String(value || '')) || /^#([0-9a-f]{6})$/i.exec(fallback);
    const rgb = Number.parseInt(match[1], 16);
    return (rgb >> 16 & 255) | (rgb & 0xff00) | ((rgb & 255) << 16);
}

export class WebGPURenderer {
    constructor(options = {}) {
        this.device = options.device;
        this.source = options.source; // MediaSource object
        this.targetElement = options.targetElement;

        this.cols = options.cols || 120;
        this.fps = options.fps || 24;
        this.frameInterval = 1000 / this.fps;
        this.saturationBoost = options.saturationBoost || 1.4;
        this.contrastBoost = options.contrastBoost || 1.0;
        this.brightness = options.brightness || 1.0;
        this.gamma = options.gamma || 1.0;
        this.bgBlend = options.bgBlend || 0;
        this.quantizeBits = options.quantizeBits || 0;
        this.paletteId = options.paletteId || 'none';
        this.paletteMapping = options.paletteMapping || 'nearest';
        this.ditherMode = options.ditherMode || 'none';
        this.ditherStrength = options.ditherStrength ?? 0.45;
        this.ditherScale = options.ditherScale || 1;
        this.ditherBias = options.ditherBias || 0;
        this.ditherInvert = options.ditherInvert === true;
        this.solidMode = options.solidMode === true;
        this.glyphMode = options.glyphMode !== false;
        this.charset = options.charset || 'point-click';
        this.customGlyphRamp = options.customGlyphRamp || '';
        this.glyphDepth = options.glyphDepth || GLYPH_RAMP_LIMIT;
        this.glyphOffset = options.glyphOffset || 0;
        this.glyphReverse = options.glyphReverse === true;
        this.glyphColorMode = options.glyphColorMode || 'source';
        this.glyphColor = options.glyphColor || '#ffffff';
        this.backgroundColor = options.backgroundColor || '#030405';
        this.jitterAmount = options.jitterAmount || 0;
        this.jitterSpeed = options.jitterSpeed || 1;
        this.sampleX = options.sampleX ?? 0.5;
        this.sampleY = options.sampleY ?? 0.5;
        this.rowsOverride = options.rows || 0;
        this.autoRows = options.autoRows !== false;
        this.aspectCorrection = options.aspectCorrection || 1;
        this.smoothing = options.smoothing !== false;
        this.cellWidth = options.cellWidth || 8;
        this.cellHeight = options.cellHeight || 12;
        this.mirrorX = options.mirrorX === true;
        this.opaqueCanvas = options.opaqueCanvas === true;

        this.running = false;
        this.animationId = null;
        this.frameTimer = null;
        this.window = window;
        this.lastFrameTime = 0;
        this.lastRafAt = 0;
        this.initialized = false;
        this.fpsFrameCount = 0;
        this.lastFpsUpdate = 0;
        this.currentFps = 0;

        this.canvas = null;
        this.context = null;
        this.cellColorTexture = null;
        this.cellColorView = null;
        this.videoComputePipeline = null;
        this.imageComputePipeline = null;
        this.renderPipeline = null;
        this.paramsBuffer = null;
        this.renderParamsBuffer = null;
        this.paletteLutBuffer = null;
        this.featureBuffer = null;
        this.imageComputeBindGroup = null;
        this.renderBindGroup = null;
        this.paramsData = new ArrayBuffer(96);
        this.paramsView = new DataView(this.paramsData);
        this.renderData = new ArrayBuffer(64);
        this.renderView = new DataView(this.renderData);
        this.featureResourceKey = '';
        this.glyphResourceKey = '';
        this.glyphRampLength = 0;
        this.loadedGlyphPages = new Set();
        this.pendingGlyphPages = new Map();
        this.glyphAtlasTexture = null;
        this.glyphAtlasView = null;
        this.glyphRampBuffer = null;

        // Image-specific: static source texture (uploaded once)
        this.imageSourceTexture = null;
        this.imageSourceView = null;
        this.frameCount = 0;

        this.rows = 0;
        this.canvasWidth = 0;
        this.canvasHeight = 0;
    }

    async init() {
        if (!this.device) throw new Error('WebGPU device not provided');

        const doc = this.targetElement.ownerDocument || document;
        this.window = doc.defaultView || window;
        this.canvas = doc.createElement('canvas');
        this.canvas.className = 'ascii-canvas';
        this.targetElement.innerHTML = '';
        this.targetElement.appendChild(this.canvas);

        this._updateDimensions();

        this.context = this.canvas.getContext('webgpu');
        const format = navigator.gpu.getPreferredCanvasFormat();
        this.context.configure({
            device: this.device,
            format: format,
            alphaMode: this.opaqueCanvas ? 'opaque' : 'premultiplied'
        });

        this.usesExternalVideoTexture = Boolean(this.source.isVideo && !this.source.canvas);

        // Create compute pipelines (one for browser video textures, one for image/canvas textures)
        if (this.usesExternalVideoTexture) {
            const videoModule = this.device.createShaderModule({ code: CELL_PASS_VIDEO_WGSL });
            this.videoComputePipeline = this.device.createComputePipeline({
                layout: 'auto',
                compute: { module: videoModule, entryPoint: 'main' }
            });
        } else {
            const imageModule = this.device.createShaderModule({ code: CELL_PASS_IMAGE_WGSL });
            this.imageComputePipeline = this.device.createComputePipeline({
                layout: 'auto',
                compute: { module: imageModule, entryPoint: 'main' }
            });

            // Upload image to GPU texture once
            await this._uploadImageTexture();
        }

        // Create render pipeline (shared)
        const renderModule = this.device.createShaderModule({ code: RENDER_PASS_WGSL });
        this.renderPipeline = this.device.createRenderPipeline({
            layout: 'auto',
            vertex: { module: renderModule, entryPoint: 'vertexMain' },
            fragment: { module: renderModule, entryPoint: 'fragmentMain', targets: [{ format }] },
            primitive: { topology: 'triangle-list' }
        });

        this._createCellTexture();

        this.paramsBuffer = this.device.createBuffer({
            size: 96,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        this.renderParamsBuffer = this.device.createBuffer({
            size: 64,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        this.paletteLutBuffer = this.device.createBuffer({
            size: PALETTE_LUT_SIZE * Uint32Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });

        this.featureBuffer = this.device.createBuffer({
            size: 16 * 16 + 64 * Float32Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });

        this.glyphAtlasTexture = this.device.createTexture({
            size: [GLYPH_ATLAS_PAGE_SIZE, GLYPH_ATLAS_PAGE_SIZE, GLYPH_ATLAS_PAGE_COUNT],
            format: 'r8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
        });
        this.glyphAtlasView = this.glyphAtlasTexture.createView({ dimension: '2d-array' });
        this.glyphRampBuffer = this.device.createBuffer({
            size: GLYPH_RAMP_LIMIT * Uint32Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });

        this.syncFeatureResources(true);
        await this.syncGlyphResources(true);

        this._createStableBindGroups();

        this.initialized = true;
        console.log(`[WebGPU] ${this.source.type} source, ${this.cols}x${this.rows} cells, ${this.canvasWidth}x${this.canvasHeight}px`);
    }

    async _uploadImageTexture() {
        const w = this.source.width;
        const h = this.source.height;

        this.imageSourceTexture = this.device.createTexture({
            size: [w, h],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
        });
        this.imageSourceView = this.imageSourceTexture.createView();
        this.imageComputeBindGroup = null;

        const sourceEl = this.source.canvas || this.source.element;
        this.device.queue.copyExternalImageToTexture(
            { source: sourceEl },
            { texture: this.imageSourceTexture },
            [w, h]
        );

        console.log(`[WebGPU] Image texture uploaded: ${w}x${h}`);
    }

    _copyImageSourceToTexture() {
        if (!this.imageSourceTexture) return;
        const sourceEl = this.source.canvas || this.source.element;
        if (!sourceEl) return;
        this.device.queue.copyExternalImageToTexture(
            { source: sourceEl },
            { texture: this.imageSourceTexture },
            [this.source.width, this.source.height]
        );
    }

    _updateDimensions() {
        const sw = this.source.width || 640;
        const sh = this.source.height || 480;
        this.rows = this.autoRows
            ? Math.max(1, Math.round(this.cols * (sh / sw) * (this.cellWidth / this.cellHeight) * this.aspectCorrection))
            : Math.max(1, Math.round(this.rowsOverride || this.rows || 1));
        this.canvasWidth = this.cols * this.cellWidth;
        this.canvasHeight = this.rows * this.cellHeight;
        if (this.canvas) {
            this.canvas.width = this.canvasWidth;
            this.canvas.height = this.canvasHeight;
            this.canvas.style.aspectRatio = `${sw} / ${sh}`;
            this.canvas.style.width = '100%';
            this.canvas.style.height = 'auto';
            this.canvas.style.maxWidth = '100%';
            this.canvas.style.maxHeight = '100%';
            this.canvas.style.imageRendering = 'pixelated';
        }
    }

    _createCellTexture() {
        if (this.cellColorTexture) this.cellColorTexture.destroy();
        this.cellColorTexture = this.device.createTexture({
            size: [this.cols, this.rows],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING
        });
        this.cellColorView = this.cellColorTexture.createView();
        this.imageComputeBindGroup = null;
        this.renderBindGroup = null;
    }

    _createStableBindGroups() {
        if (!this.cellColorView || !this.paramsBuffer || !this.renderParamsBuffer) return;
        this.renderBindGroup = this.device.createBindGroup({
            layout: this.renderPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: this.cellColorView },
                { binding: 1, resource: { buffer: this.renderParamsBuffer } },
                { binding: 2, resource: this.glyphAtlasView },
                { binding: 3, resource: { buffer: this.glyphRampBuffer } }
            ]
        });
        if (!this.usesExternalVideoTexture && this.imageComputePipeline && this.imageSourceView) {
            this.imageComputeBindGroup = this.device.createBindGroup({
                layout: this.imageComputePipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: this.imageSourceView },
                    { binding: 1, resource: this.cellColorView },
                    { binding: 2, resource: { buffer: this.paramsBuffer } },
                    { binding: 3, resource: { buffer: this.paletteLutBuffer } },
                    { binding: 4, resource: { buffer: this.featureBuffer } }
                ]
            });
        }
    }

    syncFeatureResources(force = false) {
        if (!this.device || !this.paletteLutBuffer || !this.featureBuffer) return;
        const key = `${this.paletteId}:${this.paletteMapping}:${this.ditherMode}`;
        if (!force && key === this.featureResourceKey) {
            void this.syncGlyphResources();
            return;
        }
        this.featureResourceKey = key;

        const palette = paletteById(this.paletteId);
        const lut8 = buildPaletteLut(this.paletteId, this.paletteMapping);
        const lut32 = new Uint32Array(PALETTE_LUT_SIZE);
        if (lut8) {
            for (let index = 0; index < lut8.length; index++) lut32[index] = lut8[index];
        }
        const featureData = new ArrayBuffer(16 * 16 + 64 * Float32Array.BYTES_PER_ELEMENT);
        const featureFloats = new Float32Array(featureData);
        for (let index = 0; index < (palette?.colors.length || 0); index++) {
            const color = palette.colors[index];
            const offset = index * 4;
            featureFloats[offset] = color[0] / 255;
            featureFloats[offset + 1] = color[1] / 255;
            featureFloats[offset + 2] = color[2] / 255;
            featureFloats[offset + 3] = 1;
        }
        const matrix = DITHER_MATRICES[this.ditherMode];
        if (matrix) {
            const area = matrix.size * matrix.size;
            const base = 16 * 4;
            for (let index = 0; index < area; index++) {
                featureFloats[base + index] = (matrix.values[index] + 0.5) / area - 0.5;
            }
        }
        this.device.queue.writeBuffer(this.paletteLutBuffer, 0, lut32);
        this.device.queue.writeBuffer(this.featureBuffer, 0, featureData);
        this.imageComputeBindGroup = null;
        this._createStableBindGroups();
        void this.syncGlyphResources(force);
    }

    async syncGlyphResources(force = false) {
        if (!this.device || !this.glyphAtlasTexture || !this.glyphRampBuffer) return;
        const ramp = glyphRampCodePoints(this);
        this.glyphRampLength = ramp.length;
        const enabled = this.glyphMode && !this.solidMode && ramp.length > 0;
        const key = `${enabled}:${Array.from(ramp).join(',')}:${this.glyphColorMode}:${this.glyphColor}:${this.backgroundColor}`;
        if (!force && key === this.glyphResourceKey) return;
        this.glyphResourceKey = key;

        const paddedRamp = new Uint32Array(GLYPH_RAMP_LIMIT);
        paddedRamp.set(ramp.subarray(0, GLYPH_RAMP_LIMIT));
        this.device.queue.writeBuffer(this.glyphRampBuffer, 0, paddedRamp);
        if (!enabled) return;

        const tasks = glyphAtlasPagesForRamp(ramp).map((page) => {
            if (this.loadedGlyphPages.has(page)) return Promise.resolve();
            let pending = this.pendingGlyphPages.get(page);
            if (!pending) {
                pending = loadGlyphAtlasPage(page, this.targetElement.ownerDocument || document)
                    .then((pixels) => {
                        if (!this.glyphAtlasTexture) return;
                        this.device.queue.writeTexture(
                            { texture: this.glyphAtlasTexture, origin: [0, 0, page] },
                            pixels,
                            { bytesPerRow: GLYPH_ATLAS_PAGE_SIZE, rowsPerImage: GLYPH_ATLAS_PAGE_SIZE },
                            [GLYPH_ATLAS_PAGE_SIZE, GLYPH_ATLAS_PAGE_SIZE, 1]
                        );
                        this.loadedGlyphPages.add(page);
                    })
                    .catch((error) => console.warn(`[WebGPU] Glyph atlas page ${page} unavailable:`, error))
                    .finally(() => this.pendingGlyphPages.delete(page));
                this.pendingGlyphPages.set(page, pending);
            }
            return pending;
        });
        await Promise.all(tasks);
    }

    _renderFrame() {
        if (!this.initialized) return;

        this.frameCount++;

        const sw = this.source.width || 640;
        const sh = this.source.height || 480;

        // Update params
        const pv = this.paramsView;
        pv.setUint32(0, sw, true);
        pv.setUint32(4, sh, true);
        pv.setUint32(8, this.cols, true);
        pv.setUint32(12, this.rows, true);
        const srcCellW = Math.floor(sw / this.cols);
        const srcCellH = Math.floor(sh / this.rows);
        pv.setUint32(16, srcCellW, true);
        pv.setUint32(20, srcCellH, true);
        pv.setFloat32(24, this.saturationBoost, true);
        pv.setFloat32(28, this.contrastBoost, true);
        pv.setFloat32(32, this.brightness, true);
        pv.setFloat32(36, this.gamma, true);
        pv.setFloat32(40, this.bgBlend, true);
        pv.setUint32(44, this.quantizeBits, true);
        pv.setFloat32(48, this.jitterAmount, true);
        pv.setFloat32(52, this.jitterSpeed, true);
        pv.setFloat32(56, this.sampleX, true);
        pv.setFloat32(60, this.sampleY, true);
        pv.setFloat32(64, this.frameCount / Math.max(1, this.fps), true);
        pv.setUint32(68, this.mirrorX ? 1 : 0, true);
        pv.setUint32(72, paletteById(this.paletteId)?.colors.length || 0, true);
        pv.setUint32(76, DITHER_MATRICES[this.ditherMode]?.size || 0, true);
        pv.setFloat32(80, this.ditherStrength, true);
        pv.setUint32(84, Math.max(1, Math.round(this.ditherScale)), true);
        pv.setFloat32(88, this.ditherBias, true);
        pv.setUint32(92, this.ditherInvert ? 1 : 0, true);
        this.device.queue.writeBuffer(this.paramsBuffer, 0, this.paramsData);

        // Render params
        const rv = this.renderView;
        rv.setUint32(0, this.cols, true);
        rv.setUint32(4, this.rows, true);
        rv.setUint32(8, this.cellWidth, true);
        rv.setUint32(12, this.cellHeight, true);
        rv.setUint32(16, this.canvasWidth, true);
        rv.setUint32(20, this.canvasHeight, true);
        rv.setUint32(24, this.glyphMode && !this.solidMode ? 1 : 0, true);
        rv.setUint32(28, this.glyphRampLength, true);
        rv.setUint32(32, this.glyphColorMode === 'fixed' ? 1 : 0, true);
        rv.setUint32(36, packedColor(this.glyphColor, '#ffffff'), true);
        rv.setUint32(40, packedColor(this.backgroundColor), true);
        this.device.queue.writeBuffer(this.renderParamsBuffer, 0, this.renderData);

        // Create bind groups based on source type
        let computeBG;
        let computePipeline;

        if (this.source.isVideo && this.source.canvas) {
            this._copyImageSourceToTexture();
        }

        if (this.usesExternalVideoTexture) {
            let externalTexture;
            try {
                externalTexture = this.device.importExternalTexture({ source: this.source.element });
            } catch (e) { return; }

            computePipeline = this.videoComputePipeline;
            computeBG = this.device.createBindGroup({
                layout: computePipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: externalTexture },
                    { binding: 1, resource: this.cellColorView },
                    { binding: 2, resource: { buffer: this.paramsBuffer } },
                    { binding: 3, resource: { buffer: this.paletteLutBuffer } },
                    { binding: 4, resource: { buffer: this.featureBuffer } }
                ]
            });
        } else {
            computePipeline = this.imageComputePipeline;
            computeBG = this.imageComputeBindGroup;
        }
        const renderBG = this.renderBindGroup;
        if (!computeBG || !renderBG) return;

        const encoder = this.device.createCommandEncoder();

        const computePass = encoder.beginComputePass();
        computePass.setPipeline(computePipeline);
        computePass.setBindGroup(0, computeBG);
        computePass.dispatchWorkgroups(Math.ceil(this.cols / 8), Math.ceil(this.rows / 8));
        computePass.end();

        const renderPass = encoder.beginRenderPass({
            colorAttachments: [{
                view: this.context.getCurrentTexture().createView(),
                loadOp: 'clear',
                storeOp: 'store',
                clearValue: { r: 0, g: 0, b: 0, a: 1 }
            }]
        });
        renderPass.setPipeline(this.renderPipeline);
        renderPass.setBindGroup(0, renderBG);
        renderPass.draw(3);
        renderPass.end();

        this.device.queue.submit([encoder.finish()]);
    }

    start() {
        if (this.running) return;
        this.running = true;
        this.lastRafAt = this.window.performance?.now?.() ?? performance.now();

        const tick = (ts) => {
            if (!this.running) return;
            if (ts - this.lastFrameTime >= this.frameInterval) {
                const beforeFrame = this.frameCount;
                this._renderFrame();
                if (this.frameCount !== beforeFrame) this._recordFrame(ts);
                this.lastFrameTime = ts;
            }
        };
        const loop = (ts) => {
            this.lastRafAt = this.window.performance?.now?.() ?? performance.now();
            tick(ts);
            if (!this.running) return;
            this.animationId = this.window.requestAnimationFrame(loop);
        };
        this.animationId = this.window.requestAnimationFrame(loop);
        const fallbackInterval = Math.max(8, Math.min(50, this.frameInterval));
        this.frameTimer = this.window.setInterval(() => {
            if (!this.running) return;
            const now = this.window.performance?.now?.() ?? performance.now();
            const staleMs = Math.max(80, this.frameInterval * 2);
            if (now - this.lastRafAt >= staleMs) tick(now);
        }, fallbackInterval);
    }

    stop() {
        this.running = false;
        if (this.animationId) {
            this.window.cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        if (this.frameTimer) {
            this.window.clearInterval(this.frameTimer);
            this.frameTimer = null;
        }
    }

    renderFrame() {
        const beforeFrame = this.frameCount;
        this._renderFrame();
        if (this.frameCount !== beforeFrame) {
            const now = this.window.performance?.now?.() ?? performance.now();
            this._recordFrame(now);
        }
    }

    _recordFrame(ts) {
        this.fpsFrameCount++;
        if (!this.lastFpsUpdate) {
            this.lastFpsUpdate = ts;
            return;
        }
        const elapsed = ts - this.lastFpsUpdate;
        if (elapsed >= 1000) {
            this.currentFps = this.fpsFrameCount * 1000 / elapsed;
            this.fpsFrameCount = 0;
            this.lastFpsUpdate = ts;
        }
    }

    destroy() {
        this.stop();
        if (this.cellColorTexture) this.cellColorTexture.destroy();
        if (this.imageSourceTexture) this.imageSourceTexture.destroy();
        if (this.paramsBuffer) this.paramsBuffer.destroy();
        if (this.renderParamsBuffer) this.renderParamsBuffer.destroy();
        if (this.paletteLutBuffer) this.paletteLutBuffer.destroy();
        if (this.featureBuffer) this.featureBuffer.destroy();
        if (this.glyphAtlasTexture) this.glyphAtlasTexture.destroy();
        if (this.glyphRampBuffer) this.glyphRampBuffer.destroy();
        this.cellColorView = null;
        this.imageSourceView = null;
        this.imageComputeBindGroup = null;
        this.renderBindGroup = null;
        this.glyphAtlasTexture = null;
        this.glyphAtlasView = null;
        this.glyphRampBuffer = null;
        this.initialized = false;
    }

    getStats() {
        return {
            backend: 'webgpu',
            sourceType: this.source?.type,
            cols: this.cols,
            rows: this.rows,
            fps: this.fps,
            currentFps: this.currentFps,
            canvasSize: `${this.canvasWidth}x${this.canvasHeight}`
        };
    }
}
