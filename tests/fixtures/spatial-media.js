// Equal brightness/color histograms, different spatial content. A tint-only
// response cannot pass a comparison between these two sources.
export function spatialMediaFixture(width, height, horizontal = false) {
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const light = horizontal ? y >= height / 2 : x >= width / 2;
        pixels.set(light ? [245, 245, 245, 255] : [12, 12, 12, 255], (y * width + x) * 4);
    }
    return pixels;
}

export function spatialMediaDifference(a, b) {
    let rgb = 0, shapeCells = 0, glyphCells = 0;
    const cells = a.length / 4;
    for (let i = 0; i < a.length; i += 4) {
        const delta = [0, 1, 2].map(c => Math.abs(a[i + c] - b[i + c]));
        rgb += delta.reduce((sum, n) => sum + n, 0);
        if (Math.max(...delta) > 24) shapeCells++;
        if (Math.abs(a[i + 3] - b[i + 3]) > 8) glyphCells++;
    }
    return { meanRgbDifference: rgb / (cells * 3), changedShapeFraction: shapeCells / cells, changedGlyphFraction: glyphCells / cells };
}
