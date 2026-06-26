import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { tauriTargetDir } from './lib/tauri_target_dir.mjs';

const root = path.resolve(process.env.ASCILINE_RELEASE_ROOT || process.cwd());

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) throw new Error(`unexpected argument: ${arg}`);
    const key = arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) throw new Error(`missing value for ${arg}`);
    out[key] = value;
    i += 1;
  }
  return out;
}

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
  if (result.error) {
    throw new Error(`${command} ${args.join(' ')} failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with ${result.status}: ${output}`);
  }
  return output;
}

function notarizationArgs() {
  if (process.env.APPLE_NOTARIZATION_AUTH === 'api-key') {
    for (const key of ['APPLE_API_KEY_PATH', 'APPLE_API_KEY', 'APPLE_API_ISSUER']) {
      if (!process.env[key]) throw new Error(`${key} is required for App Store Connect API notarization`);
    }
    return [
      '--key',
      process.env.APPLE_API_KEY_PATH,
      '--key-id',
      process.env.APPLE_API_KEY,
      '--issuer',
      process.env.APPLE_API_ISSUER
    ];
  }

  if (process.env.APPLE_NOTARIZATION_AUTH === 'apple-id') {
    for (const key of ['APPLE_ID', 'APPLE_PASSWORD', 'APPLE_TEAM_ID']) {
      if (!process.env[key]) throw new Error(`${key} is required for Apple ID notarization`);
    }
    return [
      '--apple-id',
      process.env.APPLE_ID,
      '--password',
      process.env.APPLE_PASSWORD,
      '--team-id',
      process.env.APPLE_TEAM_ID
    ];
  }

  throw new Error('APPLE_NOTARIZATION_AUTH must be api-key or apple-id');
}

async function dmgFiles(profile) {
  const dmgDir = path.join(tauriTargetDir(root), profile, 'bundle', 'dmg');
  const entries = await readdir(dmgDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.dmg'))
    .map((entry) => path.join(dmgDir, entry.name))
    .sort();
}

async function main() {
  if (process.platform !== 'darwin') {
    throw new Error('macOS DMG notarization can only run on macOS');
  }

  const args = parseArgs(process.argv.slice(2));
  const profile = args.profile || process.env.ASCILINE_TAURI_PROFILE || 'release';
  const dmgs = await dmgFiles(profile);
  if (dmgs.length === 0) {
    throw new Error(`no macOS DMG found under ${path.relative(root, path.join(tauriTargetDir(root), profile, 'bundle', 'dmg'))}`);
  }

  const authArgs = notarizationArgs();
  for (const dmgPath of dmgs) {
    run('/usr/bin/codesign', ['--verify', '--verbose=2', dmgPath]);
    console.log(`Submitting macOS DMG for notarization: ${path.relative(root, dmgPath)}`);
    run('xcrun', ['notarytool', 'submit', dmgPath, '--wait', ...authArgs]);
    run('xcrun', ['stapler', 'staple', dmgPath]);
    run('xcrun', ['stapler', 'validate', dmgPath]);
    console.log(`Notarized and stapled macOS DMG: ${path.relative(root, dmgPath)}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
