#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectReleaseAssets, parseArgs } from './lib/tauri_update_manifest.mjs';
import { tauriTargetDir } from './lib/tauri_target_dir.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = parseArgs(process.argv.slice(2));
const profile = args.profile || process.env.ASCILINE_TAURI_PROFILE || 'release';
const targetDir = tauriTargetDir(root);
const bundleRoot = path.resolve(root, args.bundleRoot || path.join(targetDir, profile, 'bundle'));
const outDir = path.resolve(root, args.outDir || path.join(targetDir, profile, 'release-assets'));

try {
  const copied = await collectReleaseAssets({ bundleRoot, outDir });
  for (const filePath of copied) console.log(path.relative(root, filePath));
} catch (error) {
  console.error(`Failed to collect Tauri release assets: ${error.message}`);
  process.exit(1);
}
