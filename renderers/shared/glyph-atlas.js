import { activeGlyphRamp } from './character-sets.js';

const GLYPH_ATLAS_STYLE = 'neutral';
const GLYPH_ATLAS_TILE_SIZE = 16;
const GLYPH_ATLAS_PAGE_SIZE = 1024;
const GLYPH_ATLAS_MIP_LEVEL_COUNT = Math.log2(GLYPH_ATLAS_TILE_SIZE) + 1;
const GLYPH_ATLAS_PAGE_COLUMNS = GLYPH_ATLAS_PAGE_SIZE / GLYPH_ATLAS_TILE_SIZE;
const GLYPH_ATLAS_PAGE_GLYPHS = GLYPH_ATLAS_PAGE_COLUMNS * GLYPH_ATLAS_PAGE_COLUMNS;
const GLYPH_ATLAS_PAGE_COUNT = 16;
const GLYPH_ATLAS_CACHE_LIMIT = 4;
const GLYPH_RAMP_LIMIT = 96;
const GLYPH_RAMP_TEXTURE_LEVEL_Y = Object.freeze([0, 16, 24, 28, 30]);
const GLYPH_RAMP_TEXTURE_COLUMNS = 48;
const GLYPH_RAMP_TEXTURE_ROW_HEIGHT = GLYPH_ATLAS_TILE_SIZE * 2 - 1;
const GLYPH_RAMP_TEXTURE_WIDTH = GLYPH_ATLAS_TILE_SIZE * GLYPH_RAMP_TEXTURE_COLUMNS;
const GLYPH_RAMP_TEXTURE_HEIGHT = GLYPH_RAMP_TEXTURE_ROW_HEIGHT * Math.ceil(GLYPH_RAMP_LIMIT / GLYPH_RAMP_TEXTURE_COLUMNS);
const glyphPageCache = new Map();
const glyphMipCache = new WeakMap();

function glyphRampCodePoints(params = {}) {
    return Uint32Array.from(
        [...activeGlyphRamp(params)].slice(0, GLYPH_RAMP_LIMIT),
        (scalar) => scalar.codePointAt(0)
    );
}

function glyphResourceInputKey(params = {}) {
    return [
        params.glyphMode === true,
        params.solidMode === true,
        params.charset || '',
        params.customGlyphRamp || '',
        Number(params.glyphDepth) || 0,
        Number(params.glyphOffset) || 0,
        params.glyphReverse === true,
        params.glyphColorMode || '',
        params.glyphColor || '',
        params.backgroundColor || '',
        params.atlasStyle || GLYPH_ATLAS_STYLE
    ].join(':');
}

function glyphAtlasPagesForRamp(ramp) {
    return [...new Set(Array.from(ramp || [], (codePoint) => (
        Math.floor(Number(codePoint) / GLYPH_ATLAS_PAGE_GLYPHS)
    )))]
        .filter((page) => page >= 0 && page < GLYPH_ATLAS_PAGE_COUNT)
        .sort((a, b) => a - b);
}

function glyphAtlasPageUrl(page, ownerDocument = globalThis.document) {
    const base = ownerDocument?.baseURI || globalThis.location?.href || import.meta.url;
    return new URL(
        `renderers/gpu/assets/glyphs/${GLYPH_ATLAS_STYLE}/page-${page}.png`,
        base
    ).href;
}

async function decodeGlyphPage(page, ownerDocument) {
    const url = glyphAtlasPageUrl(page, ownerDocument);
    const ownerWindow = ownerDocument?.defaultView || globalThis;
    const image = await new Promise((resolve, reject) => {
        const element = new ownerWindow.Image();
        element.decoding = 'async';
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error(`glyph atlas page ${page} could not be decoded`));
        element.src = url;
    });
    if (image.width !== GLYPH_ATLAS_PAGE_SIZE || image.height !== GLYPH_ATLAS_PAGE_SIZE) {
        image.close?.();
        throw new Error(`glyph atlas page ${page} has unexpected dimensions`);
    }
    const canvas = typeof ownerWindow.OffscreenCanvas === 'function'
        ? new ownerWindow.OffscreenCanvas(GLYPH_ATLAS_PAGE_SIZE, GLYPH_ATLAS_PAGE_SIZE)
        : ownerDocument.createElement('canvas');
    canvas.width = GLYPH_ATLAS_PAGE_SIZE;
    canvas.height = GLYPH_ATLAS_PAGE_SIZE;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    image.close?.();
    const rgba = context.getImageData(0, 0, GLYPH_ATLAS_PAGE_SIZE, GLYPH_ATLAS_PAGE_SIZE).data;
    const alpha = new Uint8Array(GLYPH_ATLAS_PAGE_SIZE * GLYPH_ATLAS_PAGE_SIZE);
    for (let source = 0, target = 0; source < rgba.length; source += 4, target += 1) {
        alpha[target] = rgba[source];
    }
    return alpha;
}

function buildGlyphRampTexture(ramp, pagePixels) {
    const texture = new Uint8Array(GLYPH_RAMP_TEXTURE_WIDTH * GLYPH_RAMP_TEXTURE_HEIGHT * 4);
    const codePoints = Array.from(ramp || []).slice(0, GLYPH_RAMP_LIMIT);
    const pageMips = new Map();
    for (const page of glyphAtlasPagesForRamp(codePoints)) {
        const pixels = pagePixels?.get?.(page);
        if (pixels) pageMips.set(page, glyphAtlasMipLevels(pixels));
    }

    for (const [rampIndex, codePoint] of codePoints.entries()) {
        const page = Math.floor(Number(codePoint) / GLYPH_ATLAS_PAGE_GLYPHS);
        const levels = pageMips.get(page);
        if (!levels) continue;
        const slot = Number(codePoint) % GLYPH_ATLAS_PAGE_GLYPHS;
        const slotX = slot % GLYPH_ATLAS_PAGE_COLUMNS;
        const slotY = Math.floor(slot / GLYPH_ATLAS_PAGE_COLUMNS);
        const targetX = (rampIndex % GLYPH_RAMP_TEXTURE_COLUMNS) * GLYPH_ATLAS_TILE_SIZE;
        const targetRowY = Math.floor(rampIndex / GLYPH_RAMP_TEXTURE_COLUMNS) * GLYPH_RAMP_TEXTURE_ROW_HEIGHT;

        for (let level = 0; level < GLYPH_ATLAS_MIP_LEVEL_COUNT; level++) {
            const tileSize = GLYPH_ATLAS_TILE_SIZE >> level;
            const pageSize = GLYPH_ATLAS_PAGE_SIZE >> level;
            const sourceX = slotX * tileSize;
            const sourceY = slotY * tileSize;
            const targetY = targetRowY + GLYPH_RAMP_TEXTURE_LEVEL_Y[level];
            for (let y = 0; y < tileSize; y++) {
                for (let x = 0; x < tileSize; x++) {
                    const value = levels[level][(sourceY + y) * pageSize + sourceX + x];
                    const target = ((targetY + y) * GLYPH_RAMP_TEXTURE_WIDTH + targetX + x) * 4;
                    texture[target] = value;
                    texture[target + 1] = value;
                    texture[target + 2] = value;
                    texture[target + 3] = 255;
                }
            }
        }
    }
    return texture;
}

function loadGlyphAtlasPage(page, ownerDocument = globalThis.document) {
    const pageIndex = Math.round(Number(page));
    if (pageIndex < 0 || pageIndex >= GLYPH_ATLAS_PAGE_COUNT) {
        return Promise.reject(new Error(`glyph atlas page ${page} is outside the BMP atlas`));
    }
    const cacheKey = glyphAtlasPageUrl(pageIndex, ownerDocument);
    let pending = glyphPageCache.get(cacheKey);
    if (!pending) {
        pending = decodeGlyphPage(pageIndex, ownerDocument).catch((error) => {
            glyphPageCache.delete(cacheKey);
            throw error;
        });
        glyphPageCache.set(cacheKey, pending);
        while (glyphPageCache.size > GLYPH_ATLAS_CACHE_LIMIT) {
            const oldestKey = glyphPageCache.keys().next().value;
            if (!oldestKey || oldestKey === cacheKey) break;
            glyphPageCache.delete(oldestKey);
        }
    }
    return pending;
}

function glyphAtlasMipLevels(pixels) {
    if (!(pixels instanceof Uint8Array) || pixels.length !== GLYPH_ATLAS_PAGE_SIZE ** 2) {
        throw new Error('glyph atlas mip source has unexpected dimensions');
    }
    const cached = glyphMipCache.get(pixels);
    if (cached) return cached;

    const levels = [pixels];
    let previous = pixels;
    let previousSize = GLYPH_ATLAS_PAGE_SIZE;
    for (let level = 1; level < GLYPH_ATLAS_MIP_LEVEL_COUNT; level++) {
        const size = previousSize / 2;
        const next = new Uint8Array(size * size);
        for (let y = 0; y < size; y++) {
            const sourceRow = y * 2 * previousSize;
            const targetRow = y * size;
            for (let x = 0; x < size; x++) {
                const source = sourceRow + x * 2;
                next[targetRow + x] = Math.max(
                    previous[source],
                    previous[source + 1],
                    previous[source + previousSize],
                    previous[source + previousSize + 1]
                );
            }
        }
        levels.push(next);
        previous = next;
        previousSize = size;
    }
    glyphMipCache.set(pixels, levels);
    return levels;
}

export {
    GLYPH_ATLAS_MIP_LEVEL_COUNT,
    GLYPH_ATLAS_PAGE_COLUMNS,
    GLYPH_ATLAS_PAGE_COUNT,
    GLYPH_ATLAS_CACHE_LIMIT,
    GLYPH_ATLAS_PAGE_GLYPHS,
    GLYPH_ATLAS_PAGE_SIZE,
    GLYPH_ATLAS_STYLE,
    GLYPH_ATLAS_TILE_SIZE,
    GLYPH_RAMP_LIMIT,
    GLYPH_RAMP_TEXTURE_COLUMNS,
    GLYPH_RAMP_TEXTURE_HEIGHT,
    GLYPH_RAMP_TEXTURE_LEVEL_Y,
    GLYPH_RAMP_TEXTURE_ROW_HEIGHT,
    GLYPH_RAMP_TEXTURE_WIDTH,
    buildGlyphRampTexture,
    glyphAtlasPageUrl,
    glyphAtlasMipLevels,
    glyphAtlasPagesForRamp,
    glyphRampCodePoints,
    glyphResourceInputKey,
    loadGlyphAtlasPage
};
