const DEFAULT_CHECK_TIMEOUT_MS = 15_000;
const DEFAULT_INSTALL_TIMEOUT_MS = 300_000;

class DesktopUpdateController {
    constructor({ checkForUpdate, installUpdate, onStateChange = () => {}, logger = console } = {}) {
        if (typeof checkForUpdate !== 'function') throw new TypeError('checkForUpdate must be a function');
        if (typeof installUpdate !== 'function') throw new TypeError('installUpdate must be a function');

        this.checkForUpdate = checkForUpdate;
        this.installUpdate = installUpdate;
        this.onStateChange = onStateChange;
        this.logger = logger;
        this.available = false;
        this.busy = false;
        this.update = null;
        this.status = '';
        this.silent = false;
        this.launchCheckStarted = false;
    }

    snapshot() {
        return {
            available: this.available,
            busy: this.busy,
            update: this.update,
            status: this.status,
            silent: this.silent,
            launchCheckStarted: this.launchCheckStarted
        };
    }

    setAvailable(available) {
        this.available = Boolean(available);
        if (!this.available) {
            this.busy = false;
            this.update = null;
            this.status = '';
            this.silent = false;
        }
        this._emit();
    }

    async checkOnLaunch() {
        if (!this.available || this.launchCheckStarted) return false;
        this.launchCheckStarted = true;
        return this.check({ silent: true });
    }

    async activate() {
        if (!this.available || this.busy) return false;
        if (this.update) return this.install();
        return this.check();
    }

    async check({ silent = false } = {}) {
        if (!this.available || this.busy) return false;

        this.busy = true;
        this.silent = Boolean(silent);
        this.status = silent ? '' : 'Checking...';
        this._emit();

        try {
            const update = await this.checkForUpdate({ timeout: DEFAULT_CHECK_TIMEOUT_MS });
            this.update = update || null;
            this.status = update ? `v${update.version} available` : (silent ? '' : 'Up to date');
            return true;
        } catch (error) {
            this.logger?.warn?.('[Updater] Update check failed:', error);
            this.update = null;
            this.status = silent ? '' : 'Check failed';
            return false;
        } finally {
            this.busy = false;
            this.silent = false;
            this._emit();
        }
    }

    async install() {
        if (!this.available || !this.update || this.busy) return false;

        this.busy = true;
        this.silent = false;
        this.status = 'Downloading...';
        this._emit();

        let received = 0;
        let total = 0;
        const updateProgress = (event) => {
            if (!event) return;
            if (event.event === 'Started') {
                received = 0;
                total = Number(event.data?.contentLength || 0);
                this.status = total > 0 ? 'Downloading 0%' : 'Downloading...';
            } else if (event.event === 'Progress') {
                received += Number(event.data?.chunkLength || 0);
                if (total > 0) {
                    const percent = Math.min(100, Math.floor((received / total) * 100));
                    this.status = `Downloading ${percent}%`;
                }
            } else if (event.event === 'Finished') {
                this.status = 'Installing...';
            }
            this._emit();
        };

        try {
            await this.installUpdate(this.update, updateProgress, { timeout: DEFAULT_INSTALL_TIMEOUT_MS });
            this.status = 'Relaunching...';
            return true;
        } catch (error) {
            this.logger?.warn?.('[Updater] Update install failed:', error);
            this.status = 'Install failed';
            this.busy = false;
            return false;
        } finally {
            this._emit();
        }
    }

    _emit() {
        this.onStateChange(this.snapshot());
    }
}

export {
    DEFAULT_CHECK_TIMEOUT_MS,
    DEFAULT_INSTALL_TIMEOUT_MS,
    DesktopUpdateController
};
