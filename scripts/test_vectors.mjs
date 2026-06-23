import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const vectorRoot = path.join(root, 'experiments', 'vectors');

function commandWorks(command, args = ['--version']) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32'
  });
  return result.status === 0;
}

function run(command, args, options = {}) {
  console.log(`> ${[command, ...args].join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

function hasVectorFixtures() {
  if (!existsSync(vectorRoot)) return false;
  try {
    return readdirSync(vectorRoot, { withFileTypes: true }).some((entry) => {
      if (!entry.isDirectory()) return false;
      return existsSync(path.join(vectorRoot, entry.name, 'meta.json'));
    });
  } catch {
    return false;
  }
}

function canGenerateVectorsLocally() {
  if (!commandWorks('ffmpeg')) return false;
  const python = commandWorks('python3') ? 'python3' : commandWorks('python') ? 'python' : '';
  if (!python) return false;
  const result = spawnSync(python, ['-c', 'import cv2, numpy'], {
    cwd: root,
    stdio: 'ignore',
    shell: process.platform === 'win32'
  });
  return result.status === 0;
}

function runVectorChecks() {
  run('node', ['experiments/check_vectors.js', 'experiments/vectors']);
  run('node', [
    'scripts/cargo_env.mjs',
    'run',
    '--manifest-path',
    'src-tauri/Cargo.toml',
    '--example',
    'check_codec_vectors',
    '--',
    'experiments/vectors'
  ]);
}

if (!hasVectorFixtures()) {
  if (canGenerateVectorsLocally()) {
    run('bash', ['experiments/make_test_clips.sh']);
    run(commandWorks('python3') ? 'python3' : 'python', ['experiments/gen_vectors.py']);
  } else if (commandWorks('podman')) {
    run('bash', ['scripts/podman_codec_tests.sh']);
    process.exit(0);
  } else {
    console.error('experiments/vectors is missing and neither local Python/OpenCV/FFmpeg nor Podman is available.');
    console.error('Install the local vector dependencies or run scripts/podman-doctor.sh to prepare the Podman path.');
    process.exit(1);
  }
}

runVectorChecks();
