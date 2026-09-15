// Pipelines contain no window, source texture or frame state. Concurrent
// renderers share compilation, while device loss discards all cached work.
const devices = new WeakMap();
export function cachedGpuPipeline(device, key, compile) {
    let entries = devices.get(device);
    if (!entries) {
        entries = new Map();
        devices.set(device, entries);
        device.lost?.then(() => devices.delete(device));
    }
    if (!entries.has(key)) {
        const pending = Promise.resolve().then(compile).catch(error => {
            entries.delete(key);
            throw error;
        });
        entries.set(key, pending);
    }
    return entries.get(key);
}
