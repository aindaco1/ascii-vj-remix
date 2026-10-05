import { spatialPresetParams, accentParams, FRACTAL_VARIATIONS } from './spatial.js';

const base = {
    ...spatialPresetParams({}), backend: 'auto', visualMode: 'flat',
    cols: 240, rows: 0, autoRows: true, cellWidth: 8, cellHeight: 12,
    aspectCorrection: 1, glyphMode: true, solidMode: false, pixel: false,
    charset: 'classic-camera', glyphDepth: 96, glyphOffset: 0, glyphReverse: false,
    glyphColorMode: 'source', paletteId: 'none', paletteCycleMode: 'off',
    ditherMode: 'none', jitterAmount: 0, bgBlend: 0, quantizeBits: 0,
    saturationBoost: 1, contrastBoost: 1, brightness: 1.1, gamma: 1.3,
    backgroundColor: '#030405', sceneSpeed: .9, sceneMaterialGlyphs: false,
};

export const FRACTAL_ACCENT_PRESETS = Object.freeze([
    ['threadlight', 'Threadlight', {accentStyle:'threads', accentAmount:.32, accentCoverage:.8, accentPlacement:'edges', charset:'braille'}],
    ['silver-etching', 'Silver Etching', {accentStyle:'etch', accentAmount:.28, accentCoverage:.9, accentPlacement:'midtones', accentVariation:5, saturationBoost:0, accentMotion:.08}],
    ['contour-silk', 'Contour Silk', {accentStyle:'silk', accentAmount:.34, accentCoverage:.9, accentPlacement:'quiet', accentVariation:1, glyphMode:false, solidMode:true}],
    ['julia-glass', 'Julia Glass', {accentStyle:'glass', accentAmount:.36, accentCoverage:.9, accentPlacement:'quiet', accentVariation:2, accentMotion:.12, glyphMode:false, solidMode:true}],
    ['chromatic-undertow', 'Chromatic Undertow', {accentStyle:'chroma', accentAmount:.4, accentCoverage:.95, accentPlacement:'midtones', accentVariation:3, glyphMode:false, solidMode:true}],
    ['phosphor-lace', 'Phosphor Lace', {accentAmount:.32, accentCoverage:.85, accentPlacement:'trails', accentVariation:4, feedbackAmount:.985, feedbackHalfLife:.4, charset:'braille'}],
].map(([id, name, params]) => Object.freeze({
    id, name, readonly:true, transitionSeconds:1.5, params:Object.freeze({...base, ...params}),
})));

// Ordinary built-ins change the base look. Accent recipes and saved custom
// looks own their accent settings; the global limit is never preset-owned.
export function retainedPresetAccents(preset, current) {
    return preset?.readonly && !FRACTAL_ACCENT_PRESETS.some(p => p.id === preset.id)
        ? accentParams(current) : {};
}

export function randomWtfAccentParams(random = Math.random) {
    // Draw once per target so safety retries do not favor enabling the effect.
    if (random() < .35) return {...accentParams({}), accentStyle:'off', accentAmount:0};
    const recipe = FRACTAL_ACCENT_PRESETS[Math.floor(random() * FRACTAL_ACCENT_PRESETS.length)];
    const range = (lo, hi) => Math.round((lo + (hi - lo) * random()) * 100) / 100;
    return {...accentParams(recipe.params), accentAmount:range(.24,.48),
        accentCoverage:range(.65,1), accentScale:range(.75,1.6),
        accentMotion:range(.12,.4), accentAudio:range(.2,.65),
        accentVariation:Math.floor(random() * FRACTAL_VARIATIONS.length)};
}
