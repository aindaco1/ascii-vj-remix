#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createRendererWithFallback } from '../renderers/gpu/ascii/renderer/fallback.js';
import {
  RendererDiagnosticLog,
  rendererFailureKey,
  rendererFailureReport
} from '../renderers/desktop/renderer-diagnostics.js';

let fallbackCalls = 0;
const preferred = await createRendererWithFallback(
  async () => 'webgl2',
  async () => {
    fallbackCalls += 1;
    return 'canvas2d';
  }
);
assert.equal(preferred.value, 'webgl2');
assert.equal(preferred.fallbackError, null);
assert.equal(fallbackCalls, 0);

const failure = Object.assign(new Error('GPU failed at C:\\Users\\alice\\private.mov'), {
  code: 'GPU_DEVICE_LOST'
});
const recovered = await createRendererWithFallback(
  async () => { throw failure; },
  async (error) => {
    assert.equal(error, failure);
    fallbackCalls += 1;
    return 'canvas2d';
  }
);
assert.equal(recovered.value, 'canvas2d');
assert.equal(recovered.fallbackError, failure);
assert.equal(fallbackCalls, 1);

const diagnostics = new RendererDiagnosticLog(2);
diagnostics.record({ event: 'create-start', presetId: 'palette-signal-court', atMs: 1 });
diagnostics.record({ event: 'gpu-failed', message: failure.message, atMs: 2 });
diagnostics.record({ event: 'canvas-fallback', actualBackend: 'canvas2d', atMs: 3 });
assert.equal(diagnostics.snapshot().length, 2);
assert.doesNotMatch(JSON.stringify(diagnostics.snapshot()), /alice|private\.mov/i);

const report = rendererFailureReport(failure, {
  phase: 'preset-transition',
  presetId: 'palette-signal-court',
  requestedBackend: 'webgpu',
  actualBackend: 'canvas2d',
  fallbackBackend: 'canvas2d',
  recovered: true,
  sourceMode: 'static',
  mediaType: 'image'
}, diagnostics.snapshot());
assert.equal(report.kind, 'renderer-error');
assert.equal(report.context.presetId, 'palette-signal-court');
assert.equal(report.context.recovered, true);
assert.equal(report.context.rendererDiagnostics.length, 2);
assert.doesNotMatch(JSON.stringify(report), /alice|private\.mov/i);
assert.equal(rendererFailureKey(failure, report.context), rendererFailureKey(failure, report.context));

console.log('Renderer fallback and diagnostics tests passed.');
