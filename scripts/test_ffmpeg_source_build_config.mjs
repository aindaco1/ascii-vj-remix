import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { macosDeploymentTarget } from './lib/macos_deployment_target.mjs';

const result = spawnSync('bash', ['scripts/build_ffmpeg_sidecar.sh', '--print-config'], {
  encoding: 'utf8',
  maxBuffer: 1024 * 1024
});

assert.equal(result.status, 0, result.stderr || result.stdout);

const config = Object.fromEntries(
  result.stdout
    .trim()
    .split(/\r?\n/)
    .map((line) => {
      const index = line.indexOf('=');
      assert.notEqual(index, -1, `invalid config line: ${line}`);
      return [line.slice(0, index), line.slice(index + 1)];
    })
);

assert.equal(config.version, '8.1.2');
assert.equal(config.sha256, '464beb5e7bf0c311e68b45ae2f04e9cc2af88851abb4082231742a74d97b524c');
assert.equal(config.license, 'LGPL-2.1-or-later');
assert.match(config.url, /^https:\/\/ffmpeg\.org\/releases\/ffmpeg-8\.1\.2\.tar\.xz$/);
assert.equal(config.fallback_url, 'https://distfiles.macports.org/ffmpeg/ffmpeg-8.1.2.tar.xz');
assert.match(config.source, /Official FFmpeg 8\.1\.2 source release/);
assert.match(config.download_flags, /--fail/);
assert.match(config.download_flags, /--retry 5/);
assert.match(config.download_flags, /--retry-all-errors/);
assert.match(config.download_flags, /--connect-timeout 30/);
assert.match(config.flags, /--disable-network/);
assert.match(config.flags, /--disable-autodetect/);
assert.doesNotMatch(config.flags, /--enable-gpl/);
assert.doesNotMatch(config.flags, /--enable-nonfree/);
if (process.platform === 'linux') assert.match(config.flags, /--enable-indev=v4l2/);
if (process.platform === 'win32') assert.match(config.flags, /--enable-indev=dshow/);
if (process.platform === 'darwin') {
  assert.ok(config.flags.includes(`--extra-cflags=-mmacosx-version-min=${macosDeploymentTarget}`));
  assert.ok(config.flags.includes(`--extra-ldflags=-mmacosx-version-min=${macosDeploymentTarget}`));
}

// Exercise failed/partial downloads and checksum enforcement without compiling FFmpeg.
const fixture = 'verified FFmpeg download fixture\n';
const fixtureHash = createHash('sha256').update(fixture).digest('hex');
const temp = mkdtempSync(join(tmpdir(), 'asciline-ffmpeg-download-test-'));
try {
  const bin = join(temp, 'bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'curl'), `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const url = args.find(arg => arg.startsWith('https://'));
fs.appendFileSync(process.env.DOWNLOAD_LOG, url + '\\n');
const mirror = url.includes('distfiles.macports.org');
const mode = process.env.DOWNLOAD_TEST_MODE;
const fails = mode === 'both-fail' || (mode !== 'primary-success' && !mirror);
fs.writeFileSync(args[args.indexOf('-o') + 1], fails || mode === 'bad-hash' ? 'partial or corrupt' : ${JSON.stringify(fixture)});
process.exit(fails ? 28 : 0);
`, { mode: 0o755 });
  writeFileSync(join(bin, 'tar'), '#!/bin/sh\nprintf extracted > "$EXTRACT_MARKER"\nexit 77\n', { mode: 0o755 });
  for (const mode of ['primary-success', 'fallback-success', 'bad-hash', 'both-fail', 'custom-fail']) {
    const work = join(temp, mode);
    mkdirSync(work);
    const log = join(work, 'download.log');
    const marker = join(work, 'extracted');
    const run = spawnSync('bash', ['scripts/build_ffmpeg_sidecar.sh'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${bin}${delimiter}${process.env.PATH}`,
        ASCILINE_FFMPEG_BUILD_DIR: work.replaceAll('\\', '/'),
        ASCILINE_FFMPEG_SHA256: fixtureHash,
        ASCILINE_FFMPEG_URL: mode === 'custom-fail' ? 'https://example.invalid/custom.tar.xz' : '',
        DOWNLOAD_LOG: log.replaceAll('\\', '/'),
        EXTRACT_MARKER: marker.replaceAll('\\', '/'),
        DOWNLOAD_TEST_MODE: mode
      }
    });
    const urls = readFileSync(log, 'utf8').trim().split('\n');
    const succeeded = mode === 'primary-success' || mode === 'fallback-success';
    assert.equal(run.status, succeeded ? 77 : 1, `${mode}: ${run.stderr}`);
    assert.equal(existsSync(marker), succeeded, `${mode}: extraction must require a verified hash`);
    assert.equal(existsSync(join(work, 'ffmpeg-8.1.2.tar.xz.partial')), false, mode);
    assert.deepEqual(urls, mode === 'custom-fail'
      ? ['https://example.invalid/custom.tar.xz']
      : mode === 'primary-success' ? [config.url] : [config.url, config.fallback_url], mode);
    if (succeeded) assert.equal(readFileSync(join(work, 'ffmpeg-8.1.2.tar.xz'), 'utf8'), fixture);
    if (mode === 'bad-hash') assert.match(run.stderr, /FFmpeg source hash mismatch/);
  }
} finally {
  rmSync(temp, { recursive: true, force: true });
}

console.log('FFmpeg source-build config and download tests passed.');
