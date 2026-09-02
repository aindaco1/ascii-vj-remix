function logicalRectFromArea(area, scaleFactor = 1) {
    return {
        position: area?.position?.toLogical
            ? area.position.toLogical(scaleFactor)
            : area?.position || null,
        size: area?.size?.toLogical
            ? area.size.toLogical(scaleFactor)
            : area?.size || null
    };
}

function displayPreferenceIndex(preference = 'auto') {
    const match = String(preference || '').match(/^display:(\d+):/);
    if (!match) return null;
    const index = Number(match[1]);
    return Number.isInteger(index) && index >= 0 ? index : null;
}

function monitorLogicalRect(monitor) {
    if (!monitor) return { position: null, size: null };
    const scaleFactor = monitor.scaleFactor || 1;
    const area = monitor.workArea || monitor;
    const rect = logicalRectFromArea(area, scaleFactor);
    return {
        position: rect.position || monitor.position || null,
        size: rect.size || monitor.size || null
    };
}

function monitorId(monitor, index) {
    const { position, size } = monitorLogicalRect(monitor);
    const name = monitor?.name || `display-${index + 1}`;
    const x = Math.round(Number(position?.x ?? 0));
    const y = Math.round(Number(position?.y ?? 0));
    const width = Math.round(Number(size?.width ?? 0));
    const height = Math.round(Number(size?.height ?? 0));
    return `display:${index}:${name}:${x},${y},${width}x${height}`;
}

function monitorLabel(monitor, index) {
    const { size } = monitorLogicalRect(monitor);
    const name = monitor?.name || `Display ${index + 1}`;
    const width = Math.round(Number(size?.width ?? 0));
    const height = Math.round(Number(size?.height ?? 0));
    const suffix = width > 0 && height > 0 ? ` ${width}x${height}` : '';
    return `${name}${suffix}`;
}

function outputDisplaysFromMonitors(monitors) {
    if (!Array.isArray(monitors)) return [];
    return monitors.map((monitor, index) => ({
        id: monitorId(monitor, index),
        label: monitorLabel(monitor, index),
        index
    }));
}

function selectMonitor(monitors, preference = 'auto') {
    if (!Array.isArray(monitors) || monitors.length === 0) return null;
    const preferredIndex = displayPreferenceIndex(preference);
    if (preferredIndex !== null && monitors[preferredIndex]) return monitors[preferredIndex];
    return monitors[1] || monitors[0];
}

function selectBrowserScreen(screens, currentScreen = null, preference = 'auto') {
    if (!Array.isArray(screens) || screens.length === 0) return currentScreen || null;
    const preferredIndex = displayPreferenceIndex(preference);
    if (preferredIndex !== null && screens[preferredIndex]) return screens[preferredIndex];
    return screens.find((screen) => !screen.isPrimary) || currentScreen || screens[0];
}

function browserScreenPlacement(screen) {
    if (!screen) return null;
    return {
        x: Number(screen.availLeft ?? screen.left ?? 0),
        y: Number(screen.availTop ?? screen.top ?? 0),
        width: Number(screen.availWidth ?? screen.width ?? 0),
        height: Number(screen.availHeight ?? screen.height ?? 0)
    };
}

function nativeCameraOutputMode(params, capabilities = {}, tauri = false) {
    if (!tauri || params?.sourceMode !== 'static' || params?.mediaType !== 'camera') return null;
    return capabilities?.nativeCamera === true ? 'native-camera' : 'mirror';
}

const NATIVE_MIRROR_MAX_WIDTH = 640;
const NATIVE_MIRROR_MAX_HEIGHT = 360;
const NATIVE_MIRROR_MAX_FPS = 30;

function nativeMirrorTargetFps(value, highCadence = false) {
    return Math.min(highCadence ? NATIVE_MIRROR_MAX_FPS : 15, Math.max(6, Number(value) || 12));
}

function nativeMirrorFrameSize(sourceWidth, sourceHeight, highCadence = false, force = false) {
    const width = Math.max(0, Number(sourceWidth) || 0);
    const height = Math.max(0, Number(sourceHeight) || 0);
    if (width <= 0 || height <= 0) return { width: 0, height: 0 };
    const maxWidth = highCadence ? NATIVE_MIRROR_MAX_WIDTH : force ? 960 : 800;
    const maxHeight = highCadence ? NATIVE_MIRROR_MAX_HEIGHT : force ? 540 : 480;
    const scale = Math.min(1, maxWidth / width, maxHeight / height);
    return {
        width: Math.max(1, Math.floor(width * scale)),
        height: Math.max(1, Math.floor(height * scale))
    };
}

export {
    browserScreenPlacement,
    displayPreferenceIndex,
    monitorId,
    monitorLabel,
    monitorLogicalRect,
    nativeCameraOutputMode,
    nativeMirrorFrameSize,
    nativeMirrorTargetFps,
    outputDisplaysFromMonitors,
    selectBrowserScreen,
    selectMonitor
};
