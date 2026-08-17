import { access, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertMacosAppBundleInspection,
  inspectMacosAppBundle
} from './lib/macos_app_bundle.mjs';
import {
  findSingleMacosDmg,
  withMountedMacosDmg
} from './lib/macos_dmg.mjs';
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
  if (appDirs.length !== 1) {
    issues.push(`expected exactly one macOS .app bundle under ${path.relative(root, path.join(bundleRoot, 'macos'))}, found ${appDirs.length}`);
    return;
  }

  const appDir = appDirs[0];
  const expectedBundleId = args.expectedBundleId || '';
  const requiredFfmpegPlatforms = await stagedFfmpegPlatforms();
  const looseInspection = await inspectMacosAppBundle(appDir, {
    expectedBundleId,
    requiredFfmpegPlatforms
  });
  issues.push(...looseInspection.issues);

  if (profile === 'release') {
    try {
      const dmgPath = await findSingleMacosDmg(bundleRoot);
      await withMountedMacosDmg(dmgPath, async ({ appPath }) => {
        const mountedInspection = assertMacosAppBundleInspection(
          await inspectMacosAppBundle(appPath, {
            expectedBundleId,
            requiredFfmpegPlatforms
          }),
          'mounted macOS app bundle'
        );
        for (const field of ['bundleIdentifier', 'version', 'executable']) {
          if (mountedInspection[field] !== looseInspection[field]) {
            throw new Error(`mounted macOS app ${field} does not match loose app bundle`);
          }
        }
      });
    } catch (error) {
      issues.push(`release macOS DMG verification failed: ${error.message || String(error)}`);
    }
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
