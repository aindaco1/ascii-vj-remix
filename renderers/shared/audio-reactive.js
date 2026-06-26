const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const AUDIO_REACTIVE_DEFAULTS = {
    enabled: true,
    source: 'input',
    inputDeviceId: '',
    preset: 'pulse-reactor',
    sensitivity: 9,
    smoothing: 0.36,
    beatAmount: 2.05,
    bassAmount: 1.48,
    midAmount: 1.34,
    trebleAmount: 1.38,
    fluxAmount: 1.52,
    presenceAmount: 1.28,
    densityDampening: 0.14,
    noiseFloor: 0.005
};

export function audioReactiveSourceOptions({ tauri = false } = {}) {
    return [
        ['file', 'Audio file'],
        ['input', 'Mic / input'],
        ['display', tauri ? 'System audio' : 'Display audio']
    ];
}

export const AUDIO_REACTIVE_PRESETS = [
    {
        id: 'pulse-reactor',
        name: 'Pulse Reactor',
        routes: [
            ['brightness', 'beatPulse', 0.28],
            ['contrastBoost', 'beatPulse', 0.5],
            ['bgBlend', 'bass', 0.2],
            ['jitterAmount', 'flux', 0.36],
            ['jitterSpeed', 'treble', 1],
            ['saturationBoost', 'mid', 0.44],
            ['gamma', 'beatPulse', -0.15]
        ],
        sway: 0.07
    },
    {
        id: 'bass-tremor',
        name: 'Bass Tremor',
        routes: [
            ['bgBlend', 'bass', 0.32],
            ['brightness', 'bass', 0.18],
            ['contrastBoost', 'bass', 0.34],
            ['jitterAmount', 'bass', 0.38],
            ['jitterSpeed', 'beatPulse', 0.55],
            ['gamma', 'bass', -0.18]
        ],
        sway: 0.035
    },
    {
        id: 'snare-shatter',
        name: 'Snare Shatter',
        routes: [
            ['jitterAmount', 'flux', 0.58],
            ['jitterSpeed', 'flux', 1.3],
            ['contrastBoost', 'beatPulse', 0.26],
            ['brightness', 'treble', 0.12],
            ['saturationBoost', 'treble', 0.25]
        ],
        sway: 0.09
    },
    {
        id: 'spectral-bloom',
        name: 'Spectral Bloom',
        routes: [
            ['saturationBoost', 'treble', 0.72],
            ['brightness', 'mid', 0.18],
            ['contrastBoost', 'rms', 0.24],
            ['bgBlend', 'rms', -0.12],
            ['gamma', 'treble', -0.16]
        ],
        sway: 0.045
    },
    {
        id: 'chromatic-surge',
        name: 'Chromatic Surge',
        routes: [
            ['saturationBoost', 'beatPulse', 0.95],
            ['contrastBoost', 'bass', 0.3],
            ['brightness', 'beatPulse', 0.18],
            ['gamma', 'mid', -0.22],
            ['jitterAmount', 'treble', 0.22],
            ['jitterSpeed', 'beatPulse', 1.1]
        ],
        sway: 0.07
    },
    {
        id: 'dense-mix-control',
        name: 'Dense Mix Control',
        routes: [
            ['contrastBoost', 'rms', 0.18],
            ['brightness', 'bass', 0.12],
            ['saturationBoost', 'presence', 0.22],
            ['jitterAmount', 'flux', 0.16],
            ['jitterSpeed', 'beatPulse', 0.34],
            ['bgBlend', 'density', -0.08],
            ['gamma', 'density', 0.1]
        ],
        sway: 0.028,
        densityDampening: 0.7
    }
];

export const AUDIO_REACTIVE_CONTROLS = [
    { key: 'sensitivity', label: 'Sensitivity', min: 0, max: 12, step: 0.05 },
    { key: 'smoothing', label: 'Smoothing', min: 0, max: 0.98, step: 0.01 },
    { key: 'beatAmount', label: 'Beat', min: 0, max: 3, step: 0.01 },
    { key: 'bassAmount', label: 'Bass', min: 0, max: 3, step: 0.01 },
    { key: 'midAmount', label: 'Mid', min: 0, max: 3, step: 0.01 },
    { key: 'trebleAmount', label: 'Treble', min: 0, max: 3, step: 0.01 },
    { key: 'fluxAmount', label: 'Transient / Flux', min: 0, max: 3, step: 0.01 },
    { key: 'presenceAmount', label: 'Presence', min: 0, max: 3, step: 0.01 },
    { key: 'densityDampening', label: 'Density Dampening', min: 0, max: 1, step: 0.01 },
    { key: 'noiseFloor', label: 'Noise Floor', min: 0, max: 0.18, step: 0.001, precision: 3 }
];

export const AUDIO_REACTIVE_FEATURE_KEYS = [
    'rms',
    'bass',
    'lowMid',
    'mid',
    'highMid',
    'treble',
    'presence',
    'brightness',
    'flux',
    'density',
    'beatPulse'
];

export const AUDIO_REACTIVE_SAFE_LIMITS = {
    saturationBoost: [0, 3],
    contrastBoost: [0.45, 2.85],
    brightness: [0.55, 1.85],
    gamma: [0.55, 2.65],
    bgBlend: [0, 0.72],
    jitterAmount: [0, 1],
    jitterSpeed: [0, 4],
    sampleX: [0.04, 0.96],
    sampleY: [0.04, 0.96]
};

export const AUDIO_REACTIVE_PRESET_MAP = new Map(AUDIO_REACTIVE_PRESETS.map((preset) => [preset.id, preset]));

export function emptyAudioReactiveFeatures() {
    return {
        rms: 0,
        bass: 0,
        lowMid: 0,
        mid: 0,
        highMid: 0,
        treble: 0,
        presence: 0,
        brightness: 0,
        flux: 0,
        density: 0,
        beatPulse: 0,
        phase: 0
    };
}

export function audioReactivePrecision(config) {
    return Number.isInteger(config?.precision) ? config.precision : 2;
}

export function sanitizeAudioReactiveSettings(settings = {}) {
    const out = { ...AUDIO_REACTIVE_DEFAULTS, ...settings };
    for (const config of AUDIO_REACTIVE_CONTROLS) {
        const fallback = AUDIO_REACTIVE_DEFAULTS[config.key];
        const value = Number(out[config.key]);
        out[config.key] = Number.isFinite(value)
            ? clamp(value, config.min, config.max)
            : fallback;
    }
    return out;
}

function audioFeatureAmount(feature, settings) {
    if (feature === 'beatPulse') return settings.beatAmount;
    if (feature === 'bass') return settings.bassAmount;
    if (feature === 'flux') return settings.fluxAmount;
    if (feature === 'presence' || feature === 'brightness') return settings.presenceAmount;
    if (feature === 'treble') return settings.trebleAmount;
    if (feature === 'lowMid' || feature === 'mid' || feature === 'highMid' || feature === 'rms' || feature === 'density') return settings.midAmount;
    return 1;
}

function denseFeatureDamping(feature, features, settings, preset) {
    const density = clamp(Number(features.density || 0), 0, 1);
    const dampening = clamp(Number(settings.densityDampening ?? preset.densityDampening ?? 0), 0, 1);
    if (dampening <= 0 || density <= 0) return 1;
    if (feature === 'beatPulse' || feature === 'flux') return clamp(1 - density * dampening * 0.82, 0.16, 1);
    if (feature === 'treble' || feature === 'presence' || feature === 'brightness') return clamp(1 - density * dampening * 0.48, 0.32, 1);
    if (feature === 'rms' || feature === 'mid' || feature === 'highMid' || feature === 'density') return clamp(1 - density * dampening * 0.24, 0.52, 1);
    if (feature === 'bass') return clamp(1 - density * dampening * 0.12, 0.68, 1);
    return 1;
}

export function normalizeAudioReactiveFeatures(features = {}, settings = {}, preset = null) {
    const safeSettings = sanitizeAudioReactiveSettings(settings);
    const safePreset = preset || AUDIO_REACTIVE_PRESET_MAP.get(safeSettings.preset) || AUDIO_REACTIVE_PRESETS[0];
    const out = emptyAudioReactiveFeatures();
    for (const key of AUDIO_REACTIVE_FEATURE_KEYS) {
        out[key] = clamp(Number(features[key] || 0), 0, 1);
    }
    out.phase = Number.isFinite(Number(features.phase)) ? Number(features.phase) : 0;

    const floor = clamp(Number(safeSettings.noiseFloor || 0), 0, 0.18);
    if (floor > 0) {
        const gate = clamp((out.rms - floor) / Math.max(0.001, floor * 4), 0, 1);
        for (const key of AUDIO_REACTIVE_FEATURE_KEYS) out[key] *= gate;
    }

    for (const key of AUDIO_REACTIVE_FEATURE_KEYS) {
        out[key] *= denseFeatureDamping(key, out, safeSettings, safePreset);
        out[key] = clamp(out[key], 0, 1);
    }
    return out;
}

export function clampAudioReactiveVisualSafety(params, baseParams = {}) {
    for (const [key, [min, max]] of Object.entries(AUDIO_REACTIVE_SAFE_LIMITS)) {
        if (typeof params[key] !== 'number') continue;
        const base = Number(baseParams[key]);
        const safeMin = Number.isFinite(base) ? Math.min(min, base) : min;
        const safeMax = Number.isFinite(base) ? Math.max(max, base) : max;
        params[key] = clamp(params[key], safeMin, safeMax);
    }

    const baseBrightness = Number(baseParams.brightness);
    const brightnessFloor = Number.isFinite(baseBrightness)
        ? Math.min(1, Math.max(0.72, baseBrightness))
        : 0.72;
    if (params.bgBlend > 0.62 && params.brightness < brightnessFloor) {
        params.brightness = brightnessFloor;
    }
    if (params.gamma < 0.7 && params.brightness < Math.max(brightnessFloor, 0.82)) {
        params.brightness = Math.max(brightnessFloor, 0.82);
    }
    return params;
}

export function applyAudioReactiveModulation(baseParams, features, audioSettings, options = {}) {
    const settings = sanitizeAudioReactiveSettings(audioSettings);
    const preset = AUDIO_REACTIVE_PRESET_MAP.get(settings.preset) || AUDIO_REACTIVE_PRESETS[0];
    const normalizedFeatures = normalizeAudioReactiveFeatures(features, settings, preset);
    const clampParamValue = options.clampParamValue || ((_, value) => value);
    const out = { ...baseParams };
    const sensitivity = Number(settings.sensitivity || 0);

    for (const [key, feature, scale] of preset.routes) {
        const raw = Number(normalizedFeatures[feature] || 0);
        const amount = raw * sensitivity * audioFeatureAmount(feature, settings);
        out[key] = clampParamValue(key, Number(baseParams[key] || 0) + amount * scale);
    }

    const swayAmount = sensitivity * (preset.sway || 0);
    if (swayAmount > 0) {
        const motion = Math.max(
            normalizedFeatures.flux || 0,
            normalizedFeatures.beatPulse || 0,
            (normalizedFeatures.treble || 0) * 0.65,
            (normalizedFeatures.presence || 0) * 0.55
        );
        const phase = Number(normalizedFeatures.phase || 0);
        out.sampleX = clampParamValue('sampleX', Number(baseParams.sampleX || 0.5) + Math.sin(phase) * motion * swayAmount);
        out.sampleY = clampParamValue('sampleY', Number(baseParams.sampleY || 0.5) + Math.cos(phase * 0.73) * motion * swayAmount);
    }

    return clampAudioReactiveVisualSafety(out, baseParams);
}
