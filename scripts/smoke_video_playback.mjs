import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { findChromiumExecutable } from './lib/chromium.mjs';

// Platform identities exercise source/preset policy, not native OS audio drivers.
const platforms = {
    macOS: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
    Windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    Linux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15'
};
const server = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false, watch: null } });
let browser;
try {
    await server.listen();
    const url = server.resolvedUrls.local[0];
    browser = await chromium.launch({
        executablePath: findChromiumExecutable(), headless: true,
        args: ['--autoplay-policy=no-user-gesture-required']
    });
    for (const [platform, userAgent] of Object.entries(platforms)) {
        const page = await browser.newPage({ userAgent, viewport: { width: 1280, height: 900 } });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(url);
        await page.waitForFunction(() => window.ascilineRemix?.running);
        if (process.env.ASCILINE_PLAYBACK_MEDIA && platform === 'macOS') {
            await page.locator('#local-media-file').setInputFiles(resolve(process.env.ASCILINE_PLAYBACK_MEDIA));
        } else {
            await page.evaluate(async () => {
                const { bundledDemoVideoUrl } = await import('/renderers/gpu/media-source.js');
                await window.ascilineRemix._switchStaticSource({
                    sourceMode: 'static', mediaUrl: bundledDemoVideoUrl(), mediaType: 'video', sourceName: 'Playback test'
                });
            });
        }
        await page.waitForFunction(() => {
            const video = window.ascilineRemix?._staticMediaSource()?.element;
            return video?.tagName === 'VIDEO' && video.readyState >= 2 && !video.paused;
        });
        const result = await page.evaluate(async ({ soakMs }) => {
            const app = window.ascilineRemix;
            const video = app._staticMediaSource().element;
            const expected = { muted: false, volume: 0.63, loop: false };
            Object.assign(app.params, expected);
            app.staticRuntime.updateParams(app.params);
            const failures = [];
            const check = (actual, label) => {
                for (const key of Object.keys(expected)) {
                    if (actual[key] !== expected[key]) failures.push(`${label}: ${key}=${actual[key]}, expected ${expected[key]}`);
                }
            };
            let signal = null;
            if (soakMs) {
                video.currentTime = 0;
                const context = new AudioContext();
                await context.resume();
                const analyser = context.createAnalyser();
                context.createMediaElementSource(video).connect(analyser);
                analyser.connect(context.destination);
                const samples = new Float32Array(analyser.fftSize);
                signal = { readings: 0, nonSilent: 0, maxSilentSeconds: 0 };
                let silenceStarted = null;
                signal.read = () => {
                    analyser.getFloatTimeDomainData(samples);
                    const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
                    signal.readings++;
                    if (rms > 0.00001) { signal.nonSilent++; silenceStarted = null; }
                    else {
                        silenceStarted ??= video.currentTime;
                        signal.maxSilentSeconds = Math.max(signal.maxSilentSeconds, video.currentTime - silenceStarted);
                    }
                };
            }
            const before = video.currentTime;
            if (soakMs) {
                const deadline = performance.now() + soakMs;
                while (performance.now() < deadline) {
                    await new Promise(resolve => setTimeout(resolve, 250));
                    check(video, 'unattended playback');
                    if (!video.ended) signal.read();
                    if (video.error) throw new Error(`Media error ${video.error.code}`);
                    if (video.paused && !video.ended) throw new Error('Playback paused before the end');
                }
            }
            const unattended = { from: before, to: video.currentTime, duration: video.duration, ended: video.ended, muted: video.muted, volume: video.volume };
            if (signal) {
                delete signal.read;
                unattended.signal = signal;
                if (!signal.nonSilent) failures.push('No decoded audio signal during soak');
                if (video.currentTime - before < Math.min(soakMs / 1000, video.duration) - 3) failures.push('Playback did not advance through the soak');
            }
            // Check every built-in and old saved settings, including WTF anchors.
            for (const preset of app._allPresets()) {
                check(app._baseForPreset(preset), `base ${preset.id}`);
            }
            for (let i = 0; i < 128; i++) check(app._randomWtfTarget(1), `WTF ${i}`);
            // Exercise actual preset application and renderer replacement on both families.
            for (const backend of ['canvas2d', 'auto']) {
                const preset = app._allPresets().find(p => p.params.backend === backend);
                if (!preset) throw new Error(`No ${backend} preset`);
                await app.applyPreset(preset.id, { transitionSeconds: 0.05 });
                check(app.params, `applied ${preset.id}`);
                check(app._staticMediaSource().element, `video ${preset.id}`);
                if (app._staticMediaSource().element !== video) failures.push('Preset replaced the video element');
            }
            app.userPresets.push({ id: 'playback-legacy', name: 'Legacy playback', readonly: false,
                params: { brightness: 1.1, muted: true, volume: 0, loop: true } });
            await app.applyPreset('playback-legacy', { transitionSeconds: 0.05 });
            check(app.params, 'legacy saved preset');
            check(app._staticMediaSource().element, 'legacy video');
            // Explicit user edits still work, and visual randomization retains silence too.
            Object.assign(expected, { muted: true, volume: 0.27, loop: true });
            Object.assign(app.params, expected);
            app.staticRuntime.updateParams(app.params);
            check(video, 'manual playback edit');
            for (let i = 0; i < 128; i++) check(app._randomWtfTarget(1), `muted WTF ${i}`);
            const transition = app._transitionTo({ ...app.params, brightness: 1.4 }, 0.5);
            await new Promise(resolve => setTimeout(resolve, 40));
            expected.muted = false;
            app.params.muted = false;
            app._paramChanged('muted');
            await transition;
            check(app.params, 'manual edit during transition');
            check(video, 'video after transition edit');
            return { unattended, failures: failures.slice(0, 12), failureCount: failures.length };
        }, { soakMs: platform === 'macOS' ? Number(process.env.ASCILINE_PLAYBACK_SOAK_MS || 0) : 0 });
        console.log(`${platform}: ${JSON.stringify(result)}`);
        assert.deepEqual(errors, [], `${platform}: uncaught errors`);
        assert.equal(result.failureCount, 0, `${platform}: playback settings changed`);
        await page.close();
    }
    console.log('Video playback survives presets, legacy saved presets, and WTF for all three platform identities.');
} finally {
    await browser?.close();
    await server.close();
}
