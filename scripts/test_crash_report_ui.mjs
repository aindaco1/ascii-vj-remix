#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  crashReportSourceLabel,
  crashReportUiState,
  isCrashReportControlLabel,
  pendingCrashReportCount
} from '../renderers/desktop/crash-report-ui.js';
import { isReportableTauriCommandFailure } from '../renderers/desktop/tauri-adapter.js';

assert.equal(pendingCrashReportCount({ pendingCount: -2 }), 0);
assert.equal(pendingCrashReportCount({ pendingCount: 2.9 }), 2);
assert.equal(pendingCrashReportCount({ pendingCount: 'bad' }), 0);
assert.equal(isCrashReportControlLabel('Reports'), true);
assert.equal(isCrashReportControlLabel('Reports 2'), true);
assert.equal(isCrashReportControlLabel('Reports 0'), false);
assert.equal(isCrashReportControlLabel('Crash 2'), false);
assert.equal(crashReportSourceLabel('tauri://localhost/app.js?v=123#frame'), 'app.js');
assert.equal(crashReportSourceLabel('/Users/alice/private/app.js'), 'app.js');
assert.equal(crashReportSourceLabel('C:\\Users\\alice\\app bundle.js'), 'app_bundle.js');

assert.deepEqual(
  crashReportUiState({ tauri: false, state: { available: true, production: false, pendingCount: 0, preference: 'ask' } }),
  {
    hidden: true,
    pending: false,
    pendingCount: 0,
    label: 'Reports',
    title: 'Review diagnostic reporting preferences',
    sendDisabled: true,
    discardDisabled: true
  }
);

assert.deepEqual(
  crashReportUiState({ tauri: true, state: { available: true, production: true, pendingCount: 0, preference: 'ask' } }),
  {
    hidden: false,
    pending: false,
    pendingCount: 0,
    label: 'Reports',
    title: 'Review diagnostic reporting preferences',
    sendDisabled: true,
    discardDisabled: true
  }
);

assert.deepEqual(
  crashReportUiState({ tauri: true, state: { available: true, production: true, pendingCount: 2, preference: 'ask' } }),
  {
    hidden: false,
    pending: true,
    pendingCount: 2,
    label: 'Reports 2',
    title: '2 pending diagnostic reports',
    sendDisabled: false,
    discardDisabled: false
  }
);

const disabled = crashReportUiState({
  tauri: true,
  state: { available: true, production: true, pendingCount: 1, preference: 'off' },
  busy: true
});
assert.equal(disabled.hidden, false);
assert.equal(disabled.label, 'Reports 1');
assert.equal(disabled.sendDisabled, true);
assert.equal(disabled.discardDisabled, true);

const localOnly = crashReportUiState({
  tauri: true,
  state: { available: true, production: false, pendingCount: 1, preference: 'ask' }
});
assert.equal(localOnly.title, '1 pending local-only diagnostic report');
assert.equal(localOnly.sendDisabled, true);
assert.equal(localOnly.discardDisabled, false);

assert.equal(
  isReportableTauriCommandFailure(
    'record_media_diagnostic',
    new Error('Could not open media diagnostics log: path not found')
  ),
  false
);
assert.equal(
  isReportableTauriCommandFailure(
    'request_media_permission',
    new Error('Camera permission denied')
  ),
  false
);
assert.equal(
  isReportableTauriCommandFailure(
    'start_input_audio_capture',
    new Error('Could not build microphone input stream: The requested audio device is not available. It may have been disconnected.')
  ),
  false
);
assert.equal(
  isReportableTauriCommandFailure(
    'open_native_output_window',
    new Error('Native renderer failed')
  ),
  true
);

console.log('Crash report UI tests passed.');
