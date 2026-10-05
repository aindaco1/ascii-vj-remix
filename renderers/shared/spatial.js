import contract from './spatial-contract.json' with { type: 'json' };
import variations from './fractal-variations.json' with { type: 'json' };
import { cycleNowMs, cycleTimeAt } from './palette-cycling.js';

export const FRACTAL_VARIATIONS = Object.freeze(variations);
export const SPATIAL_UNIFORM_FLOATS = 52;

export const SPATIAL_CONTRACT = Object.freeze(contract);
export const SPATIAL_DEFAULTS = Object.freeze(Object.fromEntries(Object.entries(contract).map(([k, v]) => [k, v.default])));
export const SPATIAL_KEYS = Object.keys(contract);
export const SPATIAL_GLOBAL_KEYS = SPATIAL_KEYS.filter(k => contract[k].global);
export const ACCENT_KEYS = SPATIAL_KEYS.filter(k => contract[k].group === 'Fractal Accents' && !contract[k].global);
export const accentParams = p => Object.fromEntries(ACCENT_KEYS.map(k => [k, p[k] ?? contract[k].default]));
export const spatialPresetParams = p => Object.fromEntries(Object.entries(spatialParams(p)).filter(([k]) => !contract[k]?.global));
export const SPATIAL_TWEEN_KEYS = SPATIAL_KEYS.filter(k => typeof contract[k].default === 'number' && k !== 'sceneSeed' && !contract[k].discrete);
export const SPATIAL_CONTROLS = SPATIAL_KEYS.map(key => {
    const c = contract[key];
    return { key, ...c, type: c.options ? 'select' : typeof c.default === 'boolean' ? 'checkbox' : 'range' };
});
export function spatialParams(params = {}, transport = params.sceneTransport) {
    const result = {};
    for (const [key, rule] of Object.entries(contract)) {
        const value = params[key];
        if (rule.options) result[key] = rule.options.some(([id]) => id === value) ? value : rule.default;
        else if (typeof rule.default === 'boolean') result[key] = typeof value === 'boolean' ? value : rule.default;
        else {
            const n = typeof value === 'number' && Number.isFinite(value) ? value : rule.default;
            result[key] = Math.max(rule.min, Math.min(rule.max, rule.step === 1 ? Math.round(n) : n));
        }
    }
    if (transport) result.sceneTransport = transport;
    return result;
}
export const spatialEnabled = p => p.visualMode && p.visualMode !== 'flat';
export const accentsEnabled = p => p.accentStyle !== 'off' && p.accentAmount > 0 && p.accentCoverage > 0;
export const effectsEnabled = p => spatialEnabled(p) || p.edgeAmount > 0 || p.feedbackAmount > 0 || accentsEnabled(p);
export const specialGlyphsEnabled = p => (spatialEnabled(p) && p.sceneMaterialGlyphs !== false) || p.edgeAmount > 0;
// Appended after a maximum of 88 ordinary glyphs. Alpha remains a glyph address,
// never depth; geometry depth stays local to the scene shader.
export const SPATIAL_GLYPHS = '-|/\\~+#.';
export function spatialGlyphRamp(base, params) {
    return specialGlyphsEnabled(params) ? [...base].slice(0, 88).join('') + SPATIAL_GLYPHS : base;
}
export function spatialHistoryKey(p, cols, rows) {
    return [cols, rows, p.visualMode, p.sceneSeed, p.sceneRoute, p.sceneOffset, p.mediaUrl,
        p.sourceMode, p.paletteId, p.charset, p.customGlyphRamp, p.glyphDepth, p.glyphOffset,
        p.glyphReverse, p.brightOutput, p.sceneMaterialGlyphs, p.edgeAmount > 0, p.feedbackAmount > 0, p.accentStyle, p.accentPlacement, p.accentVariation, accentsEnabled(p), p.accentSubtleLimit].join(':');
}
export function fillSpatialUniforms(out, p, cols, rows, baseLength, state, now = cycleNowMs()) {
    const dt = p.sceneFreeze ? 0 : Math.min(0.25, Math.max(0, (now - (state.lastMs ?? now)) / 1000));
    const key = spatialHistoryKey(p, cols, rows);
    const valid = state.key === key && state.lastMs !== undefined && now - state.lastMs < 1000;
    state.key = key;
    state.lastMs = now;
    const special = specialGlyphsEnabled(p);
    const base = special ? Math.min(88, baseLength) : baseLength;
    const total = base + (special ? 8 : 0);
    const t = cycleTimeAt(p.sceneTransport, now) + p.sceneOffset;
    const accent = p;
    const lace = accentsEnabled(p) && p.accentPlacement === 'trails' && p.feedbackAmount <= 0;
    const feedback = lace ? contract.accentPlacement.trailAmount : p.feedbackAmount;
    const halfLife = lace ? contract.accentPlacement.trailHalfLife : p.feedbackHalfLife;
    const variation = variations[accent.accentVariation];
    out.fill(0);
    out.set([
        contract.visualMode.options.findIndex(([v]) => v === p.visualMode),
        contract.sceneRoute.options.findIndex(([v]) => v === p.sceneRoute), t, p.sceneSeed,
        p.sceneFov * Math.PI / 180, p.sceneHeight, p.sceneMedia,
        contract.sceneMediaFit.options.findIndex(([v]) => v === p.sceneMediaFit),
        p.sceneFog, p.sceneLight, p.sceneGlow, p.sceneWet,
        p.sceneRain, p.sceneMaterialGlyphs ? 1 : 0, p.edgeAmount, cols,
        rows, cols * (p.cellWidth || 8) / (rows * (p.cellHeight || 12)),
        valid && feedback > 0 ? Math.pow(0.5, dt / halfLife) * Math.pow(feedback, dt * 60) : 0,
        p.feedbackZoom * dt,
        p.feedbackRotate * dt, valid ? 1 : 0, base, total,
        ...Array.from({length:8}, (_, i) => (base + i + 0.5) / Math.max(1, total)),
        p.sceneRelief, 0, dt, special ? 1 : 0,
        p.scenePitch * Math.PI / 180, p.fractalZoom, p.fractalDetail, p.fractalMorph,
        contract.accentStyle.options.findIndex(([v]) => v === accent.accentStyle), accent.accentAmount, accent.accentCoverage,
        contract.accentPlacement.options.findIndex(([v]) => v === accent.accentPlacement),
        accent.accentScale, accent.accentMotion, accent.accentSubtleLimit ? 1 : 0, accent.accentVariation,
        variation.real, variation.imag, variation.scale, 0
    ]);
    return out;
}
