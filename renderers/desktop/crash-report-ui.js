function pendingCrashReportCount(state) {
    const count = Number(state?.pendingCount || 0);
    return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
}

function isCrashReportControlLabel(value) {
    return /^Reports(?: [1-9]\d*)?$/.test(String(value || ''));
}

function crashReportSourceLabel(value) {
    const normalized = String(value || '').trim().replace(/\\/g, '/');
    if (!normalized) return '';
    const path = normalized.split(/[?#]/, 1)[0];
    const label = path.split('/').filter(Boolean).at(-1) || '';
    return label.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120);
}

function crashReportUiState({ tauri = false, state = null, busy = false } = {}) {
    const available = Boolean(tauri && state?.available);
    const pendingCount = pendingCrashReportCount(state);
    const pending = pendingCount > 0;
    const production = state?.production === true;
    const localOnly = available && !production;

    return {
        hidden: !available,
        pending,
        pendingCount,
        label: pending ? `Reports ${pendingCount}` : 'Reports',
        title: pending
            ? `${pendingCount} pending ${localOnly ? 'local-only ' : ''}diagnostic report${pendingCount === 1 ? '' : 's'}`
            : localOnly
                ? 'Development build: diagnostic reports stay on this device'
                : 'Review diagnostic reporting preferences',
        sendDisabled: Boolean(busy || !pending || !production || state?.preference === 'off'),
        discardDisabled: Boolean(busy || !pending)
    };
}

export {
    crashReportSourceLabel,
    crashReportUiState,
    isCrashReportControlLabel,
    pendingCrashReportCount
};
