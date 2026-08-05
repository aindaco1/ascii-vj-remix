import { mkdtemp, readdir, realpath } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

export const PRODUCTION_MACOS_BUNDLE_ID = 'com.asciline.remix';
export const PRODUCTION_MACOS_TEAM_ID = 'PWT3Q52LZ2';
export const DEVELOPMENT_MACOS_BUNDLE_ID = 'com.asciline.remix.dev';

function commandOutput(result) {
  return `${result.stdout || ''}${result.stderr || ''}`.trim();
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error) throw new Error(`${command} failed to start: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with ${result.status}\n${commandOutput(result)}`);
  }
  return commandOutput(result);
}

export function parseCodesignDetails(text) {
  const lines = String(text || '').split(/\r?\n/);
  const value = (prefix) => lines.find((line) => line.startsWith(prefix))?.slice(prefix.length).trim() || '';
  return {
    identifier: value('Identifier='),
    teamIdentifier: value('TeamIdentifier='),
    signature: value('Signature='),
    authorities: lines
      .filter((line) => line.startsWith('Authority='))
      .map((line) => line.slice('Authority='.length).trim()),
    hardenedRuntime: lines.some((line) => /^Runtime Version=/.test(line) || /^CodeDirectory .*flags=.*runtime/i.test(line)),
    raw: String(text || '')
  };
}

export function parseDesignatedRequirement(text) {
  const line = String(text || '')
    .split(/\r?\n/)
    .map((value) => value.trim())
    .find((value) => /^#?\s*designated\s*=>/.test(value));
  if (!line) return '';
  return line.replace(/^#?\s*designated\s*=>\s*/, '').trim();
}

export function validateProductionMacosIdentity(snapshot, options = {}) {
  const expectedBundleId = options.expectedBundleId || PRODUCTION_MACOS_BUNDLE_ID;
  const expectedTeamId = options.expectedTeamId || PRODUCTION_MACOS_TEAM_ID;
  const issues = [];

  if (snapshot.bundleIdentifier !== expectedBundleId) {
    issues.push(`bundle identifier ${snapshot.bundleIdentifier || '(missing)'} does not match ${expectedBundleId}`);
  }
  if (snapshot.codesign.identifier !== expectedBundleId) {
    issues.push(`code-signing identifier ${snapshot.codesign.identifier || '(missing)'} does not match ${expectedBundleId}`);
  }
  if (snapshot.codesign.signature.toLowerCase() === 'adhoc') {
    issues.push('app is ad-hoc signed');
  }
  if (!snapshot.codesign.authorities.some((authority) => authority.startsWith('Developer ID Application:'))) {
    issues.push('app is not signed by a Developer ID Application authority');
  }
  if (snapshot.codesign.teamIdentifier !== expectedTeamId) {
    issues.push(`TeamIdentifier ${snapshot.codesign.teamIdentifier || '(missing)'} does not match ${expectedTeamId}`);
  }
  if (!snapshot.codesign.hardenedRuntime) {
    issues.push('hardened runtime is not enabled');
  }
  if (!snapshot.designatedRequirement) {
    issues.push('designated requirement is missing');
  } else {
    if (snapshot.designatedRequirement.includes('cdhash ')) {
      issues.push('designated requirement is tied to a build-specific code hash');
    }
    if (!snapshot.designatedRequirement.includes(`identifier "${expectedBundleId}"`)) {
      issues.push(`designated requirement does not include identifier "${expectedBundleId}"`);
    }
    if (!snapshot.designatedRequirement.includes(`certificate leaf[subject.OU] = ${expectedTeamId}`)) {
      issues.push(`designated requirement does not include Team ID ${expectedTeamId}`);
    }
  }

  return issues;
}

export function assertProductionMacosIdentity(snapshot, options = {}) {
  const issues = validateProductionMacosIdentity(snapshot, options);
  if (issues.length > 0) {
    throw new Error(`macOS production identity check failed for ${snapshot.appPath || 'app'}:\n- ${issues.join('\n- ')}`);
  }
}

export function assertSameDesignatedRequirement(left, right) {
  if (!left?.designatedRequirement || !right?.designatedRequirement) {
    throw new Error('cannot compare empty macOS designated requirements');
  }
  if (left.designatedRequirement !== right.designatedRequirement) {
    throw new Error(
      `macOS designated requirement changed:\nprevious: ${left.designatedRequirement}\ncurrent:  ${right.designatedRequirement}`
    );
  }
}

export function inspectMacosApp(appPath, options = {}) {
  if (process.platform !== 'darwin') {
    throw new Error('macOS app identity inspection can only run on macOS');
  }
  const infoPlist = path.join(appPath, 'Contents', 'Info.plist');
  const bundleIdentifier = run('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleIdentifier', infoPlist]);
  const version = run('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', infoPlist]);

  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath]);
  const codesign = parseCodesignDetails(run('/usr/bin/codesign', ['-dvvv', appPath]));
  const designatedRequirement = parseDesignatedRequirement(run('/usr/bin/codesign', ['-dr', '-', appPath]));

  if (options.checkGatekeeper !== false) {
    const assessment = run('/usr/sbin/spctl', ['-a', '-vv', '--type', 'execute', appPath]);
    if (!/accepted/i.test(assessment)) {
      throw new Error(`Gatekeeper did not accept ${appPath}: ${assessment}`);
    }
  }

  return {
    appPath,
    bundleIdentifier,
    version,
    codesign,
    designatedRequirement
  };
}

async function findAppBundles(root, maxDepth = 3) {
  const out = [];
  async function walk(current, depth) {
    if (depth < 0) return;
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const entryPath = path.join(current, entry.name);
      if (entry.name.endsWith('.app')) out.push(entryPath);
      else await walk(entryPath, depth - 1);
    }
  }
  await walk(root, maxDepth);
  return out;
}

export async function extractMacosUpdaterArchive(archivePath) {
  if (process.platform !== 'darwin') {
    throw new Error('macOS updater archives can only be inspected on macOS');
  }
  const canonicalTempRoot = await realpath(os.tmpdir());
  const extractionRoot = await mkdtemp(path.join(canonicalTempRoot, 'ascii-vj-remix-updater-'));
  run('/usr/bin/tar', ['-xzf', archivePath, '-C', extractionRoot]);
  const appPaths = await findAppBundles(extractionRoot);
  if (appPaths.length !== 1) {
    throw new Error(`expected exactly one .app in ${archivePath}, found ${appPaths.length}`);
  }
  return { extractionRoot, appPath: appPaths[0] };
}
