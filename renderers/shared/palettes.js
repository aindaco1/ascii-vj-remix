const PALETTE_LUT_EDGE = 32;
const PALETTE_LUT_SIZE = PALETTE_LUT_EDGE ** 3;
const MAX_PALETTE_COLORS = 16;

const RAW_PALETTES = [
    ['signal-court', 'Signal Court', [[28, 24, 20], [46, 38, 28], [72, 58, 40], [60, 96, 72], [150, 44, 38], [190, 70, 48], [40, 52, 110], [60, 84, 170], [176, 140, 60], [206, 170, 72], [220, 202, 160], [240, 232, 210]]],
    ['ember-gold', 'Ember Gold', [[20, 16, 14], [196, 108, 32], [244, 200, 96]]],
    ['prism-armor', 'Prism Armor', [[20, 22, 28], [40, 44, 54], [64, 70, 84], [96, 104, 120], [44, 66, 140], [78, 108, 190], [120, 150, 210], [120, 28, 44], [176, 48, 56], [60, 90, 52], [104, 134, 68], [196, 150, 46], [224, 184, 80], [206, 210, 210], [228, 228, 222], [242, 240, 232]]],
    ['verdigris-clay', 'Verdigris Clay', [[40, 24, 16], [150, 80, 40], [196, 116, 64], [150, 180, 150]]],
    ['forest-kiln', 'Forest Kiln', [[16, 22, 16], [30, 46, 30], [52, 80, 44], [96, 116, 56], [150, 52, 32], [200, 84, 30], [228, 150, 48], [244, 214, 140]]],
    ['blush-lichen', 'Blush Lichen', [[26, 18, 22], [96, 40, 52], [176, 90, 108], [214, 150, 160], [120, 140, 90], [232, 216, 210]]],
    ['solar-standard', 'Solar Standard', [[24, 18, 10], [60, 44, 18], [150, 110, 40], [206, 160, 56], [232, 196, 90], [150, 32, 40], [40, 86, 64], [236, 222, 170]]],
    ['primary-rite', 'Primary Rite', [[22, 20, 18], [40, 52, 120], [60, 90, 180], [150, 36, 36], [196, 70, 56], [40, 96, 68], [176, 80, 110], [196, 150, 46], [224, 184, 84], [206, 196, 170], [228, 220, 200], [242, 236, 222]]],
    ['jewel-circuit', 'Jewel Circuit', [[26, 18, 30], [70, 28, 52], [150, 36, 52], [46, 110, 72], [96, 150, 90], [122, 72, 160], [214, 168, 52], [236, 222, 168]]],
    ['spectrum-vault', 'Spectrum Vault', [[20, 14, 28], [40, 22, 60], [72, 36, 110], [110, 52, 150], [120, 28, 42], [176, 44, 54], [30, 40, 90], [70, 100, 170], [150, 118, 52], [206, 168, 60], [232, 196, 96], [40, 86, 60], [176, 178, 184], [214, 214, 216], [236, 234, 228], [248, 246, 240]]],
    ['soft-voltage', 'Soft Voltage', [[28, 26, 40], [52, 44, 72], [72, 88, 150], [104, 124, 190], [150, 76, 108], [196, 104, 140], [220, 150, 170], [120, 150, 80], [168, 190, 110], [228, 200, 90], [238, 222, 140], [240, 232, 200]]],
    ['midnight-scan', 'Midnight Scan', [[0, 0, 1], [3, 1, 9], [10, 3, 27], [20, 9, 46], [0, 20, 62], [2, 34, 85], [35, 47, 101], [11, 109, 154], [46, 116, 175], [113, 130, 144], [142, 171, 199]]],
    ['moss-ultraviolet', 'Moss Ultraviolet', [[12, 18, 14], [28, 40, 28], [44, 30, 56], [60, 40, 80], [96, 140, 60], [120, 80, 140], [150, 180, 70], [150, 150, 140], [196, 200, 170], [214, 214, 196], [226, 224, 208], [236, 234, 220]]],
    ['cyan-fog', 'Cyan Fog', [[16, 36, 36], [24, 72, 72], [40, 130, 128], [21, 184, 166], [80, 210, 190], [150, 228, 214], [140, 150, 150], [206, 238, 230]]],
    ['dark-parade', 'Dark Parade', [[18, 16, 34], [40, 28, 86], [36, 60, 150], [120, 28, 44], [30, 96, 72], [196, 150, 46], [120, 60, 150], [232, 222, 206]]],
    ['sea-glass-array', 'Sea Glass Array', [[16, 24, 22], [28, 40, 34], [40, 56, 46], [56, 76, 60], [76, 100, 76], [100, 128, 96], [64, 96, 98], [88, 124, 128], [120, 148, 150], [150, 140, 100], [176, 196, 160], [120, 150, 160], [196, 212, 206], [214, 224, 216], [228, 234, 224], [238, 242, 234]]]
];

function luma(color) {
    return color[0] * 0.2126 + color[1] * 0.7152 + color[2] * 0.0722;
}

const PALETTES = Object.freeze(RAW_PALETTES.map(([id, label, colors]) => {
    const frozenColors = Object.freeze(colors.map((color) => Object.freeze([...color])));
    const luminanceOrder = Object.freeze(
        frozenColors.map((color, index) => ({ color, index }))
            .sort((a, b) => luma(a.color) - luma(b.color) || a.index - b.index)
            .map(({ index }) => index)
    );
    return Object.freeze({ id, label, colors: frozenColors, luminanceOrder });
}));

const PALETTE_BY_ID = new Map(PALETTES.map((palette) => [palette.id, palette]));
const PALETTE_OPTIONS = Object.freeze([
    Object.freeze(['none', 'Source colors']),
    ...PALETTES.map(({ id, label }) => Object.freeze([id, label]))
]);
const PALETTE_IDS = Object.freeze(PALETTE_OPTIONS.map(([id]) => id));

const BAYER_2 = Object.freeze([0, 2, 3, 1]);
const BAYER_4 = Object.freeze([
    0, 8, 2, 10,
    12, 4, 14, 6,
    3, 11, 1, 9,
    15, 7, 13, 5
]);
const BAYER_8 = Object.freeze([
    0, 32, 8, 40, 2, 34, 10, 42,
    48, 16, 56, 24, 50, 18, 58, 26,
    12, 44, 4, 36, 14, 46, 6, 38,
    60, 28, 52, 20, 62, 30, 54, 22,
    3, 35, 11, 43, 1, 33, 9, 41,
    51, 19, 59, 27, 49, 17, 57, 25,
    15, 47, 7, 39, 13, 45, 5, 37,
    63, 31, 55, 23, 61, 29, 53, 21
]);

const DITHER_MATRICES = Object.freeze({
    bayer2: Object.freeze({ size: 2, values: BAYER_2 }),
    bayer4: Object.freeze({ size: 4, values: BAYER_4 }),
    bayer8: Object.freeze({ size: 8, values: BAYER_8 })
});
const DITHER_MODE_OPTIONS = Object.freeze([
    Object.freeze(['none', 'Off']),
    Object.freeze(['bayer2', 'Bayer 2x2']),
    Object.freeze(['bayer4', 'Bayer 4x4']),
    Object.freeze(['bayer8', 'Bayer 8x8'])
]);
const DITHER_MODE_IDS = Object.freeze(DITHER_MODE_OPTIONS.map(([id]) => id));

function clampByte(value) {
    return Math.max(0, Math.min(255, Math.round(value)));
}

function paletteById(id) {
    return PALETTE_BY_ID.get(String(id || '')) || null;
}

function orderedDitherThreshold(mode, x, y, scale = 1, invert = false) {
    const matrix = DITHER_MATRICES[mode];
    if (!matrix) return 0;
    const safeScale = Math.max(1, Math.round(Number(scale) || 1));
    const mx = Math.abs(Math.floor(Number(x) / safeScale)) % matrix.size;
    const my = Math.abs(Math.floor(Number(y) / safeScale)) % matrix.size;
    const normalized = (matrix.values[my * matrix.size + mx] + 0.5) / (matrix.size * matrix.size) - 0.5;
    return invert ? -normalized : normalized;
}

function ditheredColor(color, x, y, params = {}) {
    const threshold = orderedDitherThreshold(
        params.ditherMode,
        x,
        y,
        params.ditherScale,
        params.ditherInvert
    );
    const strength = Math.max(0, Math.min(1, Number(params.ditherStrength) || 0));
    const bias = Math.max(-1, Math.min(1, Number(params.ditherBias) || 0));
    const delta = threshold * strength * 64 + bias * 32;
    return color.map((channel) => clampByte(channel + delta));
}

function nearestPaletteIndex(color, palette) {
    let bestIndex = 0;
    let bestDistance = Infinity;
    for (let index = 0; index < palette.colors.length; index++) {
        const candidate = palette.colors[index];
        const dr = color[0] - candidate[0];
        const dg = color[1] - candidate[1];
        const db = color[2] - candidate[2];
        const distance = dr * dr + dg * dg + db * db;
        if (distance < bestDistance) {
            bestDistance = distance;
            bestIndex = index;
        }
    }
    return bestIndex;
}

function luminancePaletteIndex(color, palette) {
    const orderIndex = Math.min(
        palette.luminanceOrder.length - 1,
        Math.floor(luma(color) / 256 * palette.luminanceOrder.length)
    );
    return palette.luminanceOrder[Math.max(0, orderIndex)];
}

function mappedPaletteIndex(color, palette, mapping = 'nearest') {
    return mapping === 'luminance'
        ? luminancePaletteIndex(color, palette)
        : nearestPaletteIndex(color, palette);
}

function buildPaletteLut(paletteId, mapping = 'nearest') {
    const palette = paletteById(paletteId);
    if (!palette) return null;
    const lut = new Uint8Array(PALETTE_LUT_SIZE);
    for (let r = 0; r < PALETTE_LUT_EDGE; r++) {
        for (let g = 0; g < PALETTE_LUT_EDGE; g++) {
            for (let b = 0; b < PALETTE_LUT_EDGE; b++) {
                const index = (r << 10) | (g << 5) | b;
                lut[index] = mappedPaletteIndex([r * 8 + 4, g * 8 + 4, b * 8 + 4], palette, mapping);
            }
        }
    }
    return lut;
}

function paletteLutIndex(color) {
    return ((clampByte(color[0]) >> 3) << 10) |
        ((clampByte(color[1]) >> 3) << 5) |
        (clampByte(color[2]) >> 3);
}

function mapColorToPalette(color, paletteId, mapping = 'nearest', lut = null) {
    const palette = paletteById(paletteId);
    if (!palette) return color.map(clampByte);
    const index = lut?.length === PALETTE_LUT_SIZE
        ? lut[paletteLutIndex(color)]
        : mappedPaletteIndex(color, palette, mapping);
    return [...palette.colors[Math.min(index, palette.colors.length - 1)]];
}

function processPaletteDither(color, x, y, params = {}, lut = null) {
    const adjusted = params.ditherMode === 'none'
        ? color.map(clampByte)
        : ditheredColor(color, x, y, params);
    return mapColorToPalette(adjusted, params.paletteId, params.paletteMapping, lut);
}

export {
    DITHER_MATRICES,
    DITHER_MODE_IDS,
    DITHER_MODE_OPTIONS,
    MAX_PALETTE_COLORS,
    PALETTES,
    PALETTE_BY_ID,
    PALETTE_IDS,
    PALETTE_LUT_EDGE,
    PALETTE_LUT_SIZE,
    PALETTE_OPTIONS,
    buildPaletteLut,
    ditheredColor,
    mapColorToPalette,
    orderedDitherThreshold,
    paletteById,
    paletteLutIndex,
    processPaletteDither
};
