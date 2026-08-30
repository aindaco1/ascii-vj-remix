#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tauriTargetDir } from './lib/tauri_target_dir.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const profileArg = process.argv.indexOf('--profile');
const profile = profileArg >= 0 ? process.argv[profileArg + 1] : 'release';
const explicitPathArg = process.argv.indexOf('--exe');
const executable = explicitPathArg >= 0
  ? path.resolve(root, process.argv[explicitPathArg + 1])
  : path.join(tauriTargetDir(root), profile, 'ascii-vj-remix.exe');

const IMAGE_SUBSYSTEM_WINDOWS_GUI = 2;

try {
  const binary = await readFile(executable);
  if (binary.length < 0x40 || binary.toString('ascii', 0, 2) !== 'MZ') {
    throw new Error('missing DOS MZ header');
  }

  const peOffset = binary.readUInt32LE(0x3c);
  const optionalHeaderOffset = peOffset + 24;
  if (peOffset < 0x40 || optionalHeaderOffset + 70 > binary.length) {
    throw new Error('invalid PE header offset');
  }
  if (binary.toString('ascii', peOffset, peOffset + 4) !== 'PE\0\0') {
    throw new Error('missing PE signature');
  }

  const optionalMagic = binary.readUInt16LE(optionalHeaderOffset);
  if (optionalMagic !== 0x10b && optionalMagic !== 0x20b) {
    throw new Error(`unsupported optional-header magic 0x${optionalMagic.toString(16)}`);
  }

  const subsystem = binary.readUInt16LE(optionalHeaderOffset + 68);
  if (subsystem !== IMAGE_SUBSYSTEM_WINDOWS_GUI) {
    throw new Error(`expected Windows GUI subsystem 2, found ${subsystem}`);
  }

  console.log(`Windows GUI subsystem verified: ${path.relative(root, executable)}`);
} catch (error) {
  console.error(`Windows GUI subsystem check failed for ${executable}: ${error.message}`);
  process.exit(1);
}
