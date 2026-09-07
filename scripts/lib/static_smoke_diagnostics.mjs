import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const boundedText = (value) => String(value || '').slice(0, 2000);

function requestUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return url.protocol;
    return `${url.origin}${url.pathname}`.slice(0, 2000);
  } catch {
    return '[invalid URL]';
  }
}

async function boundedCapture(operation, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Diagnostic capture timed out')), timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// This observes fresh browser contexts containing only smoke-test fixtures.
// Keep state explicit: no localStorage, environment, media, or full DOM dumps.
export class StaticSmokeDiagnostics {
  constructor({ outputDir, errors, timeoutMs = 2000, emit = console.error }) {
    this.outputDir = outputDir;
    this.errors = errors;
    this.timeoutMs = timeoutMs;
    this.emit = emit;
    this.startedAt = Date.now();
    this.phase = 'preview startup';
    this.runtime = { platform: process.platform, node: process.version };
    this.events = [];
    this.pages = new Map();
  }

  record(page, type, detail) {
    this.events.push({ elapsedMs: Date.now() - this.startedAt, page, type, ...detail });
    if (this.events.length > 100) this.events.shift();
  }

  recordError(message) {
    this.errors.push(message);
    if (this.errors.length > 100) this.errors.shift();
  }

  observe(page, label) {
    this.pages.set(label, page);
    page.on('console', (message) => {
      if (!['error', 'warning'].includes(message.type())) return;
      const text = boundedText(message.text());
      this.record(label, `console.${message.type()}`, { message: text });
      if (message.type() === 'error') this.recordError(`${label}:${text}`);
    });
    page.on('pageerror', (error) => {
      const message = boundedText(error.stack || error.message);
      this.record(label, 'pageerror', { message });
      this.recordError(`${label}:pageerror:${message}`);
    });
    page.on('requestfailed', (request) => this.record(label, 'requestfailed', {
      url: requestUrl(request.url()),
      resourceType: request.resourceType(),
      message: boundedText(request.failure()?.errorText)
    }));
    // HTTP failures are responses, not Playwright requestfailed events.
    page.on('response', (response) => {
      if (response.status() >= 400) this.record(label, 'http-error', {
        url: requestUrl(response.url()), status: response.status()
      });
    });
  }

  async capture(error, previewOutput = '') {
    const pages = await Promise.all([...this.pages].map(async ([label, page]) => {
      if (page.isClosed()) return { label, closed: true };
      try {
        const state = await boundedCapture(() => page.evaluate(() => {
          const app = window.ascilineRemix;
          return {
            readyState: document.readyState,
            appPresent: Boolean(app),
            sourceOptionCount: document.querySelectorAll('#source-list [role=option]').length,
            canvasCount: document.querySelectorAll('canvas').length,
            running: Boolean(app?.running),
            starting: Boolean(app?.starting),
            presetId: app?.activePresetId || '',
            requestedBackend: app?.params?.backend || '',
            sourceType: app?.params?.mediaType || '',
            audioActive: Boolean(app?.audioReactiveRuntime?.active),
            outputPresent: Boolean(window.ascilineOutput)
          };
        }), this.timeoutMs);
        return { label, state };
      } catch (captureError) {
        return { label, captureError: boundedText(captureError.message) };
      }
    }));
    const report = {
      phase: this.phase,
      elapsedMs: Date.now() - this.startedAt,
      runtime: this.runtime,
      failure: { name: error.name, message: boundedText(error.message), stack: boundedText(error.stack) },
      errors: this.errors.slice(-100).map(boundedText),
      events: [...this.events],
      pages,
      previewOutput: String(previewOutput).slice(-8000)
    };
    // Print first so a filesystem or screenshot failure cannot hide the evidence.
    this.emit(`[smoke:static] Failure diagnostics:\n${JSON.stringify(report, null, 2)}`);
    try {
      await mkdir(this.outputDir, { recursive: true });
      await writeFile(path.join(this.outputDir, 'failure.json'), `${JSON.stringify(report, null, 2)}\n`);
      await Promise.all([...this.pages].map(async ([label, page]) => {
        if (page.isClosed()) return;
        try {
          await boundedCapture(() => page.screenshot({
            path: path.join(this.outputDir, `${label}.png`), timeout: this.timeoutMs
          }), this.timeoutMs);
        } catch (captureError) {
          this.emit(`[smoke:static] ${label} screenshot unavailable: ${boundedText(captureError.message)}`);
        }
      }));
    } catch (captureError) {
      this.emit(`[smoke:static] Could not save diagnostics: ${boundedText(captureError.message)}`);
    }
    return report;
  }
}
