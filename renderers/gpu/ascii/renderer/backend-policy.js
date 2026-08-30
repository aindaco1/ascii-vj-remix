/**
 * Keep renderer backend selection deterministic and outside the frame loop.
 *
 * Windows WebView2 can expose browser GPU APIs while still producing an empty
 * primary glyph surface. The primary runtime uses the policy below to choose
 * its bounded Canvas2D glyph path until that host is physically revalidated.
 */

function isWindowsWebViewUserAgent(userAgent = '') {
    return /Windows NT/.test(userAgent) &&
        /AppleWebKit\//.test(userAgent) &&
        /(?:Chrome|Chromium|Edg)\//.test(userAgent);
}

function glyphPreviewCompatibilityReason(options = {}, userAgent = '', tauriRuntime = false) {
    const usesGlyphAtlas = options.glyphMode !== false && options.solidMode !== true;
    if (!usesGlyphAtlas) return '';
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
    isWindowsWebViewUserAgent,
    needsCompatibilityCanvasGlyphPreview,
    selectRendererBackend
};
