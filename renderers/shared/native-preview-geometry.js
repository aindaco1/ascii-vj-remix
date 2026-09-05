import { resolveGridDimensions } from './density-policy.js';

// Only the Windows native preview bridge can change its canvas dimensions
// independently of the source object. Ordinary media paths are unchanged.
export function syncNativePreviewGeometry(renderer, params = renderer.nativePreviewParams) {
    if (!renderer.source?.isNativeOutputPreview || !params) return;
    renderer.nativePreviewParams = params;
    const { source } = renderer;
    const grid = resolveGridDimensions(params, source.width, source.height, {
        actualBackend: 'webgpu', pixelMode: false
    });
    const width = Math.max(1, Math.round(params.cellWidth));
    const height = Math.max(1, Math.round(params.cellHeight));
    const gridChanged = renderer.cols !== grid.columns || renderer.rows !== grid.rows;
    const aspect = `${source.width} / ${source.height}`;
    if (!gridChanged && renderer.canvasWidth === grid.columns * width
        && renderer.canvasHeight === grid.rows * height && renderer.canvas.style.aspectRatio === aspect) return;
    renderer.cols = grid.columns;
    renderer.rowsOverride = grid.rows;
    renderer.autoRows = false;
    renderer.cellWidth = width;
    renderer.cellHeight = height;
    renderer._updateDimensions();
    if (gridChanged) renderer._createCellTexture();
    renderer._createStableBindGroups?.();
}
