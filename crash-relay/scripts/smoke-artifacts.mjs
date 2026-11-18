import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { crashFingerprint } from '../src/fingerprint.js';
import { sanitizeCrashPayload } from '../src/sanitize.js';

const repo = 'repos/aindaco1/ascii-vj-remix';
const origin = 'https://crash.dustwave.xyz';
const marker = 'Synthetic artifact delivery ' + randomUUID();
const payload = { app: { identifier: 'com.asciline.remix', version: '0.0.0-artifact-smoke', os: 'synthetic', arch: 'fixture' },
  report: { id: randomUUID(), kind: 'manual-diagnostic', surface: 'manual', message: marker,
    capturedAt: new Date().toISOString(), context: { errorCode: marker } } };
const fingerprint = await crashFingerprint(sanitizeCrashPayload(payload));
const github = (path, ...args) => JSON.parse(execFileSync('gh',
  ['api', '-H', 'X-GitHub-Api-Version: 2026-03-10', path, ...args], { encoding: 'utf8', timeout: 20000 }));
const permissions = github(repo).permissions;
assert.ok(permissions.push || permissions.triage);
const owned = new Set();
async function send() {
  const response = await fetch(origin + '/v1/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload), redirect: 'error', signal: AbortSignal.timeout(20000) });
  const receipt = await response.json();
  assert.equal(response.status, 200);
  assert.equal(receipt.reportId, payload.report.id);
  assert.equal(receipt.fingerprint, fingerprint);
  const issue = github(repo + '/issues/' + receipt.issueNumber);
  assert.equal(issue.user.type, 'Bot');
  assert.ok(issue.body.startsWith(`<!-- crash-fingerprint:${fingerprint} -->`));
  assert.ok(issue.body.includes(marker));
  if (receipt.action === 'created') owned.add(issue.number);
  console.log(receipt.action, issue.html_url);
  return receipt;
}

async function verify(number, count, previousNumber) {
  const path = `${repo}/issues/${number}/artifacts`;
  for (let attempt = 0; attempt < 20; attempt++) {
    const artifacts = github(path);
    assert.ok(artifacts.length <= 1);
    if (artifacts[0]?.body.includes(`Reports: ${count}\n`)) {
      const artifact = artifacts[0];
      if (previousNumber) assert.equal(artifact.number, previousNumber);
      assert.ok(artifact.body.startsWith(`<!-- dustwave-issue-artifact:${fingerprint} -->`));
      assert.ok(artifact.body.includes(payload.app.version));
      assert.equal(github(path + '/' + artifact.number).versions.length, count);
      console.log(`Artifact ${artifact.number}, verified ${count} version(s)`);
      return artifact.number;
    }
    await delay(1500);
  }
  throw new Error('Timed out waiting for the synthetic artifact');
}

try {
  const first = await send();
  assert.equal(first.action, 'created');
  const number = first.issueNumber;
  const artifact = await verify(number, 1);
  payload.report.id = randomUUID();
  const second = await send();
  assert.equal(second.issueNumber, number);
  assert.equal(second.action, 'updated');
  await verify(number, 2, artifact);
  const retry = await send();
  assert.equal(retry.issueNumber, number);
  assert.equal(retry.action, 'aggregated');
  await verify(number, 2, artifact);
} finally {
  for (const number of owned) {
    const closed = github(`${repo}/issues/${number}`, '-X', 'PATCH', '-f', 'state=closed', '-f', 'state_reason=completed');
    assert.equal(closed.state, 'closed');
    console.log('Closed', closed.html_url);
  }
}
