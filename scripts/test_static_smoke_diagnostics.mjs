import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { StaticSmokeDiagnostics } from './lib/static_smoke_diagnostics.mjs';

class Page extends EventEmitter {
  isClosed() { return false; }
  async evaluate() { return { readyState: 'complete', appPresent: true, sourceOptionCount: 0 }; }
  async screenshot({ path: destination }) { await writeFile(destination, 'synthetic screenshot'); }
}

async function fixture(t, options = {}) {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), 'ascii-vj-smoke-diagnostics-test-'));
  t.after(() => rm(outputDir, { recursive: true, force: true }));
  const logs = [];
  const diagnostics = new StaticSmokeDiagnostics({ outputDir, errors: [], emit: text => logs.push(text), ...options });
  return { outputDir, logs, diagnostics };
}

test('startup timeout preserves browser errors, failed requests, HTTP errors, state, and original failure', async t => {
  const { outputDir, logs, diagnostics } = await fixture(t);
  const page = new Page();
  diagnostics.phase = 'main app initialization';
  diagnostics.runtime.browser = 'Chromium test fixture';
  diagnostics.observe(page, 'main');
  page.emit('console', { type: () => 'error', text: () => 'module failed' });
  page.emit('pageerror', new Error('init rejected'));
  page.emit('requestfailed', {
    url: () => 'http://user:password@127.0.0.1:4173/module.js?token=private#fragment',
    resourceType: () => 'script', failure: () => ({ errorText: 'net::ERR_FAILED' })
  });
  page.emit('response', { url: () => 'http://127.0.0.1:4173/missing.js?private', status: () => 404 });
  const failure = new Error('Timeout 15000ms exceeded');
  failure.name = 'TimeoutError';
  const report = await diagnostics.capture(failure, 'Vite preview started');
  assert.equal(report.phase, 'main app initialization');
  assert.deepEqual(report.failure, { name: failure.name, message: failure.message, stack: failure.stack });
  assert.equal(report.runtime.browser, 'Chromium test fixture');
  assert.equal(report.pages[0].state.sourceOptionCount, 0);
  assert.deepEqual(report.events.map(event => event.type), ['console.error', 'pageerror', 'requestfailed', 'http-error']);
  assert.equal(report.events[2].url, 'http://127.0.0.1:4173/module.js');
  assert.equal(report.events[3].url, 'http://127.0.0.1:4173/missing.js');
  assert.equal(report.errors.length, 2);
  assert.deepEqual(JSON.parse(await readFile(path.join(outputDir, 'failure.json'), 'utf8')), report);
  assert.match(logs[0], /init rejected/);
  assert.equal(await readFile(path.join(outputDir, 'main.png'), 'utf8'), 'synthetic screenshot');
});

test('unresponsive and closed pages cannot prevent failure reporting', async t => {
  const { diagnostics, logs, outputDir } = await fixture(t, { timeoutMs: 20 });
  const stalled = new Page();
  stalled.evaluate = () => new Promise(() => {});
  stalled.screenshot = () => new Promise(() => {});
  const closed = new Page();
  closed.isClosed = () => true;
  diagnostics.observe(stalled, 'main');
  diagnostics.observe(closed, 'migration');
  const report = await diagnostics.capture(new Error('original startup failure'));
  assert.match(report.pages[0].captureError, /timed out/);
  assert.equal(report.pages[1].closed, true);
  assert.match(logs[0], /original startup failure/);
  assert.match(logs[1], /screenshot unavailable/);
  assert.match(await readFile(path.join(outputDir, 'failure.json'), 'utf8'), /original startup failure/);
});

test('bounded event history and unwritable artifacts retain console evidence', async t => {
  const { diagnostics, outputDir, logs } = await fixture(t);
  const page = new Page();
  diagnostics.observe(page, 'main');
  for (let i = 0; i < 125; i++) page.emit('console', { type: () => 'error', text: () => `${i}: ${'x'.repeat(3000)}` });
  assert.equal(diagnostics.events.length, 100);
  assert.equal(diagnostics.errors.length, 100);
  assert.equal(diagnostics.events[0].message.length, 2000);
  const blocker = path.join(outputDir, 'file');
  await writeFile(blocker, 'not a directory');
  diagnostics.outputDir = path.join(blocker, 'diagnostics');
  const report = await diagnostics.capture(new Error('original failure'));
  assert.equal(report.failure.message, 'original failure');
  assert.match(logs[0], /original failure/);
  assert.match(logs[1], /Could not save diagnostics/);
});
