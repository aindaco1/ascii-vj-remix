#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  mkdir,
  mkdtemp,
  rm,
  symlink,
  unlink,
  writeFile
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  assertMacosAppBundleInspection,
  inspectMacosAppBundle
} from './lib/macos_app_bundle.mjs';
import {
  MACOS_DMG_APP_NAME,
  findSingleMacosDmg,
  mountPointsFromAttachPlist,
  validateMacosDmgLayout
} from './lib/macos_dmg.mjs';

const roots = [];

async function tempRoot(prefix) {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  roots.push(root);
  return root;
}

async function layoutFixture() {
  const root = await tempRoot('ascii-vj-dmg-layout-');
  await mkdir(path.join(root, MACOS_DMG_APP_NAME));
  await symlink('/Applications', path.join(root, 'Applications'));
  await writeFile(path.join(root, '.DS_Store'), 'finder');
  await writeFile(path.join(root, '.VolumeIcon.icns'), 'icon');
  return root;
}

async function appBundleFixture() {
  const root = await tempRoot('ascii-vj-app-bundle-');
  const appPath = path.join(root, MACOS_DMG_APP_NAME);
  const resources = path.join(appPath, 'Contents', 'Resources');
  const macos = path.join(appPath, 'Contents', 'MacOS');
  const ffmpeg = path.join(resources, 'resources', 'ffmpeg', 'macos-aarch64');
  await mkdir(macos, { recursive: true });
  await mkdir(ffmpeg, { recursive: true });
  await writeFile(path.join(appPath, 'Contents', 'Info.plist'), `<?xml version="1.0"?>
<plist><dict>
<key>CFBundleIdentifier</key><string>com.asciline.remix</string>
<key>CFBundleShortVersionString</key><string>0.9.6</string>
<key>CFBundleExecutable</key><string>ascii-vj-remix</string>
<key>NSCameraUsageDescription</key><string>Camera</string>
<key>NSMicrophoneUsageDescription</key><string>Microphone</string>
<key>NSScreenCaptureUsageDescription</key><string>Screen</string>
</dict></plist>
`);
  await writeFile(path.join(macos, 'ascii-vj-remix'), 'binary');
  await writeFile(path.join(resources, 'icon.icns'), 'icon');
  await writeFile(path.join(resources, 'resources', 'ffmpeg', 'README.md'), 'policy');
  await writeFile(path.join(ffmpeg, 'manifest.json'), '{}');
  await writeFile(path.join(ffmpeg, 'NOTICE.md'), 'notice');
  return appPath;
}

try {
  const valid = await layoutFixture();
  assert.deepEqual(await validateMacosDmgLayout(valid), {
    schemaVersion: 'ascii-vj-remix-macos-dmg-layout-v1',
    appName: 'ASCII VJ Remix.app',
    applicationsLink: '/Applications',
    entries: ['.DS_Store', '.VolumeIcon.icns', 'ASCII VJ Remix.app', 'Applications']
  });

  const withoutFinderMetadata = await layoutFixture();
  await unlink(path.join(withoutFinderMetadata, '.DS_Store'));
  assert.deepEqual(await validateMacosDmgLayout(withoutFinderMetadata), {
    schemaVersion: 'ascii-vj-remix-macos-dmg-layout-v1',
    appName: 'ASCII VJ Remix.app',
    applicationsLink: '/Applications',
    entries: ['.VolumeIcon.icns', 'ASCII VJ Remix.app', 'Applications']
  });

  const missingApplications = await layoutFixture();
  await unlink(path.join(missingApplications, 'Applications'));
  await assert.rejects(validateMacosDmgLayout(missingApplications), /entries are invalid/);

  for (const invalidTarget of ['/tmp', 'Applications']) {
    const redirected = await layoutFixture();
    await unlink(path.join(redirected, 'Applications'));
    await symlink(invalidTarget, path.join(redirected, 'Applications'));
    await assert.rejects(validateMacosDmgLayout(redirected), /link target is invalid/);
  }

  const applicationsDirectory = await layoutFixture();
  await unlink(path.join(applicationsDirectory, 'Applications'));
  await mkdir(path.join(applicationsDirectory, 'Applications'));
  await assert.rejects(validateMacosDmgLayout(applicationsDirectory), /must be a symbolic link/);

  const linkedApp = await layoutFixture();
  await rm(path.join(linkedApp, MACOS_DMG_APP_NAME), { recursive: true });
  await symlink('/tmp', path.join(linkedApp, MACOS_DMG_APP_NAME));
  await assert.rejects(validateMacosDmgLayout(linkedApp), /app must be a real directory/);

  const missingIcon = await layoutFixture();
  await unlink(path.join(missingIcon, '.VolumeIcon.icns'));
  await assert.rejects(validateMacosDmgLayout(missingIcon), /entries are invalid/);

  const linkedIcon = await layoutFixture();
  await unlink(path.join(linkedIcon, '.VolumeIcon.icns'));
  await symlink('/tmp/icon.icns', path.join(linkedIcon, '.VolumeIcon.icns'));
  await assert.rejects(validateMacosDmgLayout(linkedIcon), /volume icon must be/);

  const linkedFinderMetadata = await layoutFixture();
  await unlink(path.join(linkedFinderMetadata, '.DS_Store'));
  await symlink('/tmp/.DS_Store', path.join(linkedFinderMetadata, '.DS_Store'));
  await assert.rejects(validateMacosDmgLayout(linkedFinderMetadata), /Finder metadata must be/);

  const emptyFinderMetadata = await layoutFixture();
  await writeFile(path.join(emptyFinderMetadata, '.DS_Store'), '');
  await assert.rejects(validateMacosDmgLayout(emptyFinderMetadata), /Finder metadata must be/);

  const extraEntry = await layoutFixture();
  await writeFile(path.join(extraEntry, 'Read Me.txt'), 'unexpected');
  await assert.rejects(validateMacosDmgLayout(extraEntry), /entries are invalid/);

  assert.deepEqual(mountPointsFromAttachPlist({
    'system-entities': [
      { 'dev-entry': '/dev/disk4' },
      { 'mount-point': '/private/tmp/verify/ASCII VJ Remix' }
    ]
  }), ['/private/tmp/verify/ASCII VJ Remix']);
  assert.throws(() => mountPointsFromAttachPlist({}), /no system entities/);
  assert.throws(() => mountPointsFromAttachPlist({
    'system-entities': [{ 'mount-point': 'relative' }]
  }), /invalid mount point/);

  const bundleRoot = await tempRoot('ascii-vj-dmg-discovery-');
  await mkdir(path.join(bundleRoot, 'dmg'));
  const dmgPath = path.join(bundleRoot, 'dmg', 'ASCII.VJ.Remix_0.9.6_aarch64.dmg');
  await writeFile(dmgPath, 'image');
  assert.equal(await findSingleMacosDmg(bundleRoot), dmgPath);
  await writeFile(path.join(bundleRoot, 'dmg', 'duplicate.dmg'), 'image');
  await assert.rejects(findSingleMacosDmg(bundleRoot), /exactly one macOS DMG/);

  const appPath = await appBundleFixture();
  const appInspection = await inspectMacosAppBundle(appPath, {
    expectedBundleId: 'com.asciline.remix',
    requiredFfmpegPlatforms: ['macos-aarch64'],
    verifyCodesign: false
  });
  assertMacosAppBundleInspection(appInspection);
  assert.equal(appInspection.version, '0.9.6');
  assert.equal(appInspection.executable, 'ascii-vj-remix');

  await unlink(path.join(appPath, 'Contents', 'Resources', 'resources', 'ffmpeg', 'macos-aarch64', 'NOTICE.md'));
  const brokenAppInspection = await inspectMacosAppBundle(appPath, {
    expectedBundleId: 'com.asciline.remix',
    requiredFfmpegPlatforms: ['macos-aarch64'],
    verifyCodesign: false
  });
  assert.match(brokenAppInspection.issues.join('\n'), /NOTICE\.md/);

  console.log('macOS DMG layout tests passed.');
} finally {
  for (const root of roots.reverse()) {
    await rm(root, { recursive: true, force: true });
  }
}
