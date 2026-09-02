import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { validateBuiltInPresetBackendContract } from '../renderers/shared/preset-backend-contract.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const host = process.env.SMOKE_HOST || '127.0.0.1';
const port = Number(process.env.SMOKE_PORT || 4173);
const baseUrl = `http://${host}:${port}`;
const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');

function findChromiumExecutable() {
  if (process.env.CHROMIUM_EXECUTABLE && existsSync(process.env.CHROMIUM_EXECUTABLE)) {
    return process.env.CHROMIUM_EXECUTABLE;
  }

  const candidates = [];
  const addCandidate = (...parts) => {
    if (parts.every(Boolean)) candidates.push(path.join(...parts));
  };
  if (process.platform === 'darwin') {
    addCandidate('/Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome');
    addCandidate('/Applications', 'Microsoft Edge.app', 'Contents', 'MacOS', 'Microsoft Edge');
  } else if (process.platform === 'win32') {
    addCandidate(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe');
    addCandidate(process.env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe');
    addCandidate(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe');
    addCandidate(process.env.PROGRAMFILES, 'Microsoft', 'Edge', 'Application', 'msedge.exe');
    addCandidate(process.env['PROGRAMFILES(X86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe');
  } else {
    candidates.push('/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser');
  }

  const cacheDir = process.platform === 'darwin'
    ? path.join(process.env.HOME || '', 'Library', 'Caches', 'ms-playwright')
    : process.platform === 'win32'
      ? path.join(process.env.LOCALAPPDATA || '', 'ms-playwright')
      : path.join(process.env.HOME || '', '.cache', 'ms-playwright');
  if (existsSync(cacheDir)) {
    const cacheCandidates = readdirSync(cacheDir)
      .filter((entry) => entry.startsWith('chromium_headless_shell-'))
      .sort()
      .reverse()
      .flatMap((entry) => {
        const entryRoot = path.join(cacheDir, entry);
        return [
          path.join(entryRoot, 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell'),
          path.join(entryRoot, 'chrome-headless-shell-mac-x64', 'chrome-headless-shell'),
          path.join(entryRoot, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe'),
          path.join(entryRoot, 'chrome-headless-shell-linux64', 'chrome-headless-shell')
        ];
      });
    candidates.unshift(...cacheCandidates);
  }

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function assertPresetBackendContract(presetMatrix) {
  const contract = validateBuiltInPresetBackendContract({
    presetCount: presetMatrix.length,
    acceleratedEligible: presetMatrix.filter((preset) => preset.requestedBackend === 'auto').length,
    canvasEligible: presetMatrix.filter((preset) =>
      preset.requestedBackend === 'canvas2d' || preset.requestedBackend === 'pixel-canvas'
    ).length
  });
  if (!contract.ok) {
    throw new Error(`Built-in preset backend ownership changed: ${JSON.stringify(contract)}`);
  }
  return contract;
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

    const browser = await chromium.launch({
      headless: true,
      executablePath,
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']
    });
    const errors = [];

    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`main:${msg.text()}`); });
    await page.addInitScript(() => {
      const original = navigator.mediaDevices || {};
      const audioDevices = [
        { kind: 'audioinput', deviceId: 'default', label: 'Default - Smoke Mic A', groupId: 'smoke' },
        { kind: 'audioinput', deviceId: 'mic-a', label: 'Smoke Mic A', groupId: 'smoke' },
        { kind: 'audioinput', deviceId: 'mic-b', label: 'Smoke Mic B', groupId: 'smoke' },
        { kind: 'videoinput', deviceId: 'cam-a', label: 'Smoke Camera', groupId: 'smoke' }
      ];
      window.__smokeAudioCapture = { mic: 0, display: 0, constraints: [] };
      window.__smokeAudioSources = [];
      const decorateTrack = (track, label, deviceId) => {
        if (!track) return;
        try {
          Object.defineProperty(track, 'label', { configurable: true, value: label });
        } catch {}
        const originalGetSettings = track.getSettings?.bind(track);
        track.getSettings = () => ({ ...(originalGetSettings?.() || {}), deviceId });
      };
      const makeAudioStream = (label = 'Smoke audio', deviceId = 'mic-a') => {
        const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextCtor) return new MediaStream();
        const context = new AudioContextCtor();
        const oscillator = context.createOscillator();
        const destination = context.createMediaStreamDestination();
        oscillator.frequency.value = 220;
        oscillator.connect(destination);
        oscillator.start();
        decorateTrack(destination.stream.getAudioTracks?.()[0], label, deviceId);
        window.__smokeAudioSources.push({ context, oscillator });
        return destination.stream;
      };
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          ...original,
          enumerateDevices: async () => audioDevices,
          getUserMedia: async (constraints = {}) => {
            window.__smokeAudioCapture.mic += 1;
            window.__smokeAudioCapture.constraints.push(constraints);
            const requested = constraints?.audio?.deviceId?.exact || 'mic-a';
            const device = audioDevices.find((candidate) => candidate.deviceId === requested) || audioDevices[1];
            return makeAudioStream(device.label, device.deviceId);
          },
          getDisplayMedia: async () => {
            window.__smokeAudioCapture.display += 1;
            return makeAudioStream('Smoke Display Audio', 'display-audio');
          }
        }
      });
    });
    const response = await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.ascilineRemix && document.querySelectorAll('#source-list [role=option]').length >= 3, null, { timeout: 15000 });
    await page.waitForFunction(
      () => window.__smokeAudioCapture?.mic >= 1 && window.ascilineRemix?.audioReactiveRuntime?.active,
      null,
      { timeout: 15000 }
    );
    await page.waitForFunction(() => {
      const mark = document.querySelector('.brand-mark');
      return mark instanceof HTMLImageElement && mark.complete && mark.naturalWidth > 0;
    }, null, { timeout: 15000 });
    const main = await page.evaluate(() => ({
      brandMark: (() => {
        const mark = document.querySelector('.brand-mark');
        const bounds = mark?.getBoundingClientRect();
        return {
          tagName: mark?.tagName || '',
          alt: mark?.getAttribute('alt'),
          text: mark?.textContent || '',
          source: mark instanceof HTMLImageElement ? mark.currentSrc : '',
          complete: mark instanceof HTMLImageElement && mark.complete,
          naturalWidth: mark instanceof HTMLImageElement ? mark.naturalWidth : 0,
          naturalHeight: mark instanceof HTMLImageElement ? mark.naturalHeight : 0,
          renderedWidth: bounds?.width || 0,
          renderedHeight: bounds?.height || 0
        };
      })(),
      sourceModeHidden: Boolean(document.querySelector('.source-mode-field')?.hidden),
      bufferHidden: Boolean(document.querySelector('#buffer-meter')?.hidden),
      connectionHidden: Boolean(document.querySelector('#connection-status')?.hidden),
      midiPanelHidden: Boolean(document.querySelector('#midi-panel')?.hidden),
      backendStatusAbsent: !document.querySelector('#backend-status'),
      defaultSource: {
        mediaUrl: window.ascilineRemix?.params?.mediaUrl || '',
        mediaType: window.ascilineRemix?.params?.mediaType || '',
        active: document.querySelector('#source-list .source-option.active')?.dataset?.sourceId || '',
        label: document.querySelector('#source-label')?.textContent || ''
      },
      defaultPreset: {
        id: window.ascilineRemix?.activePresetId || '',
        label: document.querySelector('#active-preset-label')?.textContent || '',
        backend: window.ascilineRemix?.params?.backend || '',
        charset: window.ascilineRemix?.params?.charset || '',
        glyphMode: Boolean(window.ascilineRemix?.params?.glyphMode)
      },
      outputDisplay: {
        value: document.querySelector('#output-display')?.value || '',
        disabled: Boolean(document.querySelector('#output-display')?.disabled),
        options: [...document.querySelectorAll('#output-display option')].map((option) => option.textContent.trim())
      },
      screenshot: {
        hidden: Boolean(document.querySelector('#take-screenshot')?.hidden),
        ariaLabel: document.querySelector('#take-screenshot')?.getAttribute('aria-label') || '',
        hasCameraIcon: Boolean(document.querySelector('#take-screenshot svg circle')),
        statsOutsideSurface: !document.querySelector('#ascii-canvas #stats-overlay') && !document.querySelector('#gpu-stage #stats-overlay')
      },
      manualDiagnostics: {
        integratedInReportsDialog: document.querySelector('#crash-report-create')?.closest('#crash-report-dialog')?.id === 'crash-report-dialog',
        noteLimit: Number(document.querySelector('#crash-report-note')?.maxLength || 0),
        contextKeys: Object.keys(window.ascilineRemix?._manualDiagnosticContext?.() || {}).sort()
      },
      audioReactive: {
        source: document.querySelector('#audio-reactive-source')?.value || '',
        status: document.querySelector('#audio-reactive-status')?.textContent || '',
        input: document.querySelector('#audio-reactive-input')?.value || '',
        inputOptions: [...document.querySelectorAll('#audio-reactive-input option')].map((option) => option.textContent.trim()),
        toggle: document.querySelector('#audio-reactive-toggle')?.textContent || '',
        pressed: document.querySelector('#audio-reactive-toggle')?.getAttribute('aria-pressed') || '',
        active: Boolean(window.ascilineRemix?.audioReactiveRuntime?.active),
        controls: [...document.querySelectorAll('#audio-reactive-controls .audio-control-row span:first-child')]
          .map((node) => node.textContent.trim()),
        calls: window.__smokeAudioCapture
      },
      glyphControls: {
        groupHidden: document.querySelector('.control-group[data-group="Glyph / Cell"]')?.classList.contains('control-hidden') ?? true,
        charsetHidden: document.querySelector('[data-control-key="charset"]')?.classList.contains('control-hidden') ?? true,
        fontFamilyHidden: document.querySelector('[data-control-key="fontFamily"]')?.classList.contains('control-hidden') ?? true,
        atlasControlAbsent: !document.querySelector('[data-control-key="atlasStyle"]'),
        charsetOptions: [...document.querySelectorAll('[data-control-key="charset"] option')].map((option) => option.textContent.trim())
      },
      controlSurface: {
        internalLabels: [...document.querySelectorAll('.control-row')]
          .filter((row) => {
            const key = row.dataset.controlKey || '';
            return [...row.querySelectorAll('.control-label small')].some((node) => node.textContent.trim() === key);
          })
          .map((row) => row.dataset.controlKey),
        advancedDescription: document.querySelector('#description-advancedDensity')?.textContent.trim() || '',
        advancedDescribedBy: document.querySelector('[data-control-key="advancedDensity"] input')?.getAttribute('aria-describedby') || '',
        selectRects: [...document.querySelectorAll('.control-row:not(.control-hidden)[data-control-type="select"] select')]
          .filter((select) => select.getClientRects().length > 0)
          .map((select) => {
            const rect = select.getBoundingClientRect();
            return { key: select.closest('.control-row')?.dataset.controlKey || '', x: rect.x, width: rect.width, height: rect.height };
          })
      },
      presetSections: [...document.querySelectorAll('#preset-list .preset-section h3')].map((node) => node.textContent.trim()),
      presetStatus: document.querySelector('#preset-search-status')?.textContent.trim() || '',
      presetNames: [...document.querySelectorAll('#preset-list .preset-name')].map((node) => node.textContent.trim()),
      sources: [...document.querySelectorAll('#source-list [role=option]')].map((el) => el.textContent.trim())
    }));
    if (!main.sourceModeHidden || !main.bufferHidden || !main.connectionHidden || !main.midiPanelHidden) {
      throw new Error(`Stream-only UI should be hidden: ${JSON.stringify({
        sourceModeHidden: main.sourceModeHidden,
        bufferHidden: main.bufferHidden,
        connectionHidden: main.connectionHidden,
        midiPanelHidden: main.midiPanelHidden
      })}`);
    }
    if (!main.backendStatusAbsent) {
      throw new Error('The duplicate top-bar backend status should be absent.');
    }
    if (!main.screenshot.hidden || main.screenshot.ariaLabel !== 'Save screenshot to Desktop' || !main.screenshot.hasCameraIcon || !main.screenshot.statsOutsideSurface) {
      throw new Error(`Screenshot control should be accessible, native-only, and separate from the stats overlay: ${JSON.stringify(main.screenshot)}`);
    }
    if (
      !main.manualDiagnostics.integratedInReportsDialog ||
      main.manualDiagnostics.noteLimit !== 500 ||
      !['nativeOutputCapabilities', 'nativeOutputSync', 'nativeOutputMirror', 'rendererDiagnostics', 'renderer'].every((key) => main.manualDiagnostics.contextKeys.includes(key))
    ) {
      throw new Error(`Manual diagnostics should extend the existing bounded Reports workflow: ${JSON.stringify(main.manualDiagnostics)}`);
    }
    if (
      main.brandMark.tagName !== 'IMG' ||
      main.brandMark.alt !== '' ||
      main.brandMark.text !== '' ||
      !main.brandMark.source.includes('/assets/build/') ||
      !main.brandMark.complete ||
      main.brandMark.naturalWidth !== 128 ||
      main.brandMark.naturalHeight !== 128 ||
      Math.round(main.brandMark.renderedWidth) !== 34 ||
      Math.round(main.brandMark.renderedHeight) !== 34
    ) {
      throw new Error(`Header should use the bundled canonical app icon at 34x34: ${JSON.stringify(main.brandMark)}`);
    }
    if (
      main.defaultSource.mediaUrl !== 'media/demo.svg' ||
      main.defaultSource.mediaType !== 'image' ||
      main.defaultSource.active !== 'demo-image' ||
      main.defaultSource.label !== 'Demo Image'
    ) {
      throw new Error(`Demo Image should be the default source: ${JSON.stringify(main.defaultSource)}`);
    }
    if (
      main.defaultPreset.id !== 'classic-camera-ascii' ||
      main.defaultPreset.label !== 'Classic Camera ASCII' ||
      main.defaultPreset.backend !== 'auto' ||
      main.defaultPreset.charset !== 'classic-camera' ||
      !main.defaultPreset.glyphMode
    ) {
      throw new Error(`Classic Camera ASCII should be the clean-profile default: ${JSON.stringify(main.defaultPreset)}`);
    }
    if (main.sources.some((source) => /Demo Video 1|Demo Video 2/.test(source)) || !main.sources.some((source) => source.includes('Demo Video'))) {
      throw new Error(`Source list should expose Demo Image, Demo Video, and Camera only: ${JSON.stringify(main.sources)}`);
    }
    if (main.outputDisplay.value !== 'auto' || !main.outputDisplay.options.includes('Auto')) {
      throw new Error('Main page output-display selector did not initialize to Auto');
    }
    if (
      main.glyphControls.groupHidden ||
      main.glyphControls.charsetHidden ||
      main.glyphControls.fontFamilyHidden ||
      !main.glyphControls.atlasControlAbsent
    ) {
      throw new Error(`Glyph controls should stay visible without a one-option Atlas Style control: ${JSON.stringify(main.glyphControls)}`);
    }
    const selectWidths = main.controlSurface.selectRects.map((rect) => Math.round(rect.width));
    const selectXs = main.controlSurface.selectRects.map((rect) => Math.round(rect.x));
    if (
      main.controlSurface.internalLabels.length ||
      !/no 30 FPS guarantee/i.test(main.controlSurface.advancedDescription) ||
      main.controlSurface.advancedDescribedBy !== 'description-advancedDensity' ||
      !main.controlSurface.selectRects.length ||
      main.controlSurface.selectRects.some((rect) => Math.round(rect.height) !== 30) ||
      new Set(selectWidths).size !== 1 ||
      new Set(selectXs).size !== 1
    ) {
      throw new Error(`Control rows should share one select geometry and user-facing labels: ${JSON.stringify(main.controlSurface)}`);
    }
    const sortedPresetNames = [...main.presetNames].sort((left, right) => left.localeCompare(right, 'en', { sensitivity: 'base', numeric: true }));
    if (
      JSON.stringify(main.presetSections) !== JSON.stringify(['Built-in', 'My Presets']) ||
      JSON.stringify(main.presetNames) !== JSON.stringify(sortedPresetNames) ||
      !main.presetNames.includes('Dense Color ASCII') ||
      main.presetNames.includes('Point & Click Default') ||
      !/^69 built-in · 0 saved$/i.test(main.presetStatus)
    ) {
      throw new Error(`Preset sections should be separate, renamed, and alphabetical: ${JSON.stringify({
        sections: main.presetSections,
        names: main.presetNames,
        status: main.presetStatus
      })}`);
    }
    const asciiTodayNames = ['Broadway KB', 'Computer', 'Doh'];
    if (
      !asciiTodayNames.every((name) => main.glyphControls.charsetOptions.includes(name)) ||
      !asciiTodayNames.every((name) => main.presetNames.includes(name))
    ) {
      throw new Error(`ascii.today character sets should appear as controls and presets: ${JSON.stringify({
        charsetOptions: main.glyphControls.charsetOptions,
        presetNames: main.presetNames
      })}`);
    }

    await page.locator('#preset-search').fill('terminal');
    const filteredPresets = await page.evaluate(() => ({
      names: [...document.querySelectorAll('#preset-list .preset-name')].map((node) => node.textContent.trim()),
      status: document.querySelector('#preset-search-status')?.textContent.trim() || '',
      activeElement: document.activeElement?.id || ''
    }));
    if (
      !filteredPresets.names.length ||
      filteredPresets.names.some((name) => !name.toLocaleLowerCase('en-US').includes('terminal')) ||
      !new RegExp(`^${filteredPresets.names.length} of 69 presets$`, 'i').test(filteredPresets.status) ||
      filteredPresets.activeElement !== 'preset-search'
    ) {
      throw new Error(`Preset search should filter live by display name: ${JSON.stringify(filteredPresets)}`);
    }
    await page.keyboard.press('Escape');
    const clearedPresetSearch = await page.evaluate(() => ({
      value: document.querySelector('#preset-search')?.value || '',
      count: document.querySelectorAll('#preset-list .preset-name').length,
      activeElement: document.activeElement?.id || ''
    }));
    if (clearedPresetSearch.value || clearedPresetSearch.count !== 69 || clearedPresetSearch.activeElement !== 'preset-search') {
      throw new Error(`Escape should clear preset search and preserve focus: ${JSON.stringify(clearedPresetSearch)}`);
    }

    const userPresetSections = await page.evaluate(() => {
      const app = window.ascilineRemix;
      const previous = app.userPresets;
      app.userPresets = [
        { id: 'user-zebra', name: 'Zebra User', readonly: false, transitionSeconds: 1, params: {} },
        { id: 'user-amber', name: 'Amber User', readonly: false, transitionSeconds: 1, params: {} }
      ];
      app._renderPresets();
      const names = [...document.querySelectorAll('#preset-section-user + .preset-section-items .preset-name')]
        .map((node) => node.textContent.trim());
      app.userPresets = previous;
      app._renderPresets();
      return names;
    });
    if (JSON.stringify(userPresetSections) !== JSON.stringify(['Amber User', 'Zebra User'])) {
      throw new Error(`My Presets should sort independently: ${JSON.stringify(userPresetSections)}`);
    }

    await page.locator('#more-presets').click();
    const overflowOpened = await page.evaluate(() => ({
      expanded: document.querySelector('#more-presets')?.getAttribute('aria-expanded') || '',
      activeElement: document.activeElement?.id || ''
    }));
    if (overflowOpened.expanded !== 'true' || overflowOpened.activeElement !== 'manage-playlists') {
      throw new Error(`Preset overflow should focus its first enabled action: ${JSON.stringify(overflowOpened)}`);
    }

    await page.locator('#manage-playlists').click();
    const playlistControlMetrics = await page.evaluate(() => {
      const metric = (id) => {
        const element = document.querySelector(`#${id}`);
        const style = getComputedStyle(element);
        return {
          height: Math.round(element.getBoundingClientRect().height),
          fontSize: Number.parseFloat(style.fontSize)
        };
      };
      return Object.fromEntries([
        'playlist-new',
        'playlist-delete',
        'playlist-name',
        'playlist-hold',
        'playlist-mode',
        'playlist-add',
        'playlist-stop',
        'playlist-save',
        'playlist-play'
      ].map((id) => [id, metric(id)]));
    });
    if (Object.values(playlistControlMetrics).some((metric) => metric.height !== 30 || metric.fontSize !== 12)) {
      throw new Error(`Playlist fields and actions should share the regular control tokens: ${JSON.stringify(playlistControlMetrics)}`);
    }
    await page.evaluate(() => {
      window.__playlistPromptCalls = 0;
      window.__playlistOriginalPrompt = window.prompt;
      window.prompt = () => {
        window.__playlistPromptCalls += 1;
        return null;
      };
    });
    await page.locator('#playlist-new').click();
    await page.locator('#playlist-name').fill('Smoke Playlist');
    await page.selectOption('#playlist-add-preset', 'ascii-today-broadway-kb');
    await page.locator('#playlist-add').click();
    await page.selectOption('#playlist-add-preset', 'point-click-default');
    await page.locator('#playlist-add').click();
    await page.locator('#playlist-items .playlist-item').first().locator('button').nth(1).click();
    await page.locator('#playlist-hold').fill('2');
    await page.selectOption('#playlist-mode', 'random');
    await page.locator('#playlist-save').click();
    const playlistSaved = await page.evaluate(() => {
      const app = window.ascilineRemix;
      const saved = app?._playlistById?.();
      const persisted = JSON.parse(localStorage.getItem('asciline-remix-preset-playlists-v1') || '{}');
      const promptCalls = window.__playlistPromptCalls;
      window.prompt = window.__playlistOriginalPrompt;
      delete window.__playlistPromptCalls;
      delete window.__playlistOriginalPrompt;
      return {
        dialogVisible: !document.querySelector('#playlist-dialog')?.hidden,
        promptCalls,
        saved,
        persisted: persisted.playlists?.[0],
        rows: [...document.querySelectorAll('#playlist-items .playlist-item-name')].map((node) => node.textContent.trim()),
        rowTypography: [...document.querySelectorAll('#playlist-items .playlist-item-name')].map((node) => Number.parseFloat(getComputedStyle(node).fontSize)),
        rowActionSizes: [...document.querySelectorAll('#playlist-items .playlist-item button')].map((node) => ({
          height: Math.round(node.getBoundingClientRect().height),
          fontSize: Number.parseFloat(getComputedStyle(node).fontSize)
        }))
      };
    });
    if (
      !playlistSaved.dialogVisible ||
      playlistSaved.promptCalls !== 0 ||
      playlistSaved.saved?.name !== 'Smoke Playlist' ||
      playlistSaved.saved?.holdSeconds !== 2 ||
      playlistSaved.saved?.playbackMode !== 'random' ||
      JSON.stringify(playlistSaved.saved?.presetIds) !== JSON.stringify(['point-click-default', 'ascii-today-broadway-kb']) ||
      JSON.stringify(playlistSaved.persisted) !== JSON.stringify(playlistSaved.saved) ||
      JSON.stringify(playlistSaved.rows) !== JSON.stringify(['Dense Color ASCII', 'Broadway KB']) ||
      playlistSaved.rowTypography.some((fontSize) => fontSize !== 12) ||
      playlistSaved.rowActionSizes.some((metric) => metric.height !== 26 || metric.fontSize !== 11)
    ) {
      throw new Error(`Playlist editor should save reordered stable preset IDs and loop settings: ${JSON.stringify(playlistSaved)}`);
    }
    await page.evaluate(() => {
      const app = window.ascilineRemix;
      app.__playlistOriginalTransitionTo = app._transitionTo;
      app.__playlistOriginalTransitionSeconds = app.params.transitionSeconds;
      app.__playlistOriginalActivePresetId = app.activePresetId;
      app.__playlistTransitionCalls = [];
      app.activePresetId = 'point-click-default';
      app.params.transitionSeconds = 0;
      app._transitionTo = (target, seconds, context) => {
        app.__playlistTransitionCalls.push({ seconds, context, targetPresetId: context?.presetId || '' });
        return new Promise((resolve) => {
          app.__playlistResolveTransition = () => resolve(true);
        });
      };
    });
    await page.locator('#playlist-play').click();
    await page.waitForFunction(
      () => Boolean(window.ascilineRemix?.playlistPlayback && window.ascilineRemix?.__playlistTransitionCalls?.length),
      null,
      { timeout: 5000 }
    );
    const playlistTransitioning = await page.evaluate(() => ({
      dialogHidden: Boolean(document.querySelector('#playlist-dialog')?.hidden),
      activeElement: document.activeElement?.id || '',
      status: document.querySelector('#playlist-status')?.textContent.trim() || '',
      transitionCalls: window.ascilineRemix?.__playlistTransitionCalls || []
    }));
    if (
      !playlistTransitioning.dialogHidden ||
      playlistTransitioning.activeElement !== 'more-presets' ||
      !/^Transitioning to 2\/2 · Broadway KB$/i.test(playlistTransitioning.status) ||
      playlistTransitioning.transitionCalls?.[0]?.targetPresetId !== 'ascii-today-broadway-kb' ||
      playlistTransitioning.transitionCalls?.[0]?.seconds !== 1 ||
      playlistTransitioning.transitionCalls?.[0]?.context?.source !== 'playlist'
    ) {
      throw new Error(`Playlist playback should reveal and describe the shared transition: ${JSON.stringify(playlistTransitioning)}`);
    }
    await page.evaluate(() => window.ascilineRemix?.__playlistResolveTransition?.());
    await page.waitForFunction(
      () => /^Playing 2\/2 · Broadway KB$/i.test(document.querySelector('#playlist-status')?.textContent.trim() || ''),
      null,
      { timeout: 5000 }
    );
    await page.locator('#more-presets').click();
    await page.locator('#manage-playlists').click();
    const reopenedPlaylistStatus = await page.locator('#playlist-status').textContent();
    if (!/^Playing 2\/2 · Broadway KB$/i.test(reopenedPlaylistStatus?.trim() || '')) {
      throw new Error(`Reopened playlist editor should preserve current playback status: ${reopenedPlaylistStatus}`);
    }
    await page.locator('#playlist-stop').click();
    const playlistStopped = await page.evaluate(() => {
      const app = window.ascilineRemix;
      const result = {
        stopped: !app?.playlistPlayback,
        stopDisabled: Boolean(document.querySelector('#playlist-stop')?.disabled),
        status: document.querySelector('#playlist-status')?.textContent.trim() || '',
        transitionCalls: app.__playlistTransitionCalls
      };
      app._transitionTo = app.__playlistOriginalTransitionTo;
      app.params.transitionSeconds = app.__playlistOriginalTransitionSeconds;
      app.activePresetId = app.__playlistOriginalActivePresetId;
      app._renderPresets();
      delete app.__playlistOriginalTransitionTo;
      delete app.__playlistOriginalTransitionSeconds;
      delete app.__playlistOriginalActivePresetId;
      delete app.__playlistTransitionCalls;
      delete app.__playlistResolveTransition;
      return result;
    });
    if (
      !playlistStopped.stopped ||
      !playlistStopped.stopDisabled ||
      !/stopped/i.test(playlistStopped.status) ||
      playlistStopped.transitionCalls?.length !== 1
    ) {
      throw new Error(`Playlist loop should stop cleanly: ${JSON.stringify(playlistStopped)}`);
    }
    await page.locator('#playlist-close').click();
    await page.evaluate(() => {
      const app = window.ascilineRemix;
      app.playlists = [];
      app.activePlaylistId = '';
      app.playlistDraft = null;
      app._persistPlaylists();
    });
    await page.locator('#more-presets').click();
    await page.keyboard.press('Escape');
    const overflowClosed = await page.evaluate(() => ({
      expanded: document.querySelector('#more-presets')?.getAttribute('aria-expanded') || '',
      hidden: Boolean(document.querySelector('#preset-overflow-menu')?.hidden),
      activeElement: document.activeElement?.id || ''
    }));
    if (overflowClosed.expanded !== 'false' || !overflowClosed.hidden || overflowClosed.activeElement !== 'more-presets') {
      throw new Error(`Escape should close preset overflow and restore trigger focus: ${JSON.stringify(overflowClosed)}`);
    }

    await page.setViewportSize({ width: 1024, height: 720 });
    const minimumWindowLayout = await page.evaluate(() => {
      const inspector = document.querySelector('.inspector');
      const selectRects = [...document.querySelectorAll('.control-row:not(.control-hidden)[data-control-type="select"] select')]
        .filter((select) => select.getClientRects().length > 0)
        .map((select) => {
          const rect = select.getBoundingClientRect();
          return { x: Math.round(rect.x), width: Math.round(rect.width), height: Math.round(rect.height) };
        });
      return {
        inspectorOverflow: inspector ? inspector.scrollWidth - inspector.clientWidth : 1,
        selectXs: [...new Set(selectRects.map((rect) => rect.x))],
        selectWidths: [...new Set(selectRects.map((rect) => rect.width))],
        selectHeights: [...new Set(selectRects.map((rect) => rect.height))]
      };
    });
    await page.setViewportSize({ width: 1280, height: 900 });
    if (
      minimumWindowLayout.inspectorOverflow > 0 ||
      minimumWindowLayout.selectXs.length !== 1 ||
      minimumWindowLayout.selectWidths.length !== 1 ||
      JSON.stringify(minimumWindowLayout.selectHeights) !== JSON.stringify([30])
    ) {
      throw new Error(`Minimum desktop window should preserve aligned controls without horizontal overflow: ${JSON.stringify(minimumWindowLayout)}`);
    }

    if (
      main.audioReactive.source !== 'input' ||
      !main.audioReactive.active ||
      main.audioReactive.toggle !== 'Stop' ||
      main.audioReactive.pressed !== 'true' ||
      main.audioReactive.calls?.mic < 1 ||
      main.audioReactive.input !== 'mic-a' ||
      main.audioReactive.inputOptions.includes('Default - Smoke Mic A') ||
      !['Transient / Flux', 'Presence', 'Density Dampening', 'Noise Floor'].every((label) => main.audioReactive.controls.includes(label))
    ) {
      throw new Error(`Audio input should auto-start and request mic capture: ${JSON.stringify(main.audioReactive)}`);
    }

    const broadwayPreset = await page.evaluate(async () => {
      const app = window.ascilineRemix;
      await app.applyPreset('ascii-today-broadway-kb');
      const surface = app?._activeRenderSurface?.();
      const state = {
        activePresetId: app?.activePresetId,
        backend: app?.params?.backend,
        charset: app?.params?.charset,
        glyphMode: app?.params?.glyphMode,
        solidMode: app?.params?.solidMode,
        surfaceWidth: surface?.width || 0,
        surfaceHeight: surface?.height || 0
      };
      await app.applyPreset('point-click-default');
      return state;
    });
    if (
      broadwayPreset.activePresetId !== 'ascii-today-broadway-kb' ||
      broadwayPreset.backend !== 'canvas2d' ||
      broadwayPreset.charset !== 'ascii-today-broadway-kb' ||
      !broadwayPreset.glyphMode ||
      broadwayPreset.solidMode ||
      broadwayPreset.surfaceWidth <= 0 ||
      broadwayPreset.surfaceHeight <= 0
    ) {
      throw new Error(`Broadway KB should apply as a live Canvas2D glyph preset: ${JSON.stringify(broadwayPreset)}`);
    }

    const midiRouting = await page.evaluate(() => {
      const app = window.ascilineRemix;
      const beforeSource = {
        mediaUrl: app.params.mediaUrl,
        mediaType: app.params.mediaType,
        sourceMode: app.params.sourceMode
      };
      const visualApplied = app.applyMidiTarget('visual.brightness', { kind: 'value', value: 1.23 });
      const audioApplied = app.applyMidiTarget('audio.fluxAmount', { kind: 'value', value: 1.75 });
      const targets = app.midiTargetDescriptors().map((target) => target.id);
      const slotKey = 'ascii-vj-remix-midi-preset-slots-v1';
      const previousSlots = localStorage.getItem(slotKey);
      const presetIds = app._allPresets().slice(0, 3).map((preset) => preset.id);
      localStorage.setItem(slotKey, JSON.stringify([presetIds[0], null, presetIds[2]]));
      const stableSlots = app._midiPresetSlots();
      if (previousSlots === null) localStorage.removeItem(slotKey);
      else localStorage.setItem(slotKey, previousSlots);
      return {
        visualApplied,
        audioApplied,
        brightness: app.params.brightness,
        fluxAmount: app.audioReactive.fluxAmount,
        sourceUnchanged: JSON.stringify(beforeSource) === JSON.stringify({
          mediaUrl: app.params.mediaUrl,
          mediaType: app.params.mediaType,
          sourceMode: app.params.sourceMode
        }),
        forbiddenTargets: targets.filter((target) => /source|camera|popout|output/i.test(target)),
        stableSlotHole: stableSlots[1] === null && stableSlots[0]?.id === presetIds[0] && stableSlots[2]?.id === presetIds[2]
      };
    });
    if (
      !midiRouting.visualApplied ||
      !midiRouting.audioApplied ||
      Math.abs(midiRouting.brightness - 1.23) > 0.001 ||
      Math.abs(midiRouting.fluxAmount - 1.75) > 0.001 ||
      !midiRouting.sourceUnchanged ||
      midiRouting.forbiddenTargets.length ||
      !midiRouting.stableSlotHole
    ) {
      throw new Error(`MIDI target routing should stay visual/audio-only: ${JSON.stringify(midiRouting)}`);
    }

    const micCallsBeforeSlider = main.audioReactive.calls.mic;
    await page.evaluate(() => {
      const slider = document.querySelector('#audio-reactive-densityDampening');
      slider.value = '0.65';
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const afterAudioSlider = await page.evaluate(() => ({
      mic: window.__smokeAudioCapture?.mic || 0,
      densityDampening: window.ascilineRemix?.audioReactive?.densityDampening,
      active: Boolean(window.ascilineRemix?.audioReactiveRuntime?.active)
    }));
    if (afterAudioSlider.mic !== micCallsBeforeSlider || afterAudioSlider.densityDampening !== 0.65 || !afterAudioSlider.active) {
      throw new Error(`Audio slider changes should update live without restarting capture: ${JSON.stringify(afterAudioSlider)}`);
    }

    await page.selectOption('#audio-reactive-input', 'mic-b');
    await page.waitForFunction(
      () => window.__smokeAudioCapture?.mic >= 2 &&
        window.__smokeAudioCapture?.constraints?.at(-1)?.audio?.deviceId?.exact === 'mic-b' &&
        window.ascilineRemix?.audioReactiveRuntime?.active,
      null,
      { timeout: 5000 }
    );

    await page.waitForFunction(() => window.ascilineRemix?.running && document.querySelector('#toggle-play')?.textContent === 'Stop', null, { timeout: 15000 });
    const numericTransitionUiWork = await page.evaluate(async () => {
      const app = window.ascilineRemix;
      const counters = { source: 0, camera: 0, visual: 0, values: 0 };
      const originals = {
        source: app._syncSourceControls,
        camera: app._syncCameraDeviceOptions,
        visual: app._applyVisualState,
        values: app._syncInputValues
      };
      app._syncSourceControls = function (...args) {
        counters.source += 1;
        return originals.source.apply(this, args);
      };
      app._syncCameraDeviceOptions = function (...args) {
        counters.camera += 1;
        return originals.camera.apply(this, args);
      };
      app._applyVisualState = function (...args) {
        counters.visual += 1;
        return originals.visual.apply(this, args);
      };
      app._syncInputValues = function (...args) {
        counters.values += 1;
        return originals.values.apply(this, args);
      };
      try {
        const target = {
          ...app.params,
          brightness: Math.min(1.7, app.params.brightness + 0.12),
          bgBlend: Math.min(0.8, app.params.bgBlend + 0.08)
        };
        const completed = await app._transitionTo(target, 0.25);
        return { completed, ...counters };
      } finally {
        app._syncSourceControls = originals.source;
        app._syncCameraDeviceOptions = originals.camera;
        app._applyVisualState = originals.visual;
        app._syncInputValues = originals.values;
      }
    });
    if (
      !numericTransitionUiWork.completed ||
      numericTransitionUiWork.source > 2 ||
      numericTransitionUiWork.camera > 1 ||
      numericTransitionUiWork.visual > 1 ||
      numericTransitionUiWork.values < 2
    ) {
      throw new Error(`Numeric transitions should avoid full UI/source work per frame: ${JSON.stringify(numericTransitionUiWork)}`);
    }
    const sourceSwitches = [
      ['demo-image', 'image'],
      ['demo-video', 'video']
    ];
    for (const [sourceId, mediaType] of sourceSwitches) {
      await page.click(`#source-list [data-source-id="${sourceId}"]`);
      await page.waitForFunction(
        ({ sourceId, mediaType }) => {
          const app = window.ascilineRemix;
          const active = document.querySelector(`#source-list [data-source-id="${sourceId}"]`)?.getAttribute('aria-selected') === 'true';
          return Boolean(app?.running && !app?.starting && app.params?.mediaType === mediaType && active && document.querySelector('#toggle-play')?.textContent === 'Stop');
        },
        { sourceId, mediaType },
        { timeout: 15000 }
      );
      if (mediaType === 'video') {
        const startTime = await page.evaluate(() => {
          const source = window.ascilineRemix?._staticMediaSource?.();
          const video = source?.isVideo ? source.element : null;
          return video?.currentTime || 0;
        });
        await page.waitForFunction(
          (previousTime) => {
            const source = window.ascilineRemix?._staticMediaSource?.();
            const video = source?.isVideo ? source.element : null;
            return Boolean(
              video &&
              video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
              !video.paused &&
              Math.abs((video.currentTime || 0) - previousTime) > 0.05
            );
          },
          startTime,
          { timeout: 15000 }
        );
      }
    }
    const demoVideoPolicy = await page.evaluate(async () => {
      const app = window.ascilineRemix;
      const linuxDesktop = /\bLinux\b/i.test(navigator.userAgent) && !/Android|CrOS/i.test(navigator.userAgent);
      const expected = linuxDesktop ? 'media/demo-video-2.webm' : 'media/demo-video-2.mp4';
      const alternate = linuxDesktop ? 'media/demo-video-2.mp4' : 'media/demo-video-2.webm';
      const selected = app?.params?.mediaUrl || '';
      await app?._switchStaticSource?.({
        sourceMode: 'static',
        mediaUrl: alternate,
        mediaType: 'video',
        sourceName: 'Demo Video'
      });
      return {
        expected,
        selected,
        migrated: app?.params?.mediaUrl || '',
        active: document.querySelector('#source-list [data-source-id="demo-video"]')?.getAttribute('aria-selected')
      };
    });
    if (
      demoVideoPolicy.selected !== demoVideoPolicy.expected ||
      demoVideoPolicy.migrated !== demoVideoPolicy.expected ||
      demoVideoPolicy.active !== 'true'
    ) {
      throw new Error(`Demo Video should select and migrate to the platform media asset: ${JSON.stringify(demoVideoPolicy)}`);
    }
    const liveFamilyTransition = await page.evaluate(async () => {
      const app = window.ascilineRemix;
      const source = app?._staticMediaSource?.();
      const video = source?.isVideo ? source.element : null;
      if (!app || !video) return { skipped: true, reason: 'missing video source' };

      const transitionOutputFrames = [];
      const originalSyncNativeOutputWindow = app._syncNativeOutputWindow?.bind(app);
      const originalUpdatePopoutRendererParams = app._updatePopoutRendererParams?.bind(app);
      app._syncNativeOutputWindow = (params, minIntervalMs) => {
        transitionOutputFrames.push({
          source: 'native',
          backend: params.backend,
          solidMode: Boolean(params.solidMode),
          glyphMode: Boolean(params.glyphMode),
          cols: params.cols
        });
        return originalSyncNativeOutputWindow?.(params, minIntervalMs);
      };
      app._updatePopoutRendererParams = (params) => {
        transitionOutputFrames.push({
          source: 'popout',
          backend: params.backend,
          solidMode: Boolean(params.solidMode),
          glyphMode: Boolean(params.glyphMode),
          cols: params.cols
        });
        return originalUpdatePopoutRendererParams?.(params);
      };

      const presetParams = (id) => app._allPresets?.().find((preset) => preset.id === id)?.params || {};
      const currentUrl = app.params.mediaUrl;
      const currentType = app.params.mediaType;
      const currentName = app.params.sourceName;
      try {
        const solidTarget = {
          ...app.params,
          ...presetParams('neon-sledgehammer'),
          mediaUrl: currentUrl,
          mediaType: currentType,
          sourceName: currentName,
          sourceMode: 'static',
          transitionSeconds: app.params.transitionSeconds
        };
        await app._transitionTo(solidTarget, 0.15);
        const beforeGlyph = video.currentTime || 0;
        const glyphTarget = {
          ...app.params,
          ...presetParams('classic-camera-ascii'),
          mediaUrl: currentUrl,
          mediaType: currentType,
          sourceName: currentName,
          sourceMode: 'static',
          transitionSeconds: app.params.transitionSeconds
        };
        transitionOutputFrames.length = 0;
        const transition = app._transitionTo(glyphTarget, 0.25);
        await new Promise((resolve) => setTimeout(resolve, 180));
        const during = {
          paused: video.paused,
          currentTime: video.currentTime || 0,
          transitioning: Boolean(app.transitioning)
        };
        await transition;
        await new Promise((resolve) => setTimeout(resolve, 120));
        const after = {
          paused: video.paused,
          currentTime: video.currentTime || 0,
          backend: app.params.backend,
          solidMode: app.params.solidMode,
          glyphMode: app.params.glyphMode
        };
        const outputFrameSummary = {
          count: transitionOutputFrames.length,
          sawSolid: transitionOutputFrames.some((frame) => frame.solidMode && !frame.glyphMode),
          sawGlyph: transitionOutputFrames.some((frame) => frame.glyphMode && !frame.solidMode),
          sample: transitionOutputFrames.slice(0, 8)
        };
        return { skipped: false, beforeGlyph, during, after, outputFrameSummary };
      } finally {
        app._syncNativeOutputWindow = originalSyncNativeOutputWindow;
        app._updatePopoutRendererParams = originalUpdatePopoutRendererParams;
      }
    });
    if (
      liveFamilyTransition.skipped ||
      liveFamilyTransition.during.paused ||
      liveFamilyTransition.after.paused ||
      liveFamilyTransition.after.currentTime <= liveFamilyTransition.beforeGlyph + 0.08 ||
      liveFamilyTransition.after.backend !== 'canvas2d' ||
      liveFamilyTransition.after.solidMode ||
      !liveFamilyTransition.after.glyphMode ||
      !liveFamilyTransition.outputFrameSummary?.sawSolid ||
      !liveFamilyTransition.outputFrameSummary?.sawGlyph
    ) {
      throw new Error(`Solid-to-glyph static transitions should keep video playback live: ${JSON.stringify(liveFamilyTransition)}`);
    }
    const nativeTransitionContract = await page.evaluate(() => {
      const app = window.ascilineRemix;
      const from = { ...app.params, brightness: 0.7, glyphMode: false, solidMode: true };
      const to = { ...app.params, brightness: 1.3, glyphMode: true, solidMode: false };
      const startAtUnixMs = Date.now() + 80;
      const payload = app._nativeOutputPayload(to, {
        kind: 'crossfade',
        startAtUnixMs,
        durationMs: 650,
        fromParams: from
      });
      return {
        kind: payload.transition?.kind,
        startDeltaMs: Number(payload.transition?.startAtUnixMs || 0) - Date.now(),
        durationMs: payload.transition?.durationMs,
        fromBrightness: payload.transition?.fromParams?.brightness,
        fromGlyphMode: payload.transition?.fromParams?.glyphMode,
        targetBrightness: payload.params?.brightness,
        targetGlyphMode: payload.params?.glyphMode,
        capturedAtUnixMs: payload.mediaState?.capturedAtUnixMs
      };
    });
    if (
      nativeTransitionContract.kind !== 'crossfade' ||
      nativeTransitionContract.startDeltaMs < 0 ||
      nativeTransitionContract.startDeltaMs > 100 ||
      nativeTransitionContract.durationMs !== 650 ||
      nativeTransitionContract.fromBrightness !== 0.7 ||
      nativeTransitionContract.fromGlyphMode ||
      nativeTransitionContract.targetBrightness !== 1.3 ||
      !nativeTransitionContract.targetGlyphMode ||
      (nativeTransitionContract.capturedAtUnixMs !== undefined &&
        !Number.isFinite(nativeTransitionContract.capturedAtUnixMs))
    ) {
      throw new Error(`Native transition payload should preserve one shared clock and both parameter endpoints: ${JSON.stringify(nativeTransitionContract)}`);
    }
    await page.click('#source-list [data-source-id="camera"]');
    await page.waitForFunction(
      () => {
        const app = window.ascilineRemix;
        const active = document.querySelector('#source-list [data-source-id="camera"]')?.getAttribute('aria-selected') === 'true';
        const cameraGroup = document.querySelector('#camera-controls-slot .control-group[data-group="Camera"]');
        return Boolean(
          app?.running &&
          !app?.starting &&
          app.params?.mediaType === 'camera' &&
          active &&
          cameraGroup &&
          !cameraGroup.classList.contains('control-hidden')
        );
      },
      null,
      { timeout: 15000 }
    );
    const cameraNativeParity = await page.evaluate(() => {
      const app = window.ascilineRemix;
      const cameraBase = {
        sourceMode: 'static',
        mediaUrl: 'camera://local',
        mediaType: 'camera',
        sourceName: 'Camera',
        cameraDeviceId: 'cam-a',
        cameraSelectedDeviceIds: ['cam-a']
      };
      const presetParams = (id) => app?._allPresets?.().find((preset) => preset.id === id)?.params || {};
      const classic = { ...app.params, ...presetParams('classic-camera-ascii'), ...cameraBase };
      const pointClick = { ...app.params, backend: 'auto', ...presetParams('point-click-default'), ...cameraBase };
      const neon = { ...app.params, ...presetParams('neon-sledgehammer'), ...cameraBase };
      const previousWtfActive = app.wtfActive;
      app.wtfActive = true;
      const wtfPayload = app._nativeOutputPayload?.(classic);
      app.wtfActive = previousWtfActive;
      return {
        classicMirrors: app?._shouldMirrorNativeCameraOutput?.(classic) ?? null,
        classicNativeGlyphs: app?._nativeOutputGlyphMode?.(classic) ?? null,
        pointClickNativeGlyphs: app?._nativeOutputGlyphMode?.(pointClick) ?? null,
        neonMirrors: app?._shouldMirrorNativeCameraOutput?.(neon) ?? null,
        neonNativeGlyphs: app?._nativeOutputGlyphMode?.(neon) ?? null,
        nativeWtfActive: wtfPayload?.params?.nativeWtfActive,
        classic: {
          glyphMode: classic.glyphMode,
          solidMode: classic.solidMode,
          pixel: classic.pixel,
          backend: classic.backend
        },
        pointClick: {
          glyphMode: pointClick.glyphMode,
          solidMode: pointClick.solidMode,
          pixel: pointClick.pixel,
          backend: pointClick.backend
        },
        neon: {
          glyphMode: neon.glyphMode,
          solidMode: neon.solidMode,
          pixel: neon.pixel,
          backend: neon.backend
        }
      };
    });
    if (cameraNativeParity.classicMirrors || cameraNativeParity.neonMirrors) {
      throw new Error(`Live camera presets should not use mirror transport by default: ${JSON.stringify(cameraNativeParity)}`);
    }
    if (!cameraNativeParity.classicNativeGlyphs || !cameraNativeParity.pointClickNativeGlyphs || cameraNativeParity.neonNativeGlyphs) {
      throw new Error(`Native output glyph masking should follow glyph and solid-mode controls independently of the preview backend: ${JSON.stringify(cameraNativeParity)}`);
    }
    if (cameraNativeParity.nativeWtfActive !== false) {
      throw new Error(`Native output should consume app-resolved WTF params instead of double-modulating: ${JSON.stringify(cameraNativeParity)}`);
    }
    await page.click('#source-list [data-source-id="demo-image"]');
    await page.waitForFunction(
      () => window.ascilineRemix?.params?.mediaUrl === 'media/demo.svg' &&
        document.querySelector('#source-list [data-source-id="demo-image"]')?.getAttribute('aria-selected') === 'true',
      null,
      { timeout: 15000 }
    );

    const traditionalPresetIds = ['classic-camera-ascii', 'ansi-newsprint', 'terminal-mono', 'dense-typewriter'];
    for (const presetId of traditionalPresetIds) {
      await page.evaluate(async (id) => {
        await window.ascilineRemix.applyPreset(id);
      }, presetId);
      await page.waitForFunction(
        ({ presetId }) => {
          const app = window.ascilineRemix;
          return Boolean(
            app?.running &&
            !app?.starting &&
            !app?.transitioning &&
            app.activePresetId === presetId &&
            app.params?.mediaUrl === 'media/demo.svg' &&
            app.params?.mediaType === 'image' &&
            app.params?.backend === 'canvas2d' &&
            app.params?.glyphMode &&
            !app.params?.solidMode
          );
        },
        { presetId },
        { timeout: 15000 }
      );
      const presetSignal = await page.evaluate(() => {
        const surface = window.ascilineRemix?._activeRenderSurface?.();
        const canvas = surface?.tagName === 'CANVAS' ? surface : document.querySelector('#gpu-stage canvas, #ascii-canvas');
        if (!canvas?.width || !canvas?.height) return { visible: false, reason: 'missing canvas' };

        const sample = document.createElement('canvas');
        sample.width = Math.min(120, canvas.width);
        sample.height = Math.min(90, canvas.height);
        const ctx = sample.getContext('2d', { willReadFrequently: true });
        if (!ctx) return { visible: false, reason: 'missing context' };

        ctx.drawImage(canvas, 0, 0, sample.width, sample.height);
        const data = ctx.getImageData(0, 0, sample.width, sample.height).data;
        let foreground = 0;
        let background = 0;
        let maxLuma = 0;
        for (let i = 0; i < data.length; i += 4) {
          const luma = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
          maxLuma = Math.max(maxLuma, luma);
          if (luma > 24) foreground += 1;
          if (data[i] <= 8 && data[i + 1] <= 10 && data[i + 2] <= 12) background += 1;
        }

        return {
          visible: maxLuma > 28 && foreground > 5 && background > 5,
          foreground,
          background,
          maxLuma
        };
      });
      if (!presetSignal.visible) {
        throw new Error(`Traditional ASCII preset did not render a glyph-like signal for ${presetId}: ${JSON.stringify(presetSignal)}`);
      }
      const presetMotion = await page.evaluate(async () => {
        const app = window.ascilineRemix;
        const capture = () => {
          app?.staticRuntime?.renderer?.renderFrame?.();
          const surface = app?._activeRenderSurface?.();
          const canvas = surface?.tagName === 'CANVAS' ? surface : document.querySelector('#gpu-stage canvas, #ascii-canvas');
          if (!canvas?.width || !canvas?.height) return null;

          const sample = document.createElement('canvas');
          sample.width = Math.min(120, canvas.width);
          sample.height = Math.min(90, canvas.height);
          const ctx = sample.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(canvas, 0, 0, sample.width, sample.height);
          return ctx.getImageData(0, 0, sample.width, sample.height).data;
        };

        const first = capture();
        await new Promise((resolve) => setTimeout(resolve, 420));
        const second = capture();
        if (!first || !second || first.length !== second.length) return { visible: false, reason: 'missing samples' };

        let changed = 0;
        let totalDelta = 0;
        for (let i = 0; i < first.length; i += 4) {
          const delta = Math.abs(first[i] - second[i]) +
            Math.abs(first[i + 1] - second[i + 1]) +
            Math.abs(first[i + 2] - second[i + 2]);
          totalDelta += delta;
          if (delta > 18) changed += 1;
        }
        const jitterControlHidden = document
          .querySelector('[data-control-key="jitterAmount"]')
          ?.classList.contains('control-hidden') ?? true;
        return {
          visible: changed > 8 && totalDelta > 900,
          changed,
          totalDelta,
          pixels: first.length / 4,
          jitterAmount: app?.params?.jitterAmount,
          jitterSpeed: app?.params?.jitterSpeed,
          jitterControlHidden
        };
      });
      if (!presetMotion.visible || presetMotion.jitterAmount <= 0 || presetMotion.jitterSpeed <= 0 || presetMotion.jitterControlHidden) {
        throw new Error(`Traditional ASCII preset should animate default Canvas2D jitter for ${presetId}: ${JSON.stringify(presetMotion)}`);
      }
    }

    const canvasJitterMotion = await page.evaluate(async () => {
      const app = window.ascilineRemix;
      if (!app?.staticRuntime?.renderer) return { visible: false, reason: 'missing renderer' };
      app.params = {
        ...app.params,
        backend: 'canvas2d',
        glyphMode: true,
        solidMode: false,
        jitterAmount: 1,
        jitterSpeed: 4,
        sampleX: 0.5,
        sampleY: 0.5
      };
      app._applyEffectiveRendererParams(app.renderParams(), 'test');

      const capture = () => {
        app.staticRuntime.renderer?.renderFrame?.();
        const surface = app._activeRenderSurface?.();
        const canvas = surface?.tagName === 'CANVAS' ? surface : document.querySelector('#gpu-stage canvas, #ascii-canvas');
        if (!canvas?.width || !canvas?.height) return null;

        const sample = document.createElement('canvas');
        sample.width = Math.min(96, canvas.width);
        sample.height = Math.min(72, canvas.height);
        const ctx = sample.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(canvas, 0, 0, sample.width, sample.height);
        return ctx.getImageData(0, 0, sample.width, sample.height).data;
      };

      const first = capture();
      await new Promise((resolve) => setTimeout(resolve, 360));
      const second = capture();
      if (!first || !second || first.length !== second.length) return { visible: false, reason: 'missing samples' };

      let changed = 0;
      let totalDelta = 0;
      for (let i = 0; i < first.length; i += 4) {
        const delta = Math.abs(first[i] - second[i]) +
          Math.abs(first[i + 1] - second[i + 1]) +
          Math.abs(first[i + 2] - second[i + 2]);
        totalDelta += delta;
        if (delta > 24) changed += 1;
      }
      return {
        visible: changed > 12 && totalDelta > 1800,
        changed,
        totalDelta,
        pixels: first.length / 4,
        backend: app.params.backend,
        jitterAmount: app.params.jitterAmount,
        jitterSpeed: app.params.jitterSpeed
      };
    });
    if (!canvasJitterMotion.visible) {
      throw new Error(`Canvas2D Demo Image jitter should animate static image sampling: ${JSON.stringify(canvasJitterMotion)}`);
    }

    const migrationContext = await browser.newContext({ viewport: { width: 960, height: 640 } });
    await migrationContext.addInitScript(() => {
      localStorage.removeItem('asciline-remix-canvas-ascii-jitter-migrated-v1');
      localStorage.setItem('asciline-remix-state-v1', JSON.stringify({
        sourceMode: 'static',
        backend: 'canvas2d',
        mediaUrl: 'media/demo.svg',
        mediaType: 'image',
        sourceName: 'Demo Image',
        cols: 170,
        autoRows: true,
        cellWidth: 6,
        cellHeight: 9,
        jitterAmount: 0,
        jitterSpeed: 0,
        sampleX: 0.5,
        sampleY: 0.5,
        glyphMode: true,
        solidMode: false,
        pixel: false,
        charset: 'classic-camera',
        fontFamily: 'Courier New',
        mode: 1
      }));
    });
    const migrationPage = await migrationContext.newPage();
    migrationPage.on('console', (msg) => { if (msg.type() === 'error') errors.push(`migration:${msg.text()}`); });
    const migrationResponse = await migrationPage.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    await migrationPage.waitForFunction(
      () => window.ascilineRemix?.running &&
        !window.ascilineRemix?.starting &&
        window.ascilineRemix?.params?.backend === 'canvas2d' &&
        window.ascilineRemix?.params?.mediaUrl === 'media/demo.svg',
      null,
      { timeout: 15000 }
    );
    const migratedStoredClassic = await migrationPage.evaluate(async () => {
      const app = window.ascilineRemix;
      const capture = () => {
        app?.staticRuntime?.renderer?.renderFrame?.();
        const surface = app?._activeRenderSurface?.();
        const canvas = surface?.tagName === 'CANVAS' ? surface : document.querySelector('#gpu-stage canvas, #ascii-canvas');
        if (!canvas?.width || !canvas?.height) return null;

        const sample = document.createElement('canvas');
        sample.width = Math.min(96, canvas.width);
        sample.height = Math.min(72, canvas.height);
        const ctx = sample.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(canvas, 0, 0, sample.width, sample.height);
        return ctx.getImageData(0, 0, sample.width, sample.height).data;
      };

      const first = capture();
      await new Promise((resolve) => setTimeout(resolve, 420));
      const second = capture();
      let changed = 0;
      let totalDelta = 0;
      if (first && second && first.length === second.length) {
        for (let i = 0; i < first.length; i += 4) {
          const delta = Math.abs(first[i] - second[i]) +
            Math.abs(first[i + 1] - second[i + 1]) +
            Math.abs(first[i + 2] - second[i + 2]);
          totalDelta += delta;
          if (delta > 18) changed += 1;
        }
      }
      return {
        visible: changed > 8 && totalDelta > 900,
        changed,
        totalDelta,
        backend: app?.params?.backend,
        jitterAmount: app?.params?.jitterAmount,
        jitterSpeed: app?.params?.jitterSpeed,
        migrationFlag: localStorage.getItem('asciline-remix-canvas-ascii-jitter-migrated-v1')
      };
    });
    await migrationContext.close();
    if (
      migrationResponse.status() >= 400 ||
      !migratedStoredClassic.visible ||
      migratedStoredClassic.jitterAmount !== 0.32 ||
      migratedStoredClassic.jitterSpeed !== 0.85 ||
      migratedStoredClassic.migrationFlag !== '1'
    ) {
      throw new Error(`Stored Classic Camera ASCII zero-jitter state should migrate and animate: ${JSON.stringify(migratedStoredClassic)}`);
    }

    const wtfAsciiAnchorTarget = await page.evaluate(() => {
      const app = window.ascilineRemix;
      if (!app?._randomWtfTarget) return { ok: false, reason: 'missing app' };
      const originalRandom = Math.random;
      const originalParams = { ...app.params };
      try {
        Math.random = () => 0;
        app.params = {
          ...app.params,
          sourceMode: 'static',
          mediaUrl: 'media/demo.svg',
          mediaType: 'image',
          sourceName: 'Demo Image',
          backend: 'auto',
          solidMode: true,
          glyphMode: false,
          pixel: false
        };
        const target = app._randomWtfTarget(0.25);
        return {
          ok: true,
          backend: target.backend,
          glyphMode: target.glyphMode,
          solidMode: target.solidMode,
          aspectCorrection: target.aspectCorrection,
          cols: target.cols
        };
      } catch (error) {
        return {
          ok: false,
          name: error?.name || '',
          message: error?.message || String(error)
        };
      } finally {
        Math.random = originalRandom;
        app.params = originalParams;
      }
    });
    if (
      !wtfAsciiAnchorTarget.ok ||
      wtfAsciiAnchorTarget.backend !== 'canvas2d' ||
      !wtfAsciiAnchorTarget.glyphMode ||
      wtfAsciiAnchorTarget.solidMode ||
      wtfAsciiAnchorTarget.aspectCorrection !== 1
    ) {
      throw new Error(`WTF solid-to-ASCII anchor target should be defined and normalized: ${JSON.stringify(wtfAsciiAnchorTarget)}`);
    }

    await page.evaluate(() => { window.__smokeAudioCapture.display = 0; });
    await page.selectOption('#audio-reactive-source', 'display');
    await page.waitForFunction(() => window.__smokeAudioCapture?.display === 1, null, { timeout: 5000 });
    const afterDisplaySelect = await page.evaluate(() => ({
      calls: window.__smokeAudioCapture,
      enabled: Boolean(window.ascilineRemix?.audioReactive?.enabled),
      active: Boolean(window.ascilineRemix?.audioReactiveRuntime?.active),
      status: document.querySelector('#audio-reactive-status')?.textContent || ''
    }));
    if (afterDisplaySelect.calls.display !== 1 || !afterDisplaySelect.enabled || !afterDisplaySelect.active) {
      throw new Error(`Display audio source selection should start capture: ${JSON.stringify(afterDisplaySelect)}`);
    }
    if (/user gesture/i.test(afterDisplaySelect.status)) {
      throw new Error(`Display audio start still hit user gesture gating: ${JSON.stringify(afterDisplaySelect)}`);
    }

    const presetMatrix = await page.evaluate(async () => {
      const app = window.ascilineRemix;
      if (app.audioReactive.enabled || app.audioReactiveRuntime.active) await app._toggleAudioReactive();
      const originalTransition = app._transitionTo.bind(app);
      app._transitionTo = (target) => originalTransition(target, 0);
      const results = [];

      try {
        for (const preset of app._allPresets()) {
          await app.applyPreset(preset.id);
          const renderer = app.staticRuntime?.renderer;
          const started = performance.now();
          while (renderer?.pendingGlyphPages?.size && performance.now() - started < 3000) {
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
          renderer?.renderFrame?.();

          const canvas = app._activeRenderSurface?.();
          let pixels = null;
          let glError = 0;
          if (canvas?.width && canvas?.height) {
            const gl = renderer?.gl;
            if (gl) {
              pixels = new Uint8Array(canvas.width * canvas.height * 4);
              gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
              glError = gl.getError();
            } else {
              pixels = canvas.getContext('2d', { willReadFrequently: true })
                ?.getImageData(0, 0, canvas.width, canvas.height).data || null;
            }
          }

          const background = app.params.backgroundColor.match(/[0-9a-f]{2}/gi).map((value) => Number.parseInt(value, 16));
          let nonBackground = 0;
          if (pixels) {
            for (let index = 0; index < pixels.length && nonBackground < 32; index += 4) {
              const difference = Math.abs(pixels[index] - background[0]) +
                Math.abs(pixels[index + 1] - background[1]) +
                Math.abs(pixels[index + 2] - background[2]);
              if (difference > 12) nonBackground += 1;
            }
          }

          const sourceRatio = (renderer?.source?.width || 16) / (renderer?.source?.height || 9);
          const canvasRatio = canvas?.width && canvas?.height ? canvas.width / canvas.height : 0;
          results.push({
            id: preset.id,
            active: app.activePresetId === preset.id,
            requestedBackend: app.params.backend,
            resolvedBackend: app.staticRuntime?.getStats?.()?.backend || '',
            hasSignal: nonBackground >= 5,
            aspectError: canvasRatio ? Math.abs(canvasRatio / sourceRatio - 1) : 1,
            glError,
            pendingGlyphPages: renderer?.pendingGlyphPages?.size || 0,
            canvasSize: `${canvas?.width || 0}x${canvas?.height || 0}`
          });
        }
      } finally {
        app._transitionTo = originalTransition;
      }
      return results;
    });
    const presetFailures = presetMatrix.filter((preset) =>
      !preset.active ||
      !preset.hasSignal ||
      preset.aspectError > 0.03 ||
      preset.glError !== 0 ||
      preset.pendingGlyphPages !== 0
    );
    if (presetFailures.length) {
      throw new Error(`Primary Demo Image preset matrix failed: ${JSON.stringify(presetFailures)}`);
    }
    assertPresetBackendContract(presetMatrix);
    const acceleratedPresetResults = presetMatrix.filter((preset) => preset.requestedBackend === 'auto');
    const acceleratedPresetFailures = acceleratedPresetResults.filter((preset) =>
      preset.resolvedBackend !== 'webgpu' && preset.resolvedBackend !== 'webgl2'
    );
    if (!acceleratedPresetResults.length || acceleratedPresetFailures.length) {
      throw new Error(`Auto built-in presets should resolve to WebGPU or WebGL2 in the capable Chromium smoke runtime: ${JSON.stringify({
        eligible: acceleratedPresetResults.length,
        failures: acceleratedPresetFailures
      })}`);
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
        paletteId: 'midnight-scan',
        paletteMapping: 'nearest',
        ditherMode: 'bayer4',
        ditherStrength: 0.55,
        ditherScale: 1,
        ditherBias: 0,
        ditherInvert: false,
        jitterAmount: 0.2,
        jitterSpeed: 1,
        sampleX: 0.5,
        sampleY: 0.5,
        smoothing: false,
        cellWidth: 2,
        cellHeight: 3,
        solidMode: false,
        glyphMode: true,
        charset: 'custom',
        customGlyphRamp: ' Aあ中한',
        glyphDepth: 96,
        glyphOffset: 0,
        glyphReverse: false,
        glyphColorMode: 'fixed',
        glyphColor: '#e6f3ff',
        backgroundColor: '#030405',
        aspectCorrection: 1
      },
      mediaState: null
    }));
    await output.waitForSelector('#output-stage canvas', { timeout: 15000 });
    await output.waitForFunction(() => {
      const state = window.ascilineOutput?.rendererState?.();
      return state?.glyphRampLength === 5 && [0, 3, 4, 13].every((page) => state.loadedGlyphPages.includes(page));
    }, null, { timeout: 15000 });
    const outputState = await output.evaluate(() => ({
      status: document.querySelector('#output-status')?.textContent,
      canvasCount: document.querySelectorAll('#output-stage canvas').length,
      renderer: window.ascilineOutput?.rendererState?.()
    }));
    if (
      outputState.renderer?.paletteId !== 'midnight-scan' ||
      outputState.renderer?.ditherMode !== 'bayer4' ||
      outputState.renderer?.glyphRampLength !== 5 ||
      ![0, 3, 4, 13].every((page) => outputState.renderer.loadedGlyphPages.includes(page))
    ) {
      throw new Error(`Palette/dither/custom Unicode output did not reach the renderer: ${JSON.stringify(outputState)}`);
    }
    await output.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 36;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#030405';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#ff2bd6';
      ctx.fillRect(8, 6, 48, 24);
      window.ascilineOutput.applyState({
        outputMode: 'mirror',
        label: 'Mirror Smoke',
        params: { sourceMode: 'static' }
      });
      window.ascilineOutput.applyMirrorFrame({
        dataUrl: canvas.toDataURL('image/png'),
        width: canvas.width,
        height: canvas.height,
        smoothing: false,
        label: 'Mirror Smoke'
      });
    });
    await output.waitForFunction(() => document.body.classList.contains('has-frame'), null, { timeout: 5000 });
    const mirrorState = await output.evaluate(() => ({
      status: document.querySelector('#output-status')?.textContent,
      canvasCount: document.querySelectorAll('#output-stage canvas').length,
      hasFrame: document.body.classList.contains('has-frame')
    }));
    if (!mirrorState.hasFrame || mirrorState.canvasCount !== 1 || mirrorState.status !== 'Mirror Smoke') {
      throw new Error(`Mirror output did not render a frame: ${JSON.stringify(mirrorState)}`);
    }

    await browser.close();

    const result = {
      mainStatus: response.status(),
      outputStatus: outputResponse.status(),
      main,
      output: outputState,
      mirrorOutput: mirrorState,
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
