import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    ...options
  });
}

function commandWorks(command, args = ['--version']) {
  return run(command, args).status === 0;
}

function originRepo() {
  const result = run('git', ['remote', 'get-url', 'origin']);
  if (result.status !== 0) return '';

  const remote = result.stdout.trim();
  const ssh = remote.match(/^git@github\.com:([^/]+\/[^/.]+)(?:\.git)?$/);
  if (ssh) return ssh[1];
  const https = remote.match(/^https:\/\/github\.com\/([^/]+\/[^/.]+)(?:\.git)?$/);
  if (https) return https[1];
  return '';
}

async function readTrimmedFile(filePath, label) {
  const value = (await readFile(filePath, 'utf8')).trim();
  if (!value) throw new Error(`${label} is empty: ${filePath}`);
  return value;
}

async function readBase64File(filePath, label) {
  const value = await readFile(filePath);
  if (value.length === 0) throw new Error(`${label} is empty: ${filePath}`);
  return value.toString('base64');
}

function requireGhAndRepo(repo) {
  if (!repo) throw new Error('could not infer GitHub repo; pass --repo owner/repo');
  if (!commandWorks('gh', ['--version'])) throw new Error('GitHub CLI is not installed or not on PATH');
}

function setSecret({ repo, name, value }) {
  const result = run('gh', ['secret', 'set', name, '--repo', repo, '--app', 'actions'], {
    input: value,
    stdio: ['pipe', 'pipe', 'pipe']
  });

  if (result.status !== 0) {
    const detail = `${result.stdout || ''}${result.stderr || ''}`.trim();
    throw new Error(`gh secret set ${name} failed${detail ? `: ${detail}` : ''}`);
  }
}

function listActionSecrets(repo) {
  const result = run('gh', ['secret', 'list', '--app', 'actions', '--repo', repo]);
  if (result.status !== 0) {
    const detail = `${result.stdout || ''}${result.stderr || ''}`.trim();
    throw new Error(`gh secret list failed${detail ? `: ${detail}` : ''}`);
  }
  return new Set(result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/)[0])
    .filter(Boolean));
}

export {
  commandWorks,
  listActionSecrets,
  originRepo,
  readBase64File,
  readTrimmedFile,
  requireGhAndRepo,
  run,
  setSecret
};
