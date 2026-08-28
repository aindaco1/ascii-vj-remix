/**
 * WebGL2 ASCII Renderer
 * Fallback GPU-accelerated rendering supporting video and image sources.
 *
 * Video: texImage2D() per frame
 * Image: texImage2D() once on init
 */

import {
    DITHER_MATRICES,
    buildPaletteLut,
    paletteById
} from '../../../../shared/palettes.js';
import {
    GLYPH_ATLAS_PAGE_COUNT,
    GLYPH_ATLAS_PAGE_SIZE,
    GLYPH_RAMP_LIMIT,
    glyphAtlasPagesForRamp,
    glyphRampCodePoints,
    glyphResourceInputKey,
    loadGlyphAtlasPage
} from '../../../../shared/glyph-atlas.js';

const CELL_PASS_VERT = `#version 300 es
in vec2 a_position;
out vec2 v_texCoord;
void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_position * 0.5 + 0.5;
}`;

const CELL_PASS_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_source;
uniform vec2 u_gridSize;
uniform float u_saturationBoost;
uniform float u_contrastBoost;
uniform float u_brightness;
uniform float u_gamma;
uniform float u_bgBlend;
uniform int u_quantizeBits;
uniform float u_jitterAmount;
uniform float u_jitterSpeed;
uniform float u_sampleX;
uniform float u_sampleY;
uniform float u_time;
uniform int u_mirrorX;
uniform sampler2D u_paletteLut;
uniform vec3 u_paletteColors[16];
uniform int u_paletteCount;
uniform float u_ditherValues[64];
uniform int u_ditherSize;
uniform float u_ditherStrength;
uniform int u_ditherScale;
uniform float u_ditherBias;
uniform int u_ditherInvert;
in vec2 v_texCoord;
out vec4 fragColor;

// Hash for per-cell jitter
float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.x, p.y, p.x) * 0.1031);
    p3 += dot(p3, vec3(p3.y + 33.33, p3.z + 33.33, p3.x + 33.33));
    return fract((p3.x + p3.y) * p3.z);
}

float orderedThreshold(ivec2 cellCoord) {
    if (u_ditherSize <= 0) return 0.0;
    int scale = max(1, u_ditherScale);
    int mx = (cellCoord.x / scale) % u_ditherSize;
    int my = (cellCoord.y / scale) % u_ditherSize;
    float threshold = u_ditherValues[my * u_ditherSize + mx];
    return u_ditherInvert == 1 ? -threshold : threshold;
}

void main() {
    vec2 cellCoord = floor(v_texCoord * u_gridSize);
    vec2 cellCenter = (cellCoord + vec2(u_sampleX, u_sampleY)) / u_gridSize;

    // Jitter sample point within the cell (animated by time)
    vec2 cellSize = 1.0 / u_gridSize;
    vec2 seed = cellCoord + u_time * u_jitterSpeed * vec2(7.13, 11.71);
    float jx = (hash(seed) - 0.5) * cellSize.x * u_jitterAmount;
    float jy = (hash(seed + vec2(37.0, 91.0)) - 0.5) * cellSize.y * u_jitterAmount;
    vec2 sampleUV = clamp(cellCenter + vec2(jx, jy), vec2(0.0), vec2(1.0));
    if (u_mirrorX == 1) {
        sampleUV.x = 1.0 - sampleUV.x;
    }

    vec4 c = texture(u_source, sampleUV);

    float avg = (c.r + c.g + c.b) * 0.333333333;
    vec3 boosted = clamp(vec3(
        avg + (c.r - avg) * u_saturationBoost,
        avg + (c.g - avg) * u_saturationBoost,
        avg + (c.b - avg) * u_saturationBoost
    ), 0.0, 1.0);
    boosted = clamp((boosted - 0.5) * u_contrastBoost + 0.5, 0.0, 1.0);
    boosted = clamp(pow(boosted * u_brightness, vec3(1.0 / max(0.01, u_gamma))), 0.0, 1.0);

    if (u_quantizeBits > 0) {
        float quantum = pow(2.0, float(u_quantizeBits));
        boosted = floor(boosted * 255.0 / quantum) * quantum / 255.0;
    }

    boosted = mix(boosted, vec3(3.0 / 255.0, 4.0 / 255.0, 5.0 / 255.0), clamp(u_bgBlend, 0.0, 1.0));

    if (u_ditherSize > 0) {
        float delta = orderedThreshold(ivec2(cellCoord)) * u_ditherStrength * (64.0 / 255.0) +
            u_ditherBias * (32.0 / 255.0);
        boosted = clamp(boosted + vec3(delta), 0.0, 1.0);
    }

    if (u_paletteCount > 0) {
        ivec3 q = ivec3(clamp(floor(boosted * 255.0 / 8.0), 0.0, 31.0));
        int row = q.r * 32 + q.g;
        int paletteIndex = int(round(texelFetch(u_paletteLut, ivec2(q.b, row), 0).r * 255.0));
        boosted = u_paletteColors[clamp(paletteIndex, 0, u_paletteCount - 1)];
    }

    float luma = dot(boosted, vec3(0.2126, 0.7152, 0.0722));
    fragColor = vec4(boosted, luma);
}`;

const RENDER_PASS_VERT = `#version 300 es
in vec2 a_position;
out vec2 v_texCoord;
void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_position * 0.5 + 0.5;
}`;

const RENDER_PASS_FRAG = `#version 300 es
precision highp float;
precision highp sampler2DArray;
precision highp usampler2D;
uniform sampler2D u_cellColors;
uniform sampler2DArray u_glyphAtlas;
uniform usampler2D u_glyphRamp;
uniform vec2 u_gridSize;
uniform vec2 u_cellSize;
uniform vec2 u_canvasSize;
uniform int u_glyphMode;
uniform int u_glyphCount;
uniform int u_glyphColorMode;
uniform vec3 u_glyphColor;
uniform vec3 u_backgroundColor;
in vec2 v_texCoord;
out vec4 fragColor;

void main() {
    vec2 pixel = v_texCoord * u_canvasSize;
    vec2 cellCoord = floor(pixel / u_cellSize);
    cellCoord = clamp(cellCoord, vec2(0.0), u_gridSize - 1.0);
    vec4 cell = texelFetch(u_cellColors, ivec2(cellCoord), 0);
    if (u_glyphMode == 0 || u_glyphCount <= 0) {
        fragColor = vec4(cell.rgb, 1.0);
        return;
    }
    vec2 local = pixel - cellCoord * u_cellSize;
    ivec2 glyphPixel = ivec2(clamp(floor(local / u_cellSize * 16.0), vec2(0.0), vec2(15.0)));
    int rampIndex = min(int(clamp(cell.a, 0.0, 0.99999) * float(u_glyphCount)), u_glyphCount - 1);
    uint glyphId = texelFetch(u_glyphRamp, ivec2(rampIndex, 0), 0).r;
    int page = int(glyphId / 4096u);
    uint slot = glyphId % 4096u;
    ivec2 atlasPixel = ivec2(
        int(slot % 64u) * 16 + glyphPixel.x,
        int(slot / 64u) * 16 + glyphPixel.y
    );
    float alpha = texelFetch(u_glyphAtlas, ivec3(atlasPixel, page), 0).r;
    if (alpha <= 0.5) {
        fragColor = vec4(u_backgroundColor, 1.0);
        return;
    }
    vec3 foreground = u_glyphColorMode == 1 ? u_glyphColor : cell.rgb;
    fragColor = vec4(foreground, 1.0);
}`;

function colorFloats(value, fallback = '#030405') {
    const match = /^#([0-9a-f]{6})$/i.exec(String(value || '')) || /^#([0-9a-f]{6})$/i.exec(fallback);
    const packed = Number.parseInt(match[1], 16);
    return [(packed >> 16 & 255) / 255, (packed >> 8 & 255) / 255, (packed & 255) / 255];
}

export class WebGL2Renderer {
    constructor(options = {}) {
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
        this.preserveDrawingBuffer = options.preserveDrawingBuffer === true;
        this.opaqueCanvas = options.opaqueCanvas === true;
        this.desynchronized = options.desynchronized === true;

        this.running = false;
        this.animationId = null;
        this.frameTimer = null;
        this.window = window;
        this.lastFrameTime = 0;
        this.lastRafAt = 0;
        this.initialized = false;
        this.frameCount = 0;
        this.fpsFrameCount = 0;
        this.lastFpsUpdate = 0;
        this.currentFps = 0;

        this.canvas = null;
        this.gl = null;
        this.cellProgram = null;
        this.renderProgram = null;
        this.cellUniforms = null;
        this.renderUniforms = null;
        this.sourceTexture = null;
        this.cellColorTexture = null;
        this.cellFramebuffer = null;
        this.paletteLutTexture = null;
        this.glyphAtlasTexture = null;
        this.glyphRampTexture = null;
        this.loadedGlyphPages = new Set();
        this.pendingGlyphPages = new Set();
        this.glyphInputKey = '';
        this.glyphResourceKey = '';
        this.glyphRampLength = 0;
        this.featureResourceKey = '';
        this.quadVAO = null;

        this.rows = 0;
        this.canvasWidth = 0;
        this.canvasHeight = 0;
    }

    init() {
        const doc = this.targetElement.ownerDocument || document;
        this.window = doc.defaultView || window;
        this.canvas = doc.createElement('canvas');
        this.canvas.className = 'ascii-canvas';
        this.targetElement.innerHTML = '';
        this.targetElement.appendChild(this.canvas);

        this.gl = this.canvas.getContext('webgl2', {
            antialias: false,
            alpha: !this.opaqueCanvas,
            preserveDrawingBuffer: this.preserveDrawingBuffer,
            desynchronized: this.desynchronized
        });
        if (!this.gl) throw new Error('WebGL2 not available');

        this._updateDimensions();

        const gl = this.gl;

        this.cellProgram = this._createProgram(CELL_PASS_VERT, CELL_PASS_FRAG);
        this.renderProgram = this._createProgram(RENDER_PASS_VERT, RENDER_PASS_FRAG);
        this.cellUniforms = this._uniformLocations(this.cellProgram, [
            'u_source',
            'u_gridSize',
            'u_saturationBoost',
            'u_contrastBoost',
            'u_brightness',
            'u_gamma',
            'u_bgBlend',
            'u_quantizeBits',
            'u_jitterAmount',
            'u_jitterSpeed',
            'u_sampleX',
            'u_sampleY',
            'u_time',
            'u_mirrorX',
            'u_paletteLut',
            'u_paletteColors[0]',
            'u_paletteCount',
            'u_ditherValues[0]',
            'u_ditherSize',
            'u_ditherStrength',
            'u_ditherScale',
            'u_ditherBias',
            'u_ditherInvert'
        ]);
        this.renderUniforms = this._uniformLocations(this.renderProgram, [
            'u_cellColors',
            'u_glyphAtlas',
            'u_glyphRamp',
            'u_gridSize',
            'u_cellSize',
            'u_canvasSize',
            'u_glyphMode',
            'u_glyphCount',
            'u_glyphColorMode',
            'u_glyphColor',
            'u_backgroundColor'
        ]);

        // Fullscreen quad VAO
        this.quadVAO = gl.createVertexArray();
        gl.bindVertexArray(this.quadVAO);
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            -1, -1, -1, 1, 1, 1,
            -1, -1, 1, 1, 1, -1
        ]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);

        // Source texture
        this.sourceTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture);
        this._applySourceSmoothing();
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

        // For images, upload texture once
        if (this.source.isImage) {
            const sourceEl = this.source.canvas || this.source.element;
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceEl);
        }

        this._createCellTexture();
        this.paletteLutTexture = gl.createTexture();
        this.glyphAtlasTexture = gl.createTexture();
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.glyphAtlasTexture);
        gl.texStorage3D(
            gl.TEXTURE_2D_ARRAY,
            1,
            gl.R8,
            GLYPH_ATLAS_PAGE_SIZE,
            GLYPH_ATLAS_PAGE_SIZE,
            GLYPH_ATLAS_PAGE_COUNT
        );
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        this.glyphRampTexture = gl.createTexture();
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, this.glyphRampTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

        this.initialized = true;
        this.syncFeatureResources(true);
        console.log(`[WebGL2] ${this.source.type} source, ${this.cols}x${this.rows} cells, ${this.canvasWidth}x${this.canvasHeight}px`);
    }

    _createProgram(vertSrc, fragSrc) {
        const gl = this.gl;

        const vert = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vert, vertSrc);
        gl.compileShader(vert);
        if (!gl.getShaderParameter(vert, gl.COMPILE_STATUS)) {
            throw new Error('Vertex shader: ' + gl.getShaderInfoLog(vert));
        }

        const frag = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(frag, fragSrc);
        gl.compileShader(frag);
        if (!gl.getShaderParameter(frag, gl.COMPILE_STATUS)) {
            throw new Error('Fragment shader: ' + gl.getShaderInfoLog(frag));
        }

        const prog = gl.createProgram();
        gl.attachShader(prog, vert);
        gl.attachShader(prog, frag);
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            throw new Error('Link: ' + gl.getProgramInfoLog(prog));
        }

        gl.deleteShader(vert);
        gl.deleteShader(frag);
        return prog;
    }

    _uniformLocations(program, names) {
        return Object.fromEntries(names.map((name) => [name, this.gl.getUniformLocation(program, name)]));
    }

    _updateDimensions() {
        const sw = this.source.width || 640;
        const sh = this.source.height || 480;
        this.rows = this.autoRows
            ? Math.max(1, Math.round(this.cols * (sh / sw) * (this.cellWidth / this.cellHeight) * this.aspectCorrection))
            : Math.max(1, Math.round(this.rowsOverride || this.rows || 1));
        this.canvasWidth = this.cols * this.cellWidth;
        this.canvasHeight = this.rows * this.cellHeight;
        this.canvas.width = this.canvasWidth;
        this.canvas.height = this.canvasHeight;
        this.canvas.style.aspectRatio = `${sw} / ${sh}`;
        this.canvas.style.width = '100%';
        this.canvas.style.height = 'auto';
        this.canvas.style.maxWidth = '100%';
        this.canvas.style.maxHeight = '100%';
        this.canvas.style.imageRendering = 'pixelated';
    }

    _createCellTexture() {
        const gl = this.gl;
        if (this.cellColorTexture) gl.deleteTexture(this.cellColorTexture);
        if (this.cellFramebuffer) gl.deleteFramebuffer(this.cellFramebuffer);

        this.cellColorTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.cellColorTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, this.cols, this.rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        this.cellFramebuffer = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.cellFramebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.cellColorTexture, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    _applySourceSmoothing() {
        if (!this.gl || !this.sourceTexture) return;
        const gl = this.gl;
        const filter = this.smoothing ? gl.LINEAR : gl.NEAREST;
        gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    }

    syncFeatureResources(force = false) {
        if (!this.gl || !this.paletteLutTexture) return;
        const key = `${this.paletteId}:${this.paletteMapping}:${this.ditherMode}`;
        if (!force && key === this.featureResourceKey) {
            this.syncGlyphResources();
            return;
        }
        this.featureResourceKey = key;

        const gl = this.gl;
        const palette = paletteById(this.paletteId);
        const lut = buildPaletteLut(this.paletteId, this.paletteMapping) || new Uint8Array(32 * 32 * 32);
        const paletteColors = new Float32Array(16 * 3);
        for (let index = 0; index < (palette?.colors.length || 0); index++) {
            const color = palette.colors[index];
            paletteColors[index * 3] = color[0] / 255;
            paletteColors[index * 3 + 1] = color[1] / 255;
            paletteColors[index * 3 + 2] = color[2] / 255;
        }
        const matrix = DITHER_MATRICES[this.ditherMode];
        const ditherValues = new Float32Array(64);
        if (matrix) {
            const area = matrix.size * matrix.size;
            for (let index = 0; index < area; index++) {
                ditherValues[index] = (matrix.values[index] + 0.5) / area - 0.5;
            }
        }

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.paletteLutTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 32, 1024, 0, gl.RED, gl.UNSIGNED_BYTE, lut);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        gl.useProgram(this.cellProgram);
        gl.uniform1i(this.cellUniforms.u_paletteLut, 1);
        gl.uniform3fv(this.cellUniforms['u_paletteColors[0]'], paletteColors);
        gl.uniform1i(this.cellUniforms.u_paletteCount, palette?.colors.length || 0);
        gl.uniform1fv(this.cellUniforms['u_ditherValues[0]'], ditherValues);
        gl.uniform1i(this.cellUniforms.u_ditherSize, matrix?.size || 0);
        this.syncGlyphResources(force);
    }

    syncGlyphResources(force = false) {
        if (!this.gl || !this.glyphAtlasTexture || !this.glyphRampTexture) return;
        const inputKey = glyphResourceInputKey(this);
        if (!force && inputKey === this.glyphInputKey) return;
        this.glyphInputKey = inputKey;
        const ramp = glyphRampCodePoints(this);
        this.glyphRampLength = ramp.length;
        const enabled = this.glyphMode && !this.solidMode && ramp.length > 0;
        const key = `${enabled}:${Array.from(ramp).join(',')}:${this.glyphColorMode}:${this.glyphColor}:${this.backgroundColor}`;
        if (!force && key === this.glyphResourceKey) return;
        this.glyphResourceKey = key;

        const gl = this.gl;
        const paddedRamp = new Uint32Array(GLYPH_RAMP_LIMIT);
        paddedRamp.set(ramp.subarray(0, GLYPH_RAMP_LIMIT));
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, this.glyphRampTexture);
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.R32UI,
            GLYPH_RAMP_LIMIT,
            1,
            0,
            gl.RED_INTEGER,
            gl.UNSIGNED_INT,
            paddedRamp
        );

        if (!enabled) return;
        for (const page of glyphAtlasPagesForRamp(ramp)) {
            if (this.loadedGlyphPages.has(page) || this.pendingGlyphPages.has(page)) continue;
            this.pendingGlyphPages.add(page);
            loadGlyphAtlasPage(page, this.targetElement.ownerDocument || document)
                .then((pixels) => {
                    if (!this.gl || !this.glyphAtlasTexture) return;
                    gl.activeTexture(gl.TEXTURE2);
                    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.glyphAtlasTexture);
                    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
                    gl.texSubImage3D(
                        gl.TEXTURE_2D_ARRAY,
                        0,
                        0,
                        0,
                        page,
                        GLYPH_ATLAS_PAGE_SIZE,
                        GLYPH_ATLAS_PAGE_SIZE,
                        1,
                        gl.RED,
                        gl.UNSIGNED_BYTE,
                        pixels
                    );
                    this.loadedGlyphPages.add(page);
                })
                .catch((error) => console.warn(`[WebGL2] Glyph atlas page ${page} unavailable:`, error))
                .finally(() => this.pendingGlyphPages.delete(page));
        }
    }

    _renderFrame() {
        if (!this.initialized) return;

        this.frameCount++;
        const gl = this.gl;

        // For video, update texture every frame
        if (this.source.isVideo) {
            const sourceEl = this.source.canvas || this.source.element;
            gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture);
            try {
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceEl);
            } catch (e) { return; }
        }

        // Pass 1: cell colors
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.cellFramebuffer);
        gl.viewport(0, 0, this.cols, this.rows);
        gl.useProgram(this.cellProgram);
        const cellUniforms = this.cellUniforms;

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture);
        gl.uniform1i(cellUniforms.u_source, 0);
        gl.uniform2f(cellUniforms.u_gridSize, this.cols, this.rows);
        gl.uniform1f(cellUniforms.u_saturationBoost, this.saturationBoost);
        gl.uniform1f(cellUniforms.u_contrastBoost, this.contrastBoost);
        gl.uniform1f(cellUniforms.u_brightness, this.brightness);
        gl.uniform1f(cellUniforms.u_gamma, this.gamma);
        gl.uniform1f(cellUniforms.u_bgBlend, this.bgBlend);
        gl.uniform1i(cellUniforms.u_quantizeBits, this.quantizeBits);
        gl.uniform1f(cellUniforms.u_jitterAmount, this.jitterAmount);
        gl.uniform1f(cellUniforms.u_jitterSpeed, this.jitterSpeed);
        gl.uniform1f(cellUniforms.u_sampleX, this.sampleX);
        gl.uniform1f(cellUniforms.u_sampleY, this.sampleY);
        gl.uniform1f(cellUniforms.u_time, this.frameCount / Math.max(1, this.fps));
        gl.uniform1i(cellUniforms.u_mirrorX, this.mirrorX ? 1 : 0);
        gl.uniform1f(cellUniforms.u_ditherStrength, this.ditherStrength);
        gl.uniform1i(cellUniforms.u_ditherScale, Math.max(1, Math.round(this.ditherScale)));
        gl.uniform1f(cellUniforms.u_ditherBias, this.ditherBias);
        gl.uniform1i(cellUniforms.u_ditherInvert, this.ditherInvert ? 1 : 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.paletteLutTexture);

        gl.bindVertexArray(this.quadVAO);
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        // Pass 2: render to canvas
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.canvasWidth, this.canvasHeight);
        gl.useProgram(this.renderProgram);
        const renderUniforms = this.renderUniforms;

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.cellColorTexture);
        gl.uniform1i(renderUniforms.u_cellColors, 0);
        gl.uniform2f(renderUniforms.u_gridSize, this.cols, this.rows);
        gl.uniform2f(renderUniforms.u_cellSize, this.cellWidth, this.cellHeight);
        gl.uniform2f(renderUniforms.u_canvasSize, this.canvasWidth, this.canvasHeight);
        gl.uniform1i(renderUniforms.u_glyphMode, this.glyphMode && !this.solidMode ? 1 : 0);
        gl.uniform1i(renderUniforms.u_glyphCount, this.glyphRampLength);
        gl.uniform1i(renderUniforms.u_glyphColorMode, this.glyphColorMode === 'fixed' ? 1 : 0);
        gl.uniform3fv(renderUniforms.u_glyphColor, colorFloats(this.glyphColor, '#ffffff'));
        gl.uniform3fv(renderUniforms.u_backgroundColor, colorFloats(this.backgroundColor));
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.glyphAtlasTexture);
        gl.uniform1i(renderUniforms.u_glyphAtlas, 2);
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, this.glyphRampTexture);
        gl.uniform1i(renderUniforms.u_glyphRamp, 3);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.bindVertexArray(null);
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

    destroy() {
        this.stop();
        const gl = this.gl;
        if (gl) {
            if (this.cellColorTexture) gl.deleteTexture(this.cellColorTexture);
            if (this.paletteLutTexture) gl.deleteTexture(this.paletteLutTexture);
            if (this.glyphAtlasTexture) gl.deleteTexture(this.glyphAtlasTexture);
            if (this.glyphRampTexture) gl.deleteTexture(this.glyphRampTexture);
            if (this.sourceTexture) gl.deleteTexture(this.sourceTexture);
            if (this.cellFramebuffer) gl.deleteFramebuffer(this.cellFramebuffer);
            if (this.cellProgram) gl.deleteProgram(this.cellProgram);
            if (this.renderProgram) gl.deleteProgram(this.renderProgram);
        }
        this.cellUniforms = null;
        this.renderUniforms = null;
        this.initialized = false;
    }

    getStats() {
        return {
            backend: 'webgl2',
            sourceType: this.source?.type,
            cols: this.cols,
            rows: this.rows,
            fps: this.fps,
            currentFps: this.currentFps,
            canvasSize: `${this.canvasWidth}x${this.canvasHeight}`
        };
    }
}
