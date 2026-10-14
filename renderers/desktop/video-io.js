import { invoke } from '@tauri-apps/api/core';
import { isTauriRuntime } from './tauri-adapter.js';

export const isTransportSource = params => ['ndi', 'syphon'].includes(params?.mediaType);
const SETTINGS_KEY = 'ascii-vj-video-io-v1';

export function decodeVideoPacket(packet) {
    const bytes = packet instanceof ArrayBuffer ? new Uint8Array(packet) : new Uint8Array(packet || []);
    if (!bytes.length) return null;
    if (bytes.length < 32 || String.fromCharCode(...bytes.subarray(0, 4)) !== 'AVIO') throw new Error('Invalid live frame');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const width = view.getUint32(8, true), height = view.getUint32(12, true);
    if (view.getUint32(4, true) !== 1 || !width || !height || width > 4096 || height > 4096 || bytes.length !== 32 + width * height * 4) throw new Error('Invalid live frame size');
    return { width, height, sequence: Number(view.getBigUint64(24, true)), pixels: new Uint8ClampedArray(bytes.buffer, bytes.byteOffset + 32, width * height * 4) };
}

export class LiveVideoSource {
    constructor(controller) {
        this.controller = controller;
        this.type = controller.config.input?.protocol || 'ndi';
        this.canvas = document.createElement('canvas'); this.canvas.width = 1; this.canvas.height = 1;
        this.context = this.canvas.getContext('2d', { alpha: true });
        this.element = this.canvas; this.width = 1; this.height = 1;
        this.ready = true; this.isVideo = true; this.isImage = false; this.isLive = true; this.isDynamicDimensions = true;
        this.sequence = 0; this.generation = controller.generation; this.destroyed = false; this.busy = false;
        this.timer = setInterval(() => this.read(), 1000 / 60); void this.read();
    }
    async read() {
        if (this.destroyed || this.busy) return;
        this.busy = true;
        try {
            if (this.generation !== this.controller.generation) { this.sequence = 0; this.generation = this.controller.generation; }
            const generation = this.generation;
            const packet = await invoke('read_video_io_frame', { generation, after: this.sequence });
            if (this.destroyed || generation !== this.controller.generation) return;
            const frame = decodeVideoPacket(packet); if (!frame) return;
            this.sequence = frame.sequence;
            if (this.width !== frame.width || this.height !== frame.height) { this.width = this.canvas.width = frame.width; this.height = this.canvas.height = frame.height; }
            this.context.putImageData(new ImageData(frame.pixels, frame.width, frame.height), 0, 0);
        } catch { this.controller.setStatus('Live input unavailable'); }
        finally { this.busy = false; }
    }
    async play() {} pause() {} // Live source ownership belongs to source selection.
    destroy() { this.destroyed = true; clearInterval(this.timer); }
}

export class VideoIoController {
    constructor(app) {
        this.app = app; this.available = false; this.generation = 1; this.busy = false; this.popout = false;
        let saved = {}; try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch {}
        this.config = { input: null, ndi: false, syphon: false, name: String(saved.name || 'ASCII VJ Remix'), width: saved.width === 1280 ? 1280 : 1920, height: saved.width === 1280 ? 720 : 1080, fps: saved.fps === 30 ? 30 : 60, mirror: false, sourceRevision: 0 };
        this.sources = []; this.protocol = 'ndi'; this.lastSource = ''; this.configQueue = Promise.resolve();
    }
    get active() { return this.config.ndi || this.config.syphon || this.config.input || this.popout; }
    async init() {
        if (!isTauriRuntime()) return;
        this.capabilities = await invoke('get_video_io_status'); this.available = true;
        this.panel = document.getElementById('video-io'); this.panel.hidden = false;
        this.status = document.getElementById('video-io-status');
        this.input = document.getElementById('video-io-source');
        this.input.addEventListener('change', () => void this.select(this.input.value));
        document.getElementById('video-io-refresh').addEventListener('click', () => void this.discover(this.protocol));
        const bind = (id, key) => { const el = document.getElementById(id); el.checked = this.config[key]; el.addEventListener('change', async () => {
            this.config[key] = el.checked;
            try { await this.configure(); if (this.app.nativeOutputActive) await this.openPopout(); }
            catch (error) { this.config[key] = el.checked = false; this.setStatus(error.message || String(error)); }
        }); return el; };
        bind('video-io-ndi', 'ndi').disabled = !this.capabilities.ndiAvailable;
        document.getElementById('video-io-syphon-label').hidden = !this.capabilities.syphonAvailable;
        bind('video-io-syphon', 'syphon');
        const name = document.getElementById('video-io-name'); name.value = this.config.name;
        name.addEventListener('change', () => { this.config.name = name.value; void this.configure().catch(e => this.setStatus(String(e))); });
        const format = document.getElementById('video-io-format'); format.value = `${this.config.width}:${this.config.fps}`;
        format.addEventListener('change', () => { const [width, fps] = format.value.split(':').map(Number); Object.assign(this.config, { width, height: width === 1280 ? 720 : 1080, fps }); void this.configure(); });
        this.timer = setInterval(() => void this.tick(), 1000 / 60);
        this.statusTimer = setInterval(() => void this.refreshStatus(), 1000);
        this.app._renderSourceList();
    }
    entries() {
        if (!this.available) return [];
        return ['ndi', ...(this.capabilities.syphonAvailable ? ['syphon'] : [])].map(protocol => ({ id: `video-io:${protocol}`, name: protocol === 'ndi' ? 'NDI Input' : 'Syphon Input', detail: protocol === 'ndi' ? 'Live network video' : 'Live local video', status: this.config.input?.protocol === protocol ? 'Selected' : 'Select', statusType: 'ready' }));
    }
    setStatus(text) { if (this.status) this.status.textContent = text; }
    async discover(protocol) {
        this.protocol = protocol; this.panel.open = true; this.setStatus('Finding sources…');
        try {
            this.sources = await invoke('discover_video_sources', { protocol });
            this.input.replaceChildren(new Option(`Select ${protocol === 'ndi' ? 'NDI' : 'Syphon'} input…`, ''));
            for (const [index, source] of this.sources.entries()) this.input.add(new Option(source.name, String(index)));
            let selected = this.sources.findIndex(s => s.id === this.config.input?.id);
            if (selected < 0 && this.config.input?.protocol === protocol) {
                const matches = this.sources.map((s, i) => s.name === this.app.params.sourceName ? i : -1).filter(i => i >= 0);
                if (matches.length === 1) selected = matches[0];
            } this.input.value = selected < 0 ? '' : String(selected);
            this.setStatus(this.sources.length ? `${this.sources.length} sources` : 'No sources found · Refresh to retry');
        } catch { this.setStatus('Discovery unavailable · Check runtime and network access'); }
    }
    async select(index) {
        const source = this.sources[Number(index)]; if (index === '' || !source) return;
        this.input.value = String(index);
        this.config.input = { protocol: source.protocol, id: source.id };
        try {
            await this.configure();
            await this.app._switchStaticSource({ sourceMode: 'static', mediaType: source.protocol, mediaUrl: `video-io://${source.protocol}`, sourceName: source.name });
            this.app._renderSourceList();
        } catch { this.setStatus('Input could not start · Refresh to retry'); }
    }
    async releaseInput() { if (this.config.input) { this.config.input = null; await this.configure(); } }
    configure() {
        this.configQueue = this.configQueue.catch(() => {}).then(async () => {
            const config = { ...this.config };
            this.generation = await invoke('configure_video_io', { config });
            for (const key of ['ndi', 'syphon']) document.getElementById(`video-io-${key}`).checked = this.config[key];
            localStorage.setItem(SETTINGS_KEY, JSON.stringify({ name: config.name, width: config.width, fps: config.fps }));
            if (!this.active) { this.lastImage = null; this.setStatus('Sharing off'); }
        });
        return this.configQueue;
    }
    async refreshStatus() {
        if (!this.active) return;
        try {
            const state = await invoke('get_video_io_status'); this.popout = Boolean(state.popout);
            const labels = [this.config.input ? `Input ${state.input}` : '', this.config.ndi ? `NDI ${state.ndi}` : '', this.config.syphon ? `Syphon ${state.syphon}` : ''].filter(Boolean);
            this.setStatus(state.error || labels.join(' · ') || 'Sharing off');
        } catch { this.setStatus('Video I/O unavailable'); }
    }
    async openPopout() {
        await this.configure(); await this.syncParams();
        await invoke('open_video_io_popout', { request: { payload: this.app._nativeOutputPayload(), displayPreference: this.app.outputDisplay, visible: true } });
        const restoreCamera = this.app.nativeOutputActive && this.app.nativeOutputExclusiveCameraActive;
        this.app.nativeOutputActive = false; this.app._stopNativeOutputMirror(); this.popout = true;
        if (restoreCamera) await this.app._restoreCameraPreviewAfterNativeOutput();
    }
    async syncParams() {
        const payload = this.app._nativeOutputPayload(this.app.renderParams());
        if (this.transition && Date.now() < this.transition.startAtUnixMs + this.transition.durationMs) payload.transition = this.transition;
        await invoke('update_video_io_params', { payload });
    }
    async tick() {
        if (!this.active || this.busy) return;
        this.busy = true;
        try {
            const sourceKey = `${this.app.params.mediaType}:${this.app.params.mediaUrl}`;
            if (sourceKey !== this.lastSource) { this.lastSource = sourceKey; this.config.sourceRevision++; await this.configure(); this.lastImage = null; }
            const mirror = !['webgpu', 'webgl2'].includes(this.app.staticRuntime.getStats()?.backend);
            if (mirror !== this.config.mirror) { this.config.mirror = mirror; this.lastImage = null; await this.configure(); }
            await this.syncParams();
            if (!this.config.ndi && !this.config.syphon && !this.popout) return;
            if (this.config.input && !mirror) return;
            const source = mirror ? this.app._activeRenderSurface() : this.app.staticRuntime.source?.canvas || this.app.staticRuntime.source?.element;
            if (!mirror && this.app.staticRuntime.source?.isImage && this.lastImage === source) return;
            const sw = source?.videoWidth || source?.naturalWidth || source?.width || 0;
            const sh = source?.videoHeight || source?.naturalHeight || source?.height || 0;
            const scale = Math.min(1, 4096 / Math.max(sw, sh));
            const width = mirror ? this.config.width : Math.round(sw * scale);
            const height = mirror ? this.config.height : Math.round(sh * scale);
            if (!source || !width || !height) return;
            if (!this.canvas) { this.canvas = document.createElement('canvas'); this.context = this.canvas.getContext('2d', { alpha: true, willReadFrequently: true }); }
            if (this.canvas.width !== width || this.canvas.height !== height) { this.canvas.width = width; this.canvas.height = height; }
            const ctx = this.context; ctx.clearRect(0, 0, width, height); ctx.drawImage(source, 0, 0, width, height);
            if (mirror) {
                // Include the outgoing visual already owned by the transition.
                // Linear premultiplied composition preserves partial coverage.
                const layer = document.querySelector('.renderer-buffer-outgoing') || document.getElementById('transition-layer');
                const outgoing = layer?.querySelector('canvas');
                const opacity = layer && getComputedStyle(layer).display !== 'none' ? Number(getComputedStyle(layer).opacity) : 0;
                if (outgoing && outgoing !== source && opacity > 0) {
                    ctx.clearRect(0, 0, width, height); ctx.globalAlpha = 1 - opacity;
                    ctx.drawImage(source, 0, 0, width, height);
                    ctx.globalAlpha = opacity; ctx.globalCompositeOperation = 'lighter';
                    ctx.drawImage(outgoing, 0, 0, width, height);
                    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
                }
            }
            const data = ctx.getImageData(0, 0, width, height).data;
            const bytes = new Uint8Array(40 + data.length), view = new DataView(bytes.buffer);
            bytes.set([65,86,73,79]); view.setUint32(4,1,true); view.setUint32(8,width,true); view.setUint32(12,height,true);
            view.setUint32(24,mirror ? 1 : 0,true); view.setBigUint64(32,BigInt(this.generation),true); bytes.set(data,40);
            await invoke('write_video_io_frame', bytes);
            if (!mirror && this.app.staticRuntime.source?.isImage) this.lastImage = source;
        } catch { this.setStatus('Video frame unavailable'); }
        finally { this.busy = false; }
    }
}
