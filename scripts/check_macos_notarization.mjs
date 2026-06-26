#!/usr/bin/env node
import { readdir, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { tauriTargetDir } from './lib/tauri_target_dir.mjs';

const root = path.resolve(process.env.ASCILINE_RELEASE_ROOT || process.cwd());
const args = parseArgs(process.argv.slice(2));
const profile = args.profile || process.env.ASCILINE_TAURI_PROFILE || 'release';
const bundleRoot = path.join(tauriTargetDir(root), profile, 'bundle');
const issues = [];

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

async function files(parent) {
  try {
    return (await readdir(parent, { withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .map((entry) => path.join(parent, entry.name));
  } catch {
    return [];
  }
}

async function dirs(parent) {
  try {
    return (await readdir(parent, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(parent, entry.name));
  } catch {
    return [];
  }
}

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function run(command, args) {
  return spawnSync(command, args, { encoding: 'utf8' });
}

function outputOf(result) {
  return `${result.stdout || ''}${result.stderr || ''}`.trim();
}

function checkCodesign(appPath) {
  const verify = run('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath]);
  if (verify.status !== 0) {
    issues.push(`codesign verification failed: ${outputOf(verify)}`);
    return;
  }

  const details = run('/usr/bin/codesign', ['-dvvv', '--entitlements', ':-', appPath]);
  const text = outputOf(details);
  if (details.status !== 0) {
    issues.push(`codesign details failed: ${text}`);
    return;
  }
  if (!text.includes('Authority=Developer ID Application')) {
    issues.push('macOS app is not signed with a Developer ID Application identity');
  }
  if (!/Runtime Version=|flags=.*runtime/i.test(text)) {
    issues.push('macOS app does not report hardened runtime in codesign details');
  }
}

function checkDmgCodesign(dmgPath) {
  const verify = run('/usr/bin/codesign', ['--verify', '--verbose=2', dmgPath]);
  if (verify.status !== 0) {
    issues.push(`DMG codesign verification failed: ${outputOf(verify)}`);
    return;
  }

  const details = run('/usr/bin/codesign', ['-dvvv', dmgPath]);
  const text = outputOf(details);
  if (details.status !== 0) {
    issues.push(`DMG codesign details failed: ${text}`);
    return;
  }
  if (!text.includes('Authority=Developer ID Application')) {
    issues.push('macOS DMG is not signed with a Developer ID Application identity');
  }
}

function checkStapler(label, targetPath) {
  const result = run('xcrun', ['stapler', 'validate', targetPath]);
  if (result.status !== 0) {
    issues.push(`${label} stapler validation failed: ${outputOf(result)}`);
  }
}

function checkSpctl(label, args) {
  const result = run('/usr/sbin/spctl', args);
  const text = outputOf(result);
  if (result.status !== 0) {
    issues.push(`${label} Gatekeeper assessment failed: ${text}`);
    return;
  }
  if (!/accepted/i.test(text)) {
    issues.push(`${label} Gatekeeper assessment did not report accepted: ${text}`);
  }
}

if (process.platform !== 'darwin') {
  console.error('macOS notarization check can only run on macOS.');
  process.exit(1);
}

const appDirs = (await dirs(path.join(bundleRoot, 'macos'))).filter((dir) => dir.endsWith('.app'));
if (appDirs.length === 0) {
  issues.push(`no macOS .app bundle found under ${path.relative(root, path.join(bundleRoot, 'macos'))}`);
} else {
  const appPath = appDirs[0];
  checkCodesign(appPath);
  checkStapler('.app', appPath);
  checkSpctl('.app', ['-a', '-vv', '--type', 'execute', appPath]);
}

const dmgFiles = (await files(path.join(bundleRoot, 'dmg'))).filter((file) => file.endsWith('.dmg'));
if (dmgFiles.length === 0) {
  issues.push(`no macOS DMG found under ${path.relative(root, path.join(bundleRoot, 'dmg'))}`);
} else if (await exists(dmgFiles[0])) {
  checkDmgCodesign(dmgFiles[0]);
  checkStapler('DMG', dmgFiles[0]);
  checkSpctl('DMG', ['-a', '-vv', '--type', 'open', '--context', 'context:primary-signature', dmgFiles[0]]);
}

if (issues.length > 0) {
  console.error('macOS notarization check failed:');
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log(`macOS notarization check passed for ${profile}.`);
