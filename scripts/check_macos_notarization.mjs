#!/usr/bin/env node
import { readdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { tauriTargetDir } from './lib/tauri_target_dir.mjs';
import {
  PRODUCTION_MACOS_BUNDLE_ID,
  PRODUCTION_MACOS_TEAM_ID,
  assertProductionMacosIdentity,
  assertSameDesignatedRequirement,
  extractMacosUpdaterArchive,
  inspectMacosApp
} from './lib/macos_app_identity.mjs';
import {
  findSingleMacosDmg,
  verifyMacosDmgTrust,
  withMountedMacosDmg
} from './lib/macos_dmg.mjs';

const root = path.resolve(process.env.ASCILINE_RELEASE_ROOT || process.cwd());
const args = parseArgs(process.argv.slice(2));
const profile = args.profile || process.env.ASCILINE_TAURI_PROFILE || 'release';
const bundleRoot = path.join(tauriTargetDir(root), profile, 'bundle');
const expectedBundleId = args.expectedBundleId || PRODUCTION_MACOS_BUNDLE_ID;
const expectedTeamId = args.expectedTeamId || PRODUCTION_MACOS_TEAM_ID;
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
let appIdentity = null;
if (appDirs.length !== 1) {
  issues.push(`expected exactly one macOS .app bundle under ${path.relative(root, path.join(bundleRoot, 'macos'))}, found ${appDirs.length}`);
} else {
  const appPath = appDirs[0];
  checkCodesign(appPath);
  checkStapler('.app', appPath);
  checkSpctl('.app', ['-a', '-vv', '--type', 'execute', appPath]);
  try {
    appIdentity = inspectMacosApp(appPath, { checkGatekeeper: false });
    assertProductionMacosIdentity(appIdentity, { expectedBundleId, expectedTeamId });
  } catch (error) {
    issues.push(error.message || String(error));
  }

  const updaterArchives = (await files(path.join(bundleRoot, 'macos')))
    .filter((file) => file.endsWith('.app.tar.gz'));
  if (updaterArchives.length !== 1) {
    issues.push(`expected exactly one macOS updater .app.tar.gz archive, found ${updaterArchives.length}`);
  } else {
    let extracted = null;
    try {
      extracted = await extractMacosUpdaterArchive(updaterArchives[0]);
      const updaterIdentity = inspectMacosApp(extracted.appPath);
      assertProductionMacosIdentity(updaterIdentity, { expectedBundleId, expectedTeamId });
      assertSameDesignatedRequirement(appIdentity, updaterIdentity);
      if (appIdentity?.version !== updaterIdentity.version) {
        issues.push(`macOS updater archive version ${updaterIdentity.version} does not match app version ${appIdentity?.version || '(missing)'}`);
      }
    } catch (error) {
      issues.push(`macOS updater archive identity check failed: ${error.message || String(error)}`);
    } finally {
      if (extracted?.extractionRoot) await rm(extracted.extractionRoot, { recursive: true, force: true });
    }
  }
}

try {
  const dmgPath = await findSingleMacosDmg(bundleRoot);
  await verifyMacosDmgTrust(dmgPath);
  await withMountedMacosDmg(dmgPath, async ({ appPath }) => {
    checkCodesign(appPath);
    checkStapler('mounted .app', appPath);
    checkSpctl('mounted .app', ['-a', '-vv', '--type', 'execute', appPath]);
    const mountedIdentity = inspectMacosApp(appPath, { checkGatekeeper: false });
    assertProductionMacosIdentity(mountedIdentity, { expectedBundleId, expectedTeamId });
    assertSameDesignatedRequirement(appIdentity, mountedIdentity);
    if (appIdentity?.version !== mountedIdentity.version) {
      throw new Error(`mounted app version ${mountedIdentity.version} does not match loose app version ${appIdentity?.version || '(missing)'}`);
    }
  });
} catch (error) {
  issues.push(`macOS DMG verification failed: ${error.message || String(error)}`);
}

if (issues.length > 0) {
  console.error('macOS notarization check failed:');
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log(`macOS notarization check passed for ${profile}.`);
