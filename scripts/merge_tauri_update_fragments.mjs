#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeUpdateFragments, parseArgs } from './lib/tauri_update_manifest.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = parseArgs(process.argv.slice(2));
const fragmentsDir = path.resolve(root, args.fragmentsDir || 'release-artifacts');
const outFile = path.resolve(root, args.out || path.join(fragmentsDir, 'latest.json'));

try {
  const { manifest, files } = await mergeUpdateFragments({
    fragmentsDir,
    outFile,
    version: args.version,
    notes: args.notes,
    pubDate: args.pubDate
  });
  console.log(`Merged ${files.length} updater fragments into ${path.relative(root, outFile)} with platforms: ${Object.keys(manifest.platforms).join(', ')}`);
} catch (error) {
  console.error(`Failed to merge Tauri update fragments: ${error.message}`);
  process.exit(1);
}
