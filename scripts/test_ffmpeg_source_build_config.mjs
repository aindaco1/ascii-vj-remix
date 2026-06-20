import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

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
assert.match(config.source, /Official FFmpeg 8\.1\.2 source release/);
assert.match(config.flags, /--disable-network/);
assert.match(config.flags, /--disable-autodetect/);
assert.doesNotMatch(config.flags, /--enable-gpl/);
assert.doesNotMatch(config.flags, /--enable-nonfree/);

console.log('FFmpeg source-build config test passed.');
