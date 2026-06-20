#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createUpdateFragment, parseArgs } from './lib/tauri_update_manifest.mjs';
import { tauriTargetDir } from './lib/tauri_target_dir.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = parseArgs(process.argv.slice(2));
const profile = args.profile || process.env.ASCILINE_TAURI_PROFILE || 'release';
const targetDir = tauriTargetDir(root);
const bundleRoot = path.resolve(root, args.bundleRoot || path.join(targetDir, profile, 'release-assets'));
const outFile = path.resolve(root, args.out || path.join(targetDir, profile, 'release-assets', 'updater-fragment.json'));

try {
  const fragment = await createUpdateFragment({
    root,
    bundleRoot,
    outFile,
    repo: args.repo,
    tag: args.tag,
    version: args.version,
    notes: args.notes,
    pubDate: args.pubDate,
    platform: args.platform || process.env.TAURI_UPDATE_TARGET,
    assetBaseUrl: args.assetBaseUrl
  });
  console.log(`Wrote ${path.relative(root, outFile)} with platforms: ${Object.keys(fragment.platforms).join(', ')}`);
} catch (error) {
  console.error(`Failed to create Tauri update fragment: ${error.message}`);
  process.exit(1);
}
