// Runs only in the opt-in debug desktop fixture, on bundled media.
(async () => {
    const report = { ok: false, passed: [] };
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    async function until(label, condition) {
        const deadline = performance.now() + 15000;
        while (!condition()) {
            if (performance.now() > deadline) throw new Error(label);
            await wait(40);
        }
        report.passed.push(label);
    }
    try {
        await until('app ready', () => window.ascilineRemix?.running);
        const app = window.ascilineRemix;
        const runtime = () => app.staticRuntime;
        const renderer = () => runtime().renderer;
        const backend = () => renderer()?.getStats().backend;
        const restart = async (mediaType, mediaUrl) => {
            app.params = { ...app.params, sourceMode: 'static', backend: 'webgpu', mediaType, mediaUrl, loop: true, muted: true };
            await app.restart();
            await until(mediaType + ' WebGPU frames', () => backend() === 'webgpu' && renderer().frameCount > 1);
        };
        await restart('image', 'media/demo.svg');
        const image = runtime().source;
        const preset = app.activePresetId;
        let failed = renderer();
        const frame = failed._renderSourceFrame;
        const observed = new DOMException('Preview fixture frame submission', 'InvalidStateError');
        failed._renderSourceFrame = () => { throw observed; };
        failed.renderFrame();
        failed._renderSourceFrame = frame;
        const before = failed.frameCount;
        await until('transient failure resumes on same renderer', () => renderer() === failed && failed.frameCount > before);
        failed._renderSourceFrame = () => { throw observed; };
        await until('persistent failure rebuilds WebGPU', () => renderer() !== failed && backend() === 'webgpu' && renderer().frameCount > 1);
        failed = renderer();
        failed._renderSourceFrame = () => { throw observed; };
        await until('second failure falls back and paints', () => renderer() !== failed && ['webgl2','canvas2d','pixel-canvas'].includes(backend()) && renderer().frameCount > 1);
        if (runtime().source !== image || app.params.backend !== 'webgpu' || app.activePresetId !== preset) throw new Error('Image, preference or preset changed');
        report.fallback = backend();
        await restart('video', 'media/point-click-test-30s.mp4');
        const video = runtime().source;
        const position = video.element.currentTime;
        const transition = app._crossfadeLiveRenderer({ ...app.params, brightness: 1.04 }, 0.5);
        await until('incoming WebGPU ready', () => runtime().crossfading && renderer().canvas.parentElement.classList.contains('renderer-buffer-incoming'));
        failed = renderer();
        failed.device.destroy();
        await transition;
        await until('shared-device loss recovers video after crossfade', () => renderer() !== failed && renderer().frameCount > 1 && runtime().source === video && !video.element.paused && video.element.currentTime > position);
        if (app.params.backend !== 'webgpu' || app.params.brightness !== 1.04) throw new Error('Video controls changed');
        const restored = renderer();
        const presented = restored.frameCount;
        await window.__TAURI_INTERNALS__.invoke('plugin:event|emit_to', {
            target: {kind:'App'}, event:'asciline-preview-minimize', payload:null
        });
        report.windowBeforeWait = { visibility: document.visibilityState, paused: video.element.paused };
        try {
            await until('native window restored and video plays', () => window.previewWindowRestored
                && document.visibilityState === 'visible' && !video.element.paused && renderer().frameCount > presented);
        } finally {
            report.windowAfterWait = { visibility: document.visibilityState, paused: video.element.paused,
                time: video.element.currentTime, frames: renderer().frameCount };
        }
        if (CHECK_SUSPEND) {
            const sample = () => ({
                frames: renderer()?.frameCount, backend: backend(), sameSource: runtime().source === video,
                paused: video.element.paused, ended: video.element.ended, time: video.element.currentTime,
                readyState: video.element.readyState, loop: video.element.loop, visibility: document.visibilityState,
                requested: app.params.backend, running: renderer()?.running,
                failure: renderer()?.runtimeFailure?.operation || null
            });
            report.beforeSleep = sample();
            await window.__TAURI_INTERNALS__.invoke('plugin:event|emit_to', {
                target: {kind:'App'}, event:'asciline-preview-await-sleep', payload:null
            });
            // The operator verifies a matching macOS Sleep/Wake pair in the power log.
            let gap = 0;
            const deadline = Date.now() + 10 * 60 * 1000;
            while (gap < 4000 && Date.now() < deadline) {
                const before = Date.now();
                await wait(200);
                gap = Date.now() - before;
            }
            if (gap < 4000) throw new Error('No suspend interval observed');
            report.suspendGapMs = gap;
            report.afterWake = sample();
            // A rebuilt renderer starts its own frame counter at zero.
            let lastRenderer = renderer();
            let first = sample();
            try {
                await until('post-wake video advances', () => {
                    if (renderer() !== lastRenderer) { lastRenderer = renderer(); first = sample(); }
                    const now = sample();
                    return now.sameSource && !now.paused && now.time !== first.time
                        && now.frames > first.frames + 2 && now.requested === 'webgpu';
                });
            } finally { report.final = sample(); }
        }
        await restart('image', 'media/demo.svg');
        const owner = runtime();
        const create = owner._createRendererForParams.bind(owner);
        let unblock;
        owner._createRendererForParams = async (params, layer, options) => {
            if (options.preservePlayback) await new Promise(resolve => { unblock = resolve; });
            return create(params, layer, options);
        };
        renderer().device.destroy();
        await until('recovery in flight', () => Boolean(unblock));
        app.params.backend = 'canvas2d';
        await app.restart({ reuseStaticMedia: true });
        const chosen = renderer();
        unblock();
        try {
            await until('stale recovery discarded after backend switch', () =>
                !owner.recovering && renderer() === chosen && runtime().usingCanvasFallback && chosen.frameCount > 1);
        } finally {
            report.backendSwitch = { sameRenderer: renderer() === chosen, recovering: Boolean(owner.recovering),
                backend: backend(), frames: chosen.frameCount, preference: app.params.backend };
        }
        delete owner._createRendererForParams;
        await restart('image', 'media/demo.svg');
        failed = renderer();
        failed.rebuiltAfterFailure = true;
        const getContext = HTMLCanvasElement.prototype.getContext;
        try {
            HTMLCanvasElement.prototype.getContext = function(kind, ...args) {
                return kind === 'webgl2' ? null : getContext.call(this, kind, ...args);
            };
            failed._renderSourceFrame = () => { throw observed; };
            await until('Canvas paints when both GPU paths fail', () =>
                runtime().usingCanvasFallback && renderer().frameCount > 1);
        } finally { HTMLCanvasElement.prototype.getContext = getContext; }
        report.ok = true;
    } catch (error) {
        report.error = String(error);
    }
    await window.__TAURI_INTERNALS__.invoke('plugin:event|emit_to', {
        target: {kind:'App'}, event:'asciline-preview-recovery-result', payload:report
    });
})()
