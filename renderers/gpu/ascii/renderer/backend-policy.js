/**
 * Keep renderer backend selection deterministic and outside the frame loop.
 * Platform identity is deliberately not an ownership signal: only an explicit
 * Canvas backend may bypass GPU construction. Auto/GPU requests still retain
 * the normal bounded Canvas fallback when renderer construction fails.
 */

function explicitCanvasRendererDecision(options = {}) {
    if (options.backend === 'pixel-canvas') {
        return { params: options, compatibilityReason: '' };
    }
    if (options.backend === 'canvas2d') {
        return {
            params: { ...options, backend: 'canvas2d' },
            compatibilityReason: ''
        };
    }
    return null;
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
    explicitCanvasRendererDecision,
    selectRendererBackend
};
