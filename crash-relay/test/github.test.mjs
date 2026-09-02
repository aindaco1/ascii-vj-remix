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
        source: 'app.js',
        lineno: 4021,
        colno: 33,
        backend: 'webgpu',
        requestedBackend: 'webgpu',
        actualBackend: 'canvas2d',
        fallbackBackend: 'canvas2d',
        recovered: true,
        nativeOutputCapabilities: {
          nativeCamera: true,
          nativeCameraMirrorFallback: true,
          mirror: true
        },
        nativeOutputMirror: {
          active: true,
          targetFps: 30,
          acceptedFps: 27.5,
          transport: 'raw-rgba'
        },
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
  assert.match(body, /source: `app\.js`/);
  assert.match(body, /lineno: `4021`/);
  assert.match(body, /colno: `33`/);
  assert.match(body, /## Renderer Diagnostics/);
  assert.match(body, /"event": "fallback-active"/);
  assert.match(body, /## Runtime Diagnostics/);
  assert.match(body, /"acceptedFps": 27\.5/);
  assert.match(body, /"nativeCameraMirrorFallback": true/);
  assert.equal(parseState(body, 'abc123').count, 2);
});

test('issue body accepts legacy renderer diagnostic field', () => {
  const sanitized = {
    app: {
      name: 'ASCII VJ Remix', version: '1.0.2', identifier: 'com.asciline.remix',
      channel: 'production', buildProfile: 'release', os: 'windows', arch: 'x86_64'
    },
    report: {
      kind: 'manual-diagnostic', surface: 'manual', message: 'Camera test', stack: '',
      capturedAt: '2026-09-01T00:00:00Z',
      context: { recentRendererEvents: [{ event: 'legacy-fallback' }] }
    }
  };
  const state = {
    fingerprint: 'legacy123', count: 1, firstSeen: '2026-09-01T00:00:00Z',
    lastSeen: '2026-09-01T00:00:00Z', versions: { '1.0.2': 1 },
    platforms: { 'windows/x86_64': 1 }, grouping: {}
  };

  assert.match(issueBody(sanitized, 'legacy123', state), /"event": "legacy-fallback"/);
});
