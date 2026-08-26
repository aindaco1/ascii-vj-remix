#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = path.join(root, 'assets', 'branding', 'ascii-vj-remix-app-icon-1024.png');
const committed = path.join(root, 'src-tauri', 'icons');
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

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

function icnsManifest(data) {
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
      const digest = createHash('sha256').update(data.subarray(offset + 8, offset + length)).digest('hex');
      chunks.push(`${type}:${length}:${digest}`);
    }
    offset += length;
  }
  return chunks.sort();
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
    const agrees = relative === 'icon.icns'
      ? JSON.stringify(icnsManifest(actual)) === JSON.stringify(icnsManifest(expected))
      : actual.equals(expected);
    if (!agrees) {
      throw new Error(`committed icon differs from canonical Tauri output: src-tauri/icons/${relative}`);
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
