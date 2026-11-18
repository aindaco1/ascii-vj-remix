import test from 'node:test';
import assert from 'node:assert/strict';
import { createGitHubIssueArtifactWriter } from '@dustwave/desktop-core/github-issue-artifacts';
import { aggregateArtifact, AsciiArtifactMirror, mirrorAsciiIssue } from '../src/issue-artifacts.js';
import { stateMarker, fingerprintMarker } from '../src/github.js';

test('published aggregate excludes individual reports, private notes and injected markup', () => {
  const { body } = aggregateArtifact({ message: 'excluded' }, 'fixture', {
    count: 4, versions: { '</pre>': 4 }, firstSeen: 'first', lastSeen: 'last', notes: ['excluded']
  });
  assert.match(body, /Reports: 4/);
  assert.match(body, /&lt;\/pre&gt;/);
  assert.doesNotMatch(body, /excluded/);
});

const fingerprint = 'abcd'.repeat(5);
const target = { issueNumber: 7, fingerprint };
const env = { ISSUE_ARTIFACTS_ENABLED: 'true' };
const enqueue = mirror => mirror.fetch(new Request('https://internal/artifact', {
  method: 'POST', body: JSON.stringify(target)
}));

function mirrorStorage() {
  const values = new Map();
  return {
    alarmTime: null,
    get: key => values.get(key),
    put: (key, value) => values.set(key, value),
    getAlarm() { return this.alarmTime; },
    setAlarm(time) { this.alarmTime = time; },
    transaction(callback) { return callback(this); }
  };
}

function issue(count) {
  const state = { fingerprint, count, versions: { test: count },
    firstSeen: '2026-11-18T12:00:00Z', lastSeen: '2026-11-18T12:05:00Z' };
  return { number: 7, body: fingerprintMarker(fingerprint) + '\n' + stateMarker(state) };
}

test('one report survives a timed out read and an object restart', async () => {
  const storage = mirrorStorage();
  const published = [];
  let attempts = 0;
  const start = () => new AsciiArtifactMirror({ storage }, env, async () => {
    if (++attempts === 1) throw new DOMException('timeout', 'TimeoutError');
    return issue(1);
  }, async (_env, doc) => published.push(doc.body.split('\n')[0]));
  assert.equal((await enqueue(start())).status, 202);
  assert.ok(storage.alarmTime);
  assert.equal(attempts, 0);
  await assert.rejects(start().alarm({ retryCount: 0 }), /read-issue/);
  await start().alarm({ retryCount: 1 });
  assert.deepEqual(published, ['Reports: 1']);
});

test('a lost create response is reconciled after restart without a second POST', async () => {
  const storage = mirrorStorage();
  let created;
  const methods = [];
  const writer = createGitHubIssueArtifactWriter({ request: async (_env, _path, options) => {
    methods.push(options.method);
    if (options.method === 'GET') return created ? [created] : [];
    assert.equal(options.method, 'POST');
    created = { ...JSON.parse(options.body), number: 1 };
    throw new DOMException('timeout', 'TimeoutError');
  } });
  const start = () => new AsciiArtifactMirror({ storage }, env, async () => issue(1), writer);
  await enqueue(start());
  await assert.rejects(start().alarm(), /write-artifact/);
  assert.equal(storage.get('artifact').pending, true);
  await start().alarm({ retryCount: 1 });
  assert.deepEqual(methods, ['GET', 'POST', 'GET']);
  assert.equal(storage.get('artifact').number, 1);
});

test('an update during publication schedules another read of the latest aggregate', { timeout: 2000 }, async () => {
  const storage = mirrorStorage();
  const started = Promise.withResolvers();
  const resume = Promise.withResolvers();
  const published = [];
  let count = 1;
  const mirror = new AsciiArtifactMirror({ storage }, env, async () => issue(count), async (_env, doc) => {
    started.resolve();
    await resume.promise;
    published.push(doc.body.split('\n')[0]);
  });
  await enqueue(mirror);
  storage.alarmTime = null; // Cloudflare consumes the current alarm at dispatch.
  const running = mirror.alarm();
  await started.promise;
  count = 2;
  await enqueue(mirror);
  assert.ok(storage.alarmTime);
  resume.resolve();
  await running;
  await mirror.alarm();
  assert.deepEqual(published, ['Reports: 1', 'Reports: 2']);
});

test('disabled publication and mismatched issues never reach the artifact writer', async () => {
  const storage = mirrorStorage();
  let reads = 0, writes = 0;
  const start = config => new AsciiArtifactMirror({ storage }, config, async () => {
    reads++;
    return { ...issue(1), number: 8 };
  }, async () => { writes++; });
  await enqueue(start(env));
  await start({ ISSUE_ARTIFACTS_ENABLED: 'false' }).alarm();
  assert.equal(reads, 0);
  await start(env).alarm();
  assert.equal(reads, 1);
  assert.equal(writes, 0);
});

test('a retryable enqueue failure obtains a fresh stub before acknowledging', async () => {
  let stubs = 0;
  const groups = { idFromName: name => name, get(id) {
    assert.equal(id, '7:' + fingerprint);
    const attempt = ++stubs;
    return { async fetch() {
      if (attempt === 1) throw Object.assign(new Error(), { retryable: true });
      return new Response(null, { status: 202 });
    } };
  } };
  await mirrorAsciiIssue({ ASCII_ARTIFACTS: groups }, target, fingerprint);
  assert.equal(stubs, 2);
});
