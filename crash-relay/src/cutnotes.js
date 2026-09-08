const schema = 'cutnotes-issue-report-v1';
const workflows = ['record', 'import', 'format'];
const languages = ['bg', 'cs', 'da', 'de', 'el', 'en', 'es', 'et', 'fi', 'fr', 'hr', 'hu',
  'it', 'lt', 'lv', 'mt', 'nl', 'pl', 'pt', 'ro', 'ru', 'sk', 'sl', 'sv', 'uk'];
const transcribers = ['parakeet', 'macwhisper'];
const formatters = ['apple', 'codex'];
const stages = ['recording', 'recording-paused', 'validating', 'transcribing', 'formatting', 'model-download'];
const failures = [
  'apple_context_window', 'apple_formatting_failed', 'apple_formatting_invalid_result', 'apple_guardrail',
  'apple_model_unavailable', 'audio_not_captured', 'audio_preparation_failed', 'audio_track_missing',
  'cancelled', 'codex_formatting_failed', 'codex_formatting_invalid_result', 'cutnotes_failed',
  'dependency_missing', 'ffprobe_missing', 'formatter_contract_failed', 'formatter_empty_response',
  'formatter_invalid_response', 'formatter_timecode_contract_failed', 'interactive_terminal_required',
  'local_engine_missing', 'macwhisper_failed', 'macwhisper_start_failed', 'media_empty',
  'media_not_regular', 'media_probe_failed', 'media_too_long', 'microphone_not_found',
  'microphone_unavailable', 'model_checksum_mismatch', 'model_disk_space', 'model_download_failed',
  'model_download_untrusted', 'model_incomplete', 'model_license_not_accepted', 'model_missing',
  'model_not_found', 'model_size_mismatch', 'model_unsafe_file', 'parakeet_failed',
  'parakeet_invalid_result', 'recording_control_invalid', 'recording_control_missing',
  'recording_finalize_failed', 'recording_not_started', 'setup_unhealthy', 'title_missing',
  'transcript_empty', 'transcript_encoding', 'transcript_not_regular', 'unknown'
];
const exceptions = ['EXC_BAD_ACCESS', 'EXC_BAD_INSTRUCTION', 'EXC_ARITHMETIC', 'EXC_EMULATION',
  'EXC_SOFTWARE', 'EXC_BREAKPOINT', 'EXC_CRASH', 'EXC_RESOURCE', 'EXC_GUARD'];
const signals = ['SIGKILL', 'SIGTERM', 'SIGABRT', 'SIGSEGV', 'SIGBUS', 'SIGILL', 'SIGTRAP', 'SIGPIPE', 'SIGINT', 'SIGFPE'];
const images = ['CutNotes', 'SwiftUI', 'SwiftUICore', 'AppKit', 'libswiftCore.dylib', 'libsystem_kernel.dylib'];
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const version = /^(?:unknown|[0-9]{1,8}(?:\.[0-9]{1,8}){0,3})$/;
const present = value => value !== undefined && value !== null;
function requireValue(valid) { if (!valid) throw new TypeError('Invalid CutNotes report'); }
function object(value, keys) {
  requireValue(value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every(key => keys.includes(key)));
}
function choice(value, values, optional = false) {
  requireValue((optional && !present(value)) || values.includes(value));
}
function optionalBoolean(value) { requireValue(!present(value) || typeof value === 'boolean'); }

export function validateCutNotesReport(value) {
  object(value, ['schemaVersion', 'id', 'application', 'kind', 'state', 'crash']);
  requireValue(value.schemaVersion === schema && typeof value.id === 'string' && uuid.test(value.id));
  choice(value.kind, ['current_state', 'native_crash']);
  object(value.application, ['version', 'build', 'operatingSystem', 'architecture']);
  for (const key of ['version', 'build', 'operatingSystem']) {
    requireValue(typeof value.application[key] === 'string' && version.test(value.application[key]));
  }
  choice(value.application.architecture, ['arm64', 'x86_64', 'unknown']);

  if (present(value.state)) {
    const state = value.state;
    object(state, ['workflow', 'isRunning', 'isRecording', 'isPaused', 'hasSource', 'transcriptOnly',
      'language', 'transcriber', 'formatter', 'usesSystemDefaultMicrophone', 'microphoneCount',
      'coreHealthy', 'defaultWorkflowReady', 'parakeetReady', 'appleFormatterReady',
      'ffmpegAvailable', 'macwhisperAvailable', 'codexAvailable', 'progressStage', 'failureCode']);
    choice(state.workflow, workflows);
    choice(state.language, languages);
    choice(state.transcriber, transcribers);
    choice(state.formatter, formatters);
    for (const key of ['isRunning', 'isRecording', 'isPaused', 'hasSource', 'transcriptOnly', 'usesSystemDefaultMicrophone']) {
      requireValue(typeof state[key] === 'boolean');
    }
    for (const key of ['coreHealthy', 'defaultWorkflowReady', 'parakeetReady', 'appleFormatterReady',
      'ffmpegAvailable', 'macwhisperAvailable', 'codexAvailable']) optionalBoolean(state[key]);
    requireValue(!present(state.microphoneCount) || Number.isInteger(state.microphoneCount)
      && state.microphoneCount >= 0 && state.microphoneCount <= 128);
    choice(state.progressStage, stages, true);
    choice(state.failureCode, failures, true);
    requireValue(!state.isPaused || state.isRecording);
    requireValue(!state.isRecording || state.isRunning);
  }

  if (present(value.crash)) {
    object(value.crash, ['exception', 'signal', 'image', 'imageOffset']);
    choice(value.crash.exception, exceptions);
    choice(value.crash.signal, signals, true);
    choice(value.crash.image, images, true);
    requireValue(!present(value.crash.imageOffset) || Number.isInteger(value.crash.imageOffset)
      && value.crash.imageOffset >= 0 && value.crash.imageOffset <= 1000000000);
  }
  requireValue(value.kind === 'current_state'
    ? present(value.state) && !present(value.crash)
    : present(value.crash) && !present(value.state));
  return value;
}

export function cutNotesGrouping(report) {
  const r = validateCutNotesReport(report);
  if (r.kind === 'native_crash') {
    return { product: 'cutnotes', kind: r.kind, platform: r.application.architecture,
      crash: { exception: r.crash.exception, signal: r.crash.signal ?? null,
        image: r.crash.image ?? null, imageOffset: r.crash.imageOffset ?? null,
        build: r.application.build, operatingSystem: r.application.operatingSystem } };
  }
  return { product: 'cutnotes', kind: r.kind, platform: r.application.architecture,
    workflow: r.state.workflow, failureCode: r.state.failureCode ?? null,
    progressStage: r.state.progressStage ?? null, transcriber: r.state.transcriber,
    formatter: r.state.formatter, coreHealthy: r.state.coreHealthy ?? null,
    defaultWorkflowReady: r.state.defaultWorkflowReady ?? null,
    parakeetReady: r.state.parakeetReady ?? null,
    appleFormatterReady: r.state.appleFormatterReady ?? null,
    ffmpegAvailable: r.state.ffmpegAvailable ?? null };
}

export async function cutNotesFingerprint(report) {
  const bytes = new TextEncoder().encode(JSON.stringify(cutNotesGrouping(report)));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map(x => x.toString(16).padStart(2, '0')).join('').slice(0, 20);
}

export function cutNotesRelayReport(report) {
  const r = validateCutNotesReport(report);
  const state = r.state;
  const errorCode = state?.failureCode ?? r.crash?.exception ?? 'current_state';
  return {
    app: { name: 'CutNotes', identifier: 'com.dustwave.cutnotes', version: r.application.version,
      buildProfile: r.application.build, os: `macos ${r.application.operatingSystem}`,
      arch: r.application.architecture, channel: 'production' },
    report: { id: r.id, kind: r.kind === 'native_crash' ? 'nativeCrash' : 'currentState',
      surface: r.kind === 'native_crash' ? 'native' : 'application',
      message: r.kind === 'native_crash' ? `native crash: ${r.crash.exception}`
        : `current state: ${state.workflow}: ${state.failureCode ?? state.progressStage ?? 'ready'}`,
      stack: '', capturedAt: new Date().toISOString(),
      context: { command: state?.workflow ?? 'application', errorCode,
        phase: state?.progressStage, cutnotesDiagnostics: r } }
  };
}
