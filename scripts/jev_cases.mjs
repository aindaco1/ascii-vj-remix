// Development fixtures only. Exercise existing behavior; never read user reports.
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRendererWithFallback } from '../renderers/gpu/ascii/renderer/fallback.js';
import { rendererFailureReport } from '../renderers/desktop/renderer-diagnostics.js';
import { DesktopUpdateController } from '../renderers/desktop/update-controller.js';
import { StaticSmokeDiagnostics } from './lib/static_smoke_diagnostics.mjs';

export const RUBRICS = [
  {
    id: 'renderer-recovered',
    requirement: 'The report distinguishes the requested WebGPU backend from the active Canvas2D fallback after a GPU failure.',
    good: 'WebGPU failed. Rendering recovered using Canvas2D.',
    bad: 'WebGPU is active and working normally; no fallback occurred.'
  },
  {
    id: 'renderer-unrecovered',
    requirement: 'The report communicates that renderer startup failed without successful recovery.',
    good: 'Renderer startup failed. Recovery was unsuccessful.',
    bad: 'Renderer startup succeeded and playback recovered.'
  },
  {
    id: 'smoke-startup',
    requirement: 'The evidence preserves an application initialization timeout as the test failure, even though the document loaded.',
    good: 'The document loaded, but application initialization timed out. The test failed.',
    bad: 'The document loaded, so application initialization passed without a timeout.'
  },
  {
    id: 'smoke-capture-unavailable',
    requirement: 'The evidence explicitly retains renderer startup as failed, even when diagnostic capture is unavailable. A timeout of diagnostic capture alone does not establish renderer startup failure.',
    good: 'Original failure: renderer startup failed. Additional diagnostic capture timed out; page state is unknown.',
    bad: 'Diagnostic capture timed out, replacing the original failure. Renderer startup passed.'
  },
  {
    id: 'updater-available',
    requirement: 'The status describes an update as available, without claiming it has already been installed.',
    good: 'v9.9.9 available',
    bad: 'v9.9.9 has been installed successfully.'
  },
  {
    id: 'updater-check-failed',
    requirement: 'The status reports an unsuccessful update check, without claiming the app is up to date.',
    good: 'Check failed',
    bad: 'Up to date'
  }
];

const syntheticError = message => Object.assign(new Error(message), { stack: '' });

export async function captureCandidates() {
  const candidates = {};
  const failure = syntheticError('GPU initialization failed');
  const recovered = await createRendererWithFallback(async () => { throw failure; }, async () => 'canvas2d');
  assert.equal(recovered.value, 'canvas2d');
  assert.equal(recovered.fallbackError, failure);
  const report = rendererFailureReport(failure, {
    phase: 'startup', requestedBackend: 'webgpu', actualBackend: recovered.value,
    fallbackBackend: recovered.value, recovered: true, sourceMode: 'static', mediaType: 'image'
  });
  assert.equal(report.context.recovered, true);
  candidates['renderer-recovered'] = JSON.stringify(report);

  let finalError;
  try {
    await createRendererWithFallback(async () => { throw failure; }, async () => { throw syntheticError('Canvas initialization failed'); });
    assert.fail('Both renderer constructors failed; recovery must reject');
  } catch (error) { finalError = error; }
  assert.equal(finalError.message, 'Canvas initialization failed');
  const unrecovered = rendererFailureReport(finalError, { phase: 'startup', requestedBackend: 'webgpu', recovered: false });
  assert.equal(unrecovered.context.recovered, false);
  candidates['renderer-unrecovered'] = JSON.stringify(unrecovered);

  const scratch = await mkdtemp(path.join(os.tmpdir(), 'ascii-vj-jev-fixtures-'));
  try {
    const page = new EventEmitter();
    page.isClosed = () => false;
    page.screenshot = async () => {}; // No image is captured or submitted.
    page.evaluate = async () => ({ readyState: 'complete', appPresent: false, sourceOptionCount: 0 });
    const diagnostics = new StaticSmokeDiagnostics({ outputDir: scratch, errors: [], timeoutMs: 20, emit() {} });
    diagnostics.phase = 'main app initialization';
    diagnostics.runtime = { browser: 'synthetic fixture' };
    diagnostics.observe(page, 'main');
    const startup = await diagnostics.capture(syntheticError('Application initialization timed out'));
    assert.equal(startup.failure.message, 'Application initialization timed out');
    assert.equal(startup.pages[0].state.appPresent, false);
    // Only explicitly selected synthetic fields are ever eligible for Jev.
    const select = value => JSON.stringify({ phase: value.phase, failure: value.failure, pages: value.pages });
    candidates['smoke-startup'] = select(startup);
    page.evaluate = () => new Promise(() => {});
    const missing = await diagnostics.capture(syntheticError('Renderer startup failed'));
    assert.equal(missing.failure.message, 'Renderer startup failed');
    assert.match(missing.pages[0].captureError, /timed out/);
    candidates['smoke-capture-unavailable'] = select(missing);
  } finally { await rm(scratch, { recursive: true, force: true }); }

  for (const available of [true, false]) {
    let installs = 0;
    const controller = new DesktopUpdateController({
      checkForUpdate: async () => { if (available) return { version: '9.9.9' }; throw syntheticError('offline'); },
      installUpdate: async () => { installs++; }, logger: { warn() {} }
    });
    controller.setAvailable(true);
    if (available) await controller.checkOnLaunch();
    else await controller.activate();
    assert.equal(installs, 0);
    const status = controller.snapshot().status;
    assert.equal(status, available ? 'v9.9.9 available' : 'Check failed');
    candidates[available ? 'updater-available' : 'updater-check-failed'] = status;
  }
  return candidates;
}

export async function prepareCases() {
  const candidates = await captureCandidates();
  const cases = [];
  for (const rubric of RUBRICS) {
    for (const [label, expected] of [['good', 'pass'], ['bad', 'fail']]) {
      cases.push({ id: `control-${rubric.id}-${label}`, kind: 'control', expected,
        candidate: rubric[label], requirements: { meaning: rubric.requirement } });
    }
  }
  // New phrasings fixed before the revised rubric's first live run. Once
  // inspected, these are regression controls, not a reusable held-out set.
  const captureRequirement = RUBRICS.find(row => row.id === 'smoke-capture-unavailable').requirement;
  for (const [label, expected, candidate] of [
    ['good', 'pass', 'Renderer did not start; we could not retrieve page diagnostics afterward.'],
    ['bad', 'fail', 'Renderer status unknown. The only observed failure was diagnostic capture timing out.']
  ]) {
    cases.push({ id: `validation-smoke-capture-${label}`, kind: 'control', expected,
      candidate, requirements: { meaning: captureRequirement } });
  }
  for (const rubric of RUBRICS) {
    cases.push({ id: rubric.id, kind: 'behavior', expected: 'pass', candidate: candidates[rubric.id],
      requirements: { meaning: rubric.requirement } });
  }
  return cases;
}
