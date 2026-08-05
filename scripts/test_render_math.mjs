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
  CHARACTER_SET_OPTIONS
} from '../renderers/shared/character-sets.js';

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

console.log('Renderer math vector checks passed.');
