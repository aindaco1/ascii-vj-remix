#!/usr/bin/env node
import assert from 'node:assert/strict';
import { crashReportUiState, pendingCrashReportCount } from '../renderers/desktop/crash-report-ui.js';

assert.equal(pendingCrashReportCount({ pendingCount: -2 }), 0);
assert.equal(pendingCrashReportCount({ pendingCount: 2.9 }), 2);
assert.equal(pendingCrashReportCount({ pendingCount: 'bad' }), 0);

assert.deepEqual(
  crashReportUiState({ tauri: false, state: { available: true, pendingCount: 0, preference: 'ask' } }),
  {
    hidden: true,
    pending: false,
    pendingCount: 0,
    label: 'Reports',
    title: 'Review crash reporting preferences',
    sendDisabled: true,
    discardDisabled: true
  }
);

assert.deepEqual(
  crashReportUiState({ tauri: true, state: { available: true, pendingCount: 0, preference: 'ask' } }),
  {
    hidden: false,
    pending: false,
    pendingCount: 0,
    label: 'Reports',
    title: 'Review crash reporting preferences',
    sendDisabled: true,
    discardDisabled: true
  }
);

assert.deepEqual(
  crashReportUiState({ tauri: true, state: { available: true, pendingCount: 2, preference: 'ask' } }),
  {
    hidden: false,
    pending: true,
    pendingCount: 2,
    label: 'Reports 2',
    title: '2 pending crash reports',
    sendDisabled: false,
    discardDisabled: false
  }
);

const disabled = crashReportUiState({
  tauri: true,
  state: { available: true, pendingCount: 1, preference: 'off' },
  busy: true
});
assert.equal(disabled.hidden, false);
assert.equal(disabled.label, 'Reports 1');
assert.equal(disabled.sendDisabled, true);
assert.equal(disabled.discardDisabled, true);

console.log('Crash report UI tests passed.');
