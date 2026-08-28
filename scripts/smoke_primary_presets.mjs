#!/usr/bin/env node

process.env.ASCILINE_UI_PERF_SMOKE_PRESET_SWEEP = '1';
process.env.ASCILINE_UI_PERF_SMOKE_DURATION_MS ||= '30000';

await import('./smoke_ui_perf.mjs');
