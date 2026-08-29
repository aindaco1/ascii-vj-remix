import test from 'node:test';
import assert from 'node:assert/strict';
import { issueBody, parseState } from '../src/github.js';

test('issue body carries fingerprint and parseable aggregation state', () => {
  const sanitized = {
    app: {
      name: 'ASCII VJ Remix',
      version: '0.9.2',
      identifier: 'com.asciline.remix',
      channel: 'production',
      buildProfile: 'release',
      os: 'macos',
      arch: 'aarch64'
    },
    report: {
      kind: 'frontend-error',
      surface: 'renderer',
      message: 'Renderer failed',
      stack: 'Error: Renderer failed',
      capturedAt: '2026-06-25T00:00:00Z',
      context: {
        phase: 'preset-transition',
        presetId: 'palette-signal-court',
        backend: 'webgpu',
        requestedBackend: 'webgpu',
        actualBackend: 'canvas2d',
        fallbackBackend: 'canvas2d',
        recovered: true,
        rendererDiagnostics: [{
          event: 'fallback-active',
          presetId: 'palette-signal-court',
          requestedBackend: 'webgpu',
          actualBackend: 'canvas2d'
        }]
      }
    }
  };
  const state = {
    fingerprint: 'abc123',
    count: 2,
    firstSeen: '2026-06-25T00:00:00Z',
    lastSeen: '2026-06-25T00:10:00Z',
    versions: { '0.9.2': 2 },
    platforms: { 'macos/aarch64': 2 },
    grouping: {
      basis: 'error-code',
      kind: 'frontend-error',
      surface: 'renderer',
      platform: 'macos/aarch64',
      backend: 'webgpu',
      errorCode: 'gpu-device-lost'
    }
  };
  const body = issueBody(sanitized, 'abc123', state);
  assert.match(body, /crash-fingerprint:abc123/);
  assert.match(body, /basis: `error-code`/);
  assert.match(body, /macos\/aarch64: 2/);
  assert.match(body, /presetId: `palette-signal-court`/);
  assert.match(body, /## Renderer Diagnostics/);
  assert.match(body, /"event": "fallback-active"/);
  assert.equal(parseState(body, 'abc123').count, 2);
});
