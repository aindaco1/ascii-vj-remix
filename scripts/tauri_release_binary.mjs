#!/usr/bin/env node

import process from 'node:process';
import { packReleaseBinary, restoreReleaseBinary } from './lib/tauri_release_binary.mjs';

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const out = { command };
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (!arg.startsWith('--')) throw new Error(`unexpected argument: ${arg}`);
    const value = rest[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`missing value for ${arg}`);
    out[arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = value;
    index += 1;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === 'pack') {
    const manifest = await packReleaseBinary({
      binary: args.binary,
      outputDir: args.outputDir,
      commit: args.commit,
      platform: args.platform,
      version: args.version
    });
    console.log(`Packed verified ${manifest.platform} release binary ${manifest.binary.sha256}.`);
    return;
  }
  if (args.command === 'restore') {
    const manifest = await restoreReleaseBinary({
      inputDir: args.inputDir,
      output: args.output,
      commit: args.commit,
      platform: args.platform,
      version: args.version
    });
    console.log(`Restored verified ${manifest.platform} release binary ${manifest.binary.sha256}.`);
    return;
  }
  throw new Error('usage: node scripts/tauri_release_binary.mjs <pack|restore> [options]');
}

main().catch((error) => {
  console.error(`Tauri release binary handoff failed: ${error.message}`);
  process.exit(1);
});
