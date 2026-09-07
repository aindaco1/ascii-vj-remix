import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import worker from '../src/index.js';
import { mkvFingerprint, mkvRelayReport, validateMkvReport } from '../src/mkv.js';
import { MkvReportGroup } from '../src/mkv-aggregation.js';
import { mkvReviewPage } from '../src/mkv-review.js';
import { issueBody, issueTitle } from '../src/github.js';

const report = () => ({ schema: 'mkv-magic-issue-report-v1', id: crypto.randomUUID(),
  kind: 'operationFailure', version: '0.3.0-test.19', build: '19', operatingSystem: '15.7.4',
  architecture: 'x86_64', action: 'verifyAndRun', stage: 'queueAdmission', failure: 'bookmarkUnavailable' });
const storage = () => {
  const map = new Map();
  return { get: async key => structuredClone(map.get(key)), put: async (key, value) => map.set(key, structuredClone(value)) };
};
const request = value => new Request('https://crash.dustwave.xyz/v1/mkv-magic/reports', {
  method: 'POST', headers: { Origin: 'https://crash.dustwave.xyz', 'Content-Type': 'application/json' }, body: JSON.stringify(value) });

test('MKV strict projection rejects content, unknown fields, cancellations, and invalid numbers', () => {
  assert.equal(validateMkvReport(report()).stage, 'queueAdmission');
  for (const mutate of [r => { r.path = '/Users/private'; }, r => { r.version = '/private/movie.mp4'; },
    r => { r.failure = 'private'; }, r => { r.failure = 'cancelled'; }, r => { r.exitCode = 256; },
    r => { r.crash = { exception: 'EXC_CRASH', stack: 'private' }; }, r => { r.architecture = null; }]) {
    const value = report(); mutate(value); assert.throws(() => validateMkvReport(value));
  }
});

test('MKV fingerprints ignore field order, report ID, and workflow version but separate causes', async () => {
  const a = report(), b = { ...report(), version: '0.3.0-test.20', build: '20' };
  assert.equal(await mkvFingerprint(a), '68d0856664ab12b0cbd5ca7f5612b3b1c2cec5ad7cbaebfaa7ba7754106e9b28');
  assert.equal(await mkvFingerprint(a), await mkvFingerprint(b));
  assert.equal(await mkvFingerprint(a), await mkvFingerprint(Object.fromEntries(Object.entries(a).reverse())));
  assert.notEqual(await mkvFingerprint(a), await mkvFingerprint({ ...a, failure: 'permissionDenied' }));
  const native = { ...a, kind: 'nativeCrash', action: 'application',
    crash: { exception: 'EXC_BAD_ACCESS', image: 'MKVMagic', imageOffset: 123 } };
  assert.notEqual(await mkvFingerprint(native), await mkvFingerprint({ ...native, build: '20' }));
});

test('MKV shares serial aggregation, fixed repository, duplicate receipts, and retry persistence', async () => {
  const ctx = { storage: storage() }, counts = [];
  let failing = false;
  const submit = async (env, value, fingerprint, state) => {
    assert.equal(env.GITHUB_REPO, 'mkv-magic');
    assert.match(issueBody(value, fingerprint, state), /mkvDiagnostics/);
    assert.equal(state.grouping.basis, 'mkv-magic-issue-report-v1');
    if (failing) throw new Error('provider failure');
    counts.push(state.count);
    return { action: counts.length === 1 ? 'created' : 'updated', issueNumber: 42 };
  };
  const group = new MkvReportGroup(ctx, {}, submit), a = report(), b = report();
  const results = await Promise.all([a, a, b].map(x => group.fetch(request(x)).then(r => r.json())));
  assert.deepEqual(results.map(r => r.action), ['created', 'duplicate', 'updated']);
  failing = true;
  const c = report(); assert.equal((await group.fetch(request(c))).status, 502);
  failing = false;
  const reopened = new MkvReportGroup(ctx, {}, submit);
  assert.equal((await reopened.fetch(request(c))).status, 200);
  assert.deepEqual(counts, [1, 2, 3]);
});

test('operation failures and interruptions are diagnostic issues, not claims of a crash', () => {
  for (const kind of ['operationFailure', 'interruptedOperation']) {
    assert.match(issueTitle(mkvRelayReport({ ...report(), kind }), 'fixture'), /^\[Diagnostic /);
  }
  assert.match(issueTitle({ report: { kind: 'nativeCrash', message: 'Synthetic' } }, 'fixture'), /^\[Crash /);
});

test('MKV route requires enablement, same-origin JSON, bounds, and strict schema', async () => {
  let dispatches = 0;
  const env = { MKV_REPORTS_ENABLED: 'true', RATELIMIT: storage(), MKV_REPORT_GROUPS: {
    idFromName: name => { assert.match(name, /^mkv-magic:/); return name; },
    get: () => ({ fetch: async () => { dispatches++; return Response.json({ ok: true }); } }) } };
  assert.equal((await worker.fetch(request(report()), {})).status, 503);
  const crossOrigin = request(report()); crossOrigin.headers.set('Origin', 'https://other.example');
  assert.equal((await worker.fetch(crossOrigin, env)).status, 403);
  assert.equal((await worker.fetch(request({ ...report(), text: 'private' }), env)).status, 400);
  assert.equal((await worker.fetch(request({ text: 'x'.repeat(4097) }), env)).status, 400);
  assert.equal(dispatches, 0);
  assert.equal((await worker.fetch(request(report()), env)).status, 200);
  assert.equal(dispatches, 1);
});

test('browser review never submits on load, retains retries, and validates receipts', async () => {
  const response = mkvReviewPage(), html = await response.text();
  assert.match(response.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/);
  assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer');
  const script = html.match(/<script nonce="[^"]+">([\s\S]+)<\/script>/)[1];
  const elements = new Map(['#status', '#send', '#preview', '#discard'].map(key => [key, {
    disabled: key === '#send', textContent: '', listeners: {}, addEventListener(event, fn) { this.listeners[event] = fn; },
    append(link) { this.link = link; }
  }]));
  const a = report(), saved = new Map(); let sends = 0, fail = true, cleared = false;
  const context = { document: { querySelector: key => elements.get(key), createElement: () => ({}) },
    history: { replaceState: () => { cleared = true; } }, location: { hash: '#' + btoa(JSON.stringify(a)), pathname: '/mkv-magic/review' },
    sessionStorage: { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key) },
    atob, TextDecoder, AbortSignal,
    fetch: async (_url, options) => {
      sends++; assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error');
      assert.equal(JSON.parse(options.body).id, a.id);
      if (fail) throw new Error('offline');
      return Response.json({ ok: true, reportId: a.id, action: 'duplicate', issueNumber: 42 });
    } };
  vm.runInNewContext(script, context);
  assert.equal(sends, 0); assert.equal(cleared, true);
  assert.equal(elements.get('#send').disabled, false);
  await elements.get('#send').listeners.click();
  assert.equal(sends, 1); assert.equal(saved.size, 1); assert.equal(elements.get('#send').disabled, false);
  fail = false; await elements.get('#send').listeners.click();
  assert.equal(saved.size, 0); assert.equal(elements.get('#send').disabled, true);
  assert.equal(elements.get('#status').link.href, 'https://github.com/aindaco1/mkv-magic/issues/42');
});
