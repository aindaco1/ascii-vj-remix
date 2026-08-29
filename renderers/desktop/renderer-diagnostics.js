const DEFAULT_DIAGNOSTIC_LIMIT = 8;
const MAX_DIAGNOSTIC_TEXT = 320;

function boundedRendererText(value, maxChars = MAX_DIAGNOSTIC_TEXT) {
    return String(value ?? '')
        .replace(/\b(?:asset|file|https?):\/\/[^\s"']+/gi, '[redacted-url]')
        .replace(/\/Users\/[^\s"']+/g, '[redacted-path]')
        .replace(/\/Volumes\/[^\s"']+/g, '[redacted-path]')
        .replace(/\/private\/[^\s"']+/g, '[redacted-path]')
        .replace(/\/tmp\/[^\s"']+/g, '[redacted-path]')
        .replace(/[A-Za-z]:\\[^\s"']+/g, '[redacted-path]')
        .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[redacted-email]')
        .slice(0, maxChars);
}

function boundedRendererToken(value, fallback = '') {
    const token = String(value ?? '')
        .replace(/[^A-Za-z0-9_.:-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 96);
    return token || fallback;
}

function rendererDiagnosticEvent(input = {}) {
    const atMs = Number(input.atMs);
    const event = {
        event: boundedRendererToken(input.event, 'renderer-event'),
        reason: boundedRendererToken(input.reason),
        phase: boundedRendererToken(input.phase),
        presetId: boundedRendererToken(input.presetId),
        requestedBackend: boundedRendererToken(input.requestedBackend),
        actualBackend: boundedRendererToken(input.actualBackend),
        fallbackBackend: boundedRendererToken(input.fallbackBackend),
        sourceMode: boundedRendererToken(input.sourceMode),
        mediaType: boundedRendererToken(input.mediaType),
        errorName: boundedRendererToken(input.errorName),
        errorCode: boundedRendererToken(input.errorCode),
        message: boundedRendererText(input.message),
        atMs: Number.isFinite(atMs) ? Math.max(0, Math.round(atMs)) : 0
    };
    return Object.fromEntries(Object.entries(event).filter(([, value]) => value !== ''));
}

class RendererDiagnosticLog {
    constructor(limit = DEFAULT_DIAGNOSTIC_LIMIT) {
        this.limit = Math.max(1, Math.min(20, Math.floor(Number(limit) || DEFAULT_DIAGNOSTIC_LIMIT)));
        this.events = [];
    }

    record(input = {}) {
        const event = rendererDiagnosticEvent(input);
        this.events.push(event);
        if (this.events.length > this.limit) {
            this.events.splice(0, this.events.length - this.limit);
        }
        return event;
    }

    snapshot() {
        return this.events.map((event) => ({ ...event }));
    }
}

function rendererFailureKey(error, context = {}) {
    return [
        boundedRendererToken(context.phase),
        boundedRendererToken(context.requestedBackend || context.backend),
        boundedRendererToken(context.fallbackBackend),
        boundedRendererToken(error?.name),
        boundedRendererToken(error?.errorCode ?? error?.code),
        boundedRendererText(error?.message || error, 160)
    ].join('|');
}

function rendererFailureReport(error, context = {}, diagnostics = []) {
    const requestedBackend = boundedRendererToken(context.requestedBackend || context.backend, 'auto');
    const actualBackend = boundedRendererToken(context.actualBackend);
    const fallbackBackend = boundedRendererToken(context.fallbackBackend);
    const errorCode = boundedRendererToken(error?.errorCode ?? error?.code);
    const message = boundedRendererText(error?.message || error || 'Renderer failed', 800);
    const reportContext = {
        phase: boundedRendererToken(context.phase, 'renderer'),
        presetId: boundedRendererToken(context.presetId),
        backend: requestedBackend,
        requestedBackend,
        actualBackend,
        fallbackBackend,
        recovered: Boolean(context.recovered),
        sourceMode: boundedRendererToken(context.sourceMode),
        mediaType: boundedRendererToken(context.mediaType),
        errorCode,
        rendererDiagnostics: diagnostics
            .slice(-DEFAULT_DIAGNOSTIC_LIMIT)
            .map((event) => rendererDiagnosticEvent(event))
    };
    return {
        kind: 'renderer-error',
        surface: 'renderer',
        message,
        stack: boundedRendererText(error?.stack || '', 3000),
        context: Object.fromEntries(
            Object.entries(reportContext).filter(([, value]) => value !== '')
        )
    };
}

export {
    RendererDiagnosticLog,
    boundedRendererText,
    rendererDiagnosticEvent,
    rendererFailureKey,
    rendererFailureReport
};
