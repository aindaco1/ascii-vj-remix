// Apply coverage after the opaque cell/glyph composition so overlapping glyphs
// do not increase a source's alpha. No color is interpreted as transparency.
export function applyCanvasCoverage(ctx, coverage, cols, rows, state) {
    if (!state.canvas) { state.canvas = document.createElement('canvas'); state.ctx = state.canvas.getContext('2d'); }
    if (state.canvas.width !== cols || state.canvas.height !== rows) { state.canvas.width = cols; state.canvas.height = rows; state.pixels = state.ctx.createImageData(cols, rows); }
    const data = state.pixels.data;
    for (let i = 0; i < coverage.length; i++) { data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = 255; data[i * 4 + 3] = Math.round(coverage[i] * 255); }
    state.ctx.putImageData(state.pixels, 0, 0);
    ctx.save(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'destination-in'; ctx.imageSmoothingEnabled = false;
    ctx.drawImage(state.canvas, 0, 0, ctx.canvas.width, ctx.canvas.height); ctx.restore();
}
