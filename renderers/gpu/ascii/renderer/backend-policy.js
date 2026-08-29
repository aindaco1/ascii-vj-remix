/**
 * Keep renderer backend selection deterministic and outside the frame loop.
 *
 * Apple WebKit and Windows WebView2 can expose browser GPU APIs while still
 * producing an empty primary glyph-atlas surface. The primary runtime uses the
 * policy below to choose its bounded Canvas2D glyph path.
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

function isWindowsWebViewUserAgent(userAgent = '') {
    return /Windows NT/.test(userAgent) &&
        /AppleWebKit\//.test(userAgent) &&
        /(?:Chrome|Chromium|Edg)\//.test(userAgent);
}

function glyphPreviewCompatibilityReason(options = {}, userAgent = '', tauriRuntime = false) {
    const usesGlyphAtlas = options.glyphMode !== false && options.solidMode !== true;
    if (!usesGlyphAtlas) return '';
    if (isAppleWebKitUserAgent(userAgent)) return 'apple-webkit-glyph';
    if (tauriRuntime && isWindowsWebViewUserAgent(userAgent)) return 'windows-webview2-glyph';
    return '';
}

function needsCompatibilityCanvasGlyphPreview(options = {}, userAgent = '', tauriRuntime = false) {
    return Boolean(glyphPreviewCompatibilityReason(options, userAgent, tauriRuntime));
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
    glyphPreviewCompatibilityReason,
    isAppleWebKitUserAgent,
    isWindowsWebViewUserAgent,
    needsCompatibilityCanvasGlyphPreview,
    needsWebKitCanvasGlyphPreview,
    selectRendererBackend
};
