import { SPATIAL_DEFAULTS } from './spatial.js';

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
    ['brightness-relief', 'Brightness Relief · Experimental', { visualMode: 'relief',
        sceneMedia: 1, sceneHeight: 3, scenePitch: -48, sceneFov: 65, sceneRelief: 4,
        sceneSpeed: 0.18, sceneFog: 0.01, sceneMaterialGlyphs: false, solidMode: true,
        glyphMode: false, cellWidth: 5, cellHeight: 5, cols: 170 }],
    ['orbital-chamber', 'Orbital Chamber · Experimental', { visualMode: 'orbitals',
        sceneRoute: 'orbit', sceneHeight: 0.9, scenePitch: -10, sceneFov: 55,
        sceneMedia: 0.9, sceneSpeed: 0.6, sceneMaterialGlyphs: false, charset: 'ascii-today-broadway-kb', cols: 180 }],
    ['edge-etching', 'Edge Etching', { edgeAmount: 0.7, charset: 'classic-camera', saturationBoost: 0 }],
    ['phosphor-echo', 'Phosphor Echo', { feedbackAmount: 0.98, feedbackHalfLife: 0.7, feedbackZoom: 0.08, feedbackRotate: 0.06 }]
].map(([id, name, params]) => Object.freeze({id, name, readonly: true, transitionSeconds: 1.5, params: Object.freeze({...base, ...params})})));
