import { SPATIAL_DEFAULTS } from './spatial.js';

const base = { ...SPATIAL_DEFAULTS, backend: 'auto', cols: 200, rows: 0, autoRows: true,
    cellWidth: 8, cellHeight: 12, aspectCorrection: 1, glyphMode: true, solidMode: false,
    pixel: false, charset: 'asciline', glyphDepth: 96, glyphOffset: 0, glyphReverse: false,
    saturationBoost: 1.1, contrastBoost: 1.05, brightness: 1.2, gamma: 1.55,
    jitterAmount: 0, bgBlend: 0, quantizeBits: 0, paletteId: 'none', ditherMode: 'none',
    paletteCycleMode: 'off', glyphColorMode: 'source', backgroundColor: '#030405' };
export const SPATIAL_PRESETS = Object.freeze([
    ['neon-night-drive', 'Neon Night Drive', { visualMode: 'city', sceneWet: 0.55, sceneRain: 0.25 }],
    ['media-corridor', 'Media Corridor', { visualMode: 'corridor', sceneMedia: 0.95, sceneMediaFit: 'fit', sceneWet: 0.3 }],
    ['wet-coast', 'Wet Coast', { visualMode: 'coast', sceneWet: 0.85, sceneFog: 0.035, sceneSpeed: 0.4 }],
    ['neon-cathedral', 'Neon Cathedral', { visualMode: 'cathedral', sceneHeight: 1.6, sceneFov: 85, sceneGlow: 1.2 }],
    ['brightness-relief', 'Brightness Relief · Experimental', { visualMode: 'relief', sceneMedia: 0.9, sceneHeight: 2.5, sceneFov: 90 }],
    ['orbital-chamber', 'Orbital Chamber · Experimental', { visualMode: 'orbitals', sceneFov: 50, sceneMedia: 0.9, sceneSpeed: 0.35 }],
    ['edge-etching', 'Edge Etching', { edgeAmount: 0.7, charset: 'classic-camera', saturationBoost: 0 }],
    ['phosphor-echo', 'Phosphor Echo', { feedbackAmount: 0.98, feedbackHalfLife: 0.7, feedbackZoom: 0.08, feedbackRotate: 0.06 }]
].map(([id, name, params]) => Object.freeze({id, name, readonly: true, transitionSeconds: 1.5, params: Object.freeze({...base, ...params})})));
