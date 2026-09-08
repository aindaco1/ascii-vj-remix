import { crashFingerprint } from './fingerprint.js';
import { submitCrashReport } from './github.js';
import { checkIpRateLimit } from './rate-limit.js';
import { sanitizeCrashPayload } from './sanitize.js';
import { podcastFingerprint, validatePodcastReport } from './podcast.js';
export { PodcastReportGroup } from './podcast-aggregation.js';
import { cutNotesFingerprint, validateCutNotesReport } from './cutnotes.js';
export { CutNotesReportGroup } from './cutnotes-aggregation.js';
import { mkvFingerprint, validateMkvReport } from './mkv.js';
import { mkvReviewPage } from './mkv-review.js';
export { MkvReportGroup } from './mkv-aggregation.js';
import { validateAutoSubtitleReport, autoSubtitleFingerprint } from './auto-subtitle-contract.mjs';
export { AutoSubtitleReportGroup } from './auto-subtitle-aggregation.js';

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers
    }
  });
}

function maxPayloadBytes(env) {
  const value = Number(env.CRASH_MAX_PAYLOAD_BYTES);
  return Number.isFinite(value) && value > 1024 ? value : 24576;
}

const EXPECTED_PERMISSION_COMMANDS = new Set([
  'request_media_permission',
  'start_input_audio_capture',
  'start_system_audio_capture'
]);

const NON_FATAL_DIAGNOSTIC_COMMANDS = new Set([
  'record_media_diagnostic'
]);

function isPermissionLikeText(value) {
  const raw = String(value || '').toLowerCase();
  return raw.includes('permission') ||
    raw.includes('declined') ||
    raw.includes('notallowed') ||
    raw.includes('not allowed') ||
    raw.includes('no shareable content') ||
    raw.includes('content unavailable') ||
    raw.includes('tcc');
}

function isUnavailableInputHardwareText(value) {
  const raw = String(value || '').toLowerCase();
  return raw.includes('no default microphone input device') ||
    raw.includes('requested audio device is not available') ||
    raw.includes('audio device is unavailable') ||
    raw.includes('devicenotavailable') ||
    raw.includes('device disconnected') ||
    raw.includes('device has been disconnected');
}

function ignoredCrashReportReason(sanitized) {
  const report = sanitized?.report || {};
  const context = report.context || {};
  if (report.kind !== 'tauri-command' || report.surface !== 'tauri-command') return '';
  const command = String(context.command || '');
  if (NON_FATAL_DIAGNOSTIC_COMMANDS.has(command)) return 'nonfatal-diagnostic-write-failure';
  if (command === 'start_input_audio_capture' && (
    isUnavailableInputHardwareText(report.message) ||
    isUnavailableInputHardwareText(context.name) ||
    isUnavailableInputHardwareText(context.code)
  )) return 'expected-hardware-unavailable';
  if (!EXPECTED_PERMISSION_COMMANDS.has(command)) return '';
  return (isPermissionLikeText(report.message) ||
    isPermissionLikeText(context.name) ||
    isPermissionLikeText(context.code) ||
    isPermissionLikeText(context.statusCode))
    ? 'expected-permission-denial'
    : '';
}

function isIgnoredCrashReport(sanitized) {
  return Boolean(ignoredCrashReportReason(sanitized));
}

async function readBoundedJson(request, env) {
  const limit = maxPayloadBytes(env);
  const length = Number(request.headers.get('Content-Length') || 0);
  if (Number.isFinite(length) && length > limit) {
    throw new Error('Crash report payload is too large');
  }
  if (!request.body) return {};
  const reader = request.body.getReader();
  const chunks = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > limit) {
      await reader.cancel().catch(() => {});
      throw new Error('Crash report payload is too large');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder().decode(bytes);
  return JSON.parse(text);
}

async function handleReport(request, env) {
  if (String(env.CRASH_REPORTS_ENABLED || 'false') !== 'true') {
    return json({ error: 'Crash reporting disabled' }, 503);
  }

  const limited = await checkIpRateLimit(request, env);
  if (!limited.ok) {
    const headers = limited.retryAfter ? { 'Retry-After': String(limited.retryAfter) } : {};
    return json({ error: limited.error }, limited.status || 429, headers);
  }

  let payload;
  try {
    payload = await readBoundedJson(request, env);
  } catch {
    return json({ error: 'Invalid crash report payload' }, 400);
  }

  let sanitized;
  try {
    sanitized = sanitizeCrashPayload(payload, env);
  } catch (error) {
    return json({ error: error.message || 'Crash report rejected' }, 400);
  }

  const ignoredReason = ignoredCrashReportReason(sanitized);
  if (ignoredReason) {
    return json({
      ok: true,
      reportId: sanitized.report.id,
      action: 'ignored',
      reason: ignoredReason
    });
  }

  const fingerprint = await crashFingerprint(sanitized);
  try {
    const result = await submitCrashReport(env, sanitized, fingerprint);
    return json({
      ok: true,
      reportId: sanitized.report.id,
      fingerprint,
      ...result
    });
  } catch (error) {
    console.error(JSON.stringify({
      scope: 'crash-relay',
      event: 'github-submit-failed',
      fingerprint,
      error: error?.message || String(error)
    }));
    return json({ error: 'Unable to submit crash report', fingerprint }, 502);
  }
}

async function handleReviewedReport(request, env, adapter) {
  if (env[adapter.enabled] !== 'true' || !env[adapter.binding]) {
    return json({ error: `${adapter.name} reporting is not enabled` }, 503);
  }
  if (adapter.browserOnly && request.headers.get('Origin') !== new URL(request.url).origin) {
    return json({ error: 'Same-origin review required' }, 403);
  }
  const limited = await checkIpRateLimit(request, env);
  if (!limited.ok) return json({ error: 'Report rate limit exceeded' }, limited.status || 429,
    limited.retryAfter ? { 'Retry-After': String(limited.retryAfter) } : {});
  let report;
  try {
    if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw new Error();
    report = adapter.validate(await readBoundedJson(request, { CRASH_MAX_PAYLOAD_BYTES: adapter.maximumBytes }));
  } catch { return json({ error: `Invalid ${adapter.name} report` }, 400); }
  const fingerprint = await adapter.fingerprint(report);
  const groups = env[adapter.binding];
  const group = groups.get(groups.idFromName(`${adapter.namespace}:${fingerprint}`));
  return group.fetch(new Request('https://internal/report', { method: 'POST', body: JSON.stringify(report) }));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true, service: 'ascii-vj-crash-relay' });
    }
    if (request.method === 'GET' && url.pathname === '/mkv-magic/review') return mkvReviewPage();
    if (request.method === 'POST' && url.pathname === '/v1/mkv-magic/reports') {
      return handleReviewedReport(request, env, { name: 'MKV Magic', enabled: 'MKV_REPORTS_ENABLED',
        binding: 'MKV_REPORT_GROUPS', namespace: 'mkv-magic', maximumBytes: '4096', browserOnly: true,
        validate: validateMkvReport, fingerprint: mkvFingerprint });
    }
    if (request.method === 'POST' && url.pathname === '/v1/reports') {
      return handleReport(request, env);
    }
    if (request.method === 'POST' && url.pathname === '/v1/podcast-visualizer/reports') {
      return handleReviewedReport(request, env, { name: 'Podcast Visualizer', enabled: 'PODCAST_REPORTS_ENABLED',
        binding: 'PODCAST_REPORT_GROUPS', namespace: 'podcast-visualizer', maximumBytes: '8192',
        validate: validatePodcastReport, fingerprint: podcastFingerprint });
    }
    if (request.method === 'POST' && url.pathname === '/v1/cutnotes/reports') {
      return handleReviewedReport(request, env, { name: 'CutNotes', enabled: 'CUTNOTES_REPORTS_ENABLED',
        binding: 'CUTNOTES_REPORT_GROUPS', namespace: 'cutnotes', maximumBytes: '8192',
        validate: validateCutNotesReport, fingerprint: cutNotesFingerprint });
    }
    if (request.method === 'POST' && url.pathname === '/v1/auto-subtitle/reports') {
      return handleReviewedReport(request, env, { name: 'Auto Subtitle', enabled: 'AUTO_SUBTITLE_REPORTS_ENABLED',
        binding: 'AUTO_SUBTITLE_REPORT_GROUPS', namespace: 'auto-subtitle', maximumBytes: '4096',
        validate: validateAutoSubtitleReport,
        fingerprint: autoSubtitleFingerprint });
    }
    return json({ error: 'Not found' }, 404);
  }
};

export { ignoredCrashReportReason, isIgnoredCrashReport, isPermissionLikeText };
