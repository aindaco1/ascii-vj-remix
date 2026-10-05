import limits from './wtf-visual-limits.json' with { type: 'json' };

export const WTF_VISUAL_LIMITS = Object.freeze(limits);

// Applied only to WTF's concrete targets and effective audio/tween parameters.
// Contrast clips before gamma, so raising brightness alone cannot save shadows.
export function protectWtfVisibility(params) {
    const out = { ...params };
    for (const [key, [min, max]] of Object.entries(limits)) {
        if (Number.isFinite(out[key])) out[key] = Math.max(min, Math.min(max, out[key]));
    }
    return out;
}
