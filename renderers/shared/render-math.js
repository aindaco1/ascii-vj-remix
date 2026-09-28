import { ASCII_CHARS, activeGlyphRamp } from './character-sets.js';
import { processPaletteDither, paletteById } from './palettes.js';

const GPU_BACKGROUND = [3 / 255, 4 / 255, 5 / 255];

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function fract(value) {
    return value - Math.floor(value);
}

// Keep hue while fitting the brighter luminance into the RGB gamut.
function brightenRgb([r, g, b]) {
    const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
    if (luma <= 0) return [r, g, b];
    const lifted = Math.pow(luma, 0.22), gain = lifted / luma;
    const peak = Math.max(r, g, b) * gain;
    const chroma = peak > 1 ? (1 - lifted) / (peak - lifted) : 1;
    return [r, g, b].map(v => lifted + (v * gain - lifted) * chroma);
}

function finishPalette(color, x, y, params, lut, display) {
    const mapped = processPaletteDither(color, x, y, params, lut, display);
    if (params?.brightOutput === false || !paletteById(params?.paletteId)) return mapped;
    const baseLuma = mapped[3] ?? (mapped[0] * .2126 + mapped[1] * .7152 + mapped[2] * .0722);
    return [...brightenRgb(mapped.slice(0,3).map(v=>v/255)).map(v=>Math.round(clamp(v,0,1)*255)),
        Math.pow(baseLuma / 255, .22) * 255];
}

function applyBasicColorAdjustments(r, g, b, params) {
    let rr = r / 255;
    let gg = g / 255;
    let bb = b / 255;
    const saturationBoost = Number(params?.saturationBoost ?? 1);
    const contrastBoost = Number(params?.contrastBoost ?? 1);
    const brightness = Number(params?.brightness ?? 1);
    const gamma = Math.max(0.01, Number(params?.gamma ?? 1));
    const avg = (rr + gg + bb) / 3;
    rr = clamp(avg + (rr - avg) * saturationBoost, 0, 1);
    gg = clamp(avg + (gg - avg) * saturationBoost, 0, 1);
    bb = clamp(avg + (bb - avg) * saturationBoost, 0, 1);
    // Palette lookup keeps its authored color ranges, including animated
    // ranges. Those colors are lifted afterwards with stable base glyph luma.
    if (params?.brightOutput !== false && !paletteById(params?.paletteId)) {
        [rr, gg, bb] = brightenRgb([rr, gg, bb]);
    }
    rr = clamp((rr - 0.5) * contrastBoost + 0.5, 0, 1);
    gg = clamp((gg - 0.5) * contrastBoost + 0.5, 0, 1);
    bb = clamp((bb - 0.5) * contrastBoost + 0.5, 0, 1);
    rr = clamp(Math.pow(rr * brightness, 1 / gamma), 0, 1);
    gg = clamp(Math.pow(gg * brightness, 1 / gamma), 0, 1);
    bb = clamp(Math.pow(bb * brightness, 1 / gamma), 0, 1);
    return [rr, gg, bb];
}

function processCanvasColorLegacy(r, g, b, params, x = 0, y = 0, paletteLut = null, paletteDisplay = null) {
    const [rr, gg, bb] = applyBasicColorAdjustments(r, g, b, params);
    let color;
    if ((params?.quantizeBits || 0) > 0) {
        const mask = (255 << params.quantizeBits) & 255;
        color = [
            Math.round(rr * 255) & mask,
            Math.round(gg * 255) & mask,
            Math.round(bb * 255) & mask
        ];
    } else {
        color = [Math.round(rr * 255), Math.round(gg * 255), Math.round(bb * 255)];
    }
    if ((!params?.paletteId || params.paletteId === 'none') && (!params?.ditherMode || params.ditherMode === 'none')) {
        return color;
    }
    return finishPalette(color, x, y, params, paletteLut, paletteDisplay);
}

function processStreamColorLegacy(r, g, b, params) {
    return processCanvasColorLegacy(r, g, b, params);
}

function shaderHash(x, y) {
    let p3x = fract(x * 0.1031);
    let p3y = fract(y * 0.1031);
    let p3z = fract(x * 0.1031);
    const dot = p3x * (p3y + 33.33) + p3y * (p3z + 33.33) + p3z * (p3x + 33.33);
    p3x += dot;
    p3y += dot;
    p3z += dot;
    return fract((p3x + p3y) * p3z);
}

function processGpuCellColor(r, g, b, params, x = 0, y = 0, paletteLut = null, paletteDisplay = null) {
    let [rr, gg, bb] = applyBasicColorAdjustments(r, g, b, params);
    const quantizeBits = Math.max(0, Math.round(params?.quantizeBits || 0));
    if (quantizeBits > 0) {
        const quantum = Math.pow(2, quantizeBits);
        rr = Math.floor(rr * 255 / quantum) * quantum / 255;
        gg = Math.floor(gg * 255 / quantum) * quantum / 255;
        bb = Math.floor(bb * 255 / quantum) * quantum / 255;
    }

    const bgBlend = clamp(params?.bgBlend || 0, 0, 1);
    rr = rr * (1 - bgBlend) + GPU_BACKGROUND[0] * bgBlend;
    gg = gg * (1 - bgBlend) + GPU_BACKGROUND[1] * bgBlend;
    bb = bb * (1 - bgBlend) + GPU_BACKGROUND[2] * bgBlend;
    const color = [Math.round(rr * 255), Math.round(gg * 255), Math.round(bb * 255)];
    if ((!params?.paletteId || params.paletteId === 'none') && (!params?.ditherMode || params.ditherMode === 'none')) {
        return color;
    }
    return finishPalette(color, x, y, params, paletteLut, paletteDisplay);
}

function charsetChars(params) {
    return activeGlyphRamp(params);
}

function glyphForLuma(luma, params, resolvedRamp = null) {
    const chars = resolvedRamp || charsetChars(params);
    const idx = Math.min(chars.length - 1, Math.floor(luma / 256 * chars.length));
    return chars[idx] || ' ';
}

export {
    ASCII_CHARS,
    applyBasicColorAdjustments,
    charsetChars,
    clamp,
    fract,
    glyphForLuma,
    processCanvasColorLegacy,
    processGpuCellColor,
    processStreamColorLegacy,
    shaderHash
};
