const BUILTIN_PRESET_BACKEND_BASELINE = Object.freeze({
    presetCount: 69,
    acceleratedEligible: 41,
    canvasEligible: 28
});

function validateBuiltInPresetBackendContract(actual = {}) {
    const normalized = {
        presetCount: Number(actual.presetCount || 0),
        acceleratedEligible: Number(actual.acceleratedEligible || 0),
        canvasEligible: Number(actual.canvasEligible || 0)
    };
    const mismatches = Object.entries(BUILTIN_PRESET_BACKEND_BASELINE)
        .filter(([key, expected]) => normalized[key] !== expected)
        .map(([key, expected]) => `${key}:${normalized[key]}!=${expected}`);
    return {
        ok: mismatches.length === 0,
        expected: BUILTIN_PRESET_BACKEND_BASELINE,
        actual: normalized,
        mismatches
    };
}

export {
    BUILTIN_PRESET_BACKEND_BASELINE,
    validateBuiltInPresetBackendContract
};
