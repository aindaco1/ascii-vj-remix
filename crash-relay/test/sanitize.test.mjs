import test from 'node:test';
import assert from 'node:assert/strict';
import { crashFingerprint, crashGroupingSummary } from '../src/fingerprint.js';
import { ignoredCrashReportReason, isIgnoredCrashReport } from '../src/index.js';
import { sanitizeCrashPayload } from '../src/sanitize.js';

const env = { CRASH_ALLOWED_APP_IDENTIFIER: 'com.asciline.remix' };

test('sanitizes paths, URLs, emails, and secret-looking context keys', () => {
  const report = sanitizeCrashPayload({
    app: { identifier: 'com.asciline.remix', version: '0.9.2' },
    report: {
      kind: 'frontend-error',
      surface: 'frontend',
      message: 'failed /Users/alice/private.mov alice@example.com',
      stack: 'Error: x\n    at file:///Users/alice/app.js:1:2',
      context: {
        backend: 'webgpu',
        token: 'secret',
        mediaUrl: 'asset://localhost/private.mov'
      }
    }
  }, env);

  assert.equal(report.app.identifier, 'com.asciline.remix');
  assert.match(report.report.message, /\[redacted-path\]/);
  assert.match(report.report.message, /\[redacted-email\]/);
  assert.match(report.report.stack, /\[redacted-url\]/);
  assert.equal(report.report.context.token, '[redacted]');
  assert.match(report.report.context.mediaUrl, /\[redacted-url\]/);
});

test('rejects reports from unexpected app identifiers', () => {
  assert.throws(() => sanitizeCrashPayload({
    app: { identifier: 'other.app' },
    report: { message: 'boom' }
  }, env), /identifier/);
});

test('preserves manual diagnostic kind and surface', () => {
  const report = sanitizeCrashPayload({
    app: { identifier: 'com.asciline.remix', version: '1.0.3' },
    report: {
      kind: 'manual-diagnostic',
      surface: 'manual',
      message: 'Camera Pop Out is choppy',
      context: { nativeOutputMirror: { acceptedFps: 14.2 } }
    }
  }, env);

  assert.equal(report.report.kind, 'manual-diagnostic');
  assert.equal(report.report.surface, 'manual');
  assert.equal(report.report.context.nativeOutputMirror.acceptedFps, 14.2);
});

test('fingerprint is stable across local paths and patch versions', async () => {
  const left = sanitizeCrashPayload({
    app: { identifier: 'com.asciline.remix', version: '0.9.2' },
    report: {
      kind: 'frontend-error',
      surface: 'renderer',
      message: 'Renderer failed at frame 123',
      stack: 'Error\n at file:///Users/alice/app.js:10:20'
    }
  }, env);
  const right = sanitizeCrashPayload({
    app: { identifier: 'com.asciline.remix', version: '0.9.3' },
    report: {
      kind: 'frontend-error',
      surface: 'renderer',
      message: 'Renderer failed at frame 456',
      stack: 'Error\n at file:///Users/bob/app.js:90:40'
    }
  }, env);

  assert.equal(await crashFingerprint(left), await crashFingerprint(right));
});

test('fingerprint groups same platform and error code across message and stack variants', async () => {
  const left = sanitizeCrashPayload({
    app: { identifier: 'com.asciline.remix', version: '0.9.2', os: 'macos', arch: 'aarch64' },
    report: {
      kind: 'renderer-error',
      surface: 'renderer',
      message: 'WebGPU adapter failed after 12 frames',
      stack: 'AdapterError\n at file:///Users/alice/webgpu.js:10:20',
      context: {
        errorCode: 'GPU_DEVICE_LOST',
        backend: 'webgpu',
        sourceMode: 'static'
      }
    }
  }, env);
  const right = sanitizeCrashPayload({
    app: { identifier: 'com.asciline.remix', version: '0.9.3', os: 'macos', arch: 'aarch64' },
    report: {
      kind: 'renderer-error',
      surface: 'renderer',
      message: 'Device lost while rendering different media',
      stack: 'DeviceLost\n at file:///Users/bob/renderer.js:90:40',
      context: {
        errorCode: 'gpu_device_lost',
        backend: 'webgpu',
        sourceMode: 'static'
      }
    }
  }, env);

  assert.equal(crashGroupingSummary(left).basis, 'error-code');
  assert.equal(await crashFingerprint(left), await crashFingerprint(right));
});

test('fingerprint separates different error codes on the same platform', async () => {
  const base = {
    app: { identifier: 'com.asciline.remix', version: '0.9.2', os: 'macos', arch: 'aarch64' },
    report: {
      kind: 'renderer-error',
      surface: 'renderer',
      message: 'Renderer failed',
      stack: 'Error\n at file:///Users/alice/renderer.js:10:20',
      context: {
        backend: 'webgpu',
        sourceMode: 'static'
      }
    }
  };
  const deviceLost = sanitizeCrashPayload({
    ...base,
    report: {
      ...base.report,
      context: { ...base.report.context, errorCode: 'GPU_DEVICE_LOST' }
    }
  }, env);
  const validation = sanitizeCrashPayload({
    ...base,
    report: {
      ...base.report,
      context: { ...base.report.context, errorCode: 'GPU_VALIDATION_ERROR' }
    }
  }, env);

  assert.notEqual(await crashFingerprint(deviceLost), await crashFingerprint(validation));
});

test('ignores expected macOS system audio permission denials', () => {
  const report = sanitizeCrashPayload({
    app: { identifier: 'com.asciline.remix', version: '0.9.2' },
    report: {
      kind: 'tauri-command',
      surface: 'tauri-command',
      message: 'Native system audio needs macOS Screen & System Audio Recording permission for ASCII VJ Remix: No shareable content available: Content unavailable: The user declined TCCs for application, window, display capture',
      context: {
        command: 'start_system_audio_capture',
        backend: 'canvas2d',
        sourceMode: 'static'
      }
    }
  }, env);

  assert.equal(isIgnoredCrashReport(report), true);
});

test('ignores unavailable virtual microphone hardware', () => {
  const report = sanitizeCrashPayload({
    app: { identifier: 'com.asciline.remix', version: '1.0.0', os: 'linux', arch: 'x86_64' },
    report: {
      kind: 'tauri-command',
      surface: 'tauri-command',
      message: 'Could not build microphone input stream: The requested audio device is not available. It may have been disconnected.',
      context: {
        command: 'start_input_audio_capture',
        backend: 'auto',
        sourceMode: 'static'
      }
    }
  }, env);

  assert.equal(isIgnoredCrashReport(report), true);
  assert.equal(ignoredCrashReportReason(report), 'expected-hardware-unavailable');
});

test('keeps unexpected Tauri command failures reportable', () => {
  const report = sanitizeCrashPayload({
    app: { identifier: 'com.asciline.remix', version: '0.9.2' },
    report: {
      kind: 'tauri-command',
      surface: 'tauri-command',
      message: 'Native renderer failed to allocate output buffer',
      context: {
        command: 'update_native_output_frame',
        backend: 'canvas2d',
        sourceMode: 'static'
      }
    }
  }, env);

  assert.equal(isIgnoredCrashReport(report), false);
});

test('ignores non-fatal media diagnostic writer failures', () => {
  const report = sanitizeCrashPayload({
    app: { identifier: 'com.asciline.remix', version: '0.9.12' },
    report: {
      kind: 'tauri-command',
      surface: 'tauri-command',
      message: 'Could not open media diagnostics log: The system cannot find the path specified.',
      context: {
        command: 'record_media_diagnostic',
        backend: 'auto',
        sourceMode: 'static',
        mediaType: 'image'
      }
    }
  }, env);

  assert.equal(isIgnoredCrashReport(report), true);
  assert.equal(ignoredCrashReportReason(report), 'nonfatal-diagnostic-write-failure');
});
