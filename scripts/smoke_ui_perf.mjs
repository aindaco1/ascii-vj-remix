#!/usr/bin/env node
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nativeLogPath = path.join(tmpdir(), 'asciline-native-output.log');
const mediaLogPath = '/tmp/asciline-media-diagnostics.log';
const defaultReleaseApp = '/private/tmp/ascii-vj-remix-tauri-target/release/bundle/macos/ASCII VJ Remix Dev.app';
const releaseApp = process.env.ASCILINE_SOURCE_APP || defaultReleaseApp;
const durationMs = Number(process.env.ASCILINE_UI_PERF_SMOKE_DURATION_MS || '9000');
const sampleMs = Number(process.env.ASCILINE_UI_PERF_SMOKE_SAMPLE_MS || '500');

if (!existsSync(releaseApp)) {
  console.error(`ui-perf-smoke: missing optimized app: ${releaseApp}`);
  console.error('Build one first: npm run tauri:build:dev -- --bundles app');
  process.exit(1);
}

rmSync(nativeLogPath, { force: true });
rmSync(mediaLogPath, { force: true });

const env = {
  ...process.env,
  ASCILINE_SOURCE_APP: releaseApp,
  ASCILINE_SYNC_SYSTEM_APP: process.env.ASCILINE_SYNC_SYSTEM_APP || '0',
  ASCILINE_FOREGROUND: process.env.ASCILINE_UI_PERF_SMOKE_FOREGROUND || '0',
  ASCILINE_UI_PERF_SMOKE: '1',
  ASCILINE_UI_PERF_SMOKE_DURATION_MS: String(durationMs || 9000),
  ASCILINE_UI_PERF_SMOKE_SAMPLE_MS: String(sampleMs || 500),
  ASCILINE_UI_PERF_SMOKE_BACKEND: process.env.ASCILINE_UI_PERF_SMOKE_BACKEND || 'auto',
  ASCILINE_UI_PERF_SMOKE_PALETTE: process.env.ASCILINE_UI_PERF_SMOKE_PALETTE || 'none',
  ASCILINE_UI_PERF_SMOKE_DITHER: process.env.ASCILINE_UI_PERF_SMOKE_DITHER || 'none',
  ASCILINE_UI_PERF_SMOKE_CHARSET: process.env.ASCILINE_UI_PERF_SMOKE_CHARSET || 'point-click',
  ASCILINE_UI_PERF_SMOKE_MEDIA:
    process.env.ASCILINE_UI_PERF_SMOKE_MEDIA || 'media/point-click-test-30s.mp4'
};

const launch = spawnSync('bash', ['scripts/run_local_desktop_app.sh'], {
  cwd: root,
  stdio: 'inherit',
  env
});

if (launch.status !== 0) {
  process.exit(launch.status || 1);
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let reportLine = null;
const deadline = Date.now() + Math.max(30000, durationMs + 25000);
while (Date.now() < deadline) {
  if (existsSync(mediaLogPath)) {
    reportLine = readFileSync(mediaLogPath, 'utf8')
      .split(/\r?\n/)
      .filter((line) => line.includes('[ASCILINE_UI_PERF_REPORT]'))
      .at(-1);
    if (reportLine) break;
  }
  await wait(250);
}

if (!reportLine) {
  console.error('ui-perf-smoke: no ASCILINE_UI_PERF_REPORT found');
  process.exit(1);
}

const jsonStart = reportLine.indexOf('{');
const report = JSON.parse(reportLine.slice(jsonStart));
const phaseValues = Object.values(report.phases || {});
const phaseAverage = (key) => phaseValues.length
  ? phaseValues.reduce((sum, phase) => sum + Number(phase?.[key] || 0), 0) / phaseValues.length
  : 0;
report.mainAvgFps ??= phaseAverage('mainAvgFps');
report.mainMinFps ??= phaseValues.length
  ? Math.min(...phaseValues.map((phase) => Number(phase?.mainMinFps || 0)))
  : 0;
report.mainP95FrameMs ??= phaseValues.length
  ? Math.max(...phaseValues.map((phase) => Number(phase?.mainP95FrameMs || 0)))
  : 0;
report.mainP99FrameMs ??= phaseValues.length
  ? Math.max(...phaseValues.map((phase) => Number(phase?.mainP99FrameMs || 0)))
  : 0;
const reportPath = process.env.ASCILINE_UI_PERF_REPORT_PATH;
if (reportPath) {
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

console.log([
  'UI perf smoke:',
  `ok=${report.ok}`,
  `mainAvg=${Number(report.mainAvgFps || 0).toFixed(1)}fps`,
  `mainMin=${Number(report.mainMinFps || 0).toFixed(1)}fps`,
  `p95=${Number(report.mainP95FrameMs || 0).toFixed(2)}ms`,
  `p99=${Number(report.mainP99FrameMs || 0).toFixed(2)}ms`,
  `cols=${report.columns || 0}`,
  `audio=${report.syntheticAudio ? 'synthetic' : 'runtime'}`,
  `nativeOk=${Number(report.nativeOkHz || 0).toFixed(1)}hz`,
  `nativeFailed=${report.nativeFailed || 0}`,
  `displays=${report.outputDisplayCount || 0}`,
  `backend=${report.actualBackends?.join(',') || report.backend || 'unknown'}`,
  `palette=${report.paletteId || 'none'}`,
  `dither=${report.ditherMode || 'none'}`,
  `charset=${report.charset || 'point-click'}`,
  `media=${report.mediaUrl || 'unknown'}`
].join(' '));

if (report.phases) {
  for (const [phase, stats] of Object.entries(report.phases)) {
    console.log([
      `  ${phase}:`,
      `mainAvg=${Number(stats.mainAvgFps || 0).toFixed(1)}fps`,
      `mainMin=${Number(stats.mainMinFps || 0).toFixed(1)}fps`,
      `p95=${Number(stats.mainP95FrameMs || 0).toFixed(2)}ms`,
      `p99=${Number(stats.mainP99FrameMs || 0).toFixed(2)}ms`,
      `nativeOk=${Number(stats.nativeOkHz || 0).toFixed(1)}hz`
    ].join(' '));
  }
}

if (!report.ok) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

const analyzer = spawnSync(process.execPath, ['scripts/analyze_native_output_log.mjs', nativeLogPath], {
  cwd: root,
  stdio: 'inherit',
  env: process.env
});

if (analyzer.status !== 0) {
  process.exit(analyzer.status || 1);
}
