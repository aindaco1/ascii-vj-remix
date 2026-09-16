import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// Tauri owns the supported OS floor for the app, Cargo helpers and sidecars.
export const macosDeploymentTarget = JSON.parse(readFileSync(
  new URL('../../src-tauri/tauri.conf.json', import.meta.url), 'utf8'
)).bundle.macOS.minimumSystemVersion;

function versionParts(value) {
  if (!/^\d+\.\d+(?:\.\d+)?$/.test(value || '')) {
    throw new Error(`Invalid macOS deployment target: ${value}`);
  }
  return value.split('.').map(Number).concat(0).slice(0, 3);
}

versionParts(macosDeploymentTarget);

export function applyMacosDeploymentTarget(env, platform = process.platform) {
  if (platform === 'darwin') env.MACOSX_DEPLOYMENT_TARGET = macosDeploymentTarget;
}

export function macosDeploymentIssues(output, maximum = macosDeploymentTarget) {
  const limit = versionParts(maximum);
  const commands = String(output).split(/Load command \d+/).slice(1);
  const targets = commands.flatMap(command => {
    if (/\bcmd LC_BUILD_VERSION\b/.test(command) && /\bplatform (?:1|MACOS)\s/.test(command)) {
      return [command.match(/\bminos (\S+)/)?.[1] || ''];
    }
    if (/\bcmd LC_VERSION_MIN_MACOSX\b/.test(command)) {
      return [command.match(/\bversion (\S+)/)?.[1] || ''];
    }
    return [];
  });
  if (!targets.length) return ['no macOS minimum-version load command found'];
  return targets.flatMap(target => {
    let parts;
    try { parts = versionParts(target); }
    catch { return [`invalid macOS minimum version: ${target || '(missing)'}`]; }
    const different = parts.findIndex((part, index) => part !== limit[index]);
    return different >= 0 && parts[different] > limit[different]
      ? [`requires macOS ${target}, above supported minimum ${maximum}`]
      : [];
  });
}

export function inspectMacosDeploymentTarget(binaryPath, maximum = macosDeploymentTarget) {
  const result = spawnSync('otool', ['-l', binaryPath], {
    encoding: 'utf8', maxBuffer: 4 * 1024 * 1024
  });
  if (result.error || result.status !== 0) {
    return [`could not inspect macOS minimum version: ${result.error?.message || result.stderr || result.stdout}`];
  }
  return macosDeploymentIssues(result.stdout, maximum);
}
