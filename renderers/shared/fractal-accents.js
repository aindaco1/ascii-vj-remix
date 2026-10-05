import { FRACTAL_VARIATIONS } from './spatial.js';

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const luma = c => c[0] * .2126 + c[1] * .7152 + c[2] * .0722;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };

// Original, bounded Julia orbit measurements. The GPU version lives alongside
// the other shared scene math. No source pixels enter the cached field.
export function accentField(u, v, aspect, p, time) {
    const variation = FRACTAL_VARIATIONS[p.accentVariation];
    const drift = time * p.accentMotion * .04;
    let x = (u * 2 - 1) * variation.scale / p.accentScale + Math.sin(drift) * .06;
    let y = (v * 2 - 1) * variation.scale / (p.accentScale * aspect) + Math.cos(drift * .73) * .06;
    let trap = 1, stripes = 0, etch = 0, count = 0;
    for (let i = 0; i < 24; i++) {
        const nx = x * x - y * y + variation.real;
        y = 2 * x * y + variation.imag; x = nx;
        const r2 = x * x + y * y;
        trap = Math.min(trap, Math.min(Math.abs(x), Math.abs(y)));
        // sin(6 theta), computed without an atan/sin pair per iteration.
        const s2 = 2 * x * y / Math.max(.0001, r2);
        stripes += 3 * s2 - 4 * s2 * s2 * s2;
        etch += Math.abs(r2 - 1) / (r2 + 1);
        count++;
        if (r2 > 16) break;
    }
    return [Math.exp(-trap * 18), stripes / count,
        Math.sin(etch / count * 24 + drift), Math.sin((x - y) / (1 + Math.abs(x) + Math.abs(y)) * 4)];
}

export function createAccentSampler(p, sample, process, cols, rows, aspect, time, state, dt = 1 / 60) {
    const fieldKey = [cols, rows, aspect, p.accentVariation, p.accentScale, p.accentMotion ? time * p.accentMotion : 0].join(':');
    if (state.accentField?.length !== cols * rows * 4) state.accentField = new Float32Array(cols * rows * 4);
    const cached = state.accentFieldKey === fieldKey;
    if (!cached) {
        for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
            state.accentField.set(accentField((x + .5) / cols, (y + .5) / rows, aspect, p, time), (y * cols + x) * 4);
        }
    }
    state.accentFieldKey = fieldKey;
    const processed = (u, v, x, y) => {
        const c = process(sample(u, v).map(n => n * 255), x, y);
        return [c[0] / 255, c[1] / 255, c[2] / 255, (c[3] ?? luma(c)) / 255];
    };
    const maskAt = (u, v, trails = false) => {
        const coverageField = .5 + .5 * Math.sin(u * 11 + p.accentVariation) * Math.cos(v * 9 - p.accentVariation);
        const coverage = p.accentCoverage >= 1 ? 1 : smooth(1 - p.accentCoverage - .08, 1 - p.accentCoverage + .08, coverageField);
        const source = sample(u, v), L = luma(source);
        const gx = luma(sample(u + 1 / cols, v)) - luma(sample(u - 1 / cols, v));
        const gy = luma(sample(u, v + 1 / rows)) - luma(sample(u, v - 1 / rows));
        const edge = smooth(.015, .22, Math.hypot(gx, gy));
        let mask = smooth(.02, .18, L) * (1 - smooth(.8, .98, L));
        if (p.accentPlacement === 'edges') mask = edge;
        if (p.accentPlacement === 'quiet') mask = (1 - edge) * smooth(.015, .12, L);
        if (trails) mask = 1;
        return [coverage * mask, edge];
    };
    const fieldAt = (x, y) => state.accentField.subarray((y * cols + x) * 4, (y * cols + x) * 4 + 4);
    const displacement = (mask, edge) => Math.min(p.accentAmount * 2.5, p.accentSubtleLimit ? .85 : 1) * mask * (1 - edge);
    const apply = (cell, u, v, x, y, trails = false) => {
        // Spatial glass warps the primary ray once, before shading.
        if (!trails && p.accentStyle === 'glass' && p.visualMode !== 'flat') return cell;
        const f = fieldAt(x, y), [mask, edge] = maskAt(u, v, trails);
        const amount = Math.min(p.accentAmount, p.accentSubtleLimit ? .5 : 1) * mask;
        let result = [...cell];
        if (trails) {
            // Only attenuate history: accents cannot feed energy back into a trail.
            result = cell.map(n => n * Math.pow(Math.max(.00001, 1 - amount * (1 - f[0])), dt * 60));
        } else if (p.accentStyle === 'glass') {
            const shift = displacement(mask, edge);
            const dx = f[1] * shift, dy = f[3] * shift;
            const sx = dx < 0 ? -1 : 1, sy = dy < 0 ? -1 : 1;
            const a = processed(u + sx / cols, v, x, y), b = processed(u, v + sy / rows, x, y);
            const c = processed(u + sx / cols, v + sy / rows, x, y);
            result = mix(mix(cell, a, Math.abs(dx)), mix(b, c, Math.abs(dx)), Math.abs(dy));
        } else if (p.accentStyle === 'chroma') {
            const shifted = f[3] >= 0 ? [cell[1], cell[2], cell[0]] : [cell[2], cell[0], cell[1]];
            const delta = shifted.map((n, i) => n - cell[i]), brightness = luma(delta);
            const tone = f[3] * amount * .5;
            result = [...cell.slice(0, 3).map((n, i) => n + (delta[i] - brightness) * Math.abs(f[3]) * amount + n * tone), cell[3] + cell[3] * tone];
        } else {
            const signal = p.accentStyle === 'etch' ? f[2] : p.accentStyle === 'silk' ? f[1] : (f[0] - .55) * 2;
            result = [...cell.slice(0, 3).map(n => n + n * signal * amount), cell[3] + cell[3] * signal * amount * .65];
        }
        if (p.accentSubtleLimit) {
            let delta = result.slice(0, 3).map((n, i) => clamp(n - cell[i], Math.max(-.22, -cell[i]), Math.min(.22, 1 - cell[i])));
            const scale = Math.min(1, .16 / Math.max(.00001, Math.abs(luma(delta))));
            delta = delta.map(n => n * scale);
            result = [...cell.slice(0, 3).map((n, i) => n + delta[i]), clamp(result[3], cell[3] - .1, cell[3] + .1)];
        }
        return result.map(n => clamp(n));
    };
    apply.warp = (u, v, x, y) => {
        if (p.accentStyle !== 'glass' || p.accentPlacement === 'trails') return [u, v];
        const f = fieldAt(x, y), shift = displacement(...maskAt(u, v));
        return [u + f[1] * shift / cols, v + f[3] * shift / rows];
    };
    return apply;
}
