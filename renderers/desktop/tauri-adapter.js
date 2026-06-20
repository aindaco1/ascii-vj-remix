import { convertFileSrc, invoke, isTauri as tauriApiIsTauri } from '@tauri-apps/api/core';
import { emitTo } from '@tauri-apps/api/event';
import { availableMonitors } from '@tauri-apps/api/window';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { relaunch } from '@tauri-apps/plugin-process';
import { check as checkForTauriUpdate } from '@tauri-apps/plugin-updater';
import {
    monitorLogicalRect,
    outputDisplaysFromMonitors,
    selectMonitor
} from './output-display.js';

const OUTPUT_WINDOW_LABEL = 'output';

const MEDIA_EXTENSIONS = {
    video: ['mp4', 'webm'],
    image: ['jpg', 'jpeg', 'png', 'gif', 'svg']
};

function isTauriRuntime() {
    try {
        return Boolean(tauriApiIsTauri?.() || globalThis.__TAURI_INTERNALS__ || globalThis.isTauri);
    } catch {
        return false;
    }
}

function baseName(filePath) {
    return String(filePath || '').split(/[\\/]/).filter(Boolean).pop() || 'Custom media';
}

function extensionForName(name) {
    const match = String(name || '').toLowerCase().match(/\.([a-z0-9]+)(?:[?#].*)?$/);
    return match ? match[1] : '';
}

function mediaTypeFromName(name) {
    const ext = extensionForName(name);
    if (MEDIA_EXTENSIONS.video.includes(ext)) return 'video';
    if (MEDIA_EXTENSIONS.image.includes(ext)) return 'image';
    return 'video';
}

async function openTauriMediaFile() {
    if (!isTauriRuntime()) return { available: false, file: null };

    const selected = await invoke('select_media_file');
    if (!selected) return { available: true, file: null };

    const name = selected.name || baseName(selected.path);
    return {
        available: true,
        file: {
            id: selected.id,
            provider: 'tauri',
            path: selected.path,
            url: convertFileSrc(selected.path),
            name,
            size: selected.size ?? null,
            lastModified: selected.lastModified ?? null,
            type: selected.type || '',
            mediaType: selected.mediaType || mediaTypeFromName(name)
        }
    };
}

async function probeTauriMediaFile(file) {
    if (!isTauriRuntime() || !file?.id) return null;
    return invoke('probe_registered_media', { id: file.id });
}

async function startTauriMediaSession(file, request) {
    if (!isTauriRuntime() || !file?.id) return null;
    return invoke('start_registered_media_session', { id: file.id, request });
}

async function readTauriMediaSessionFrame(sessionId) {
    if (!isTauriRuntime() || !sessionId) return null;
    return invoke('read_media_session_frame', { sessionId });
}

async function readTauriMediaSessionFrames(sessionId, maxFrames) {
    if (!isTauriRuntime() || !sessionId) return null;
    return invoke('read_media_session_frames', { sessionId, maxFrames });
}

async function stopTauriMediaSession(sessionId) {
    if (!isTauriRuntime() || !sessionId) return false;
    return invoke('stop_media_session', { sessionId });
}

async function listTauriOutputDisplays() {
    if (!isTauriRuntime()) return [];
    const monitors = await availableMonitors();
    if (!Array.isArray(monitors)) return [];
    return outputDisplaysFromMonitors(monitors);
}

async function checkTauriUpdate(options = {}) {
    if (!isTauriRuntime()) return null;
    return checkForTauriUpdate(options);
}

async function installTauriUpdate(update, onEvent, options = {}) {
    if (!isTauriRuntime() || !update) return false;
    await update.downloadAndInstall(onEvent, options);
    await relaunch();
    return true;
}

async function placeOutputWindow(windowRef, displayPreference = 'auto') {
    try {
        const monitors = await availableMonitors();
        const target = selectMonitor(monitors, displayPreference);
        if (!target) return;

        const { position, size } = monitorLogicalRect(target);

        if (position) await windowRef.setPosition(position);
        if (size) await windowRef.setSize(size);
    } catch (error) {
        console.info('[TauriOutput] External display placement unavailable:', error);
    }
}

async function sendTauriOutputState(payload) {
    if (!isTauriRuntime()) return false;
    try {
        await emitTo(OUTPUT_WINDOW_LABEL, 'asciline-output-state', payload);
        return true;
    } catch (error) {
        console.info('[TauriOutput] State sync failed:', error);
        return false;
    }
}

async function openTauriOutputWindow(payload, options = {}) {
    if (!isTauriRuntime()) return false;

    const existing = await WebviewWindow.getByLabel(OUTPUT_WINDOW_LABEL).catch(() => null);
    if (existing) {
        await existing.show().catch(() => {});
        await placeOutputWindow(existing, options.outputDisplay).catch(() => {});
        await existing.setFocus().catch(() => {});
        await sendTauriOutputState(payload);
        return true;
    }

    const outputWindow = new WebviewWindow(OUTPUT_WINDOW_LABEL, {
        url: 'output.html',
        title: 'ASCILINE Remix Output',
        width: 1280,
        height: 720,
        minWidth: 320,
        minHeight: 240,
        resizable: true,
        decorations: false,
        visible: true,
        backgroundColor: '#030405'
    });

    await new Promise((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error('Output window creation timed out')), 5000);
        outputWindow.once('tauri://created', () => {
            window.clearTimeout(timeout);
            resolve();
        });
        outputWindow.once('tauri://error', (event) => {
            window.clearTimeout(timeout);
            reject(new Error(String(event?.payload || 'Output window creation failed')));
        });
    });

    await placeOutputWindow(outputWindow, options.outputDisplay);
    await sendTauriOutputState(payload);
    return true;
}

export {
    checkTauriUpdate,
    installTauriUpdate,
    isTauriRuntime,
    listTauriOutputDisplays,
    openTauriMediaFile,
    openTauriOutputWindow,
    probeTauriMediaFile,
    readTauriMediaSessionFrame,
    readTauriMediaSessionFrames,
    sendTauriOutputState,
    startTauriMediaSession,
    stopTauriMediaSession
};
