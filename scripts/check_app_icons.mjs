#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = path.join(root, 'assets', 'branding', 'ascii-vj-remix-app-icon-1024.png');
const committed = path.join(root, 'src-tauri', 'icons');
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const maxChannelDelta = 3;
const maxMeanChannelDelta = 0.1;

function hash(data) {
  return createHash('sha256').update(data).digest('hex');
}

function paeth(left, above, upperLeft) {
  const prediction = left + above - upperLeft;
  const leftDistance = Math.abs(prediction - left);
  const aboveDistance = Math.abs(prediction - above);
  const upperLeftDistance = Math.abs(prediction - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  return aboveDistance <= upperLeftDistance ? above : upperLeft;
}

function decodePng(data) {
  if (!data.subarray(0, pngSignature.length).equals(pngSignature)) {
    throw new Error('generated icon payload is not a PNG');
  }

  let header;
  const compressed = [];
  for (let offset = pngSignature.length; offset < data.length;) {
    if (offset + 12 > data.length) throw new Error('generated PNG has a truncated chunk header');
    const length = data.readUInt32BE(offset);
    const type = data.subarray(offset + 4, offset + 8).toString('ascii');
    const payloadEnd = offset + 8 + length;
    if (payloadEnd + 4 > data.length) throw new Error(`generated PNG has a truncated ${type} chunk`);
    const payload = data.subarray(offset + 8, payloadEnd);
    if (type === 'IHDR') {
      header = {
        width: payload.readUInt32BE(0),
        height: payload.readUInt32BE(4),
        bitDepth: payload[8],
        colorType: payload[9],
        compression: payload[10],
        filter: payload[11],
        interlace: payload[12]
      };
    } else if (type === 'IDAT') {
      compressed.push(payload);
    }
    offset = payloadEnd + 4;
  }

  if (!header || compressed.length === 0) throw new Error('generated PNG is missing IHDR or IDAT data');
  if (header.bitDepth !== 8 || header.colorType !== 6 || header.compression !== 0 || header.filter !== 0 || header.interlace !== 0) {
    throw new Error(
      `generated PNG must be non-interlaced 8-bit RGBA, got bit depth ${header.bitDepth}, color type ${header.colorType}, interlace ${header.interlace}`
    );
  }

  const bytesPerPixel = 4;
  const stride = header.width * bytesPerPixel;
  const filtered = inflateSync(Buffer.concat(compressed));
  const expectedLength = header.height * (stride + 1);
  if (filtered.length !== expectedLength) {
    throw new Error(`generated PNG decoded to ${filtered.length} bytes; expected ${expectedLength}`);
  }

  const pixels = Buffer.alloc(header.height * stride);
  for (let row = 0; row < header.height; row += 1) {
    const filter = filtered[row * (stride + 1)];
    const sourceStart = row * (stride + 1) + 1;
    const targetStart = row * stride;
    for (let column = 0; column < stride; column += 1) {
      const source = filtered[sourceStart + column];
      const left = column >= bytesPerPixel ? pixels[targetStart + column - bytesPerPixel] : 0;
      const above = row > 0 ? pixels[targetStart + column - stride] : 0;
      const upperLeft = row > 0 && column >= bytesPerPixel
        ? pixels[targetStart + column - stride - bytesPerPixel]
        : 0;
      let value;
      if (filter === 0) value = source;
      else if (filter === 1) value = source + left;
      else if (filter === 2) value = source + above;
      else if (filter === 3) value = source + Math.floor((left + above) / 2);
      else if (filter === 4) value = source + paeth(left, above, upperLeft);
      else throw new Error(`generated PNG uses unsupported row filter ${filter}`);
      pixels[targetStart + column] = value & 0xff;
    }
  }

  // RGB values beneath transparent pixels are not rendered and can vary across
  // platform encoders. Compare premultiplied pixels so the check reflects the
  // visible icon while still requiring exact alpha and composited color data.
  const visiblePixels = Buffer.alloc(pixels.length);
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const alpha = pixels[offset + 3];
    visiblePixels[offset] = Math.round((pixels[offset] * alpha) / 255);
    visiblePixels[offset + 1] = Math.round((pixels[offset + 1] * alpha) / 255);
    visiblePixels[offset + 2] = Math.round((pixels[offset + 2] * alpha) / 255);
    visiblePixels[offset + 3] = alpha;
  }

  return {
    format: `${header.width}x${header.height}:rgba8-premultiplied`,
    pixels: visiblePixels
  };
}

function comparePng(actualData, expectedData) {
  const actual = decodePng(actualData);
  const expected = decodePng(expectedData);
  if (actual.format !== expected.format || actual.pixels.length !== expected.pixels.length) {
    return { agrees: false, detail: `PNG format differs (${actual.format} versus ${expected.format})` };
  }
  if (actual.pixels.equals(expected.pixels)) return { agrees: true, detail: 'exact visible pixels' };

  let maximum = 0;
  let total = 0;
  let changed = 0;
  for (let index = 0; index < actual.pixels.length; index += 1) {
    const delta = Math.abs(actual.pixels[index] - expected.pixels[index]);
    if (delta > 0) changed += 1;
    if (delta > maximum) maximum = delta;
    total += delta;
  }
  const mean = total / actual.pixels.length;
  return {
    agrees: maximum <= maxChannelDelta && mean <= maxMeanChannelDelta,
    detail: `visible pixel delta max=${maximum}, mean=${mean.toFixed(4)}, changed=${changed}/${actual.pixels.length}`
  };
}

function compareIconPayload(actual, expected) {
  const actualIsPng = actual.subarray(0, pngSignature.length).equals(pngSignature);
  const expectedIsPng = expected.subarray(0, pngSignature.length).equals(pngSignature);
  if (actualIsPng || expectedIsPng) {
    if (!actualIsPng || !expectedIsPng) return { agrees: false, detail: 'icon payload format differs' };
    return comparePng(actual, expected);
  }
  return {
    agrees: actual.equals(expected),
    detail: actual.equals(expected)
      ? 'exact binary payload'
      : `binary payload differs (${actual.length}:${hash(actual)} versus ${expected.length}:${hash(expected)})`
  };
}

async function validateSource() {
  const data = await readFile(source);
  if (!data.subarray(0, pngSignature.length).equals(pngSignature)) {
    throw new Error('canonical app icon must be a PNG');
  }
  if (data.subarray(12, 16).toString('ascii') !== 'IHDR') {
    throw new Error('canonical app icon is missing the PNG IHDR chunk');
  }
  const width = data.readUInt32BE(16);
  const height = data.readUInt32BE(20);
  const bitDepth = data[24];
  const colorType = data[25];
  if (width !== 1024 || height !== 1024 || bitDepth !== 8 || colorType !== 6) {
    throw new Error(
      `canonical app icon must be 1024x1024 8-bit RGBA, got ${width}x${height}, bit depth ${bitDepth}, color type ${colorType}`
    );
  }
}

async function filesUnder(directory, relative = '') {
  const entries = await readdir(path.join(directory, relative), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === '.gitkeep') continue;
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) {
      files.push(...await filesUnder(directory, child));
    } else if (entry.isFile()) {
      files.push(child.split(path.sep).join('/'));
    }
  }
  return files.sort();
}

function icnsEntries(data) {
  if (data.subarray(0, 4).toString('ascii') !== 'icns' || data.readUInt32BE(4) !== data.length) {
    throw new Error('generated macOS icon is not a valid ICNS container');
  }
  const chunks = [];
  for (let offset = 8; offset < data.length;) {
    if (offset + 8 > data.length) throw new Error('generated macOS icon has a truncated ICNS chunk header');
    const type = data.subarray(offset, offset + 4).toString('ascii');
    const length = data.readUInt32BE(offset + 4);
    if (length < 8 || offset + length > data.length) {
      throw new Error(`generated macOS icon has an invalid ${type} ICNS chunk`);
    }
    if (type !== 'TOC ') {
      const payload = data.subarray(offset + 8, offset + length);
      chunks.push({ type, payload });
    }
    offset += length;
  }
  return chunks.sort((left, right) => left.type.localeCompare(right.type));
}

function compareIcns(actualData, expectedData) {
  const actual = icnsEntries(actualData);
  const expected = icnsEntries(expectedData);
  if (actual.length !== expected.length) {
    return { agrees: false, detail: `ICNS chunk count differs (${actual.length} versus ${expected.length})` };
  }
  for (let index = 0; index < actual.length; index += 1) {
    if (actual[index].type !== expected[index].type) {
      return { agrees: false, detail: `ICNS chunk type differs (${actual[index].type} versus ${expected[index].type})` };
    }
    const comparison = compareIconPayload(actual[index].payload, expected[index].payload);
    if (!comparison.agrees) {
      return { agrees: false, detail: `ICNS ${actual[index].type}: ${comparison.detail}` };
    }
  }
  return { agrees: true, detail: 'ICNS image chunks agree' };
}

function icoEntries(data) {
  if (data.length < 6 || data.readUInt16LE(0) !== 0 || data.readUInt16LE(2) !== 1) {
    throw new Error('generated Windows icon is not a valid ICO container');
  }
  const count = data.readUInt16LE(4);
  if (data.length < 6 + count * 16) throw new Error('generated Windows icon has a truncated directory');
  const images = [];
  for (let index = 0; index < count; index += 1) {
    const offset = 6 + index * 16;
    const width = data[offset] || 256;
    const height = data[offset + 1] || 256;
    const colorCount = data[offset + 2];
    const planes = data.readUInt16LE(offset + 4);
    const bitCount = data.readUInt16LE(offset + 6);
    const length = data.readUInt32LE(offset + 8);
    const imageOffset = data.readUInt32LE(offset + 12);
    if (imageOffset + length > data.length) throw new Error('generated Windows icon has a truncated image');
    const payload = data.subarray(imageOffset, imageOffset + length);
    images.push({ key: `${width}x${height}:${colorCount}:${planes}:${bitCount}`, payload });
  }
  return images.sort((left, right) => left.key.localeCompare(right.key));
}

function compareIco(actualData, expectedData) {
  const actual = icoEntries(actualData);
  const expected = icoEntries(expectedData);
  if (actual.length !== expected.length) {
    return { agrees: false, detail: `ICO image count differs (${actual.length} versus ${expected.length})` };
  }
  for (let index = 0; index < actual.length; index += 1) {
    if (actual[index].key !== expected[index].key) {
      return { agrees: false, detail: `ICO entry differs (${actual[index].key} versus ${expected[index].key})` };
    }
    const comparison = compareIconPayload(actual[index].payload, expected[index].payload);
    if (!comparison.agrees) {
      return { agrees: false, detail: `ICO ${actual[index].key}: ${comparison.detail}` };
    }
  }
  return { agrees: true, detail: 'ICO images agree' };
}

async function compareGeneratedIcons(generated) {
  const expectedFiles = await filesUnder(generated);
  const committedFiles = await filesUnder(committed);
  if (JSON.stringify(committedFiles) !== JSON.stringify(expectedFiles)) {
    throw new Error(
      `committed icon file set differs from Tauri output\nexpected: ${expectedFiles.join(', ')}\ncommitted: ${committedFiles.join(', ')}`
    );
  }

  for (const relative of expectedFiles) {
    const [expected, actual] = await Promise.all([
      readFile(path.join(generated, relative)),
      readFile(path.join(committed, relative))
    ]);
    let comparison;
    if (relative.endsWith('.png')) {
      comparison = comparePng(actual, expected);
    } else if (relative === 'icon.icns') {
      comparison = compareIcns(actual, expected);
    } else if (relative === 'icon.ico') {
      comparison = compareIco(actual, expected);
    } else {
      comparison = {
        agrees: actual.equals(expected),
        detail: actual.equals(expected) ? 'exact bytes' : 'file bytes differ'
      };
    }
    if (!comparison.agrees) {
      throw new Error(
        `committed icon differs from canonical Tauri output: src-tauri/icons/${relative} (${comparison.detail})`
      );
    }
  }
}

await validateSource();
const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'ascii-vj-remix-icons-'));
try {
  const generated = path.join(tempRoot, 'icons');
  const result = spawnSync(
    process.execPath,
    [path.join(root, 'scripts', 'tauri_env.mjs'), 'icon', source, '--output', generated],
    { cwd: root, stdio: 'inherit' }
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Tauri icon generation exited with status ${result.status}`);
  }
  if (!(await stat(generated)).isDirectory()) {
    throw new Error('Tauri icon generation did not create an output directory');
  }
  await compareGeneratedIcons(generated);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

console.log('App icon check passed: canonical 1024px RGBA source and all Tauri-generated platform assets agree.');
