import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, gunzipSync } from 'node:zlib';

import { GLYPH_COVERAGE_RANGES } from '../renderers/shared/character-sets.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const sourcePath = path.join(root, 'third_party/unifont/unifont-17.0.05.hex.gz');
const outputDir = path.join(root, 'renderers/gpu/assets/glyphs/neutral');
const TILE_SIZE = 16;
const PAGE_SIZE = 1024;
const PAGE_COLUMNS = PAGE_SIZE / TILE_SIZE;
const PAGE_GLYPHS = PAGE_COLUMNS * PAGE_COLUMNS;
const PAGE_COUNT = 16;

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value >>> 1) ^ (0xedb88320 & -(value & 1));
    }
  }
  return (value ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  typeBytes.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
  return out;
}

function encodeGrayscalePng(width, height, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 0;
  const scanlines = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width + 1);
    scanlines[row] = 0;
    pixels.copy(scanlines, row + 1, y * width, (y + 1) * width);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(scanlines, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

function isCovered(codePoint) {
  return GLYPH_COVERAGE_RANGES.some(({ start, end }) => codePoint >= start && codePoint <= end);
}

function drawGlyph(page, codePoint, bitmapHex) {
  const bytes = Buffer.from(bitmapHex, 'hex');
  if (bytes.length % TILE_SIZE !== 0) {
    throw new Error(`U+${codePoint.toString(16).toUpperCase()} has a malformed bitmap`);
  }
  const sourceWidth = (bytes.length / TILE_SIZE) * 8;
  if (sourceWidth !== 8 && sourceWidth !== 16) {
    throw new Error(`U+${codePoint.toString(16).toUpperCase()} has unsupported width ${sourceWidth}`);
  }
  const slot = codePoint % PAGE_GLYPHS;
  const tileX = (slot % PAGE_COLUMNS) * TILE_SIZE;
  const tileY = Math.floor(slot / PAGE_COLUMNS) * TILE_SIZE;
  const xOffset = sourceWidth === 8 ? 4 : 0;
  const sourceBytesPerRow = sourceWidth / 8;
  for (let y = 0; y < TILE_SIZE; y += 1) {
    for (let x = 0; x < sourceWidth; x += 1) {
      const sourceByte = bytes[y * sourceBytesPerRow + Math.floor(x / 8)];
      const on = sourceByte & (0x80 >> (x % 8));
      if (on) page[(tileY + y) * PAGE_SIZE + tileX + xOffset + x] = 255;
    }
  }
}

const compressedSource = await readFile(sourcePath);
const sourceText = gunzipSync(compressedSource).toString('utf8');
const pages = Array.from({ length: PAGE_COUNT }, () => Buffer.alloc(PAGE_SIZE * PAGE_SIZE));
const pageGlyphCounts = Array(PAGE_COUNT).fill(0);
const found = new Set();

for (const line of sourceText.split(/\r?\n/)) {
  if (!line || line.startsWith('#')) continue;
  const separator = line.indexOf(':');
  if (separator < 1) continue;
  const codePoint = Number.parseInt(line.slice(0, separator), 16);
  if (!Number.isInteger(codePoint) || codePoint > 0xffff || !isCovered(codePoint)) continue;
  drawGlyph(pages[Math.floor(codePoint / PAGE_GLYPHS)], codePoint, line.slice(separator + 1).trim());
  found.add(codePoint);
  pageGlyphCounts[Math.floor(codePoint / PAGE_GLYPHS)] += 1;
}

const expected = GLYPH_COVERAGE_RANGES.reduce((total, { start, end }) => total + end - start + 1, 0);
const missing = [];
for (const { start, end } of GLYPH_COVERAGE_RANGES) {
  for (let codePoint = start; codePoint <= end; codePoint += 1) {
    if (!found.has(codePoint)) missing.push(codePoint);
  }
}
if (missing.length) {
  const preview = missing.slice(0, 12).map((value) => `U+${value.toString(16).toUpperCase()}`).join(', ');
  throw new Error(`Unifont source is missing ${missing.length}/${expected} covered scalars: ${preview}`);
}

await mkdir(outputDir, { recursive: true });
const pageFiles = [];
for (let index = 0; index < pages.length; index += 1) {
  const png = encodeGrayscalePng(PAGE_SIZE, PAGE_SIZE, pages[index]);
  const filename = `page-${index}.png`;
  await writeFile(path.join(outputDir, filename), png);
  pageFiles.push({
    index,
    filename,
    glyphCount: pageGlyphCounts[index],
    sha256: createHash('sha256').update(png).digest('hex')
  });
}

const manifest = {
  schemaVersion: 1,
  id: 'neutral',
  source: {
    name: 'GNU Unifont',
    version: '17.0.05',
    sha256: createHash('sha256').update(compressedSource).digest('hex')
  },
  tileWidth: TILE_SIZE,
  tileHeight: TILE_SIZE,
  pageWidth: PAGE_SIZE,
  pageHeight: PAGE_SIZE,
  pageColumns: PAGE_COLUMNS,
  pageGlyphs: PAGE_GLYPHS,
  pageCount: PAGE_COUNT,
  glyphId: 'unicode-scalar',
  coverage: GLYPH_COVERAGE_RANGES,
  glyphCount: found.size,
  pages: pageFiles
};
await writeFile(path.join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`generated ${found.size} glyphs across ${PAGE_COUNT} deterministic atlas pages`);
for (const page of pageFiles) {
  console.log(`${page.filename}: ${page.glyphCount} glyphs, sha256 ${page.sha256}`);
}
