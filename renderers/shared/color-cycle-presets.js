import { CYCLING_PALETTE_DEFINITIONS } from './cycling-palettes.js';

export const COLOR_CYCLE_PRESETS = Object.freeze(CYCLING_PALETTE_DEFINITIONS.flatMap((palette, family) =>
    [false, true].map((glyph) => Object.freeze({
        id: `cycle-${palette.id}-${glyph ? 'glyph' : 'pixel'}`,
        name: `${palette.label} ${glyph ? 'Glyphs' : 'Pixels'}`,
        readonly: true,
        transitionSeconds: 1.5,
        params: Object.freeze({
            cols: glyph ? 200 : 240, autoRows: true,
            cellWidth: glyph ? 8 : 3, cellHeight: glyph ? 12 : 3,
            aspectCorrection: 1, saturationBoost: 1.05, contrastBoost: 1.12,
            brightness: 1, gamma: 1.1, bgBlend: 0, quantizeBits: 0,
            paletteId: palette.id, paletteMapping: 'nearest',
            paletteCycleMode: 'blend', paletteCycleSpeed: 1, paletteCycleAmount: 0.65,
            ditherMode: family === 2 ? 'bayer8' : 'bayer4',
            ditherStrength: 0.45, ditherScale: 1, ditherBias: 0, ditherInvert: false,
            jitterAmount: 0, jitterSpeed: 0, sampleX: 0.5, sampleY: 0.5, smoothing: false,
            solidMode: !glyph, glyphMode: glyph, pixel: !glyph,
            charset: family === 0 ? 'braille' : 'point-click',
            glyphColorMode: 'palette', backgroundColor: '#080c14',
            glyphDepth: 96, glyphOffset: 0, glyphReverse: false, mode: 3
        })
    }))));
