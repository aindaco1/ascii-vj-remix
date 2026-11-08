import { invoke, isTauri } from '@tauri-apps/api/core';

const panel = document.querySelector('.software-license-activation');
if (panel && isTauri()) {
    const status = panel.querySelector('[role="status"]');
    const form = panel.querySelector('form');
    const input = form.querySelector('input');
    const button = form.querySelector('button');
    try {
        const license = await invoke('software_license_status');
        panel.hidden = !license.enabled;
        status.textContent = license.activated ? 'Activated for covered updates.' : 'Enter your license key to access covered updates.';
    } catch {
        // A locked Keychain must never block app startup or renderer controls.
        panel.hidden = false;
        status.textContent = 'Keychain is unavailable. Your installed app still works.';
    }
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        button.disabled = true;
        const key = input.value;
        input.value = '';
        status.textContent = 'Activating…';
        try {
            await invoke('activate_software_license', { key });
            status.textContent = 'Activated. Use Check for Updates to find covered builds.';
        } catch (error) {
            status.textContent = String(error);
        } finally {
            button.disabled = false;
        }
    });
}
