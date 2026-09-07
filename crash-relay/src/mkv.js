// Self-contained so the browser and Worker execute the exact same validator.
export function validateMkvReport(value) {
  const present = x => x !== undefined && x !== null;
  const requireValue = valid => { if (!valid) throw new TypeError('Invalid MKV Magic report'); };
  const object = (x, keys) => requireValue(x && typeof x === 'object' && !Array.isArray(x)
    && Object.keys(x).every(key => keys.includes(key)));
  const choice = (x, values, optional = false) => requireValue(optional && !present(x) || values.includes(x));
  const integer = (x, min, max) => requireValue(!present(x) || Number.isInteger(x) && x >= min && x <= max);
  object(value, ['schema', 'id', 'kind', 'version', 'build', 'operatingSystem', 'architecture',
    'action', 'stage', 'failure', 'tool', 'exitCode', 'crash']);
  requireValue(value.schema === 'mkv-magic-issue-report-v1');
  requireValue(typeof value.id === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value.id));
  for (const key of ['version', 'build']) requireValue(typeof value[key] === 'string'
    && /^(?:unknown|[0-9][0-9A-Za-z.+-]{0,63})$/.test(value[key]));
  requireValue(typeof value.operatingSystem === 'string' && /^(?:unknown|[0-9]{1,3}(\.[0-9]{1,3}){1,2})$/.test(value.operatingSystem));
  choice(value.architecture, ['arm64', 'x86_64']);
  choice(value.kind, ['operationFailure', 'interruptedOperation', 'nativeCrash']);
  choice(value.action, ['application', 'importFiles', 'remuxWithSubtitle', 'verifyAndRun', 'addToQueue', 'automaticQueue']);
  choice(value.stage, ['requested', 'selection', 'subtitlePreview', 'review', 'destination', 'queueAdmission', 'execution', 'tool', 'verifying', 'committing', 'finished']);
  choice(value.failure, ['selectionChanged', 'missingReview', 'sourceUnavailable', 'sourceChanged',
    'destinationUnavailable', 'bookmarkUnavailable', 'staleBookmark', 'queueUnavailable',
    'queueUnsafePath', 'queueOversized', 'queueFull', 'queueInvalidSchema', 'queueInvalidData', 'queueJobMissing', 'toolUnavailable',
    'toolLaunchFailed', 'toolTimedOut', 'toolExited', 'invalidData', 'permissionDenied', 'diskFull', 'readOnlyFilesystem', 'unknown']);
  choice(value.tool, ['ffmpeg', 'ffprobe', 'mkvmerge', 'mkvpropedit', 'mkvextract'], true);
  integer(value.exitCode, -1, 255);
  if (present(value.crash)) {
    object(value.crash, ['exception', 'signal', 'image', 'imageOffset']);
    choice(value.crash.exception, ['EXC_BAD_ACCESS', 'EXC_BAD_INSTRUCTION', 'EXC_ARITHMETIC', 'EXC_SOFTWARE', 'EXC_BREAKPOINT', 'EXC_CRASH', 'EXC_RESOURCE', 'EXC_GUARD']);
    choice(value.crash.signal, ['SIGABRT', 'SIGSEGV', 'SIGBUS', 'SIGILL', 'SIGTRAP', 'SIGKILL', 'SIGFPE', 'SIGTERM'], true);
    choice(value.crash.image, ['MKVMagic', 'AppKit', 'libswiftCore.dylib', 'libsystem_kernel.dylib'], true);
    integer(value.crash.imageOffset, 0, 1000000000);
  }
  requireValue(value.kind === 'nativeCrash' ? present(value.crash) && value.action === 'application' : !present(value.crash));
  return { ...value, id: value.id.toLowerCase() };
}

export function mkvGrouping(report) {
  const r = validateMkvReport(report);
  return [r.schema, r.kind, r.architecture, r.action, r.stage, r.failure, r.tool ?? '', r.exitCode ?? '',
    r.crash?.exception ?? '', r.crash?.signal ?? '', r.crash?.image ?? '', r.crash?.imageOffset ?? '',
    r.crash ? r.build : '', r.crash ? r.operatingSystem : ''].join('|');
}

export async function mkvFingerprint(report) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(mkvGrouping(report)));
  return [...new Uint8Array(hash)].map(x => x.toString(16).padStart(2, '0')).join('');
}

export function mkvRelayReport(report) {
  const r = validateMkvReport(report);
  return {
    app: { name: 'MKV Magic', identifier: 'com.dustwave.mkvmagic', version: r.version,
      buildProfile: r.build, os: `macos ${r.operatingSystem}`, arch: r.architecture, channel: 'reviewed' },
    report: { id: r.id, kind: r.kind, surface: r.kind === 'nativeCrash' ? 'native' : 'workflow',
      message: `${r.action}: ${r.stage}: ${r.failure}`, stack: '', capturedAt: new Date().toISOString(),
      context: { command: r.action, errorCode: r.failure, phase: r.stage, mkvDiagnostics: r } }
  };
}
