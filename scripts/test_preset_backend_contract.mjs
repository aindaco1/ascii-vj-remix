#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  explicitCanvasRendererDecision,
  selectRendererBackend
} from '../renderers/gpu/ascii/renderer/backend-policy.js';
import {
  BUILTIN_PRESET_BACKEND_BASELINE,
  validateBuiltInPresetBackendContract
} from '../renderers/shared/preset-backend-contract.js';

const windowsWebViewGlyphPreset = {
  backend: 'auto',
  glyphMode: true,
  solidMode: false,
  userAgent: 'Windows NT 10.0; WebView2',
  tauriRuntime: true
};
const acceleratedCapabilities = { webgpu: true, webgl2: true, cpu: true };

// Host metadata must never preemptively move an Auto preset to Canvas.
assert.equal(explicitCanvasRendererDecision(windowsWebViewGlyphPreset), null);
assert.equal(selectRendererBackend(acceleratedCapabilities, windowsWebViewGlyphPreset), 'webgpu');
assert.equal(
  selectRendererBackend({ webgpu: false, webgl2: true, cpu: true }, windowsWebViewGlyphPreset),
  'webgl2'
);

assert.deepEqual(
  explicitCanvasRendererDecision({ ...windowsWebViewGlyphPreset, backend: 'canvas2d' }),
  {
    params: { ...windowsWebViewGlyphPreset, backend: 'canvas2d' },
    compatibilityReason: ''
  }
);
assert.equal(
  explicitCanvasRendererDecision({ ...windowsWebViewGlyphPreset, backend: 'pixel-canvas' })?.params?.backend,
  'pixel-canvas'
);

assert.equal(validateBuiltInPresetBackendContract(BUILTIN_PRESET_BACKEND_BASELINE).ok, true);
const collapsedWindowsContract = validateBuiltInPresetBackendContract({
  presetCount: BUILTIN_PRESET_BACKEND_BASELINE.presetCount,
  acceleratedEligible: 7,
  canvasEligible: BUILTIN_PRESET_BACKEND_BASELINE.presetCount - 7
});
assert.equal(collapsedWindowsContract.ok, false);
assert.deepEqual(collapsedWindowsContract.mismatches, [
  'acceleratedEligible:7!=42',
  'canvasEligible:63!=28'
]);

console.log('preset-backend-contract: ok');
