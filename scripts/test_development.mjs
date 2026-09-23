#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { parseArgs } from 'node:util';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export function developmentChecks({ offline = false } = {}) {
  return ['test:jev-harness', 'check:desktop', 'smoke:static', ...(offline ? [] : ['test:jev'])];
}

export async function runChecks(checks, run) {
  for (const check of checks) {
    const status = await run(check);
    if (status !== 0) return status || 1;
  }
  return 0;
}

async function main() {
  const { values } = parseArgs({ options: { offline: { type: 'boolean' }, help: { type: 'boolean' } } });
  if (values.help) {
    console.log('npm test [-- --offline]\nExisting desktop gate and static smoke, then live synthetic Jev review. --offline explicitly skips Jev.');
    return;
  }
  if (values.offline) console.log('Offline development subset: Jev is not run; this is not semantic acceptance.');
  const npm = process.env.npm_execpath;
  if (!npm) throw new Error('Run through npm test');
  process.exitCode = await runChecks(developmentChecks({ offline: values.offline }), check => new Promise((resolve, reject) => {
    console.log(`\nDevelopment check: ${check}`);
    const child = spawn(process.execPath, [npm, 'run', check], { cwd: ROOT, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', code => resolve(code ?? 1));
  }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 2; });
}
