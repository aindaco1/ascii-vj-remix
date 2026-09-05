import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { selectWorkflowRun, workflowRunState } from './lib/github_workflow_acceptance.mjs';
import { packReleaseBinary, restoreReleaseBinary } from './lib/tauri_release_binary.mjs';

const commit = '0123456789abcdef0123456789abcdef01234567';
const runs = [
  { id: 1, head_sha: 'f'.repeat(40), head_branch: 'main', event: 'push', status: 'completed', conclusion: 'success', created_at: '2026-01-01T00:00:00Z' },
  { id: 2, head_sha: commit, head_branch: 'feature', event: 'push', status: 'completed', conclusion: 'success', created_at: '2026-01-02T00:00:00Z' },
  { id: 3, head_sha: commit, head_branch: 'main', event: 'pull_request', status: 'completed', conclusion: 'success', created_at: '2026-01-03T00:00:00Z' },
  { id: 4, head_sha: commit, head_branch: 'main', event: 'push', status: 'in_progress', conclusion: null, created_at: '2026-01-04T00:00:00Z' }
];

const matching = selectWorkflowRun(runs, { commit, branch: 'main', event: 'push' });
assert.equal(matching.id, 4);
assert.equal(workflowRunState(matching).state, 'waiting');
assert.equal(workflowRunState({ ...matching, status: 'completed', conclusion: 'success' }).state, 'accepted');
assert.equal(workflowRunState({ ...matching, status: 'completed', conclusion: 'failure' }).state, 'rejected');
assert.equal(selectWorkflowRun([], { commit }), null);

const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'ascii-vj-release-reuse-'));
function restoreRuntimeScript(text) {
  // Git may check YAML out with CRLF on Windows runners.
  const workflow = text.replace(/\r\n?/g, '\n');
  const restoreStep = workflow.indexOf('- name: Restore Unix FFmpeg executable permissions');
  assert.ok(restoreStep > workflow.indexOf('- name: Download verified FFmpeg runtime'));
  assert.ok(restoreStep < workflow.indexOf('- name: Verify release package inputs'));
  const step = workflow.slice(restoreStep, workflow.indexOf('\n      - name:', restoreStep + 1));
  assert.match(step, /if: runner\.os != 'Windows'/);
  return step.split('run: |\n')[1].split('\n').map(line => line.replace(/^          /, '')).join('\n');
}
try {
  const workflow = await readFile(new URL('../.github/workflows/release-desktop.yml', import.meta.url), 'utf8');
  const shell = restoreRuntimeScript(workflow);
  assert.equal(restoreRuntimeScript(workflow.replace(/\r?\n/g, '\r\n')), shell);
  if (process.platform !== 'win32') {
    for (const platform of ['linux-x86_64', 'macos-aarch64']) {
      const bin = path.join(tempRoot, 'src-tauri/resources/ffmpeg', platform, 'bin');
      await mkdir(bin, { recursive: true });
      for (const name of ['ffmpeg', 'ffprobe']) {
        const tool = path.join(bin, name);
        await writeFile(tool, '#!/bin/sh\nexit 0\n');
        await chmod(tool, 0o644);
        assert.equal(spawnSync(tool).error?.code, 'EACCES');
      }
      const restore = spawnSync('bash', ['-c', shell.replaceAll('${{ matrix.platform }}', platform)], {
        cwd: tempRoot, encoding: 'utf8'
      });
      assert.equal(restore.status, 0, restore.stderr);
      for (const name of ['ffmpeg', 'ffprobe']) {
        const tool = path.join(bin, name);
        assert.equal((await stat(tool)).mode & 0o777, 0o755);
        assert.equal(spawnSync(tool).status, 0);
      }
    }
  }
  const source = path.join(tempRoot, 'ascii-vj-remix');
  const packed = path.join(tempRoot, 'packed');
  const restored = path.join(tempRoot, 'restored', 'ascii-vj-remix');
  await writeFile(source, 'verified release binary\n');
  await chmod(source, 0o755);
  const manifest = await packReleaseBinary({
    binary: source,
    outputDir: packed,
    commit,
    platform: 'macos-aarch64',
    version: '0.9.8'
  });
  assert.equal(manifest.commit, commit);
  await restoreReleaseBinary({
    inputDir: packed,
    output: restored,
    commit,
    platform: 'macos-aarch64',
    version: '0.9.8'
  });
  assert.equal(await readFile(restored, 'utf8'), 'verified release binary\n');

  await writeFile(path.join(packed, 'ascii-vj-remix'), 'tampered\n');
  await assert.rejects(
    restoreReleaseBinary({
      inputDir: packed,
      output: restored,
      commit,
      platform: 'macos-aarch64',
      version: '0.9.8'
    }),
    /byte size mismatch|hash mismatch/
  );
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

console.log('Release build reuse tests passed.');
