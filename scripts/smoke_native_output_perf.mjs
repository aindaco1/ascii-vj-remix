#!/usr/bin/env node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { hostPlatformId } from './lib/ffmpeg_resource_policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tempDir = mkdtempSync(path.join(tmpdir(), 'asciline-native-output-smoke-'));
const reportPath = path.resolve(process.env.ASCILINE_NATIVE_OUTPUT_REPORT_PATH || path.join(tempDir, 'report.json'));
mkdirSync(path.dirname(reportPath), {recursive:true});
const logPath = path.join(tmpdir(), 'asciline-native-output.log');
const defaultReleaseApp =
  '/private/tmp/ascii-vj-remix-tauri-target/release/bundle/macos/ASCII VJ Remix Dev.app';
const sourceApp = process.env.ASCILINE_SOURCE_APP || (process.platform === 'darwin'
  ? defaultReleaseApp
  : path.join(root, 'src-tauri', 'target', 'release', `ascii-vj-remix${process.platform === 'win32' ? '.exe' : ''}`));

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
    ...options
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

if (!existsSync(sourceApp)) {
  console.error(`native-output-smoke: missing optimized app: ${sourceApp}`);
  console.error('Build one first, for example: npm run tauri:build:dev -- --bundles app');
  process.exit(1);
}

rmSync(logPath, { force: true });

const launchEnv = {
  ...process.env,
  ASCILINE_SOURCE_APP: sourceApp,
  ASCILINE_FOREGROUND: '1',
  ASCILINE_SYNC_SYSTEM_APP: process.env.ASCILINE_SYNC_SYSTEM_APP || '0',
  ASCILINE_NATIVE_OUTPUT_SMOKE: '1',
  ASCILINE_NATIVE_OUTPUT_SMOKE_MEDIA:
    process.env.ASCILINE_NATIVE_OUTPUT_SMOKE_MEDIA || 'media/point-click-test-30s.mp4',
  ASCILINE_NATIVE_OUTPUT_SMOKE_DURATION_MS:
    process.env.ASCILINE_NATIVE_OUTPUT_SMOKE_DURATION_MS || '7000',
  ASCILINE_DESKTOP_SMOKE_REPORT: reportPath
};

// The unbundled Windows/Linux executable has no installer resource directory.
// Use the same verified sidecars that bundle:test just packaged, never PATH.
if (process.platform !== 'darwin') {
  run(process.execPath, ['scripts/check_ffmpeg_resources.mjs', '--require-current-platform']);
  const sidecars = path.join(root, 'src-tauri', 'resources', 'ffmpeg', hostPlatformId(), 'bin');
  const suffix = process.platform === 'win32' ? '.exe' : '';
  launchEnv.ASCILINE_FFMPEG = path.join(sidecars, `ffmpeg${suffix}`);
  launchEnv.ASCILINE_FFPROBE = path.join(sidecars, `ffprobe${suffix}`);
}

const launch = spawnSync(process.platform === 'darwin' ? 'bash' : sourceApp,
  process.platform === 'darwin' ? ['scripts/run_local_desktop_app.sh'] : [], {
  cwd: root,
  stdio: 'inherit',
  env: launchEnv,
  timeout: Number(launchEnv.ASCILINE_NATIVE_OUTPUT_SMOKE_DURATION_MS) + 90000
});

if (launch.status !== 0) {
  process.exit(launch.status || 1);
}

if (!existsSync(reportPath)) throw new Error('Native output smoke did not produce a report');
{
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  if (!report.ok || !report.opens?.length) throw new Error(`Native presentation failed: ${JSON.stringify(report)}`);
  console.log(`Native output opens: ${JSON.stringify(report.opens)}`);
  console.log(
    `Native output smoke: ok=${report.ok} backend=${report.backend || 'unknown'} media=${report.media_url || 'unknown'} elapsed=${report.elapsed_ms}ms`
  );
}

if (process.platform === 'darwin') run(process.execPath, ['scripts/analyze_native_output_log.mjs', logPath]);
