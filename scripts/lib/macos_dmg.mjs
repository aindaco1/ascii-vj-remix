import { execFile } from 'node:child_process';
import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readlink,
  realpath,
  rm,
  writeFile
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

export const MACOS_DMG_APP_NAME = 'ASCII VJ Remix.app';
export const MACOS_DMG_APPLICATIONS_LINK_NAME = 'Applications';
export const MACOS_DMG_APPLICATIONS_LINK_TARGET = '/Applications';
export const MACOS_DMG_FINDER_METADATA_NAME = '.DS_Store';
export const MACOS_DMG_VOLUME_ICON_NAME = '.VolumeIcon.icns';

const EXPECTED_ENTRIES = Object.freeze([
  MACOS_DMG_APP_NAME,
  MACOS_DMG_APPLICATIONS_LINK_NAME,
  MACOS_DMG_FINDER_METADATA_NAME,
  MACOS_DMG_VOLUME_ICON_NAME
].sort());
const execFileAsync = promisify(execFile);
const MAX_BUFFER = 16 * 1024 * 1024;

function outputOf(result) {
  return `${result?.stdout || ''}${result?.stderr || ''}`.trim();
}

async function runTool(executable, args, options = {}) {
  try {
    return await execFileAsync(executable, args, {
      encoding: 'utf8',
      maxBuffer: MAX_BUFFER,
      timeout: 180_000,
      killSignal: 'SIGKILL',
      ...options
    });
  } catch (error) {
    const detail = outputOf(error);
    throw new Error(`${executable} ${args.join(' ')} failed${detail ? `:\n${detail}` : ''}`);
  }
}

async function validateDmgPath(dmgInput) {
  if (!dmgInput || !path.isAbsolute(dmgInput)) {
    throw new Error('macOS DMG path must be absolute');
  }
  const dmgPath = path.resolve(dmgInput);
  if (dmgPath === path.parse(dmgPath).root || path.extname(dmgPath).toLowerCase() !== '.dmg') {
    throw new Error('macOS DMG path is invalid');
  }
  const dmgStat = await lstat(dmgPath).catch(() => null);
  if (!dmgStat || dmgStat.isSymbolicLink() || !dmgStat.isFile() || dmgStat.size < 1) {
    throw new Error('macOS DMG must be a non-empty regular file');
  }
  return { dmgPath, dmgStat };
}

export async function findSingleMacosDmg(bundleRoot) {
  if (!bundleRoot || !path.isAbsolute(bundleRoot)) {
    throw new Error('macOS bundle root must be absolute');
  }
  const dmgRoot = path.join(path.resolve(bundleRoot), 'dmg');
  const entries = await readdir(dmgRoot, { withFileTypes: true }).catch(() => []);
  const candidates = entries.filter((entry) => entry.name.toLowerCase().endsWith('.dmg'));
  if (candidates.length !== 1) {
    throw new Error(`expected exactly one macOS DMG under ${dmgRoot}, found ${candidates.length}`);
  }
  if (!candidates[0].isFile() || candidates[0].isSymbolicLink()) {
    throw new Error('macOS DMG artifact must be a regular file');
  }
  const { dmgPath } = await validateDmgPath(path.join(dmgRoot, candidates[0].name));
  return dmgPath;
}

export async function validateMacosDmgLayout(layoutInput) {
  if (!layoutInput || !path.isAbsolute(layoutInput)) {
    throw new Error('macOS DMG layout root must be absolute');
  }
  const layoutRoot = path.resolve(layoutInput);
  if (layoutRoot === path.parse(layoutRoot).root) {
    throw new Error('macOS DMG layout root must be a specific directory');
  }
  const layoutStat = await lstat(layoutRoot).catch(() => null);
  if (!layoutStat || layoutStat.isSymbolicLink() || !layoutStat.isDirectory()) {
    throw new Error('macOS DMG layout root is missing or unsafe');
  }

  const entries = (await readdir(layoutRoot)).sort();
  if (entries.length !== EXPECTED_ENTRIES.length
      || entries.some((entry, index) => entry !== EXPECTED_ENTRIES[index])) {
    throw new Error(`macOS DMG layout entries are invalid: ${entries.join(', ') || 'none'}`);
  }

  const appPath = path.join(layoutRoot, MACOS_DMG_APP_NAME);
  const appStat = await lstat(appPath).catch(() => null);
  if (!appStat || appStat.isSymbolicLink() || !appStat.isDirectory()) {
    throw new Error('macOS DMG app must be a real directory');
  }

  const applicationsPath = path.join(layoutRoot, MACOS_DMG_APPLICATIONS_LINK_NAME);
  const applicationsStat = await lstat(applicationsPath).catch(() => null);
  if (!applicationsStat?.isSymbolicLink()) {
    throw new Error('macOS DMG Applications entry must be a symbolic link');
  }
  const applicationsTarget = await readlink(applicationsPath);
  if (applicationsTarget !== MACOS_DMG_APPLICATIONS_LINK_TARGET) {
    throw new Error('macOS DMG Applications link target is invalid');
  }

  const volumeIconPath = path.join(layoutRoot, MACOS_DMG_VOLUME_ICON_NAME);
  const volumeIconStat = await lstat(volumeIconPath).catch(() => null);
  if (!volumeIconStat || volumeIconStat.isSymbolicLink() || !volumeIconStat.isFile()
      || volumeIconStat.size < 1) {
    throw new Error('macOS DMG volume icon must be a non-empty regular file');
  }

  const finderMetadataPath = path.join(layoutRoot, MACOS_DMG_FINDER_METADATA_NAME);
  const finderMetadataStat = await lstat(finderMetadataPath).catch(() => null);
  if (!finderMetadataStat || finderMetadataStat.isSymbolicLink()
      || !finderMetadataStat.isFile() || finderMetadataStat.size < 1) {
    throw new Error('macOS DMG Finder metadata must be a non-empty regular file');
  }

  return {
    schemaVersion: 'ascii-vj-remix-macos-dmg-layout-v1',
    appName: MACOS_DMG_APP_NAME,
    applicationsLink: MACOS_DMG_APPLICATIONS_LINK_TARGET,
    entries
  };
}

export function mountPointsFromAttachPlist(value) {
  const entities = value?.['system-entities'];
  if (!Array.isArray(entities)) {
    throw new Error('macOS DMG attach response has no system entities');
  }
  const mountPoints = [];
  for (const entity of entities) {
    if (!entity || !Object.hasOwn(entity, 'mount-point')) continue;
    const mountPoint = entity['mount-point'];
    if (typeof mountPoint !== 'string' || !path.isAbsolute(mountPoint)) {
      throw new Error('macOS DMG attach response contains an invalid mount point');
    }
    mountPoints.push(mountPoint);
  }
  return mountPoints;
}

async function discoverMountedVolumes(mountRoot) {
  const entries = await readdir(mountRoot, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(mountRoot, entry.name));
}

async function detach(mountPoint) {
  try {
    await runTool('/usr/bin/hdiutil', ['detach', mountPoint]);
  } catch (error) {
    try {
      await runTool('/usr/bin/hdiutil', ['detach', '-force', mountPoint]);
    } catch {
      throw error;
    }
  }
}

export async function withMountedMacosDmg(dmgInput, callback = null) {
  if (process.platform !== 'darwin') {
    throw new Error('macOS DMG verification can only run on macOS');
  }
  const { dmgPath, dmgStat } = await validateDmgPath(dmgInput);
  const workRoot = await mkdtemp(path.join(os.tmpdir(), 'ascii-vj-remix-dmg-verify-'));
  const mountRoot = path.join(workRoot, 'mounts');
  const attachPlist = path.join(workRoot, 'attach.plist');
  await mkdir(mountRoot);
  let attachSucceeded = false;
  let mountPoints = [];
  let primaryError;
  let result;

  try {
    await runTool('/usr/bin/hdiutil', ['verify', dmgPath]);
    const attached = await runTool('/usr/bin/hdiutil', [
      'attach', '-readonly', '-nobrowse', '-noautoopen',
      '-mountroot', mountRoot, '-plist', dmgPath
    ]);
    attachSucceeded = true;
    await writeFile(attachPlist, attached.stdout, { flag: 'wx', mode: 0o600 });
    const converted = await runTool('/usr/bin/plutil', [
      '-convert', 'json', '-o', '-', attachPlist
    ]);
    mountPoints = mountPointsFromAttachPlist(JSON.parse(converted.stdout));
    if (mountPoints.length !== 1) {
      throw new Error(`macOS DMG must mount exactly one volume; found ${mountPoints.length}`);
    }

    const canonicalMountRoot = await realpath(mountRoot);
    const canonicalMountPoint = await realpath(mountPoints[0]);
    const containment = path.relative(canonicalMountRoot, canonicalMountPoint);
    if (!containment || containment === '..' || containment.startsWith(`..${path.sep}`)
        || path.isAbsolute(containment)) {
      throw new Error('macOS DMG mounted outside its private verification root');
    }

    const layout = await validateMacosDmgLayout(canonicalMountPoint);
    const mounted = {
      dmgPath,
      bytes: dmgStat.size,
      mountPoint: canonicalMountPoint,
      appPath: path.join(canonicalMountPoint, MACOS_DMG_APP_NAME),
      layout
    };
    const callbackResult = callback ? await callback(mounted) : undefined;
    result = {
      schemaVersion: 'ascii-vj-remix-macos-dmg-verification-v1',
      bytes: dmgStat.size,
      layout,
      callbackResult
    };
  } catch (error) {
    primaryError = error;
  } finally {
    if (attachSucceeded && mountPoints.length === 0) {
      mountPoints = await discoverMountedVolumes(mountRoot);
    }
    for (const mountPoint of [...new Set(mountPoints)].reverse()) {
      try {
        await detach(mountPoint);
      } catch (error) {
        primaryError ??= new Error(`failed to detach verified DMG: ${error.message}`);
      }
    }
    try {
      await rm(workRoot, { recursive: true, force: true });
    } catch (error) {
      primaryError ??= new Error(`failed to remove private DMG verification data: ${error.message}`);
    }
  }

  if (primaryError) throw primaryError;
  return result;
}

export async function verifyMacosDmgTrust(dmgInput) {
  if (process.platform !== 'darwin') {
    throw new Error('macOS DMG trust verification can only run on macOS');
  }
  const { dmgPath } = await validateDmgPath(dmgInput);
  await runTool('/usr/bin/codesign', ['--verify', '--strict', '--verbose=2', dmgPath]);
  const details = await runTool('/usr/bin/codesign', ['-dvvv', dmgPath]);
  const detailText = outputOf(details);
  if (!detailText.includes('Authority=Developer ID Application')) {
    throw new Error('macOS DMG is not signed with a Developer ID Application identity');
  }
  await runTool('/usr/bin/xcrun', ['stapler', 'validate', dmgPath]);
  const assessment = await runTool('/usr/sbin/spctl', [
    '-a', '-vv', '--type', 'open', '--context', 'context:primary-signature', dmgPath
  ]);
  const assessmentText = outputOf(assessment);
  if (!/accepted/i.test(assessmentText)) {
    throw new Error(`Gatekeeper did not accept macOS DMG: ${assessmentText}`);
  }
  return {
    schemaVersion: 'ascii-vj-remix-macos-dmg-trust-v1',
    dmgPath
  };
}
