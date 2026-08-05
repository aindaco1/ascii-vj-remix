const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const MIDI_PROFILE_ID = 'uc33e-mioxc-v1';
export const MIDI_PROFILE_NAME = 'Evolution UC-33e via mioXC';
export const MIDI_PAGE_NAMES = Object.freeze({
    1: 'Visual',
    2: 'Audio',
    3: 'Presets',
    4: 'Fine / User'
});

const continuous = (channel, number, target, options = {}) => ({
    id: `ch${channel}-cc${number}-${target}`,
    channel,
    kind: 'cc',
    number,
    target,
    mode: 'continuous',
    pickup: options.pickup !== false,
    ...options
});

const action = (channel, number, target, options = {}) => ({
    id: `ch${channel}-cc${number}-${target}`,
    channel,
    kind: 'cc',
    number,
    target,
    mode: 'action',
    pickup: false,
    pressThreshold: 64,
    ...options
});

const digit = (channel, number, value) => action(channel, number, 'action.preset.digit', { digit: value });

// Verified on the target UC-33e hardware revision: keypad 0-9 are controller
// ids 34-43, followed by Stop/Play/Rewind/Fast-forward as ids 44-47.
const UC33E_BUTTON = Object.freeze({
    digit0: 34,
    stop: 44,
    play: 45,
    rewind: 46,
    fastForward: 47
});

const primaryContinuous = (channel, options = {}) => {
    const fine = Boolean(options.fine);
    return [
        continuous(channel, 1, 'visual.cols', fine ? { min: 240, max: 620 } : {}),
        continuous(channel, 2, 'visual.brightness', fine ? { min: 0.72, max: 1.32 } : {}),
        continuous(channel, 3, 'visual.contrastBoost', fine ? { min: 0.7, max: 1.7 } : {}),
        continuous(channel, 4, 'visual.saturationBoost', fine ? { min: 0.7, max: 2.1 } : {}),
        continuous(channel, 5, 'visual.gamma', fine ? { min: 0.65, max: 1.55 } : {}),
        continuous(channel, 6, 'visual.bgBlend', fine ? { min: 0.05, max: 0.55 } : {}),
        continuous(channel, 7, 'visual.jitterAmount', fine ? { min: 0, max: 0.5 } : {}),
        continuous(channel, 8, 'visual.jitterSpeed', fine ? { min: 0, max: 2 } : {}),
        continuous(channel, 9, 'audio.sensitivity'),
        continuous(channel, 10, 'visual.rows'),
        continuous(channel, 11, 'visual.cellWidth'),
        continuous(channel, 12, 'visual.cellHeight'),
        continuous(channel, 13, 'visual.aspectCorrection'),
        continuous(channel, 14, 'visual.fps'),
        continuous(channel, 15, 'visual.quantizeBits'),
        continuous(channel, 16, 'visual.sampleX', fine ? { min: 0.35, max: 0.65 } : {}),
        continuous(channel, 17, 'visual.sampleY', fine ? { min: 0.35, max: 0.65 } : {}),
        continuous(channel, 18, 'visual.transitionSeconds'),
        continuous(channel, 19, 'visual.volume'),
        continuous(channel, 20, 'macro.visualIntensity', { pickup: false }),
        continuous(channel, 21, 'audio.smoothing'),
        continuous(channel, 22, 'audio.beatAmount'),
        continuous(channel, 23, 'audio.bassAmount'),
        continuous(channel, 24, 'audio.midAmount'),
        continuous(channel, 25, 'audio.trebleAmount'),
        continuous(channel, 26, 'audio.fluxAmount'),
        continuous(channel, 27, 'audio.presenceAmount'),
        continuous(channel, 28, 'audio.densityDampening'),
        continuous(channel, 29, 'audio.noiseFloor'),
        continuous(channel, 30, 'audio.preset'),
        continuous(channel, 31, 'visual.charset'),
        continuous(channel, 32, 'visual.fontFamily'),
        continuous(channel, 33, 'visual.backend')
    ];
};

const visualActions = (channel) => [
    action(channel, 34, 'action.preset.previous'),
    action(channel, 35, 'action.preset.next'),
    action(channel, 36, 'action.wtf.toggle'),
    action(channel, 37, 'action.audio.toggle'),
    action(channel, 38, 'action.visual.glyphMode.toggle'),
    action(channel, 39, 'action.visual.solidMode.toggle'),
    action(channel, 40, 'action.visual.smoothing.toggle'),
    action(channel, 41, 'action.visual.autoRows.toggle'),
    action(channel, 42, 'action.visual.charset.next'),
    action(channel, 43, 'action.visual.fontFamily.next'),
    action(channel, 44, 'action.audio.preset.previous'),
    action(channel, 45, 'action.audio.preset.next'),
    action(channel, 46, 'action.visual.resetPreset'),
    action(channel, 47, 'action.midi.rearmPickup')
];

const audioContinuous = () => [
    continuous(2, 1, 'audio.sensitivity'),
    continuous(2, 2, 'audio.smoothing'),
    continuous(2, 3, 'audio.beatAmount'),
    continuous(2, 4, 'audio.bassAmount'),
    continuous(2, 5, 'audio.midAmount'),
    continuous(2, 6, 'audio.trebleAmount'),
    continuous(2, 7, 'audio.fluxAmount'),
    continuous(2, 8, 'audio.presenceAmount'),
    continuous(2, 9, 'audio.densityDampening'),
    ...primaryContinuous(2).filter((binding) => binding.number >= 10)
];

const audioActions = () => [
    action(2, 34, 'action.audio.toggle'),
    action(2, 35, 'action.audio.preset.previous'),
    action(2, 36, 'action.audio.preset.next'),
    action(2, 37, 'action.wtf.toggle'),
    ...Array.from({ length: 6 }, (_, index) => action(2, 38 + index, 'action.audio.preset.select', { presetIndex: index })),
    action(2, 44, 'action.audio.reset'),
    action(2, 45, 'action.preset.previous'),
    action(2, 46, 'action.preset.next'),
    action(2, 47, 'action.midi.rearmPickup')
];

const presetActions = () => [
    ...Array.from({ length: 10 }, (_, value) => digit(3, UC33E_BUTTON.digit0 + value, value)),
    action(3, UC33E_BUTTON.stop, 'action.preset.clear'),
    action(3, UC33E_BUTTON.play, 'action.preset.enter'),
    action(3, UC33E_BUTTON.rewind, 'action.preset.previous'),
    action(3, UC33E_BUTTON.fastForward, 'action.preset.next')
];

export const UC33E_MIOXC_BINDINGS = Object.freeze([
    ...primaryContinuous(1),
    ...visualActions(1),
    ...audioContinuous(),
    ...audioActions(),
    ...primaryContinuous(3),
    ...presetActions(),
    ...primaryContinuous(4, { fine: true }),
    ...visualActions(4)
]);

export const UC33E_MIOXC_PROFILE = Object.freeze({
    schemaVersion: 1,
    id: MIDI_PROFILE_ID,
    name: MIDI_PROFILE_NAME,
    inputNamePattern: 'mioXC',
    outputNamePattern: 'mioXC',
    pages: MIDI_PAGE_NAMES,
    bindings: UC33E_MIOXC_BINDINGS,
    sysexPackets: [],
    sysexCaptureRequired: true,
    packetDelayMs: 12
});

export function midiBindingKey(event) {
    return `${event.kind || 'unknown'}:${Number(event.channel || 0)}:${Number(event.number ?? -1)}`;
}

export function sanitizeMidiBinding(binding, index = 0) {
    if (!binding || typeof binding !== 'object' || Array.isArray(binding)) {
        throw new Error(`MIDI binding ${index + 1} must be an object`);
    }
    const channel = clamp(Math.round(Number(binding.channel || 1)), 1, 16);
    const number = clamp(Math.round(Number(binding.number || 0)), 0, 127);
    const kind = ['cc', 'noteOn', 'noteOff', 'program'].includes(binding.kind) ? binding.kind : 'cc';
    const target = String(binding.target || '').slice(0, 120);
    if (!target) throw new Error(`MIDI binding ${index + 1} is missing a target`);
    const mode = binding.mode === 'action' ? 'action' : 'continuous';
    const out = {
        id: String(binding.id || `custom-${channel}-${kind}-${number}-${target}`).slice(0, 180),
        channel,
        kind,
        number,
        target,
        mode,
        pickup: mode === 'continuous' && binding.pickup !== false,
        pressThreshold: clamp(Math.round(Number(binding.pressThreshold ?? 64)), 1, 127)
    };
    if (Number.isFinite(Number(binding.min))) out.min = Number(binding.min);
    if (Number.isFinite(Number(binding.max))) out.max = Number(binding.max);
    if (binding.invert) out.invert = true;
    if (['linear', 'exponential', 'logarithmic'].includes(binding.curve)) out.curve = binding.curve;
    if (Number.isInteger(binding.digit)) out.digit = clamp(binding.digit, 0, 9);
    if (Number.isInteger(binding.presetIndex)) out.presetIndex = Math.max(0, binding.presetIndex);
    return out;
}

export function sanitizeMidiBindings(bindings, options = {}) {
    const maxBindings = clamp(Math.round(Number(options.maxBindings || 512)), 1, 1024);
    if (!Array.isArray(bindings)) return [];
    return bindings.slice(0, maxBindings).map(sanitizeMidiBinding);
}

function curvedValue(normalized, curve = 'linear') {
    if (curve === 'exponential') return normalized ** 2;
    if (curve === 'logarithmic') return Math.sqrt(normalized);
    return normalized;
}

function bindingRange(binding, target) {
    const min = Number.isFinite(Number(binding.min)) ? Number(binding.min) : Number(target.min ?? 0);
    const max = Number.isFinite(Number(binding.max)) ? Number(binding.max) : Number(target.max ?? 1);
    return max >= min ? [min, max] : [max, min];
}

export function mapMidiValue(value, binding, target) {
    let normalized = clamp(Number(value || 0) / 127, 0, 1);
    if (binding.invert) normalized = 1 - normalized;
    normalized = curvedValue(normalized, binding.curve);
    if (target.type === 'enum') {
        const options = Array.isArray(target.options) ? target.options : [];
        if (!options.length) return null;
        return options[Math.round(normalized * (options.length - 1))];
    }
    const [min, max] = bindingRange(binding, target);
    let mapped = min + normalized * (max - min);
    const step = Number(target.step || 0);
    if (step > 0) mapped = min + Math.round((mapped - min) / step) * step;
    return clamp(mapped, min, max);
}

function targetNormalized(value, binding, target) {
    if (target.type === 'enum') {
        const options = Array.isArray(target.options) ? target.options : [];
        const index = options.indexOf(value);
        return options.length <= 1 || index < 0 ? 0 : index / (options.length - 1);
    }
    const [min, max] = bindingRange(binding, target);
    if (max <= min) return 0;
    return clamp((Number(value) - min) / (max - min), 0, 1);
}

export class MidiMappingEngine {
    constructor(options = {}) {
        this.bindings = sanitizeMidiBindings(options.bindings || []);
        this.getTarget = options.getTarget || (() => null);
        this.applyTarget = options.applyTarget || (() => false);
        this.softTakeover = options.softTakeover !== false;
        this.pickupThreshold = clamp(Number(options.pickupThreshold ?? 0.035), 0.005, 0.2);
        this.pickup = new Map();
        this.lastApplied = new Map();
        this.actionPressed = new Set();
    }

    setBindings(bindings) {
        this.bindings = sanitizeMidiBindings(bindings);
        this.rearmPickup();
    }

    setSoftTakeover(enabled) {
        this.softTakeover = Boolean(enabled);
        this.rearmPickup();
    }

    rearmPickup() {
        this.pickup.clear();
        this.lastApplied.clear();
        this.actionPressed.clear();
    }

    matchingBindings(event) {
        return this.bindings.filter((binding) =>
            (binding.kind === event.kind ||
                (binding.mode === 'action' && binding.kind === 'noteOn' && event.kind === 'noteOff')) &&
            binding.channel === Number(event.channel) &&
            binding.number === Number(event.number)
        );
    }

    process(event) {
        const results = [];
        for (const binding of this.matchingBindings(event)) {
            const value = Number(event.value || 0);
            if (binding.mode === 'action') {
                if (value < binding.pressThreshold) {
                    this.actionPressed.delete(binding.id);
                    continue;
                }
                if (this.actionPressed.has(binding.id)) continue;
                this.actionPressed.add(binding.id);
                const applied = this.applyTarget(binding.target, { binding, event, kind: 'action' });
                results.push({ binding, applied: applied !== false, waiting: false });
                continue;
            }
            const target = this.getTarget(binding.target);
            if (!target || !['range', 'enum'].includes(target.type)) continue;
            const normalized = clamp(value / 127, 0, 1);
            const pickupState = this.pickup.get(binding.id) || { picked: false, previous: null };
            if (this.softTakeover && binding.pickup && !pickupState.picked) {
                const current = targetNormalized(target.value, binding, target);
                const close = Math.abs(normalized - current) <= this.pickupThreshold;
                const crossed = pickupState.previous !== null &&
                    ((pickupState.previous <= current && normalized >= current) ||
                     (pickupState.previous >= current && normalized <= current));
                pickupState.previous = normalized;
                pickupState.picked = close || crossed;
                this.pickup.set(binding.id, pickupState);
                if (!pickupState.picked) {
                    results.push({ binding, applied: false, waiting: true });
                    continue;
                }
            }
            const mapped = mapMidiValue(value, binding, target);
            if (mapped === null || this.lastApplied.get(binding.id) === mapped) continue;
            this.lastApplied.set(binding.id, mapped);
            const applied = this.applyTarget(binding.target, { binding, event, kind: 'value', value: mapped });
            results.push({ binding, applied: applied !== false, waiting: false, value: mapped });
        }
        return results;
    }
}

export function coalesceMidiEvents(events, bindings = UC33E_MIOXC_BINDINGS) {
    const bindingModes = new Map(bindings.map((binding) => [
        `${binding.kind}:${binding.channel}:${binding.number}`,
        binding.mode
    ]));
    const ordered = [];
    const continuous = new Map();
    for (const event of Array.isArray(events) ? events : []) {
        const key = midiBindingKey(event);
        if (bindingModes.get(key) === 'continuous') continuous.set(key, event);
        else ordered.push(event);
    }
    return [...ordered, ...continuous.values()];
}

export function findPreferredMidiPort(ports, pattern = 'mioXC') {
    const normalized = String(pattern || '').toLowerCase();
    return (Array.isArray(ports) ? ports : []).find((port) =>
        String(port?.name || '').toLowerCase().includes(normalized)
    ) || null;
}
