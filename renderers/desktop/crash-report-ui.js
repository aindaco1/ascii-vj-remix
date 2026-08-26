function pendingCrashReportCount(state) {
    const count = Number(state?.pendingCount || 0);
    return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
}

function isCrashReportControlLabel(value) {
    return /^Reports(?: [1-9]\d*)?$/.test(String(value || ''));
}

function crashReportUiState({ tauri = false, state = null, busy = false } = {}) {
    const available = Boolean(tauri && state?.available);
    const pendingCount = pendingCrashReportCount(state);
    const pending = pendingCount > 0;

    return {
        hidden: !available,
        pending,
        pendingCount,
        label: pending ? `Reports ${pendingCount}` : 'Reports',
        title: pending
            ? `${pendingCount} pending crash report${pendingCount === 1 ? '' : 's'}`
            : 'Review crash reporting preferences',
        sendDisabled: Boolean(busy || !pending || state?.preference === 'off'),
        discardDisabled: Boolean(busy || !pending)
    };
}

export { crashReportUiState, isCrashReportControlLabel, pendingCrashReportCount };
