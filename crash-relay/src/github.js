import { createGitHubIssueReporter } from '@dustwave/desktop-core/github-issues';
import { createAppAuth } from '@octokit/auth-app';
import { crashGroupingSummary } from './fingerprint.js';
import { checkDailyIssueLimit, shouldUpdateIssue } from './rate-limit.js';

const GITHUB_API_VERSION = '2022-11-28';

function normalizePrivateKey(value) {
  return String(value || '').replace(/\\n/g, '\n').trim();
}

async function installationToken(env) {
  for (const key of ['GITHUB_APP_ID', 'GITHUB_APP_INSTALLATION_ID', 'GITHUB_APP_PRIVATE_KEY']) {
    if (!env[key]) throw new Error(`${key} is not configured`);
  }
  const auth = createAppAuth({
    appId: env.GITHUB_APP_ID,
    installationId: env.GITHUB_APP_INSTALLATION_ID,
    privateKey: normalizePrivateKey(env.GITHUB_APP_PRIVATE_KEY)
  });
  const result = await auth({ type: 'installation' });
  return result.token;
}

async function githubRequest(env, path, options = {}) {
  const token = await installationToken(env);
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    ...(env.REPORT_ISSUE_BODY ? { signal: AbortSignal.timeout(15000) } : {}),
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'ascii-vj-crash-relay',
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = data?.message || `GitHub API error ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.errors = data?.errors;
    error.providerOperation = ['GET', 'POST', 'PATCH'].includes(options.method) ? options.method : 'GET';
    error.providerReason = message === 'Resource not accessible by integration'
      ? 'integration_access'
      : message.toLowerCase().includes('secondary rate limit')
        ? 'secondary_rate_limit'
        : message === 'Validation Failed'
          ? 'validation_failed'
          : 'other';
    throw error;
  }
  return data;
}

function summarizeContext(context = {}) {
  const rows = [];
  for (const key of [
    'surface',
    'command',
    'phase',
    'presetId',
    'source',
    'lineno',
    'colno',
    'backend',
    'requestedBackend',
    'actualBackend',
    'fallbackBackend',
    'recovered',
    'sourceMode',
    'mediaType',
    'nativeOutputActive',
    'errorCode',
    'code',
    'statusCode'
  ]) {
    const value = context[key];
    if (value === undefined || value === null || value === '') continue;
    rows.push(`- ${key}: \`${String(value).slice(0, 160)}\``);
  }
  return rows.length ? rows.join('\n') : '- none';
}

function summarizeRendererDiagnostics(context = {}) {
  const source = Array.isArray(context.rendererDiagnostics)
    ? context.rendererDiagnostics
    : Array.isArray(context.recentRendererEvents)
      ? context.recentRendererEvents
      : [];
  const diagnostics = source.length
    ? source.slice(-8)
    : [];
  if (!diagnostics.length) return '_No renderer diagnostics captured._';
  return `\`\`\`json\n${JSON.stringify(diagnostics, null, 2)}\n\`\`\``;
}

function summarizeRuntimeDiagnostics(context = {}) {
  const details = {};
  for (const key of [
    'cameraStatus',
    'running',
    'transitioning',
    'nativeOutputCapabilities',
    'nativeOutputSync',
    'nativeOutputMirror',
    'renderer'
  ]) {
    if (context[key] !== undefined && context[key] !== null) details[key] = context[key];
  }
  if (context.podcastDiagnostics) details.podcastDiagnostics = context.podcastDiagnostics;
  if (context.cutnotesDiagnostics) details.cutnotesDiagnostics = context.cutnotesDiagnostics;
  if (context.mkvDiagnostics) details.mkvDiagnostics = context.mkvDiagnostics;
  if (context.recordDiagnostics) details.recordDiagnostics = context.recordDiagnostics;
  if (context.paperDiagnostics) details.paperDiagnostics = context.paperDiagnostics;
  if (context.autoSubtitleDiagnostics) details.autoSubtitleDiagnostics = context.autoSubtitleDiagnostics;
  if (!Object.keys(details).length) return '_No runtime diagnostics captured._';
  return `\`\`\`json\n${JSON.stringify(details, null, 2)}\n\`\`\``;
}

function countRows(map = {}) {
  return Object.entries(map || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => `- ${key}: ${count}`)
    .join('\n') || '- none';
}

function summarizeGrouping(grouping = {}) {
  const rows = [];
  for (const key of [
    'basis',
    'kind',
    'surface',
    'platform',
    'command',
    'backend',
    'sourceMode',
    'mediaType',
    'nativeOutputActive',
    'errorCode',
    'stackFrame',
    'message'
  ]) {
    const value = grouping?.[key];
    if (value === undefined || value === null || value === '') continue;
    rows.push(`- ${key}: \`${String(value).slice(0, 240)}\``);
  }
  return rows.length ? rows.join('\n') : '- none';
}

function issueTitle(sanitized, fingerprint) {
  const message = sanitized.report.message.replace(/\s+/g, ' ').slice(0, 82);
  const label = sanitized.report.kind === 'currentState' ? 'Support'
    : ['operationFailure', 'interruptedOperation', 'current_state', 'workflow_failure', 'interrupted_job'].includes(sanitized.report.kind)
      ? 'Diagnostic' : 'Crash';
  return `[${label} ${fingerprint}] ${message || sanitized.report.kind}`;
}

function issueBody(sanitized, fingerprint, state) {
  const app = sanitized.app;
  const report = sanitized.report;
  const versions = Object.entries(state.versions || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([version, count]) => `- ${version}: ${count}`)
    .join('\n') || '- none';
  const platforms = countRows(state.platforms);
  const stack = report.stack ? `\n\`\`\`text\n${report.stack}\n\`\`\`` : '\n_No stack captured._';

  return `${fingerprintMarker(fingerprint)}
${stateMarker(state)}

## Summary

- Fingerprint: \`${fingerprint}\`
- Kind: \`${report.kind}\`
- Surface: \`${report.surface}\`
- Count: \`${state.count}\`
- First seen: \`${state.firstSeen}\`
- Last seen: \`${state.lastSeen}\`

## Grouping

${summarizeGrouping(state.grouping)}

## Latest Report

- App: \`${app.name}\`
- Version: \`${app.version}\`
- Identifier: \`${app.identifier}\`
- Channel: \`${app.channel}\`
- Build: \`${app.buildProfile}\`
- OS: \`${app.os}\`
- Arch: \`${app.arch}\`
- Captured: \`${report.capturedAt}\`

## Message

\`\`\`text
${report.message}
\`\`\`

## Context

${summarizeContext(report.context)}

## Renderer Diagnostics

${summarizeRendererDiagnostics(report.context)}

## Runtime Diagnostics

${summarizeRuntimeDiagnostics(report.context)}

## Versions

${versions}

## Platforms

${platforms}

## Stack
${stack}
`;
}

export const { submitCrashReport, createIssue, updateAggregateState, stateMarker,
  fingerprintMarker, parseState, issueUpdateBody } = createGitHubIssueReporter({
  request: githubRequest, issueTitle, issueBody, groupingSummary: crashGroupingSummary,
  checkDailyIssueLimit, shouldUpdateIssue, owner: 'aindaco1', repository: 'ascii-vj-remix',
  defaultLabels: 'crash,automated-report,needs-triage'
});
export { issueBody, issueTitle };
