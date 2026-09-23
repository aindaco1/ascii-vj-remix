import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { prepareCases } from './jev_cases.mjs';
import { LIMITS, POLICY, summarize, validateBudget, verifyPlatform, PLATFORM_PIN } from './jev_evaluation.mjs';
import { developmentChecks, runChecks } from './test_development.mjs';
import { evaluateJevCases } from '../shared/dust-wave-platform/packages/test-core/src/jev.js';

function answer(choice, options = {}) {
  return { model: options.model || POLICY.models[0], usage: { input_tokens: 20, output_tokens: 2 },
    answers: { meaning: { type: 'choice', choice, probabilities: options.probabilities ||
      Object.fromEntries(['pass', 'fail', 'uncertain'].map(key => [key, key === choice ? 0.98 : 0.01])) } } };
}

test('real code produces six bounded synthetic cases plus fourteen known-answer controls', async () => {
  const cases = await prepareCases();
  assert.equal(cases.length, 20);
  assert.equal(new Set(cases.map(row => row.id)).size, 20);
  assert.equal(cases.filter(row => row.kind === 'behavior').length, 6);
  assert.doesNotMatch(JSON.stringify(cases), /\/Users\/|\/private\/|C:\\|\.mp4|access_token/);
  assert.match(cases.find(row => row.id === 'renderer-recovered').candidate, /canvas2d/);
  assert.match(cases.find(row => row.id === 'smoke-capture-unavailable').candidate, /Renderer startup failed/);
  assert.equal(verifyPlatform(), PLATFORM_PIN);
  const preview = await evaluateJevCases(cases, { policy: POLICY, maxQuestions: LIMITS.questions });
  validateBudget(cases, preview);
  assert.equal(preview.complete, false);
  assert.equal(preview.networkAttempts, 0);
  assert.equal(preview.releaseAccepted, false);
  assert.throws(() => validateBudget([...cases, cases[0]], preview), /budget/);
  assert.throws(() => validateBudget(cases, { ...preview, questionCount: 21 }), /budget/);
});

test('known good and bad controls must match labels before behavior can pass', async () => {
  const cases = await prepareCases();
  let index = 0;
  const result = await evaluateJevCases(cases, { policy: POLICY, call: async () => answer(cases[index++].expected) });
  assert.equal(summarize(cases, result).status, 'pass');
  assert.equal(result.releaseAccepted, false);
  const broken = structuredClone(result);
  broken.cases[1].result.findings.meaning.decision = 'pass'; // Bad control falsely accepted.
  assert.equal(summarize(cases, broken).controlsPassed, false);
  assert.equal(summarize(cases, broken).status, 'review');
  const regression = structuredClone(result);
  regression.cases.at(-1).result.findings.meaning.decision = 'fail';
  assert.equal(summarize(cases, regression).status, 'fail');
});

test('new judge versions, near ties and uncertain results require review', async () => {
  const cases = await prepareCases();
  for (const options of [
    { model: 'jev-new-version' },
    { probabilities: { pass: 0.50, fail: 0.49, uncertain: 0.01 } },
    { probabilities: { pass: 0.01, fail: 0.01, uncertain: 0.98 } }
  ]) {
    const result = await evaluateJevCases(cases, { policy: POLICY,
      call: async () => answer(options.probabilities?.uncertain === 0.98 ? 'uncertain' : 'pass', options) });
    assert.equal(summarize(cases, result).status, 'review');
    assert.ok(result.cases.every(row => row.result.findings.meaning.decision === 'review'));
  }
});

test('provider failures and incomplete answers stop without retry or false acceptance', async () => {
  const cases = await prepareCases();
  for (const response of [{ success: false }, { ...answer('pass'), answers: {} }]) {
    let calls = 0;
    const result = await evaluateJevCases(cases, { policy: POLICY, call: async () => { calls++; return response; } });
    assert.equal(calls, 1);
    assert.equal(result.complete, false);
    assert.equal(summarize(cases, result).status, 'error');
  }
});

test('dry-run CLI needs no credentials and refuses arbitrary input or evidence overwrite', async t => {
  const scratch = await mkdtemp(path.join(os.tmpdir(), 'ascii-vj-jev-cli-'));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  const output = path.join(scratch, 'preview');
  const env = { ...process.env, CLOUDFLARE_ACCOUNT_ID: 'invalid', CLOUDFLARE_API_TOKEN: 'invalid' };
  const run = args => execFileSync(process.execPath, ['scripts/jev_evaluation.mjs', ...args], { env, stdio: 'pipe' });
  run(['--dry-run', '--output-dir', output]);
  const report = JSON.parse(await readFile(path.join(output, 'report.json')));
  assert.equal(report.status, 'dry-run');
  assert.equal(report.complete, false);
  assert.equal(report.networkAttempts, 0);
  assert.equal(report.releaseAccepted, false);
  assert.throws(() => run(['--dry-run', '--output-dir', output]));
  assert.throws(() => run(['--input', '/private/user-report.json']));
  const failureOutput = path.join(scratch, 'auth-failure');
  assert.throws(() => run(['--output-dir', failureOutput]));
  const failure = JSON.parse(await readFile(path.join(failureOutput, 'report.json')));
  assert.equal(failure.status, 'error');
  assert.equal(failure.networkAttempts, 0);
  assert.doesNotMatch(JSON.stringify(failure), /invalid|CLOUDFLARE_API_TOKEN/);
});

test('development defaults to live Jev, offline omits it, and exact failures stop the workflow', async () => {
  const defaults = developmentChecks();
  assert.equal(defaults.at(-1), 'test:jev');
  assert.deepEqual(developmentChecks({ offline: true }), defaults.slice(0, -1));
  const attempted = [];
  assert.equal(await runChecks(defaults, async check => { attempted.push(check); return check === 'check:desktop' ? 7 : 0; }), 7);
  assert.deepEqual(attempted, ['test:jev-harness', 'check:desktop']);
  assert.equal(await runChecks(defaults, async () => 0), 0);
});
