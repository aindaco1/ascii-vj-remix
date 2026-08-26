import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
try {
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
