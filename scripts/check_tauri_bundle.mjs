import { access, readFile, readdir, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tauriTargetDir } from './lib/tauri_target_dir.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = parseArgs(process.argv.slice(2));
const profile = args.profile || process.env.ASCILINE_TAURI_PROFILE || 'release';
const bundleRoot = path.join(tauriTargetDir(root), profile, 'bundle');
const sourceFfmpegRoot = path.join(root, 'src-tauri', 'resources', 'ffmpeg');
const issues = [];

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) throw new Error(`unexpected argument: ${arg}`);
    const key = arg.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) throw new Error(`missing value for --${key}`);
    out[key.replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = value;
    i += 1;
  }
  return out;
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function fileExists(filePath) {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
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

async function files(parent) {
  try {
    return (await readdir(parent, { withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .map((entry) => path.join(parent, entry.name));
  } catch {
    return [];
  }
}

async function stagedFfmpegPlatforms() {
  const platforms = [];
  for (const dir of await dirs(sourceFfmpegRoot)) {
    if (await fileExists(path.join(dir, 'manifest.json'))) platforms.push(path.basename(dir));
  }
  return platforms.sort();
}

async function checkMacosBundle() {
  const appDirs = (await dirs(path.join(bundleRoot, 'macos'))).filter((dir) => dir.endsWith('.app'));
  if (appDirs.length === 0) {
    issues.push(`no macOS .app bundle found under ${path.relative(root, path.join(bundleRoot, 'macos'))}`);
    return;
  }

  const appDir = appDirs[0];
  const contents = path.join(appDir, 'Contents');
  const infoPlistPath = path.join(contents, 'Info.plist');
  const resources = path.join(contents, 'Resources');
  const macos = path.join(contents, 'MacOS');

  if (!(await fileExists(infoPlistPath))) issues.push('macOS bundle is missing Contents/Info.plist');
  if (!(await fileExists(path.join(resources, 'icon.icns')))) issues.push('macOS bundle is missing Contents/Resources/icon.icns');

  const plist = await readFile(infoPlistPath, 'utf8').catch(() => '');
  const executableMatch = plist.match(/<key>CFBundleExecutable<\/key>\s*<string>([^<]+)<\/string>/);
  const executable = executableMatch?.[1] || '';
  if (!executable || !(await fileExists(path.join(macos, executable)))) {
    issues.push('macOS bundle executable declared in Info.plist is missing');
  }

  for (const key of [
    'NSCameraUsageDescription',
    'NSMicrophoneUsageDescription',
    'NSScreenCaptureUsageDescription'
  ]) {
    if (!plist.includes(`<key>${key}</key>`)) issues.push(`macOS bundle Info.plist is missing ${key}`);
  }

  const bundledFfmpegRoot = path.join(resources, 'resources', 'ffmpeg');
  if (!(await fileExists(path.join(bundledFfmpegRoot, 'README.md')))) {
    issues.push('macOS bundle is missing resources/ffmpeg/README.md');
  }
  for (const platform of await stagedFfmpegPlatforms()) {
    const platformDir = path.join(bundledFfmpegRoot, platform);
    for (const required of ['manifest.json', 'NOTICE.md']) {
      if (!(await fileExists(path.join(platformDir, required)))) {
        issues.push(`macOS bundle is missing resources/ffmpeg/${platform}/${required}`);
      }
    }
  }

  const verify = spawnSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', appDir], { encoding: 'utf8' });
  if (verify.status !== 0) {
    issues.push(`macOS .app bundle is not codesign-valid: ${(verify.stderr || verify.stdout || '').trim()}`);
  }

  const details = spawnSync('/usr/bin/codesign', ['-dv', '--verbose=4', appDir], { encoding: 'utf8' });
  const signatureDetails = `${details.stdout || ''}${details.stderr || ''}`;
  if (details.status !== 0) {
    issues.push(`macOS .app bundle signature details could not be read: ${signatureDetails.trim()}`);
  } else if (!/Signature=adhoc|Authority=/.test(signatureDetails)) {
    issues.push('macOS .app bundle does not report an ad-hoc or certificate authority signature');
  }

  const dmgFiles = (await files(path.join(bundleRoot, 'dmg'))).filter((file) => file.endsWith('.dmg'));
  if (profile === 'release' && dmgFiles.length === 0) {
    issues.push('release macOS bundle is missing a DMG artifact');
  }
}

async function checkWindowsBundle() {
  const artifactFiles = [
    ...(await files(path.join(bundleRoot, 'nsis'))),
    ...(await files(path.join(bundleRoot, 'msi')))
  ].filter((file) => /\.(exe|msi)$/i.test(file));
  if (artifactFiles.length === 0) {
    issues.push(`no Windows installer artifact found under ${path.relative(root, bundleRoot)}`);
  }
}

async function checkLinuxBundle() {
  const artifactFiles = [
    ...(await files(path.join(bundleRoot, 'appimage'))),
    ...(await files(path.join(bundleRoot, 'deb'))),
    ...(await files(path.join(bundleRoot, 'rpm')))
  ].filter((file) => /\.(AppImage|deb|rpm)$/i.test(file));
  if (artifactFiles.length === 0) {
    issues.push(`no Linux bundle artifact found under ${path.relative(root, bundleRoot)}`);
  }
}

if (!(await exists(bundleRoot))) {
  issues.push(`Tauri bundle directory is missing: ${path.relative(root, bundleRoot)}`);
} else if (process.platform === 'darwin') {
  await checkMacosBundle();
} else if (process.platform === 'win32') {
  await checkWindowsBundle();
} else if (process.platform === 'linux') {
  await checkLinuxBundle();
} else {
  issues.push(`unsupported bundle check platform: ${process.platform}`);
}

if (issues.length > 0) {
  console.error('Tauri bundle check failed:');
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log(`Tauri bundle check passed for ${process.platform} ${profile}.`);
