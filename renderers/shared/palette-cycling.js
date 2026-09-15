import contract from './palette-contract.json' with { type: 'json' };

export const PALETTE_CONTRACT = Object.freeze(contract);
export const PALETTE_CYCLE_DEFAULTS = Object.freeze({
    paletteCycleMode: 'off', paletteCycleSpeed: 1, paletteCycleAmount: 1
});
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const modulo = (value, length) => ((value % length) + length) % length;
const clockOrigin = Date.now() - (globalThis.performance?.now?.() || 0);
export const cycleNowMs = () => clockOrigin + (globalThis.performance?.now?.() || 0);

export function paletteCycleParams(params = {}, transport = params.paletteCycleTransport) {
    return {
        paletteCycleMode: ['classic', 'blend'].includes(params.paletteCycleMode) ? params.paletteCycleMode : 'off',
        paletteCycleSpeed: clamp(finite(params.paletteCycleSpeed, 1), -contract.maxSpeed, contract.maxSpeed),
        paletteCycleAmount: clamp(finite(params.paletteCycleAmount, 1), 0, 1),
        ...(transport ? { paletteCycleTransport: transport } : {})
    };
}

export function validateCycleRanges(ranges = [], colorCount) {
    if (!Array.isArray(ranges) || ranges.length > contract.maxCycleRanges) throw new Error('Too many palette cycle ranges');
    const occupied = new Set();
    return Object.freeze(ranges.map((range) => {
        const { start, end, rate, direction = 1, offset = 0 } = range;
        if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end >= colorCount ||
            !Number.isFinite(rate) || rate <= 0 || rate > 60 || ![1, -1].includes(direction) ||
            !Number.isFinite(offset) || Math.abs(offset) > 256) throw new Error('Invalid palette cycle range');
        for (let i = start; i <= end; i++) {
            if (occupied.has(i)) throw new Error('Overlapping palette cycle ranges');
            occupied.add(i);
        }
        return Object.freeze({ start, end, rate, direction, offset });
    }));
}

// Integral of the existing quadratic easeInOut curve over [0, t].
export function cycleEaseIntegral(t) {
    const x = clamp(t, 0, 1);
    return x <= 0.5 ? 2 * x ** 3 / 3 : -x + 2 * x * x - 2 * x ** 3 / 3 + 1 / 6;
}

export function cycleTimeAt(transport, now = cycleNowMs()) {
    if (!transport) return 0;
    const elapsed = (now - transport.anchorMs) / 1000;
    const duration = transport.durationMs / 1000;
    if (elapsed <= 0) return transport.position + elapsed * transport.fromRate;
    if (duration > 0 && elapsed < duration) {
        return transport.position + transport.fromRate * elapsed +
            (transport.toRate - transport.fromRate) * duration * cycleEaseIntegral(elapsed / duration);
    }
    return transport.position + (duration > 0 ? duration * (transport.fromRate + transport.toRate) / 2 : 0) +
        Math.max(0, elapsed - Math.max(0, duration)) * transport.toRate;
}

function rateAt(transport, now) {
    if (!transport.durationMs) return transport.toRate;
    const t = clamp((now - transport.anchorMs) / transport.durationMs, 0, 1);
    const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    return transport.fromRate + (transport.toRate - transport.fromRate) * eased;
}

export function createCycleTransport(rate = 0, now = cycleNowMs()) {
    return { anchorMs: now, position: 0, fromRate: rate, toRate: rate, durationMs: 0 };
}

export function setCycleTransportRate(transport, rate, now = cycleNowMs(), durationMs = 0) {
    const position = cycleTimeAt(transport, now);
    const fromRate = rateAt(transport, now);
    Object.assign(transport, { anchorMs: now, position, fromRate: durationMs > 0 ? fromRate : rate,
        toRate: rate, durationMs: Math.max(0, durationMs) });
    return transport;
}

export function cycleEnabled(palette, params) {
    return params.paletteCycleMode !== 'off' && ['classic', 'blend'].includes(params.paletteCycleMode) &&
        Boolean(palette?.cycleRanges?.length);
}

// Caller owns this reusable buffer. Alpha carries stable base-palette luminance.
export function fillPaletteDisplay(target, palette, params = {}, time = cycleTimeAt(params.paletteCycleTransport)) {
    const colors = palette?.colors || [];
    const enabled = cycleEnabled(palette, params);
    const amount = clamp(finite(params.paletteCycleAmount, 1), 0, 1);
    for (let i = 0; i < colors.length; i++) {
        const color = colors[i];
        target[i * 4] = color[0] / 255;
        target[i * 4 + 1] = color[1] / 255;
        target[i * 4 + 2] = color[2] / 255;
        target[i * 4 + 3] = (color[0] * 0.2126 + color[1] * 0.7152 + color[2] * 0.0722) / 255;
    }
    if (!enabled || amount === 0) return target;
    for (const range of palette.cycleRanges) {
        const length = range.end - range.start + 1;
        const phase = time * range.rate * range.direction + range.offset;
        const step = Math.floor(phase);
        const blend = params.paletteCycleMode === 'blend' ? phase - step : 0;
        for (let i = range.start; i <= range.end; i++) {
            const a = colors[range.start + modulo(i - range.start + step, length)];
            const b = colors[range.start + modulo(i - range.start + step + 1, length)];
            for (let c = 0; c < 3; c++) {
                target[i * 4 + c] = (colors[i][c] + ((a[c] + (b[c] - a[c]) * blend) - colors[i][c]) * amount) / 255;
            }
        }
    }
    return target;
}
