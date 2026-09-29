import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  AUDIO_REACTIVE_CONTROLS,
  AUDIO_REACTIVE_DEFAULTS,
  AUDIO_REACTIVE_PRESETS,
  AUDIO_REACTIVE_FEATURE_KEYS,
  applyAudioReactiveModulation,
  normalizeAudioReactiveFeatures,
  smoothAudioReactiveFeatures,
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

const silence=Object.fromEntries(AUDIO_REACTIVE_FEATURE_KEYS.map(key=>[key,0]));
const impulse=Object.fromEntries(AUDIO_REACTIVE_FEATURE_KEYS.map(key=>[key,1]));
for(const smoothing of [0,.36,.98]){
  const state={};
  smoothAudioReactiveFeatures(state,silence,smoothing,0);
  assert.deepEqual(smoothAudioReactiveFeatures(state,impulse,smoothing,8),{...impulse,phase:.096},'attacks must not be delayed by smoothing');
  const release=smoothAudioReactiveFeatures(state,silence,smoothing,16);
  assert.ok(smoothing===0?release.rms===0:release.rms>0&&release.rms<1);
}
const decayAtRate=hz=>{
  const state={};smoothAudioReactiveFeatures(state,impulse,.36,0);
  for(let i=1;i<=hz;i++)smoothAudioReactiveFeatures(state,silence,.36,i*1000/hz);
  return state.features.rms;
};
for(const hz of [30,60,120,144])assert.ok(Math.abs(decayAtRate(hz)-Math.exp(-1000/(200*.36**2)))<1e-12,'smoothing must follow elapsed time');
const malformed=smoothAudioReactiveFeatures({}, {rms:NaN,bass:Infinity,mid:.6,lowMid:0,treble:.5,presence:0},.36,0);
assert.equal(malformed.rms,0);assert.equal(malformed.bass,0);assert.equal(malformed.lowMid,0);assert.equal(malformed.presence,0);
assert.equal(malformed.highMid,.6);

// Reproducible software-only step comparison with the previous 60 Hz envelope.
// This excludes device, driver, IPC and display latency.
function stepTime(legacy,release){
  const hz=legacy?60:120,dt=1000/hz,state={};let value=release?1:0;
  smoothAudioReactiveFeatures(state,{rms:value},.36,0);
  for(let i=1;i<1000;i++){
    const target=release?0:1;
    value=legacy?value+(target-value)*(release ? .34-.36*.28 : .92-.36*.28):
      smoothAudioReactiveFeatures(state,{rms:target},.36,i*dt).rms;
    if(release?value<=.1:value>=.9)return i*dt;
  }
}
const timing={previous:{attack90Ms:stepTime(true,false),release10Ms:stepTime(true,true)},current:{attack90Ms:stepTime(false,false),release10Ms:stepTime(false,true)}};
assert.ok(timing.current.attack90Ms<timing.previous.attack90Ms);
assert.ok(timing.current.release10Ms<timing.previous.release10Ms);
console.log('Synthetic sampling + envelope response (not physical end-to-end latency):',JSON.stringify(timing));

// Exercise the actual native polling and stop methods with deferred IPC replies.
const appSource = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const runtimeSource = appSource.slice(appSource.indexOf('class AudioReactiveRuntime {'), appSource.indexOf('class CameraMixer {'));
let clock = 0;
const pending = [], applied = [];
const readFeatures = () => new Promise(resolve => pending.push(resolve));
const Runtime = new Function('readTauriInputAudioFeatures', 'readTauriSystemAudioFeatures', 'stopTauriInputAudioCapture', 'stopTauriSystemAudioCapture', 'smoothAudioReactiveFeatures', 'applyAudioReactiveModulation', 'clampParamValue', 'performance', `${runtimeSource}; return AudioReactiveRuntime;`)(
  readFeatures, readFeatures, async () => {}, async () => {}, smoothAudioReactiveFeatures, applyAudioReactiveModulation, (_key, value) => value, {now: () => clock}
);
const app = {
  params: {...baseParams}, audioReactive: {...AUDIO_REACTIVE_DEFAULTS, source:'input'},
  applyAudioReactiveFrame: (params, features) => applied.push({params, features}),
  _syncAudioReactiveUi() {}, _syncNativeOutputWindow() {}, clearAudioReactiveFrame() {}, renderParams() { return this.params; }
};
const runtime = new Runtime(app);
runtime.active = runtime.nativeInputAudio = true;
const frame = frames => ({...impulse, available:true, active:true, frames, analysisWindowMs:8/3, ageMs:1});
const first = runtime._emitNativeFrame();
await runtime._emitNativeFrame();
assert.equal(pending.length, 1, 'native reads must never queue up');
clock = 2; pending.shift()(frame(1)); await first;
assert.equal(applied.length, 1);
assert.equal(runtime.featureSmoothing.lastMs, 2, 'timestamp delivery, not the request');
assert.equal(runtime.captureTiming.featureAgeUpperBoundMs, 3);
const duplicate = runtime._emitNativeFrame();
pending.shift()(frame(1)); await duplicate;
assert.equal(applied.length, 1, 'duplicate capture frames must not be smoothed twice');
const obsolete = runtime._emitNativeFrame();
runtime.stop();
runtime.active = runtime.nativeInputAudio = true;
const restarted = runtime._emitNativeFrame();
pending.shift()(frame(2)); await obsolete;
assert.equal(applied.length, 1, 'late replies from a stopped capture must be ignored');
assert.equal(runtime.nativeFeaturePending, true, 'old replies must not unlock a new capture request');
clock = 10; pending.shift()(frame(1)); await restarted;
assert.equal(applied.length, 2, 'restarted capture accepts its own frame counter');
assert.equal(runtime.nativeFeaturePending, false);
assert.deepEqual(app.params, baseParams, 'live audio must not rewrite saved visual parameters');
console.log('Native audio polling, duplicate-frame and capture-restart regressions passed.');

const payloadSource = appSource.slice(appSource.indexOf('    _nativeOutputPayload('), appSource.indexOf('    _nativeOutputSourceId('));
const makePayload = new Function(`return {${payloadSource}}._nativeOutputPayload;`)();
const output = {
  params:{...baseParams, sourceName:'Fixture'}, audioReactiveRuntime:{active:true},
  _nativeCameraOutputMeta: () => null, _canUseNativeRenderOutputWindow: () => true,
  _nativeOutputSourceId: () => null, _nativeOutputParams: params => ({...params}),
  _captureStaticMediaState: () => null
};
const steady = makePayload.call(output, {...baseParams, brightness:1.4});
assert.equal(steady.params.brightness, 1.4);
assert.equal(steady.params.audioReactiveActive, false, 'steady effective params must not be modulated twice');
const transition = {kind:'tween', fromParams:baseParams, durationMs:1000, startAtUnixMs:0};
const armed = makePayload.call(output, baseParams, transition);
assert.equal(armed.params.audioReactiveActive, true, 'autonomous transitions need direct native audio while parameter sync is suspended');
assert.equal(armed.transition.fromParams.audioReactiveActive, true);
output.audioReactiveRuntime.active = false;
assert.equal(makePayload.call(output, baseParams, transition).params.audioReactiveActive, false);
console.log('Steady and transitioning native audio ownership passed.');
