import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../src/index.js';
import { cutNotesFingerprint, cutNotesRelayReport, validateCutNotesReport } from '../src/cutnotes.js';
import { CutNotesReportGroup, cutNotesRelayFailure } from '../src/cutnotes-aggregation.js';
import { issueBody } from '../src/github.js';

function report() {
  return {
    schemaVersion: 'cutnotes-issue-report-v1',
    id: crypto.randomUUID(),
    application: { version: '1.0.2', build: '3', operatingSystem: '26.0.0', architecture: 'arm64' },
    kind: 'current_state',
    state: {
      workflow: 'format', isRunning: false, isRecording: false, isPaused: false,
      hasSource: true, transcriptOnly: false, language: 'en', transcriber: 'parakeet', formatter: 'apple',
      usesSystemDefaultMicrophone: true, microphoneCount: 2, coreHealthy: true,
      defaultWorkflowReady: true, parakeetReady: true, appleFormatterReady: true,
      ffmpegAvailable: true, macwhisperAvailable: false, codexAvailable: true,
      progressStage: 'formatting', failureCode: 'apple_guardrail'
    }
  };
}

function storage() {
  const values = new Map();
  return { get: async key => structuredClone(values.get(key)),
    put: async (key, value) => { values.set(key, structuredClone(value)); } };
}

const request = value => new Request('https://crash.dustwave.xyz/v1/cutnotes/reports', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value)
});

test('CutNotes contract accepts only the reviewed metadata projection', () => {
  assert.equal(validateCutNotesReport(report()).kind, 'current_state');
  for (const mutate of [
    x => { x.path = '/Users/private/secret'; },
    x => { x.application.version = 'private transcript'; },
    x => { x.state.projectName = 'secret'; },
    x => { x.state.language = 'secret'; },
    x => { x.state.microphoneName = 'Studio microphone'; },
    x => { x.state.failureCode = 'private provider output'; },
    x => { x.state.microphoneCount = 129; },
    x => { x.state.isPaused = true; x.state.isRecording = false; },
    x => { x.application.architecture = 'secret'; }
  ]) {
    const value = report(); mutate(value);
    assert.throws(() => validateCutNotesReport(value), /Invalid CutNotes/);
  }
});

test('current-state fingerprints ignore report identity and app version but separate actionable state', async () => {
  const a = report();
  const b = report();
  b.application.version = '1.0.3'; b.application.build = '4';
  b.state.hasSource = false; b.state.language = 'es'; b.state.microphoneCount = 8;
  assert.equal(await cutNotesFingerprint(a), await cutNotesFingerprint(b));
  for (const mutate of [
    x => { x.state.failureCode = 'apple_context_window'; },
    x => { x.state.formatter = 'codex'; },
    x => { x.state.appleFormatterReady = false; },
    x => { x.application.architecture = 'x86_64'; }
  ]) {
    const value = structuredClone(a); mutate(value);
    assert.notEqual(await cutNotesFingerprint(a), await cutNotesFingerprint(value));
  }
});

test('native crash uses a separate strict grouping without paths or stacks', async () => {
  const value = report();
  value.kind = 'native_crash';
  delete value.state;
  value.crash = { exception: 'EXC_BREAKPOINT', signal: 'SIGTRAP', image: 'CutNotes', imageOffset: 1234 };
  const relayed = cutNotesRelayReport(value);
  assert.equal(relayed.report.surface, 'native');
  assert.equal(relayed.report.stack, '');
  const fingerprint = await cutNotesFingerprint(value);
  const reordered = structuredClone(value);
  reordered.crash = { imageOffset: 1234, image: 'CutNotes', signal: 'SIGTRAP', exception: 'EXC_BREAKPOINT' };
  assert.equal(await cutNotesFingerprint(reordered), fingerprint);
  reordered.crash.path = '/Users/private/secret';
  assert.throws(() => validateCutNotesReport(reordered));
});

test('serialized aggregation deduplicates receipts and targets the CutNotes repository', async () => {
  const calls = [];
  const ctx = { storage: storage() };
  const submit = async (env, value, fingerprint, state) => {
    assert.equal(env.GITHUB_REPO, 'cutnotes');
    calls.push(state.count);
    assert.match(issueBody(value, fingerprint, state), /cutnotesDiagnostics/);
    return { action: calls.length === 1 ? 'created' : 'updated', issueNumber: 42 };
  };
  const group = new CutNotesReportGroup(ctx, {}, submit);
  const a = report(), b = report();
  const results = await Promise.all([a, a, b].map(x => group.fetch(request(x)).then(r => r.json())));
  assert.deepEqual(calls, [1, 2]);
  assert.deepEqual(results.map(x => x.action), ['created', 'duplicate', 'updated']);
});

test('route is disabled by default and rejects invalid or oversized reports before dispatch', async () => {
  assert.equal((await worker.fetch(request(report()), {})).status, 503);
  let dispatched = 0;
  const env = { CUTNOTES_REPORTS_ENABLED: 'true', RATELIMIT: storage(),
    CUTNOTES_REPORT_GROUPS: { idFromName: name => name,
      get: () => ({ fetch: async () => { dispatched++; return Response.json({ ok: true }); } }) } };
  const invalid = report(); invalid.state.transcript = 'private';
  assert.equal((await worker.fetch(request(invalid), env)).status, 400);
  assert.equal((await worker.fetch(request({ blob: 'x'.repeat(8193) }), env)).status, 400);
  assert.equal(dispatched, 0);
  assert.equal((await worker.fetch(request(report()), env)).status, 200);
  assert.equal(dispatched, 1);
});

test('operator failure logging retains only an allowlisted provider status', () => {
  const error = Object.assign(new Error('/Users/private/transcript'), {
    status: 403, body: 'private', providerOperation: 'PATCH', providerReason: 'integration_access'
  });
  assert.deepEqual(cutNotesRelayFailure(error), {
    code: 'cutnotes_report_submission_failed', providerStatus: 403,
    providerOperation: 'PATCH', providerReason: 'integration_access'
  });
  assert.deepEqual(cutNotesRelayFailure({
    status: 'private', providerOperation: 'DELETE', providerReason: '/Users/private/transcript'
  }), {
    code: 'cutnotes_report_submission_failed', providerStatus: null,
    providerOperation: null, providerReason: null
  });
});
