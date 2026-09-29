import { SPATIAL_CONTRACT, SPATIAL_DEFAULTS, spatialParams } from './spatial.js';

const base = { ...SPATIAL_DEFAULTS, backend: 'auto', cols: 200, rows: 0, autoRows: true,
    cellWidth: 8, cellHeight: 12, aspectCorrection: 1, glyphMode: true, solidMode: false,
    pixel: false, charset: 'asciline', glyphDepth: 96, glyphOffset: 0, glyphReverse: false,
    saturationBoost: 1.1, contrastBoost: 1.05, brightness: 1.2, gamma: 1.55,
    jitterAmount: 0, bgBlend: 0, quantizeBits: 0, paletteId: 'none', ditherMode: 'none',
    paletteCycleMode: 'off', glyphColorMode: 'source', backgroundColor: '#030405' };
export const SPATIAL_PRESETS = Object.freeze([
    ['neon-night-drive', 'Neon Night Drive', { visualMode: 'city', sceneRoute: 'weave',
        sceneHeight: 0.65, sceneFov: 82, sceneSpeed: 1.3, sceneWet: 0.7, sceneRain: 0.4, sceneSeed: 17 }],
    ['media-corridor', 'Media Corridor', { visualMode: 'corridor', sceneMedia: 0.95,
        sceneMediaFit: 'fit', sceneHeight: 1.6, sceneFov: 105, sceneSpeed: 0.85,
        sceneFog: 0.012, sceneWet: 0.1, charset: 'blocks', cols: 156 }],
    ['wet-coast', 'Wet Coast', { visualMode: 'coast', sceneRoute: 'weave',
        sceneHeight: 0.5, scenePitch: -8, sceneFov: 105, sceneWet: 0.9,
        sceneFog: 0.018, sceneSpeed: 0.22, sceneGlow: 0.25, charset: 'braille' }],
    ['neon-cathedral', 'Neon Cathedral', { visualMode: 'cathedral', sceneHeight: 0.8,
        scenePitch: 24, sceneFov: 100, sceneSpeed: 0.3, sceneGlow: 1.35,
        sceneFog: 0.015, sceneWet: 0.15, sceneMediaFit: 'fit', charset: 'classic-camera', cols: 240 }],
    ['orbital-chamber', 'Orbital Chamber', { visualMode: 'orbitals',
        sceneRoute: 'orbit', sceneHeight: 0.9, scenePitch: -10, sceneFov: 55,
        sceneMedia: 0.9, sceneSpeed: 0.6, sceneMaterialGlyphs: false, charset: 'ascii-today-broadway-kb', cols: 180 }],
    ['ashen-ruins', 'Ashen Ruins', { visualMode: 'ruins', sceneRoute: 'weave', sceneHeight: 1.7,
        scenePitch: 5, sceneFov: 85, sceneSpeed: 0.45, sceneFog: 0.07, sceneMedia: 0.85,
        sceneMaterialGlyphs: false, saturationBoost: 0, charset: 'classic-camera',
        brightness: 1.4, gamma: 1.5, fractalDetail: 4, cols: 240, glyphMode: false, solidMode: true }],
    ['fractal-dive', 'Fractal Dive', { visualMode: 'mandelbrot', sceneRoute: 'orbit',
        sceneFov: 75, sceneHeight: 1.25, sceneSpeed: 0.6, sceneMedia: 0.8,
        sceneMaterialGlyphs: false, fractalDetail: 6, fractalMorph: 0.3, fractalZoom: 2.2, sceneOffset: 14,
        charset: 'blocks', cols: 240, glyphMode: false, solidMode: true }],
    ['mandelbulb-bloom', 'Mandelbulb Bloom', { visualMode: 'mandelbulb', sceneRoute: 'orbit',
        sceneHeight: 1.25, sceneFov: 65, sceneSpeed: 0.4, sceneMedia: 0.85, sceneFog: 0.015,
        sceneMaterialGlyphs: false, fractalMorph: 0.65, brightness: 1.6, gamma: 2, charset: 'braille', cols: 180 }],
    ['mandelbox-passage', 'Mandelbox Passage', { visualMode: 'mandelbox', sceneRoute: 'drive',
        sceneHeight: 1.25, sceneFov: 95, sceneSpeed: 0.45, sceneMedia: 0.85, sceneFog: 0.025,
        sceneMaterialGlyphs: false, fractalMorph: 0.35, brightness: 1.5, gamma: 1.8,
        charset: 'ascii-today-broadway-kb', cols: 240, glyphMode: false, solidMode: true }],
    ['edge-etching', 'Edge Etching', { edgeAmount: 0.7, charset: 'classic-camera', saturationBoost: 0 }],
    ['phosphor-echo', 'Phosphor Echo', { feedbackAmount: 0.98, feedbackHalfLife: 0.7, feedbackZoom: 0.08, feedbackRotate: 0.06 }]
].map(([id, name, params]) => Object.freeze({
    id, name, readonly: true, transitionSeconds: 1.5,
    // Keep the scene recipe available for manual opt-in and WTF. Selecting the
    // built-in look always starts on the unprojected source.
    sceneMode: params.visualMode || 'flat',
    params: Object.freeze({...base, ...params, visualMode: 'flat'})
})));

const wtfSceneModes = SPATIAL_CONTRACT.visualMode.options.map(([id]) => id).filter(id => id !== 'flat');
export function randomWtfSpatialParams(random = Math.random) {
    if (random() < 0.5) return { visualMode: 'flat' };
    const visualMode = wtfSceneModes[Math.floor(random() * wtfSceneModes.length)];
    const preset = SPATIAL_PRESETS.find(p => p.sceneMode === visualMode);
    // Scene-specific camera defaults avoid inheriting an unsuitable view from
    // an earlier look. Prefer acceleration, retaining normal renderer fallback.
    return { ...spatialParams(preset?.params), visualMode, backend: 'auto', pixel: false };
}
