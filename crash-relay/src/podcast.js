// Podcast Visualizer owns a strict metadata contract; it never sends the
// arbitrary text/stack/context accepted by the older ASCII client contract.
const schema = 'podcast-visualizer-issue-report-v1';
const phases = ['runtime', 'alignment', 'branding', 'scene', 'staging', 'encoding', 'verifying', 'reused'];
const causes = ['type_error', 'range_error', 'syntax_error', 'reference_error', 'unknown',
  'process_exit', 'process_signal', 'process_timeout', 'process_output_limit', 'process_spawn',
  'helper_spawn', 'helper_pipe', 'helper_read', 'helper_wait', 'helper_output_limit', 'helper_progress_limit',
  'invalid_progress', 'invalid_result', 'helper_busy', 'invalid_models_root'];
const signals = ['SIGKILL', 'SIGTERM', 'SIGABRT', 'SIGSEGV', 'SIGBUS', 'SIGILL', 'SIGTRAP', 'SIGPIPE', 'SIGINT'];
const codes = ['failure', 'render_failure', 'app_error', 'helper_failed', 'invalid_progress', 'interrupted_render', 'native_crash'];
const diagnostics = ['runtime', 'alignment', 'branding', 'scene', 'staging', 'encoding', 'verification', 'output'].map(x => `render_${x}_failed`);
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const version = /^(?:unknown|[0-9]{1,8}(?:\.[0-9]{1,8}){0,3})$/;
const present = value => value !== undefined && value !== null;
function requireValue(valid) { if (!valid) throw new TypeError('Invalid Podcast Visualizer report'); }
function object(value, keys) {
  requireValue(value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every(key => keys.includes(key)));
}
function choice(value, values, optional = false) { requireValue(optional && !present(value) || values.includes(value)); }
function number(value, minimum, maximum, integer = true) {
  requireValue(!present(value) || typeof value === 'number' && Number.isFinite(value)
    && (!integer || Number.isInteger(value)) && value >= minimum && value <= maximum);
}

export function validatePodcastReport(value) {
  object(value, ['schemaVersion', 'id', 'application', 'kind', 'command', 'failureCode', 'diagnosticCode', 'exitCode', 'durationMs', 'renderSettings', 'context', 'crash']);
  requireValue(value.schemaVersion === schema && typeof value.id === 'string' && uuid.test(value.id));
  choice(value.kind, ['workflow_failure', 'interrupted_render', 'native_crash']);
  choice(value.command, ['probe', 'init', 'status', 'prepare', 'analyze', 'review', 'align', 'render', 'export', 'doctor', 'models', 'chapters', 'branding'], true);
  choice(value.failureCode, codes);
  choice(value.diagnosticCode, diagnostics, true);
  number(value.exitCode, 0, 255);
  number(value.durationMs, 0, 604800000);
  object(value.application, ['version', 'build', 'operatingSystem', 'architecture']);
  for (const key of ['version', 'build', 'operatingSystem']) {
    requireValue(typeof value.application[key] === 'string' && version.test(value.application[key]));
  }
  choice(value.application.architecture, ['arm64', 'x86_64', 'unknown']);
  if (present(value.renderSettings)) {
    object(value.renderSettings, ['aspect', 'background', 'alphaCodec']);
    choice(value.renderSettings.aspect, ['16:9', '1:1', '9:16', 'all']);
    choice(value.renderSettings.background, ['opaque', 'transparent', 'both']);
    choice(value.renderSettings.alphaCodec, ['hevc', 'prores', 'both']);
  }
  if (present(value.context)) {
    object(value.context, ['attemptID', 'renderProgress', 'failureDetails']);
    requireValue(value.context.attemptID === value.id);
    if (present(value.context.renderProgress)) {
      const progress = value.context.renderProgress;
      object(progress, ['phase', 'fraction', 'processedMs', 'outputIndex', 'totalOutputs', 'aspect', 'background', 'alphaCodec']);
      choice(progress.phase, phases);
      number(progress.fraction, 0, 1, false);
      number(progress.processedMs, 0, 604800000, false);
      number(progress.totalOutputs, 1, 9);
      number(progress.outputIndex, 1, progress.totalOutputs ?? 9);
      choice(progress.aspect, ['16:9', '1:1', '9:16'], true);
      choice(progress.background, ['opaque', 'transparent'], true);
      choice(progress.alphaCodec, ['hevc', 'prores'], true);
    }
    if (present(value.context.failureDetails)) {
      const details = value.context.failureDetails;
      object(details, ['cause', 'systemCode', 'processExitCode', 'processSignal', 'reason']);
      choice(details.cause, causes);
      choice(details.reason, ['disk_full', 'permission_denied', 'encoder_unavailable', 'encoder_initialization', 'invalid_media'], true);
      choice(details.systemCode, ['ENOSPC', 'EACCES', 'EPERM', 'ENOENT', 'EIO', 'EMFILE', 'ENFILE', 'ENOMEM', 'EROFS', 'EEXIST'], true);
      choice(details.processSignal, signals, true);
      number(details.processExitCode, 0, 255);
    }
  }
  if (present(value.crash)) {
    object(value.crash, ['exception', 'signal', 'image', 'imageOffset']);
    choice(value.crash.exception, ['EXC_BAD_ACCESS', 'EXC_BAD_INSTRUCTION', 'EXC_ARITHMETIC', 'EXC_EMULATION', 'EXC_SOFTWARE', 'EXC_BREAKPOINT', 'EXC_CRASH', 'EXC_RESOURCE', 'EXC_GUARD']);
    choice(value.crash.signal, signals, true);
    choice(value.crash.image, ['PodcastVisualizer', 'SwiftUI', 'SwiftUICore', 'AppKit', 'libswiftCore.dylib', 'libsystem_kernel.dylib'], true);
    number(value.crash.imageOffset, 0, 1000000000);
  }
  requireValue(value.kind === 'native_crash'
    ? present(value.crash) && !present(value.context) && value.failureCode === 'native_crash'
    : !present(value.crash) && present(value.context) && value.failureCode !== 'native_crash');
  return value;
}

export function podcastGrouping(report) {
  const progress = report.context?.renderProgress ?? {};
  const details = report.context?.failureDetails ?? {};
  return {
    product: 'podcast-visualizer', kind: report.kind, command: report.command ?? '', platform: report.application.architecture,
    code: report.diagnosticCode ?? report.failureCode, phase: progress.phase ?? '',
    cause: details.cause ?? '', systemCode: details.systemCode ?? '',
    reason: details.reason ?? '',
    processExitCode: details.processExitCode ?? '', processSignal: details.processSignal ?? '',
    // Invocation "both/all" must not hide the actual encoder that failed.
    background: progress.background ?? '', codec: progress.alphaCodec ?? '',
    crash: report.crash ? { ...report.crash, build: report.application.build,
      operatingSystem: report.application.operatingSystem } : null
  };
}

export async function podcastFingerprint(report) {
  const bytes = new TextEncoder().encode(JSON.stringify(podcastGrouping(validatePodcastReport(report))));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map(x => x.toString(16).padStart(2, '0')).join('').slice(0, 20);
}

export function podcastRelayReport(report) {
  validatePodcastReport(report);
  return {
    app: { name: 'Podcast Visualizer', identifier: 'com.aindaco.podcast-visualizer',
      version: report.application.version, buildProfile: report.application.build,
      os: `macos ${report.application.operatingSystem}`, arch: report.application.architecture, channel: 'production' },
    report: { id: report.id, kind: report.kind, surface: report.kind === 'native_crash' ? 'native' : 'workflow',
      message: report.diagnosticCode ?? report.failureCode, stack: '', capturedAt: new Date().toISOString(),
      context: { command: report.command, errorCode: report.diagnosticCode ?? report.failureCode,
        phase: report.context?.renderProgress?.phase, podcastDiagnostics: report } }
  };
}
