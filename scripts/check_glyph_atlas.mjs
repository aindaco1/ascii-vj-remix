import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { GLYPH_COVERAGE_RANGES } from '../renderers/shared/character-sets.js';
import {
  GLYPH_ATLAS_PAGE_COUNT,
  GLYPH_ATLAS_PAGE_GLYPHS,
  GLYPH_ATLAS_PAGE_SIZE,
  GLYPH_ATLAS_TILE_SIZE
} from '../renderers/shared/glyph-atlas.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const atlasDir = path.join(root, 'renderers/gpu/assets/glyphs/neutral');
const sourcePath = path.join(root, 'third_party/unifont/unifont-17.0.05.hex.gz');
const manifest = JSON.parse(await readFile(path.join(atlasDir, 'manifest.json'), 'utf8'));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.id, 'neutral');
assert.equal(manifest.glyphId, 'unicode-scalar');
assert.equal(manifest.tileWidth, GLYPH_ATLAS_TILE_SIZE);
assert.equal(manifest.tileHeight, GLYPH_ATLAS_TILE_SIZE);
assert.equal(manifest.pageWidth, GLYPH_ATLAS_PAGE_SIZE);
assert.equal(manifest.pageHeight, GLYPH_ATLAS_PAGE_SIZE);
assert.equal(manifest.pageGlyphs, GLYPH_ATLAS_PAGE_GLYPHS);
assert.equal(manifest.pageCount, GLYPH_ATLAS_PAGE_COUNT);
assert.deepEqual(manifest.coverage, GLYPH_COVERAGE_RANGES);
assert.equal(
  manifest.glyphCount,
  GLYPH_COVERAGE_RANGES.reduce((total, range) => total + range.end - range.start + 1, 0)
);
assert.equal(manifest.pages.length, GLYPH_ATLAS_PAGE_COUNT);

const source = await readFile(sourcePath);
assert.equal(sha256(source), manifest.source.sha256);
for (const page of manifest.pages) {
  const png = await readFile(path.join(atlasDir, page.filename));
  assert.deepEqual(Array.from(png.subarray(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.readUInt32BE(16), GLYPH_ATLAS_PAGE_SIZE);
  assert.equal(png.readUInt32BE(20), GLYPH_ATLAS_PAGE_SIZE);
  assert.equal(sha256(png), page.sha256);
}

await Promise.all([
  readFile(path.join(root, 'third_party/unifont/LICENSE.txt')),
  readFile(path.join(root, 'third_party/unifont/OFL-1.1.txt'))
]);
console.log(`Glyph atlas verified: ${manifest.glyphCount} scalars, ${manifest.pages.length} pages.`);
