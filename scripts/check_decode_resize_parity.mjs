import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const workRoot = path.join(root, 'tmp', 'decode-resize-parity');
const pythonOut = path.join(workRoot, 'python');
const rustOut = path.join(workRoot, 'rust');
const pythonOutRel = path.relative(root, pythonOut);
const video = process.env.DECODE_RESIZE_VIDEO || 'media/point-click-test.mp4';
const width = Number(process.env.DECODE_RESIZE_WIDTH || 96);
const height = Number(process.env.DECODE_RESIZE_HEIGHT || 54);
const frames = Number(process.env.DECODE_RESIZE_FRAMES || 12);
const files = [
  { name: 'rgb.bin', frameBytes: width * height * 3, meanMax: 14, p99Max: 80, channel: 'all' },
  { name: 'pixel.bin', frameBytes: width * height * 3, meanMax: 14, p99Max: 80, channel: 'all' },
  { name: 'ascii_m5.bin', frameBytes: width * height * 4, meanMax: 40, p99Max: 130, channel: 'all' },
  { name: 'ascii_m5.bin', frameBytes: width * height * 4, meanMax: 8, p99Max: 40, channel: 'glyph', label: 'ascii_m5.glyph' },
  { name: 'ascii_m5.bin', frameBytes: width * height * 4, meanMax: 14, p99Max: 80, channel: 'color', label: 'ascii_m5.color' }
];
const palette = " `.-':_,^=;><+!rc*/z?sLTv)J7(|Fi{C}fI31tlu[neoZ5Yxjya]2ESwqkP6h9d4VpOGbUAKXHm8RD#$Bg0MNWQ%&@";
const paletteRank = new Map([...Buffer.from(palette, 'ascii')].map((byte, index) => [byte, index]));

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: options.stdio || 'pipe',
    env: { ...process.env, ...options.env },
    shell: process.platform === 'win32'
  });
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`${command} ${args.join(' ')} failed with status ${result.status}${detail ? `\n${detail}` : ''}`);
  }
  return result;
}

function hostPythonHasDeps() {
  const result = spawnSync('python3', ['-c', 'import cv2, numpy'], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'pipe',
    shell: process.platform === 'win32'
  });
  return result.status === 0;
}

function generatePythonReference() {
  const args = [
    'experiments/decode_resize_reference.py',
    '--video',
    video,
    '--out',
    pythonOutRel,
    '--width',
    String(width),
    '--height',
    String(height),
    '--frames',
    String(frames)
  ];

  if (hostPythonHasDeps()) {
    run('python3', args);
    return 'host-python';
  }

  run('bash', ['scripts/podman_run.sh', 'python', ...args], {
    env: {
      ASCILINE_PORT_CHECK: '0',
      PORT: '18081',
      HOST_PORT: '18081',
      CONTAINER_PORT: '18081'
    }
  });
  return 'podman-python';
}

function generateRustCandidate() {
  run('node', [
    'scripts/cargo_env.mjs',
    'run',
    '--manifest-path',
    'src-tauri/Cargo.toml',
    '--example',
    'decode_resize_fixture',
    '--',
    video,
    String(width),
    String(height),
    String(frames),
    rustOut
  ]);
}

function diffStats(expected, actual, spec) {
  if (expected.length !== actual.length) {
    return {
      file: spec.label || spec.name,
      expectedLength: expected.length,
      actualLength: actual.length,
      lengthMismatch: true
    };
  }

  const diffs = [];
  for (let idx = 0; idx < expected.length; idx += 1) {
    if (spec.channel === 'glyph' && idx % 4 !== 0) continue;
    if (spec.channel === 'color' && idx % 4 === 0) continue;
    if (spec.channel === 'glyph') {
      diffs.push(Math.abs((paletteRank.get(expected[idx]) ?? 0) - (paletteRank.get(actual[idx]) ?? 0)));
    } else {
      diffs.push(Math.abs(expected[idx] - actual[idx]));
    }
  }
  diffs.sort((a, b) => a - b);
  const sum = diffs.reduce((acc, value) => acc + value, 0);
  const nonzero = diffs.filter((value) => value !== 0).length;
  const percentile = (p) => diffs[Math.min(diffs.length - 1, Math.floor((diffs.length - 1) * p))] || 0;
  return {
    file: spec.label || spec.name,
    samples: diffs.length,
    exactPercent: Number((100 * (1 - nonzero / Math.max(1, diffs.length))).toFixed(3)),
    meanAbs: Number((sum / Math.max(1, diffs.length)).toFixed(3)),
    p95: percentile(0.95),
    p99: percentile(0.99),
    max: diffs[diffs.length - 1] || 0,
    threshold: {
      meanMax: spec.meanMax,
      p99Max: spec.p99Max
    },
    pass: sum / Math.max(1, diffs.length) <= spec.meanMax && percentile(0.99) <= spec.p99Max
  };
}

rmSync(workRoot, { recursive: true, force: true });
mkdirSync(workRoot, { recursive: true });

const source = generatePythonReference();
if (!existsSync(path.join(pythonOut, 'rgb.bin'))) {
  throw new Error('Python reference did not generate rgb.bin');
}
generateRustCandidate();

const results = files.map((spec) =>
  diffStats(readFileSync(path.join(pythonOut, spec.name)), readFileSync(path.join(rustOut, spec.name)), spec)
);
const summary = {
  source,
  video,
  width,
  height,
  frames,
  pythonMeta: JSON.parse(readFileSync(path.join(pythonOut, 'meta.json'), 'utf8')),
  rustMeta: JSON.parse(readFileSync(path.join(rustOut, 'meta.json'), 'utf8')),
  results
};
console.log(JSON.stringify(summary, null, 2));

const failures = results.filter((result) => result.lengthMismatch || !result.pass);
if (failures.length) {
  throw new Error(`decode/resize parity failed for ${failures.map((failure) => failure.file).join(', ')}`);
}
