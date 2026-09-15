function safeCanvasImageData(context, x, y, width, height, onError = null) {
    try {
        return context?.getImageData?.(x, y, width, height) || null;
    } catch (error) {
        if (typeof onError === 'function') onError(error);
        return null;
    }
}

export { safeCanvasImageData };

// WebKit can reject the external-image texture path for a readable local
// canvas. Retry only after the browser itself authorizes pixel readback.
// A genuinely tainted image still throws; camera/video never take this path.
const imagePixels = new WeakMap();
export function uploadStaticImage(source, uploadElement, uploadPixels, flipY = false) {
    try { return uploadElement(source.canvas || source.element); }
    catch (error) {
        if (error?.name !== 'SecurityError' || !source.isImage) throw error;
        let cached = imagePixels.get(source);
        if (!cached) {
            const canvas = source.canvas;
            const context = canvas?.getContext?.('2d');
            if (!context) throw error;
            const image = context.getImageData(0, 0, source.width, source.height);
            cached = {data: image.data, width: image.width, height: image.height};
            imagePixels.set(source, cached);
        }
        if (flipY && !cached.flipped) {
            const stride = cached.width * 4;
            cached.flipped = new Uint8Array(cached.data.length);
            for (let row = 0; row < cached.height; row++) {
                cached.flipped.set(cached.data.subarray(row * stride, (row + 1) * stride),
                    (cached.height - row - 1) * stride);
            }
        }
        return uploadPixels(flipY ? cached.flipped : cached.data, cached.width, cached.height);
    }
}
