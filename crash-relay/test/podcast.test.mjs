import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../src/index.js';
import { podcastFingerprint, podcastRelayReport, validatePodcastReport } from '../src/podcast.js';
import { PodcastReportGroup, podcastRelayFailure } from '../src/podcast-aggregation.js';
import { createIssue, issueBody } from '../src/github.js';

function report() {
  const id = crypto.randomUUID();
  return { schemaVersion: 'podcast-visualizer-issue-report-v1', id,
    application: { version: '1.3.0', build: '23', operatingSystem: '26.6.2', architecture: 'arm64' },
    kind: 'workflow_failure', failureCode: 'render_failure', diagnosticCode: 'render_encoding_failed',
    exitCode: 6, durationMs: 2400,
    renderSettings: { aspect: 'all', background: 'both', alphaCodec: 'both' },
    context: { attemptID: id, renderProgress: { phase: 'encoding', fraction: 0.5, processedMs: 12345,
      outputIndex: 2, totalOutputs: 9, aspect: '16:9', background: 'transparent', alphaCodec: 'hevc' },
    failureDetails: { cause: 'process_exit', processExitCode: 1 } } };
}
function storage() {
  const values = new Map();
  return { get: async key => structuredClone(values.get(key)), put: async (key, value) => { values.set(key, structuredClone(value)); } };
}

test('operator failure diagnostics retain only an allowlisted provider status', () => {
  const error = Object.assign(new Error('/Users/private/transcript and credential'), { status: 403, body: 'private' });
  assert.deepEqual(podcastRelayFailure(error), { code: 'podcast_report_submission_failed', providerStatus: 403 });
  assert.equal(podcastRelayFailure({ status: 'private' }).providerStatus, null);
  assert.equal(podcastRelayFailure(null).providerStatus, null);
});
const request = value => new Request('https://crash.dustwave.xyz/v1/podcast-visualizer/reports', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });

test('Podcast contract rejects unknown fields and private strings at every depth', () => {
  assert.equal(validatePodcastReport(report()).kind, 'workflow_failure');
  for (const mutate of [
    x => { x.path = '/Users/private/secret'; }, x => { x.application.version = 'Private transcript'; },
    x => { x.renderSettings.source = 'secret'; }, x => { x.context.message = 'secret'; },
    x => { x.context.renderProgress.title = 'secret'; }, x => { x.context.failureDetails.stderr = 'secret'; },
    x => { x.context.failureDetails.cause = 'secret'; }, x => { x.context.failureDetails.processExitCode = 256; },
    x => { x.context.renderProgress.totalOutputs = 0; }, x => { x.context.renderProgress.fraction = -1; },
    x => { x.context.attemptID = crypto.randomUUID(); }, x => { x.application.architecture = 'secret'; }
  ]) { const value = report(); mutate(value); assert.throws(() => validatePodcastReport(value), /Invalid Podcast/); }
});

test('fingerprints group repeated failures across versions, times, and aspects while separating causes/codecs', async () => {
  const a = report();
  const b = report();
  b.application.version = '1.3.1'; b.application.build = '24'; b.durationMs = 5000;
  b.context.renderProgress.aspect = '9:16'; b.context.renderProgress.fraction = 0.8;
  assert.equal(await podcastFingerprint(a), await podcastFingerprint(b));
  for (const mutate of [x => { x.context.failureDetails.processExitCode = 2; },
    x => { x.context.renderProgress.alphaCodec = 'prores'; },
    x => { x.context.failureDetails = { cause: 'type_error' }; },
    x => { x.application.architecture = 'x86_64'; }]) {
    const value = structuredClone(a); mutate(value);
    assert.notEqual(await podcastFingerprint(a), await podcastFingerprint(value));
  }
});

test('serialized aggregation counts concurrent reports once and retains failures for retry', async () => {
  const calls = [];
  let failing = false;
  const ctx = { storage: storage() };
  const submit = async (env, value, fingerprint, state) => {
    assert.equal(env.GITHUB_REPO, 'podcast-visualizer');
    await new Promise(resolve => setTimeout(resolve, 2));
    if (failing) throw new Error('provider unavailable');
    calls.push(state.count);
    const body = issueBody(value, fingerprint, state);
    assert.match(body, /podcastDiagnostics/);
    return { action: calls.length === 1 ? 'created' : 'updated', issueNumber: 42 };
  };
  const group = new PodcastReportGroup(ctx, {}, submit);
  const a = report(), b = report();
  const results = await Promise.all([a, a, b].map(x => group.fetch(request(x)).then(r => r.json())));
  assert.deepEqual(calls, [1, 2]);
  assert.deepEqual(results.map(x => x.action), ['created', 'duplicate', 'updated']);
  failing = true;
  const c = report();
  assert.equal((await group.fetch(request(c))).status, 502);
  failing = false;
  const restarted = new PodcastReportGroup(ctx, {}, submit);
  assert.equal((await restarted.fetch(request(c))).status, 200);
  assert.deepEqual(calls, [1, 2, 3]);
  assert.equal((await (await restarted.fetch(request(c))).json()).action, 'duplicate');
});

test('intake is disabled by default and rejects oversized or unvalidated reports before dispatch', async () => {
  assert.equal((await worker.fetch(request(report()), {})).status, 503);
  let dispatched = 0;
  const env = { PODCAST_REPORTS_ENABLED: 'true', RATELIMIT: storage(),
    PODCAST_REPORT_GROUPS: { idFromName: name => name, get: () => ({ fetch: async () => { dispatched++; return Response.json({ ok: true }); } }) } };
  const invalid = report(); invalid.context.secret = 'private';
  assert.equal((await worker.fetch(request(invalid), env)).status, 400);
  assert.equal((await worker.fetch(request({ blob: 'x'.repeat(8193) }), env)).status, 400);
  assert.equal(dispatched, 0);
  assert.equal((await worker.fetch(request(report()), env)).status, 200);
  assert.equal(dispatched, 1);
});

test('native crash summary has a separate grouping basis without paths or raw stacks', async () => {
  const value = report();
  value.kind = 'native_crash'; value.failureCode = 'native_crash';
  delete value.context; delete value.diagnosticCode;
  value.crash = { exception: 'EXC_BREAKPOINT', signal: 'SIGTRAP', image: 'libswiftCore.dylib', imageOffset: 1234 };
  assert.equal(podcastRelayReport(value).report.surface, 'native');
  const fingerprint = await podcastFingerprint(value);
  value.crash.imageOffset++;
  assert.notEqual(await podcastFingerprint(value), fingerprint);
  value.crash.path = '/Users/private/secret';
  assert.throws(() => validatePodcastReport(value));
});

test('an uncertain GitHub issue creation is not blindly repeated', async () => {
  let calls = 0;
  const env = { RATELIMIT: storage(), CRASH_CREATION_GUARD: storage() };
  await assert.rejects(createIssue(env, podcastRelayReport(report()), 'a'.repeat(20), {}, async () => {
    calls++; throw new Error('response lost');
  }), /response lost/);
  assert.equal(calls, 1);
  const retry = await createIssue(env, podcastRelayReport(report()), 'a'.repeat(20), {}, async () => { calls++; });
  assert.equal(retry.action, 'pending');
  assert.equal(calls, 1);
});

test('a definite label validation error retries once without labels', async () => {
  const bodies = [];
  const env = { RATELIMIT: storage(), CRASH_CREATION_GUARD: storage() };
  const result = await createIssue(env, podcastRelayReport(report()), 'b'.repeat(20), {}, async (_env, _path, options) => {
    bodies.push(JSON.parse(options.body));
    if (bodies.length === 1) throw Object.assign(new Error('invalid label'), { status: 422, errors: [{ field: 'labels' }] });
    return { number: 42, html_url: 'https://github.com/aindaco1/podcast-visualizer/issues/42' };
  });
  assert.equal(result.action, 'created');
  assert.equal(bodies.length, 2);
  assert.equal(bodies[1].labels, undefined);
});
