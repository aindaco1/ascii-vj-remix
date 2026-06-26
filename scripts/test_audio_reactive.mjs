import assert from 'node:assert/strict';
import {
  AUDIO_REACTIVE_CONTROLS,
  AUDIO_REACTIVE_DEFAULTS,
  AUDIO_REACTIVE_PRESETS,
  applyAudioReactiveModulation,
  normalizeAudioReactiveFeatures,
  sanitizeAudioReactiveSettings
} from '../renderers/shared/audio-reactive.js';

const controlByKey = new Map(AUDIO_REACTIVE_CONTROLS.map((control) => [control.key, control]));

assert.equal(controlByKey.get('sensitivity')?.max, 12);
assert.equal(controlByKey.get('beatAmount')?.max, 3);
assert.equal(controlByKey.get('densityDampening')?.max, 1);
assert.equal(controlByKey.get('noiseFloor')?.precision, 3);
assert.ok(AUDIO_REACTIVE_PRESETS.some((preset) => preset.id === 'dense-mix-control'));
assert.equal(AUDIO_REACTIVE_DEFAULTS.sensitivity, 9);
assert.equal(AUDIO_REACTIVE_DEFAULTS.smoothing, 0.36);
assert.equal(AUDIO_REACTIVE_DEFAULTS.densityDampening, 0.14);
assert.equal(AUDIO_REACTIVE_DEFAULTS.noiseFloor, 0.005);

const clamped = sanitizeAudioReactiveSettings({
  ...AUDIO_REACTIVE_DEFAULTS,
  sensitivity: 99,
  beatAmount: 99,
  densityDampening: 2,
  noiseFloor: 1
});
assert.equal(clamped.sensitivity, 12);
assert.equal(clamped.beatAmount, 3);
assert.equal(clamped.densityDampening, 1);
assert.equal(clamped.noiseFloor, 0.18);

const baseParams = {
  brightness: 1,
  contrastBoost: 1,
  bgBlend: 0.2,
  jitterAmount: 0.2,
  jitterSpeed: 1,
  saturationBoost: 1,
  gamma: 1,
  sampleX: 0.5,
  sampleY: 0.5
};

const denseFeatures = {
  rms: 0.85,
  bass: 0.7,
  lowMid: 0.8,
  mid: 0.8,
  highMid: 0.82,
  treble: 0.86,
  presence: 0.82,
  brightness: 0.8,
  flux: 0.9,
  density: 1,
  beatPulse: 0.9,
  phase: 1
};

const noDamping = applyAudioReactiveModulation(baseParams, denseFeatures, {
  ...AUDIO_REACTIVE_DEFAULTS,
  sensitivity: 2,
  densityDampening: 0,
  noiseFloor: 0
});
const damped = applyAudioReactiveModulation(baseParams, denseFeatures, {
  ...AUDIO_REACTIVE_DEFAULTS,
  sensitivity: 2,
  densityDampening: 1,
  noiseFloor: 0
});
assert.ok(damped.jitterAmount < noDamping.jitterAmount, 'dense damping should reduce flux-driven jitter');
assert.ok(damped.jitterSpeed < noDamping.jitterSpeed, 'dense damping should reduce transient speed response');

const broadSongFeatures = {
  rms: 0.08,
  bass: 0.12,
  lowMid: 0.1,
  mid: 0.1,
  highMid: 0.09,
  treble: 0.08,
  presence: 0.09,
  brightness: 0.08,
  flux: 0.1,
  density: 0.45,
  beatPulse: 0.08,
  phase: 1.25
};
const defaultPulse = applyAudioReactiveModulation(baseParams, broadSongFeatures, AUDIO_REACTIVE_DEFAULTS);
assert.ok(defaultPulse.brightness - baseParams.brightness > 0.3, 'default Pulse Reactor should visibly lift brightness on modest tracks');
assert.ok(defaultPulse.contrastBoost - baseParams.contrastBoost > 0.55, 'default Pulse Reactor should visibly lift contrast on modest tracks');
assert.ok(defaultPulse.jitterAmount - baseParams.jitterAmount > 0.35, 'default Pulse Reactor should visibly add transient movement on modest tracks');
assert.ok(Math.abs(defaultPulse.sampleX - baseParams.sampleX) > 0.045, 'default Pulse Reactor should visibly move the sampling window on modest tracks');

const gated = normalizeAudioReactiveFeatures({ ...denseFeatures, rms: 0.004 }, {
  ...AUDIO_REACTIVE_DEFAULTS,
  noiseFloor: 0.02,
  densityDampening: 0
});
assert.equal(gated.flux, 0);
assert.equal(gated.beatPulse, 0);

const densePreset = applyAudioReactiveModulation(baseParams, denseFeatures, {
  ...AUDIO_REACTIVE_DEFAULTS,
  sensitivity: 2,
  preset: 'dense-mix-control',
  noiseFloor: 0
});
assert.ok(densePreset.jitterAmount > baseParams.jitterAmount);
assert.ok(densePreset.jitterAmount < noDamping.jitterAmount);

console.log('Audio-reactive checks passed.');
