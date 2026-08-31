import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  charsetChars,
  glyphForLuma,
  processCanvasColorLegacy,
  processGpuCellColor,
  processStreamColorLegacy,
  shaderHash
} from '../renderers/shared/render-math.js';
import {
  ASCII_TODAY_CHARACTER_SETS,
  CHARACTER_SET_IDS,
  CHARACTER_SET_OPTIONS,
  GLYPH_COVERAGE_RANGES,
  MAX_GLYPH_RAMP_SCALARS,
  UNICODE_CHARACTER_SETS,
  activeGlyphRamp,
  isSupportedGlyphCodePoint,
  sanitizeGlyphRamp
} from '../renderers/shared/character-sets.js';
import {
  DITHER_MATRICES,
  PALETTES,
  PALETTE_LUT_SIZE,
  buildPaletteLut,
  mapColorToPalette,
  orderedDitherThreshold,
  processPaletteDither
} from '../renderers/shared/palettes.js';
import {
  ADVANCED_MAX_COLUMNS,
  NORMAL_ACCELERATED_MAX_CELLS,
  NORMAL_ACCELERATED_MAX_COLUMNS,
  NORMAL_SOFTWARE_MAX_COLUMNS,
  resolveGridDimensions
} from '../renderers/shared/density-policy.js';
import {
  GLYPH_ATLAS_MIP_LEVEL_COUNT,
  GLYPH_ATLAS_PAGE_GLYPHS,
  GLYPH_ATLAS_PAGE_SIZE,
  GLYPH_RAMP_TEXTURE_COLUMNS,
  GLYPH_RAMP_TEXTURE_HEIGHT,
  GLYPH_RAMP_TEXTURE_ROW_HEIGHT,
  GLYPH_RAMP_TEXTURE_WIDTH,
  buildGlyphRampTexture,
  glyphAtlasMipLevels,
  glyphAtlasPagesForRamp,
  glyphRampCodePoints
} from '../renderers/shared/glyph-atlas.js';
import {
  selectRendererBackend
} from '../renderers/gpu/ascii/renderer/backend-policy.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const vectors = JSON.parse(await readFile(path.join(root, 'renderers/shared/render-math-vectors.json'), 'utf8'));

for (const vector of vectors.gpu) {
  const actual = processGpuCellColor(...vector.rgb, vector.params);
  assert.deepEqual(actual, vector.expected, `GPU vector failed: ${vector.name}`);
}

for (const vector of vectors.canvasLegacy) {
  const actual = processCanvasColorLegacy(...vector.rgb, vector.params);
  assert.deepEqual(actual, vector.expected, `Canvas legacy vector failed: ${vector.name}`);
  assert.deepEqual(
    processStreamColorLegacy(...vector.rgb, vector.params),
    vector.expected,
    `Stream legacy vector failed: ${vector.name}`
  );
}

assert.equal(charsetChars({ charset: 'blocks' }), ' ░▒▓█');
assert.equal(charsetChars({ charset: 'asciline' }), ' .:-=+*#%@');
assert.equal(glyphForLuma(255, { charset: 'asciline' }), '@');
assert.equal(ASCII_TODAY_CHARACTER_SETS.length, 23);
assert.equal(CHARACTER_SET_IDS.length, CHARACTER_SET_OPTIONS.length);
assert.equal(new Set(CHARACTER_SET_IDS).size, CHARACTER_SET_IDS.length);
assert.equal(
  charsetChars({ charset: 'ascii-today-broadway-kb' }),
  " ',><~+-)(|\\/*@"
);
assert.equal(glyphForLuma(255, { charset: 'ascii-today-broadway-kb' }), '@');
for (const characterSet of ASCII_TODAY_CHARACTER_SETS) {
  assert.ok(characterSet.id.startsWith('ascii-today-'));
  assert.ok(characterSet.label.length > 0);
  assert.ok(characterSet.author.length > 0);
  assert.equal(characterSet.source, 'ascii.today');
  assert.equal(characterSet.chars[0], ' ');
  assert.ok(characterSet.chars.length >= 8 && characterSet.chars.length <= 15);
  assert.equal(new Set(characterSet.chars).size, characterSet.chars.length);
  assert.match(characterSet.chars, /^[\x20-\x7e]+$/);
  assert.equal(charsetChars({ charset: characterSet.id }), characterSet.chars);
}
assert.ok(shaderHash(1, 2) >= 0 && shaderHash(1, 2) < 1);

assert.equal(PALETTES.length, 16);
assert.equal(new Set(PALETTES.map(({ id }) => id)).size, PALETTES.length);
for (const palette of PALETTES) {
  assert.ok(palette.colors.length >= 3 && palette.colors.length <= 16);
  assert.equal(palette.luminanceOrder.length, palette.colors.length);
  for (const color of palette.colors) {
    assert.equal(color.length, 3);
    assert.ok(color.every((channel) => Number.isInteger(channel) && channel >= 0 && channel <= 255));
  }
}
const emberLut = buildPaletteLut('ember-gold');
assert.equal(emberLut.length, PALETTE_LUT_SIZE);
assert.deepEqual(mapColorToPalette([0, 0, 0], 'ember-gold', 'nearest', emberLut), [20, 16, 14]);
assert.deepEqual(mapColorToPalette([255, 220, 100], 'ember-gold', 'nearest', emberLut), [244, 200, 96]);
assert.deepEqual(processPaletteDither([0, 0, 0], 0, 0, { paletteId: 'none', ditherMode: 'none' }), [0, 0, 0]);
assert.equal(DITHER_MATRICES.bayer2.values.length, 4);
assert.equal(DITHER_MATRICES.bayer4.values.length, 16);
assert.equal(DITHER_MATRICES.bayer8.values.length, 64);
assert.equal(orderedDitherThreshold('bayer2', 0, 0), -0.375);
assert.equal(orderedDitherThreshold('bayer2', 1, 0), 0.125);
assert.equal(orderedDitherThreshold('bayer2', 0, 1), 0.375);
assert.equal(orderedDitherThreshold('bayer2', 1, 1), -0.125);
assert.equal(orderedDitherThreshold('bayer2', 0, 0, 1, true), 0.375);

assert.ok(UNICODE_CHARACTER_SETS.length >= 15);
assert.ok(UNICODE_CHARACTER_SETS.every(({ chars }) => [...chars].length <= MAX_GLYPH_RAMP_SCALARS));
assert.ok(GLYPH_COVERAGE_RANGES.some(({ id, start, end }) => id === 'cjk-basic' && start === 0x4e00 && end === 0x9fff));
assert.ok(isSupportedGlyphCodePoint('中'.codePointAt(0)));
assert.ok(isSupportedGlyphCodePoint('한'.codePointAt(0)));
assert.ok(isSupportedGlyphCodePoint('あ'.codePointAt(0)));
assert.equal(isSupportedGlyphCodePoint('🙂'.codePointAt(0)), false);
assert.equal(sanitizeGlyphRamp(' A中한🙂\n'), ' A中한');
assert.equal(sanitizeGlyphRamp('中'.repeat(120)).length, MAX_GLYPH_RAMP_SCALARS);
assert.equal(activeGlyphRamp({ charset: 'custom', customGlyphRamp: ' .:-=+*#%@', glyphDepth: 4, glyphOffset: 2 }), ':-=+');
assert.equal(activeGlyphRamp({ charset: 'custom', customGlyphRamp: ' .:-=+*#%@', glyphDepth: 4, glyphOffset: 2, glyphReverse: true }), '+=-:');
assert.deepEqual(glyphAtlasPagesForRamp(Uint32Array.from([0x20, 0x4e00, 0xac00])), [0, 4, 10]);
assert.equal(GLYPH_ATLAS_PAGE_GLYPHS, 4096);
const glyphPage = new Uint8Array(GLYPH_ATLAS_PAGE_SIZE ** 2);
glyphPage[2 * GLYPH_ATLAS_PAGE_SIZE + 3] = 255;
const glyphMips = glyphAtlasMipLevels(glyphPage);
assert.equal(glyphMips.length, GLYPH_ATLAS_MIP_LEVEL_COUNT);
assert.equal(glyphMips[1].length, (GLYPH_ATLAS_PAGE_SIZE / 2) ** 2);
assert.equal(glyphMips[1][1 * (GLYPH_ATLAS_PAGE_SIZE / 2) + 1], 255);
assert.equal(glyphMips[2][0], 255);
const glyphRampTexture = buildGlyphRampTexture(Uint32Array.from([0]), new Map([[0, glyphPage]]));
const glyphRampTextureRed = (x, y) => glyphRampTexture[(y * GLYPH_RAMP_TEXTURE_WIDTH + x) * 4];
assert.equal(glyphRampTexture.byteLength, GLYPH_RAMP_TEXTURE_WIDTH * GLYPH_RAMP_TEXTURE_HEIGHT * 4);
assert.equal(glyphRampTextureRed(3, 2), 255);
assert.equal(glyphRampTextureRed(1, 16 + 1), 255);
assert.equal(glyphRampTextureRed(0, 24), 255);
const twoRowRampTexture = buildGlyphRampTexture(
  new Uint32Array(GLYPH_RAMP_TEXTURE_COLUMNS + 1),
  new Map([[0, glyphPage]])
);
assert.equal(
  twoRowRampTexture[((GLYPH_RAMP_TEXTURE_ROW_HEIGHT + 2) * GLYPH_RAMP_TEXTURE_WIDTH + 3) * 4],
  255
);
assert.deepEqual(
  Array.from(glyphRampCodePoints({ charset: 'custom', customGlyphRamp: ' Aあ한' })),
  [0x20, 0x41, 0x3042, 0xd55c]
);

const acceleratedCapabilities = { webgpu: true, webgl2: true, cpu: true };
assert.equal(selectRendererBackend(acceleratedCapabilities, { glyphMode: true }), 'webgpu');
assert.equal(selectRendererBackend(acceleratedCapabilities, {
  preferredBackend: 'webgpu', glyphMode: true
}), 'webgpu');
assert.equal(selectRendererBackend(acceleratedCapabilities, {
  preferredBackend: 'webgpu', glyphMode: false, solidMode: true
}), 'webgpu');
assert.equal(selectRendererBackend({ webgpu: false, webgl2: true }, { glyphMode: true }), 'webgl2');

const acceleratedGrid = resolveGridDimensions({
  backend: 'webgpu', cols: 640, autoRows: true, cellWidth: 2, cellHeight: 3, aspectCorrection: 1
}, 1920, 1080);
assert.equal(acceleratedGrid.columns, NORMAL_ACCELERATED_MAX_COLUMNS);
assert.equal(acceleratedGrid.rows, 240);
assert.equal(acceleratedGrid.cells, 153600);
assert.equal(acceleratedGrid.clamped, false);
const softwareGrid = resolveGridDimensions({
  backend: 'canvas2d', cols: 480, autoRows: true, cellWidth: 2, cellHeight: 3, aspectCorrection: 1
}, 1920, 1080);
assert.equal(softwareGrid.columns, NORMAL_SOFTWARE_MAX_COLUMNS);
assert.ok(softwareGrid.cells <= 6000);
assert.equal(softwareGrid.clamped, true);
const advancedGrid = resolveGridDimensions({
  backend: 'webgpu', advancedDensity: true, cols: 900, autoRows: true, cellWidth: 2, cellHeight: 3, aspectCorrection: 1
}, 1920, 1080);
assert.equal(advancedGrid.columns, ADVANCED_MAX_COLUMNS);
assert.equal(advancedGrid.clamped, false);
const pixelGrid = resolveGridDimensions({
  backend: 'webgpu', cols: 640, autoRows: true, cellWidth: 2, cellHeight: 3, aspectCorrection: 1, pixel: true
}, 1920, 1080, { pixelMode: true });
assert.ok(pixelGrid.cells <= NORMAL_ACCELERATED_MAX_CELLS);
assert.equal(pixelGrid.clamped, true);
const solidCellGrid = resolveGridDimensions({
  backend: 'webgpu', cols: 80, autoRows: true, cellWidth: 12, cellHeight: 16, aspectCorrection: 1, solidMode: true
}, 1920, 1080, { pixelMode: false });
assert.equal(solidCellGrid.rows, 34);
assert.ok(Math.abs((solidCellGrid.columns * 12) / (solidCellGrid.rows * 16) - 16 / 9) < 0.02);
const squarePixelGrid = resolveGridDimensions({
  backend: 'webgpu', cols: 80, autoRows: true, cellWidth: 12, cellHeight: 16, aspectCorrection: 1, pixel: true
}, 1920, 1080, { pixelMode: true });
assert.equal(squarePixelGrid.rows, 45);

console.log('Renderer math vector checks passed.');
