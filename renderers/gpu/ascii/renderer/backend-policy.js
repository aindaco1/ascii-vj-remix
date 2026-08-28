/**
 * Keep renderer backend selection deterministic and outside the frame loop.
 *
 * Apple WebKit currently exposes WebGPU in the desktop webview, but its glyph
 * atlas path can produce an empty surface. WebGL2 uses the same canonical
 * palette/glyph inputs and is the reliable accelerated path for that mode.
 */

function isAppleWebKitUserAgent(userAgent = '') {
    return /AppleWebKit\//.test(userAgent) &&
        !/(?:Chrome|Chromium|CriOS|Edg|OPR)\//.test(userAgent);
}

function needsWebKitGlyphFallback(options = {}, userAgent = '') {
    return isAppleWebKitUserAgent(userAgent) &&
        options.glyphMode !== false &&
        options.solidMode !== true;
}

function selectRendererBackend(capabilities, options = {}, userAgent = '') {
    const preferred = options.preferredBackend;
    const avoidWebGpu = capabilities.webgl2 && needsWebKitGlyphFallback(options, userAgent);

    if (preferred === 'webgpu' && capabilities.webgpu && !avoidWebGpu) return 'webgpu';
    if (preferred === 'webgl2' && capabilities.webgl2) return 'webgl2';
    if (preferred === 'cpu') return 'cpu';
    if (capabilities.webgpu && !avoidWebGpu) return 'webgpu';
    if (capabilities.webgl2) return 'webgl2';
    if (capabilities.webgpu) return 'webgpu';
    return 'cpu';
}

export {
    isAppleWebKitUserAgent,
    needsWebKitGlyphFallback,
    selectRendererBackend
};
