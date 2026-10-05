import { requestedRows } from './density-policy.js';
import { glyphRampCodePoints, glyphAtlasPagesForRamp, loadGlyphAtlasPage, GLYPH_ATLAS_PAGE_GLYPHS, GLYPH_ATLAS_PAGE_COLUMNS, GLYPH_ATLAS_PAGE_SIZE, GLYPH_ATLAS_TILE_SIZE } from './glyph-atlas.js';
import { renderSpatialCells } from './spatial-canvas.js';
import { processGpuCellColor, processCanvasColorLegacy } from './render-math.js';
import { getPaletteLut, paletteById } from './palettes.js';
import { fillPaletteDisplay, PALETTE_CONTRACT } from './palette-cycling.js';
import { applyAudioReactiveModulation, emptyAudioReactiveFeatures } from './audio-reactive.js';
import { protectWtfVisibility, WTF_VISUAL_LIMITS } from './wtf-visual-safety.js';

const WIDTH = 48, HEIGHT = 27;
const luma = (r, g, b) => .2126 * r + .7152 * g + .0722 * b;
const rgb = hex => (hex || '#030405').slice(1).match(/../g).map(v => parseInt(v, 16));
const coverageCache = new Map();
// A changing source must remain legible after it cuts to dim footage. This
// deterministic probe is also available while an actual source frame is black.
const dimPixels = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
    const n = 24 + (x * 3 + y * 5) % 64;
    dimPixels.set([n, n, n, 255], (y * WIDTH + x) * 4);
}
const dimSource = { pixels: dimPixels, width: WIDTH, height: HEIGHT };

export function sampleWtfSource(source) {
    const element = source?.canvas || source?.element || source;
    if (!element) return null;
    try {
        const canvas = document.createElement('canvas');
        const width = element.videoWidth || element.naturalWidth || element.width;
        const height = element.videoHeight || element.naturalHeight || element.height;
        if (!(width > 0 && height > 0)) return null;
        const scale = WIDTH / Math.max(width, height);
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(element, 0, 0, canvas.width, canvas.height);
        return { pixels: ctx.getImageData(0, 0, canvas.width, canvas.height).data, width: canvas.width, height: canvas.height };
    } catch { return null; }
}

async function glyphCoverage(params) {
    if (!params.glyphMode || params.solidMode || params.pixel) return null;
    const ramp = glyphRampCodePoints(params);
    const coverage = new Float32Array(ramp.length);
    const pages = new Map(await Promise.all(glyphAtlasPagesForRamp(ramp).map(async page => [page, await loadGlyphAtlasPage(page)])));
    for (let i = 0; i < ramp.length; i++) {
        const code = ramp[i];
        if (!coverageCache.has(code)) {
            const pixels = pages.get(Math.floor(code / GLYPH_ATLAS_PAGE_GLYPHS));
            const slot = code % GLYPH_ATLAS_PAGE_GLYPHS;
            const x = slot % GLYPH_ATLAS_PAGE_COLUMNS * GLYPH_ATLAS_TILE_SIZE;
            const y = Math.floor(slot / GLYPH_ATLAS_PAGE_COLUMNS) * GLYPH_ATLAS_TILE_SIZE;
            let ink = 0;
            for (let dy = 0; dy < GLYPH_ATLAS_TILE_SIZE; dy++) for (let dx = 0; dx < GLYPH_ATLAS_TILE_SIZE; dx++) {
                if (pixels?.[(y + dy) * GLYPH_ATLAS_PAGE_SIZE + x + dx] > 127) ink++;
            }
            // Full-resolution atlas coverage is conservative: GPU's max-pooled
            // small-cell mips only add ink. Cache numbers, not extra atlas pages.
            coverageCache.set(code, ink / (GLYPH_ATLAS_TILE_SIZE ** 2));
        }
        coverage[i] = coverageCache.get(code);
    }
    return coverage;
}

export function wtfCellSignal(cells, params, coverage = null) {
    const background = luma(...rgb(params.backgroundColor));
    const fixed = params.glyphColorMode === 'fixed' ? luma(...rgb(params.glyphColor || '#ffffff')) : null;
    let sum = 0, peak = 0, visible = 0;
    for (let i = 0; i < cells.length; i += 4) {
        const ink = coverage ? coverage[Math.min(coverage.length - 1, Math.floor(cells[i + 3] / 255 * coverage.length))] || 0 : 1;
        const foreground = coverage && fixed !== null ? fixed : luma(cells[i], cells[i + 1], cells[i + 2]);
        const displayed = ink * foreground + (1 - ink) * background;
        sum += displayed; peak = Math.max(peak, displayed);
        if (displayed > 12) visible++;
    }
    const count = cells.length / 4;
    return { average: sum / count, peak, visibleRatio: visible / count };
}

export async function inspectWtfTarget(params, source, { time = 0, audio = null } = {}) {
    const coverage = await glyphCoverage(params);
    // Exercise the dark and bright ends of the same live audio envelope even
    // while audio is stopped. Palette selection and reversed ramps can turn a
    // brighter cell into a darker displayed glyph.
    const variants = [params,
        protectWtfVisibility({ ...params, saturationBoost: 3, contrastBoost: WTF_VISUAL_LIMITS.contrastBoost[1], brightness: WTF_VISUAL_LIMITS.brightness[1], gamma: WTF_VISUAL_LIMITS.gamma[0], bgBlend: WTF_VISUAL_LIMITS.bgBlend[1] }),
        protectWtfVisibility({ ...params, saturationBoost: 3, brightness: WTF_VISUAL_LIMITS.brightness[1], gamma: WTF_VISUAL_LIMITS.gamma[1], bgBlend: 0 })
    ];
    if (audio) {
        const loud = Object.fromEntries(Object.keys(emptyAudioReactiveFeatures()).map(key => [key, 1]));
        variants.push(protectWtfVisibility(applyAudioReactiveModulation(params, loud, audio)));
    }
    const sources = [dimSource];
    // Black source frames are valid content, not evidence of a bad candidate.
    if (source && wtfCellSignal(source.pixels, { backgroundColor: '#000000' }).average > 8) sources.push(source);
    for (const variant of variants) {
        const lut = getPaletteLut(variant.paletteId, variant.paletteMapping);
        const display = fillPaletteDisplay(new Float32Array(PALETTE_CONTRACT.maxColors * 4), paletteById(variant.paletteId), variant);
        for (const input of sources) {
            const process = variant.backend === 'canvas2d' && variant.visualMode === 'flat' ? processCanvasColorLegacy : processGpuCellColor;
            let cols = WIDTH, rows = requestedRows({ ...variant, autoRows: true }, input.width, input.height, Boolean(variant.pixel), cols);
            if (rows > WIDTH) { cols = Math.max(1, Math.round(cols * WIDTH / rows)); rows = WIDTH; }
            const cells = renderSpatialCells(variant, input.pixels, input.width, input.height, cols, rows,
                (color, x, y) => process(...color, variant, x, y, lut, display), {}, time * 1000, time);
            const signal = wtfCellSignal(cells, variant, coverage);
            if (signal.average < 10 || signal.average > 245 || signal.peak < 24 || signal.visibleRatio < .08) return false;
        }
    }
    return true;
}
