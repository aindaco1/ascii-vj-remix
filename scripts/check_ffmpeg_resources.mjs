import { access, readFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { forbiddenMacosDependencies } from './lib/ffmpeg_resource_policy.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const ffmpegRoot = path.join(root, 'src-tauri', 'resources', 'ffmpeg');
const args = new Set(process.argv.slice(2));
const requireCurrentPlatform = args.has('--require-current-platform');
const requireAny = args.has('--require-any') || process.env.ASCILINE_REQUIRE_BUNDLED_FFMPEG === '1';
const issues = [];

function hostPlatformId() {
  const os = {
    darwin: 'macos',
    win32: 'windows',
    linux: 'linux'
  }[process.platform] || process.platform;
  const arch = {
    x64: 'x86_64',
    arm64: 'aarch64'
  }[process.arch] || process.arch;
  return `${os}-${arch}`;
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function sha256(filePath) {
  const bytes = await readFile(filePath);
  return createHash('sha256').update(bytes).digest('hex');
}

function checkMacosDependencies(platformId, fileName, filePath) {
  if (!platformId.startsWith('macos-')) return;
  if (process.platform !== 'darwin') return;

  const result = spawnSync('otool', ['-L', filePath], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024
  });
  if (result.error) {
    issues.push(`${platformId}: failed to inspect ${fileName} dependencies with otool: ${result.error.message}`);
    return;
  }
  if (result.status !== 0) {
    issues.push(`${platformId}: otool failed for ${fileName}: ${result.stderr || result.stdout}`);
    return;
  }

  const forbidden = forbiddenMacosDependencies(result.stdout);
  for (const dependency of forbidden) {
    issues.push(`${platformId}: ${fileName} depends on non-standalone macOS library path ${dependency}`);
  }
}

async function manifestDirs() {
  const entries = await readdir(ffmpegRoot, { withFileTypes: true });
  const dirs = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(ffmpegRoot, entry.name, 'manifest.json');
    if (await exists(manifestPath)) dirs.push(entry.name);
  }
  return dirs.sort();
}

async function checkManifest(platformId) {
  const platformDir = path.join(ffmpegRoot, platformId);
  const manifestPath = path.join(platformDir, 'manifest.json');
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (error) {
    issues.push(`${platformId}: cannot read manifest.json: ${error.message}`);
    return;
  }

  if (manifest.platform !== platformId) {
    issues.push(`${platformId}: manifest platform must match directory name`);
  }
  if (!manifest.license || /unreviewed|unknown/i.test(manifest.license)) {
    issues.push(`${platformId}: manifest license must be explicit and reviewed`);
  }
  if (!manifest.source) {
    issues.push(`${platformId}: manifest source/build review is required`);
  }
  if (!Array.isArray(manifest.files) || manifest.files.length < 2) {
    issues.push(`${platformId}: manifest must include ffmpeg and ffprobe file entries`);
    return;
  }

  const seen = new Set(manifest.files.map((file) => file.name));
  const expectedNames = platformId.startsWith('windows-')
    ? ['ffmpeg.exe', 'ffprobe.exe']
    : ['ffmpeg', 'ffprobe'];
  for (const expected of expectedNames) {
    if (!seen.has(expected)) issues.push(`${platformId}: missing ${expected} in manifest`);
  }

  for (const file of manifest.files) {
    if (!file.path || !file.sha256 || !file.bytes || !file.version) {
      issues.push(`${platformId}: incomplete file entry for ${file.name || '(unknown)'}`);
      continue;
    }
    const filePath = path.join(ffmpegRoot, file.path);
    if (!(await exists(filePath))) {
      issues.push(`${platformId}: missing binary ${file.path}`);
      continue;
    }
    const metadata = await stat(filePath);
    if (metadata.size !== file.bytes) {
      issues.push(`${platformId}: byte size mismatch for ${file.path}`);
    }
    const actualHash = await sha256(filePath);
    if (actualHash !== file.sha256) {
      issues.push(`${platformId}: sha256 mismatch for ${file.path}`);
    }
    checkMacosDependencies(platformId, file.name || file.path, filePath);
  }

  if (!(await exists(path.join(platformDir, 'NOTICE.md')))) {
    issues.push(`${platformId}: NOTICE.md is required beside manifest.json`);
  }
}

await access(ffmpegRoot);
const dirs = await manifestDirs();
const host = process.env.ASCILINE_FFMPEG_PLATFORM || hostPlatformId();

if (dirs.length === 0) {
  if (requireAny || requireCurrentPlatform) {
    issues.push('no bundled FFmpeg manifests found under src-tauri/resources/ffmpeg');
  } else {
    console.log('FFmpeg resource check passed: no bundled sidecars staged yet.');
  }
} else {
  for (const dir of dirs) await checkManifest(dir);
  if (requireCurrentPlatform && !dirs.includes(host)) {
    issues.push(`current platform FFmpeg bundle is required but missing: ${host}`);
  }
}

if (issues.length > 0) {
  console.error('FFmpeg resource check failed:');
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

if (dirs.length > 0) {
  console.log(`FFmpeg resource check passed: ${dirs.join(', ')}`);
}
