import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('..', import.meta.url));
const host = process.env.SMOKE_HOST || '127.0.0.1';
const port = Number(process.env.SMOKE_PORT || 4173);
const baseUrl = `http://${host}:${port}`;
const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');

function findChromiumExecutable() {
  if (process.env.CHROMIUM_EXECUTABLE && existsSync(process.env.CHROMIUM_EXECUTABLE)) {
    return process.env.CHROMIUM_EXECUTABLE;
  }

  const cacheDir = path.join(process.env.HOME || '', 'Library', 'Caches', 'ms-playwright');
  if (existsSync(cacheDir)) {
    const candidates = readdirSync(cacheDir)
      .filter((entry) => entry.startsWith('chromium_headless_shell-'))
      .sort()
      .reverse()
      .map((entry) => path.join(cacheDir, entry, 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell'));
    for (const candidate of candidates) {
      if (existsSync(candidate)) return candidate;
    }
  }

  return null;
}

function waitForServer(url, timeoutMs = 12000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) {
          resolve();
          return;
        }
        retry();
      });
      req.on('error', retry);
      req.setTimeout(1000, () => {
        req.destroy();
        retry();
      });
    };
    const retry = () => {
      if (Date.now() - started > timeoutMs) {
        reject(new Error(`Timed out waiting for ${url}`));
      } else {
        setTimeout(attempt, 250);
      }
    };
    attempt();
  });
}

async function runSmoke() {
  const executablePath = findChromiumExecutable();
  if (!executablePath) {
    throw new Error('No Chromium executable found. Set CHROMIUM_EXECUTABLE to a local Chromium or Chrome path.');
  }

  const preview = spawn(process.execPath, [viteBin, 'preview', '--host', host, '--port', String(port), '--strictPort'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let previewOutput = '';
  preview.stdout.on('data', (chunk) => { previewOutput += chunk.toString(); });
  preview.stderr.on('data', (chunk) => { previewOutput += chunk.toString(); });

  try {
    await waitForServer(`${baseUrl}/`);

    const browser = await chromium.launch({ headless: true, executablePath });
    const errors = [];

    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`main:${msg.text()}`); });
    const response = await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.ascilineRemix && document.querySelectorAll('#source-list [role=option]').length >= 3, null, { timeout: 15000 });
    const main = await page.evaluate(() => ({
      status: document.querySelector('#backend-status')?.textContent,
      outputDisplay: {
        value: document.querySelector('#output-display')?.value || '',
        disabled: Boolean(document.querySelector('#output-display')?.disabled),
        options: [...document.querySelectorAll('#output-display option')].map((option) => option.textContent.trim())
      },
      sources: [...document.querySelectorAll('#source-list [role=option]')].map((el) => el.textContent.trim())
    }));
    if (main.outputDisplay.value !== 'auto' || !main.outputDisplay.options.includes('Auto')) {
      throw new Error('Main page output-display selector did not initialize to Auto');
    }

    const output = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    output.on('console', (msg) => { if (msg.type() === 'error') errors.push(`output:${msg.text()}`); });
    const outputResponse = await output.goto(`${baseUrl}/output.html`, { waitUntil: 'domcontentloaded' });
    await output.waitForFunction(() => window.ascilineOutput, null, { timeout: 10000 });
    await output.evaluate(() => window.ascilineOutput.applyState({
      label: 'Smoke Demo',
      params: {
        sourceMode: 'static',
        backend: 'webgl2',
        mediaUrl: 'media/demo.svg',
        mediaType: 'image',
        sourceName: 'Demo Image',
        loop: true,
        muted: true,
        volume: 1,
        cols: 160,
        rows: 0,
        autoRows: true,
        fps: 24,
        saturationBoost: 1.4,
        contrastBoost: 1.2,
        brightness: 1,
        gamma: 1,
        bgBlend: 0.3,
        quantizeBits: 0,
        jitterAmount: 0.2,
        jitterSpeed: 1,
        sampleX: 0.5,
        sampleY: 0.5,
        smoothing: false,
        cellWidth: 2,
        cellHeight: 3,
        solidMode: false,
        glyphMode: true,
        aspectCorrection: 1
      },
      mediaState: null
    }));
    await output.waitForSelector('#output-stage canvas', { timeout: 15000 });
    const outputState = await output.evaluate(() => ({
      status: document.querySelector('#output-status')?.textContent,
      canvasCount: document.querySelectorAll('#output-stage canvas').length
    }));

    await browser.close();

    const result = {
      mainStatus: response.status(),
      outputStatus: outputResponse.status(),
      main,
      output: outputState,
      errors
    };
    console.log(JSON.stringify(result, null, 2));
    if (errors.length) throw new Error(`Console errors: ${errors.join('; ')}`);
  } catch (error) {
    if (previewOutput.trim()) {
      console.error(previewOutput.trim());
    }
    throw error;
  } finally {
    preview.kill('SIGTERM');
  }
}

runSmoke().catch((error) => {
  console.error(error);
  process.exit(1);
});
