/**
 * Keep renderer backend selection deterministic and outside the frame loop.
 *
 * Apple WebKit currently exposes browser GPU APIs in the desktop webview, but
 * its GPU glyph-atlas paths can produce an empty primary surface. The primary
 * runtime uses the policy below to choose its bounded Canvas2D glyph path.
 */

function isAppleWebKitUserAgent(userAgent = '') {
    return /AppleWebKit\//.test(userAgent) &&
        !/(?:Chrome|Chromium|CriOS|Edg|OPR)\//.test(userAgent);
}

function needsWebKitCanvasGlyphPreview(options = {}, userAgent = '') {
    return isAppleWebKitUserAgent(userAgent) &&
        options.glyphMode !== false &&
        options.solidMode !== true;
}

function selectRendererBackend(capabilities, options = {}) {
    const preferred = options.preferredBackend;

    if (preferred === 'webgpu' && capabilities.webgpu) return 'webgpu';
    if (preferred === 'webgl2' && capabilities.webgl2) return 'webgl2';
    if (preferred === 'cpu') return 'cpu';
    if (capabilities.webgpu) return 'webgpu';
    if (capabilities.webgl2) return 'webgl2';
    return 'cpu';
}

export {
    isAppleWebKitUserAgent,
    needsWebKitCanvasGlyphPreview,
    selectRendererBackend
};
