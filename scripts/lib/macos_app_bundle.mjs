import { lstat, readFile, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const REQUIRED_USAGE_KEYS = Object.freeze([
  'NSCameraUsageDescription',
  'NSMicrophoneUsageDescription',
  'NSScreenCaptureUsageDescription'
]);

async function fileExists(filePath) {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

function commandOutput(result) {
  return `${result.stdout || ''}${result.stderr || ''}`.trim();
}

export async function inspectMacosAppBundle(appPath, options = {}) {
  const expectedBundleId = options.expectedBundleId || '';
  const requiredFfmpegPlatforms = options.requiredFfmpegPlatforms || [];
  const verifyCodesign = options.verifyCodesign !== false;
  const issues = [];
  const appStat = await lstat(appPath).catch(() => null);
  if (!appStat || appStat.isSymbolicLink() || !appStat.isDirectory()) {
    return {
      appPath,
      bundleIdentifier: '',
      version: '',
      executable: '',
      issues: ['macOS app bundle must be a real directory']
    };
  }

  const contents = path.join(appPath, 'Contents');
  const infoPlistPath = path.join(contents, 'Info.plist');
  const resources = path.join(contents, 'Resources');
  const macos = path.join(contents, 'MacOS');

  if (!(await fileExists(infoPlistPath))) issues.push('macOS bundle is missing Contents/Info.plist');
  if (!(await fileExists(path.join(resources, 'icon.icns')))) {
    issues.push('macOS bundle is missing Contents/Resources/icon.icns');
  }

  const plist = await readFile(infoPlistPath, 'utf8').catch(() => '');
  const identifierMatch = plist.match(/<key>CFBundleIdentifier<\/key>\s*<string>([^<]+)<\/string>/);
  const versionMatch = plist.match(/<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/);
  const executableMatch = plist.match(/<key>CFBundleExecutable<\/key>\s*<string>([^<]+)<\/string>/);
  const bundleIdentifier = identifierMatch?.[1] || '';
  const version = versionMatch?.[1] || '';
  const executable = executableMatch?.[1] || '';

  if (expectedBundleId && bundleIdentifier !== expectedBundleId) {
    issues.push(`macOS bundle identifier ${bundleIdentifier || '(missing)'} does not match ${expectedBundleId}`);
  }
  if (!version) issues.push('macOS bundle version is missing');
  if (!executable || !(await fileExists(path.join(macos, executable)))) {
    issues.push('macOS bundle executable declared in Info.plist is missing');
  }

  for (const key of REQUIRED_USAGE_KEYS) {
    if (!plist.includes(`<key>${key}</key>`)) issues.push(`macOS bundle Info.plist is missing ${key}`);
  }

  const bundledFfmpegRoot = path.join(resources, 'resources', 'ffmpeg');
  if (!(await fileExists(path.join(bundledFfmpegRoot, 'README.md')))) {
    issues.push('macOS bundle is missing resources/ffmpeg/README.md');
  }
  for (const platform of requiredFfmpegPlatforms) {
    const platformDir = path.join(bundledFfmpegRoot, platform);
    for (const required of ['manifest.json', 'NOTICE.md']) {
      if (!(await fileExists(path.join(platformDir, required)))) {
        issues.push(`macOS bundle is missing resources/ffmpeg/${platform}/${required}`);
      }
    }
  }

  if (verifyCodesign) {
    const verify = spawnSync('/usr/bin/codesign', [
      '--verify', '--deep', '--strict', '--verbose=2', appPath
    ], { encoding: 'utf8' });
    if (verify.error) {
      issues.push(`macOS .app codesign verification failed to start: ${verify.error.message}`);
    } else if (verify.status !== 0) {
      issues.push(`macOS .app bundle is not codesign-valid: ${commandOutput(verify)}`);
    }

    const details = spawnSync('/usr/bin/codesign', [
      '-dv', '--verbose=4', appPath
    ], { encoding: 'utf8' });
    const signatureDetails = commandOutput(details);
    if (details.error) {
      issues.push(`macOS .app signature inspection failed to start: ${details.error.message}`);
    } else if (details.status !== 0) {
      issues.push(`macOS .app bundle signature details could not be read: ${signatureDetails}`);
    } else if (!/Signature=adhoc|Authority=/.test(signatureDetails)) {
      issues.push('macOS .app bundle does not report an ad-hoc or certificate authority signature');
    }
  }

  return {
    appPath,
    bundleIdentifier,
    version,
    executable,
    issues
  };
}

export function assertMacosAppBundleInspection(inspection, label = 'macOS app bundle') {
  if (inspection.issues.length > 0) {
    throw new Error(`${label} check failed:\n- ${inspection.issues.join('\n- ')}`);
  }
  return inspection;
}
