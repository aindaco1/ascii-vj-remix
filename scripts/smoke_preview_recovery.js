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
            app.params = { ...app.params, sourceMode: 'static', backend: 'webgpu', mediaType, mediaUrl };
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
        await until('native window restored and video paints', () => window.previewWindowRestored && renderer().frameCount > presented);
        if (CHECK_SUSPEND) {
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
            const first = renderer().frameCount;
            await until('post-wake video advances', () => runtime().source === video && !video.element.paused
                && renderer().frameCount > first + 2 && app.params.backend === 'webgpu');
        }
        report.ok = true;
    } catch (error) {
        report.error = String(error);
    }
    await window.__TAURI_INTERNALS__.invoke('plugin:event|emit_to', {
        target: {kind:'App'}, event:'asciline-preview-recovery-result', payload:report
    });
})()
