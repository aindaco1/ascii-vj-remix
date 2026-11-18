import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateArtifact, AsciiArtifactMirror } from '../src/issue-artifacts.js';
import { stateMarker, fingerprintMarker } from '../src/github.js';

test('published aggregate excludes individual reports, private notes and injected markup', () => {
  const { body } = aggregateArtifact({ message: 'excluded' }, 'fixture', {
    count: 4, versions: { '</pre>': 4 }, firstSeen: 'first', lastSeen: 'last', notes: ['excluded']
  });
  assert.match(body, /Reports: 4/);
  assert.match(body, /&lt;\/pre&gt;/);
  assert.doesNotMatch(body, /excluded/);
});

test('native mirror serializes reads of confirmed state and rejects mismatched issues', async () => {
  const fp = 'abcd'.repeat(5);
  let count = 0;
  let active = false;
  let wrongIssue = false;
  const counts = [];
  const mirror = new AsciiArtifactMirror({ storage: {} }, {}, async () => {
    assert.equal(active, false);
    active = true;
    const state = { fingerprint: fp, count: ++count, versions: { test: count } };
    return { number: wrongIssue ? 8 : 7, body: fingerprintMarker(fp) + '\n' + stateMarker(state) };
  }, async (_env, doc) => {
    await Promise.resolve();
    counts.push(doc.body.split('\n')[0]);
    assert.equal(doc.issueNumber, 7);
    active = false;
  });
  const send = () => mirror.fetch(new Request('https://internal/artifact', {
    method: 'POST', body: JSON.stringify({ fingerprint: fp, issueNumber: 7 })
  }));
  await Promise.all([send(), send()]);
  wrongIssue = true;
  await assert.rejects(send(), /marker mismatch/);
  assert.deepEqual(counts, ['Reports: 1', 'Reports: 2']);
});
