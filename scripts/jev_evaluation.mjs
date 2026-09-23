#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { prepareCases } from './jev_cases.mjs';
import { evaluateJevCases, callCloudflareJev } from '../shared/dust-wave-platform/packages/test-core/src/jev.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const PLATFORM_PIN = '60d439b887f1244f82ff232c849d74152b28c776';
export const POLICY = { minimumMargin: 0.10, models: ['jev-1.13.0'] }; // Provisional for this corpus; never auto-tuned.
export const LIMITS = { requests: 20, questions: 20, totalBytes: 64000 };
const SOURCES = ['scripts/jev_cases.mjs', 'scripts/jev_evaluation.mjs',
  'scripts/lib/static_smoke_diagnostics.mjs', 'renderers/gpu/ascii/renderer/fallback.js',
  'renderers/desktop/renderer-diagnostics.js', 'renderers/desktop/update-controller.js',
  'shared/dust-wave-platform/packages/test-core/src/jev.js',
  'shared/dust-wave-platform/packages/worker-core/src/response-body.js'];
const hash = value => createHash('sha256').update(value).digest('hex');
const save = (dir, file, value) => writeFileSync(path.join(dir, file), JSON.stringify(value, null, 2) + '\n');

export function verifyPlatform() {
  const cwd = path.join(ROOT, 'shared/dust-wave-platform');
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
  const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], { cwd, encoding: 'utf8' }).trim();
  const version = JSON.parse(readFileSync(path.join(cwd, 'packages/test-core/package.json'))).version;
  if (commit !== PLATFORM_PIN || dirty || version !== '0.3.0') throw new Error('Unexpected Platform pin, version or local changes');
  return commit;
}

export function validateBudget(cases, preview) {
  if (cases.length !== LIMITS.requests || preview.questionCount !== LIMITS.questions ||
      Buffer.byteLength(JSON.stringify(preview.cases.map(row => row.request))) > LIMITS.totalBytes) {
    throw new Error('Unexpected corpus or request budget');
  }
}

export function summarize(cases, result) {
  const byId = new Map(result.cases.map(row => [row.id, row]));
  const findings = cases.map(item => {
    const row = byId.get(item.id);
    const decisions = Object.values(row?.result?.findings || {}).map(answer => answer.decision);
    const status = row?.error ? 'error' : decisions.length !== Object.keys(item.requirements).length ? 'not-run' :
      decisions.includes('review') ? 'review' : decisions.every(value => value === item.expected) ? 'pass' : 'fail';
    return { id: item.id, kind: item.kind, expected: item.expected, status };
  });
  const controlsPassed = findings.filter(row => row.kind === 'control').length === 14 &&
    findings.filter(row => row.kind === 'control').every(row => row.status === 'pass');
  return { controlsPassed, findings, status: !result.complete ? 'error' : !controlsPassed ? 'review' :
    findings.some(row => row.status === 'fail') ? 'fail' : findings.some(row => row.status !== 'pass') ? 'review' : 'pass' };
}

function credentials(wranglerAuth) {
  let accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const config = path.join(ROOT, '.ascii-vj-development.json');
  if (!accountId && existsSync(config)) accountId = JSON.parse(readFileSync(config)).cloudflare_account_id;
  if (!/^[a-fA-F0-9]{32}$/.test(accountId || '')) throw new Error('Cloudflare account configuration required');
  let token = process.env.CLOUDFLARE_API_TOKEN;
  if (wranglerAuth || !token) {
    // Reuse the repository's pinned Wrangler dependency; never install a tool or log its output.
    const wrangler = path.join(ROOT, 'node_modules/wrangler/bin/wrangler.js');
    const auth = JSON.parse(execFileSync(process.execPath, [wrangler, 'auth', 'token', '--json'],
      { cwd: ROOT, encoding: 'utf8', timeout: 45000, stdio: ['ignore', 'pipe', 'pipe'] }));
    token = auth.token || auth.access_token;
  }
  if (typeof token !== 'string' || !token.trim()) throw new Error('Cloudflare authentication required');
  return { accountId, token };
}

function reviewMarkdown(report, cases) {
  const lines = ['# ASCII VJ Jev development review', '', `Status: ${report.status}. Controls passed: ${report.controlsPassed ?? false}.`,
    '', 'Synthetic behavior evidence only. No visual, native hardware, or release acceptance.',
    'The 0.10 margin is provisional. Controls are engineering labels, not independent human validation.', ''];
  for (const item of cases) {
    const row = report.cases?.find(row => row.id === item.id);
    lines.push(`## ${item.id}`, '', `Expected: ${item.expected}`, '', '```json', item.candidate, '```', '',
      `Requirement: ${item.requirements.meaning}`, '', '```json', JSON.stringify(row?.result?.findings || { status: 'not-run' }, null, 2), '```', '');
  }
  return lines.join('\n');
}

export async function runEvaluation({ dryRun = false, wranglerAuth = false, outputDir } = {}) {
  const platformCommit = verifyPlatform();
  const cases = await prepareCases(); // Exact assertions and complete validation precede authentication.
  const preview = await evaluateJevCases(cases, { policy: POLICY, maxQuestions: LIMITS.questions });
  validateBudget(cases, preview);
  const output = path.resolve(outputDir || path.join(ROOT, 'jev-results', new Date().toISOString().replace(/[:.]/g, '-')));
  mkdirSync(path.dirname(output), { recursive: true });
  mkdirSync(output); // Evidence is immutable: refuse an existing directory.
  const metadata = { createdAt: new Date().toISOString(), platformCommit, testCoreVersion: '0.3.0',
    dryRun, limits: LIMITS, sourceHashes: Object.fromEntries(SOURCES.map(file => [file, hash(readFileSync(path.join(ROOT, file)))])),
    requestSha256: hash(JSON.stringify(preview.cases.map(row => row.request))), deterministicFixturesPassed: true };
  save(output, 'requests.json', preview.cases);
  let report = { ...preview, ...metadata, status: dryRun ? 'dry-run' : 'error' };
  try {
    if (!dryRun) {
      const auth = credentials(wranglerAuth);
      const result = await evaluateJevCases(cases, { policy: POLICY, maxQuestions: LIMITS.questions,
        call: payload => callCloudflareJev(payload, auth),
        onProgress: partial => {
          report = { ...partial, ...metadata, status: 'error' };
          save(output, 'progress.json', report);
        } });
      report = { ...result, ...metadata, ...summarize(cases, result) };
    }
  } catch { report = { ...report, complete: false, status: 'error', error: 'Evaluation stopped. Check local authentication and evidence storage; no credentials or provider error details recorded.' }; }
  save(output, 'report.json', report);
  writeFileSync(path.join(output, 'review.md'), reviewMarkdown(report, cases));
  console.log(`Jev ${report.status}: ${output}`);
  return report.status === 'error' ? 2 : ['review', 'fail'].includes(report.status) ? 1 : 0;
}

async function main() {
  const { values } = parseArgs({ options: { 'dry-run': { type: 'boolean' }, 'wrangler-auth': { type: 'boolean' },
    'output-dir': { type: 'string' }, help: { type: 'boolean' } } });
  if (values.help) {
    console.log('npm run test:jev -- [--dry-run] [--wrangler-auth] [--output-dir NEW_DIRECTORY]\nOnly built-in synthetic cases. Live by default. No retries or private report inputs.');
    return;
  }
  process.exitCode = await runEvaluation({ dryRun: values['dry-run'], wranglerAuth: values['wrangler-auth'], outputDir: values['output-dir'] });
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(() => { console.error('Jev preparation failed. Verify the pinned submodule, fixture assertions and a new output directory. No network request is made before local preparation succeeds.'); process.exitCode = 2; });
}
