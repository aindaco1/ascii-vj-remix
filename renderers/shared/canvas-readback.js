function safeCanvasImageData(context, x, y, width, height, onError = null) {
    try {
        return context?.getImageData?.(x, y, width, height) || null;
    } catch (error) {
        if (typeof onError === 'function') onError(error);
        return null;
    }
}

export { safeCanvasImageData };
