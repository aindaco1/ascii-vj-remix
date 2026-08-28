#!/usr/bin/env node
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultApp = '/private/tmp/ascii-vj-remix-tauri-target/release/bundle/macos/ASCII VJ Remix Dev.app';
const sourceApp = process.env.ASCILINE_SOURCE_APP || defaultApp;
const durationMs = Math.max(9000, Number(process.env.ASCILINE_DENSITY_BENCH_DURATION_MS || '15000'));
const sampleMs = Math.max(120, Number(process.env.ASCILINE_DENSITY_BENCH_SAMPLE_MS || '250'));
const columns = String(process.env.ASCILINE_DENSITY_BENCH_COLUMNS || '480,600,640,720,900')
  .split(',')
  .map((value) => Math.round(Number(value)))
  .filter((value, index, values) => value >= 80 && value <= 900 && values.indexOf(value) === index);
const outputPath = process.env.ASCILINE_DENSITY_BENCH_REPORT_PATH || '';

if (!existsSync(sourceApp)) {
  console.error(`density-bench: missing optimized app: ${sourceApp}`);
  process.exit(1);
}
if (!columns.length) {
  console.error('density-bench: no valid columns in ASCILINE_DENSITY_BENCH_COLUMNS');
  process.exit(1);
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function appRssKb() {
  const pgrep = spawnSync('pgrep', ['-f', '/ASCII VJ Remix Dev.app/Contents/MacOS/ascii-vj-remix'], {
    encoding: 'utf8'
  });
  const pids = String(pgrep.stdout || '').trim().split(/\s+/).filter(Boolean);
  let total = 0;
  for (const pid of pids) {
    const ps = spawnSync('ps', ['-o', 'rss=', '-p', pid], { encoding: 'utf8' });
    const rss = Number(String(ps.stdout || '').trim());
    if (Number.isFinite(rss)) total += rss;
  }
  return total;
}

function hardwareSummary() {
  if (process.platform !== 'darwin') {
    return { platform: process.platform, arch: process.arch };
  }
  const profile = spawnSync('system_profiler', ['SPHardwareDataType', '-json'], {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024
  });
  try {
    const parsed = JSON.parse(profile.stdout || '{}');
    const hardware = parsed.SPHardwareDataType?.[0] || {};
    return {
      platform: process.platform,
      arch: process.arch,
      model: hardware.machine_model || hardware._name || 'unknown',
      chip: hardware.chip_type || 'unknown',
      memory: hardware.physical_memory || 'unknown'
    };
  } catch {
    return { platform: process.platform, arch: process.arch };
  }
}

async function runDensity(columnCount, tempDir) {
  const reportPath = path.join(tempDir, `density-${columnCount}.json`);
  const env = {
    ...process.env,
    ASCILINE_SOURCE_APP: sourceApp,
    ASCILINE_CODESIGN_IDENTITY: process.env.ASCILINE_CODESIGN_IDENTITY || '-',
    ASCILINE_ALLOW_ADHOC_LOCAL: process.env.ASCILINE_ALLOW_ADHOC_LOCAL || '1',
    ASCILINE_UI_PERF_SMOKE_DURATION_MS: String(durationMs),
    ASCILINE_UI_PERF_SMOKE_SAMPLE_MS: String(sampleMs),
    ASCILINE_UI_PERF_SMOKE_COLUMNS: String(columnCount),
    ASCILINE_UI_PERF_SMOKE_SYNTHETIC_AUDIO: '1',
    ASCILINE_UI_PERF_REPORT_PATH: reportPath
  };
  const child = spawn(process.execPath, ['scripts/smoke_ui_perf.mjs'], {
    cwd: root,
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    const text = String(chunk);
    stdout += text;
    process.stdout.write(text);
  });
  child.stderr.on('data', (chunk) => {
    const text = String(chunk);
    stderr += text;
    process.stderr.write(text);
  });
  const closePromise = new Promise((resolve) => child.once('close', resolve));

  const rssSamplesKb = [];
  while (child.exitCode === null) {
    await wait(500);
    const rss = appRssKb();
    if (rss > 0) rssSamplesKb.push(rss);
  }
  const exitCode = await closePromise;
  if (!existsSync(reportPath)) {
    return { columns: columnCount, exitCode, error: 'missing report', stdout, stderr };
  }
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  return {
    ...report,
    exitCode,
    rssSampleCount: rssSamplesKb.length,
    rssPeakMb: rssSamplesKb.length ? Math.max(...rssSamplesKb) / 1024 : 0,
    rssMinMb: rssSamplesKb.length ? Math.min(...rssSamplesKb) / 1024 : 0
  };
}

const tempDir = mkdtempSync(path.join(tmpdir(), 'ascii-vj-density-bench-'));
const result = {
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  sourceApp,
  durationMs,
  sampleMs,
  hardware: hardwareSummary(),
  runs: []
};

for (const columnCount of columns) {
  console.log(`\nDensity benchmark: columns=${columnCount}`);
  result.runs.push(await runDensity(columnCount, tempDir));
}

const encoded = `${JSON.stringify(result, null, 2)}\n`;
if (outputPath) writeFileSync(outputPath, encoded);
console.log('\nDensity benchmark summary:');
for (const run of result.runs) {
  const popout = run.phases?.popout || {};
  console.log([
    `cols=${run.columns}`,
    `main=${Number(run.phases?.main?.mainAvgFps || 0).toFixed(1)}fps`,
    `popout=${Number(popout.mainAvgFps || 0).toFixed(1)}fps`,
    `popoutP95=${Number(popout.mainP95FrameMs || 0).toFixed(2)}ms`,
    `peakRss=${Number(run.rssPeakMb || 0).toFixed(1)}MB`,
    `exit=${run.exitCode}`
  ].join(' '));
}

if (result.runs.some((run) => run.error)) process.exit(1);
