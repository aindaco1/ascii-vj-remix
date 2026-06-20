import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const workRoot = path.join(root, 'tmp', 'frame-prep-parity');
const pythonOut = path.join(workRoot, 'python');
const rustOut = path.join(workRoot, 'rust');
const pythonOutRel = path.relative(root, pythonOut);
const width = Number(process.env.FRAME_PREP_WIDTH || 17);
const height = Number(process.env.FRAME_PREP_HEIGHT || 11);
const files = ['text.txt', 'pixel.bin', 'ascii_m2.bin', 'ascii_m3.bin', 'ascii_m4.bin', 'ascii_m5.bin'];

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
    'experiments/frame_prep_reference.py',
    '--out',
    pythonOutRel,
    '--width',
    String(width),
    '--height',
    String(height)
  ];

  if (hostPythonHasDeps()) {
    run('python3', args);
    return 'host-python';
  }

  run('bash', ['scripts/podman_run.sh', 'python', ...args], {
    env: {
      ASCILINE_PORT_CHECK: '0',
      PORT: '18080',
      HOST_PORT: '18080',
      CONTAINER_PORT: '18080'
    }
  });
  return 'podman-python';
}

function checksum(bytes) {
  let hash = 0xcbf29ce484222325n;
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}

function compareOutputs(source) {
  const failures = [];
  const summaries = [];

  for (const file of files) {
    const expectedPath = path.join(pythonOut, file);
    const actualPath = path.join(rustOut, file);
    const expected = readFileSync(expectedPath);
    const actual = readFileSync(actualPath);
    let firstDiff = -1;
    const max = Math.min(expected.length, actual.length);
    for (let idx = 0; idx < max; idx += 1) {
      if (expected[idx] !== actual[idx]) {
        firstDiff = idx;
        break;
      }
    }
    if (firstDiff === -1 && expected.length !== actual.length) firstDiff = max;
    if (firstDiff !== -1) failures.push({ file, firstDiff, expectedLength: expected.length, actualLength: actual.length });
    summaries.push({
      file,
      bytes: actual.length,
      checksum: checksum(actual)
    });
  }

  const result = {
    source,
    width,
    height,
    pythonMeta: JSON.parse(readFileSync(path.join(pythonOut, 'meta.json'), 'utf8')),
    files: summaries,
    failures
  };
  console.log(JSON.stringify(result, null, 2));

  if (failures.length) {
    throw new Error(`frame-prep parity failed for ${failures.length} file(s)`);
  }
}

rmSync(workRoot, { recursive: true, force: true });
mkdirSync(workRoot, { recursive: true });

const source = generatePythonReference();
if (!existsSync(path.join(pythonOut, 'input.rgb'))) {
  throw new Error('Python reference did not generate input.rgb');
}

run('node', [
  'scripts/cargo_env.mjs',
  'run',
  '--manifest-path',
  'src-tauri/Cargo.toml',
  '--example',
  'frame_prep_fixture',
  '--',
  path.join(pythonOut, 'input.rgb'),
  String(width),
  String(height),
  rustOut
]);

compareOutputs(source);
