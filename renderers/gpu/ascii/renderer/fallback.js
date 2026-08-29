async function createRendererWithFallback(createPreferred, createFallback) {
    try {
        return {
            value: await createPreferred(),
            fallbackError: null
        };
    } catch (error) {
        return {
            value: await createFallback(error),
            fallbackError: error
        };
    }
}

export { createRendererWithFallback };
