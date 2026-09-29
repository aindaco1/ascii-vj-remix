import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AUDIO_REACTIVE_DEFAULTS, AUDIO_REACTIVE_CONTROLS, AUDIO_REACTIVE_PRESETS, audioReactivePresetTuning, audioReactivePresetIsCustom } from '../renderers/shared/audio-reactive.js';

const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const runtimeSource = source.slice(source.indexOf('class AudioReactiveRuntime {'), source.indexOf('class CameraMixer {'));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
function fixture(overrides = {}) {
  const events = [], frames = [];
  const deps = {
    isTauriRuntime: () => false, requestNativeCapturePermission: async () => {},
    startTauriInputAudioCapture: async () => ({available:true, active:true}),
    startTauriSystemAudioCapture: async () => ({available:true, active:true}),
    stopTauriInputAudioCapture: async () => events.push('stop-input'),
    stopTauriSystemAudioCapture: async () => events.push('stop-display'),
    logMediaDiagnostic() {}, diagnosticErrorLabel: String, friendlyAudioErrorMessage: e => e.message,
    performance: {now: () => 10}, AUDIO_REACTIVE_FRAME_MS: 8,
    scheduleResponsiveFrame: () => { events.push('schedule'); return () => events.push('cancel'); },
    ...overrides
  };
  const Runtime = new Function(...Object.keys(deps), `${runtimeSource}; return AudioReactiveRuntime;`)(...Object.values(deps));
  const app = {
    params:{brightness:1}, audioReactive:{...AUDIO_REACTIVE_DEFAULTS, enabled:true, source:'input'},
    _syncAudioReactiveUi() {}, _syncNativeOutputWindow() {}, _audioReactiveSettingsChanged() {},
    clearAudioReactiveFrame() { frames.length = 0; }, renderParams() { return this.params; }
  };
  const runtime = new Runtime(app);
  runtime._ensureContext = async () => {};
  runtime._configureAnalyser = () => {};
  runtime._startStreamSource = stream => { runtime.stream = stream; events.push('connect'); };
  runtime._emitCurrentFrame = () => frames.push('frame');
  return {runtime, app, events, frames};
}
function streamFixture() { const track = {stops:0, stop() { this.stops++; }}; return {track, getTracks: () => [track]}; }

// A browser permission/capture reply arriving after Stop must release its tracks.
{
  const f = fixture(), capture = deferred(), stream = streamFixture();
  f.runtime._requestInputStream = () => capture.promise;
  const start = f.runtime.start(); await flush(); f.runtime.stop();
  capture.resolve(stream); assert.equal(await start, false);
  assert.equal(stream.track.stops, 1); assert.equal(f.runtime.active, false);
  assert.equal(f.runtime.status, 'Idle'); assert.deepEqual(f.frames, []);
  assert.ok(!f.events.includes('connect') && !f.events.includes('schedule'));
}
// Late failure cannot turn off or overwrite a newer successful browser capture.
{
  const f = fixture(), old = deferred(), stream = streamFixture(); let calls = 0;
  f.runtime._requestInputStream = () => ++calls === 1 ? old.promise : Promise.resolve(stream);
  const first = f.runtime.start(); await flush();
  assert.equal(await f.runtime.start(), true); old.reject(new Error('old permission rejected'));
  assert.equal(await first, false); assert.equal(f.runtime.active, true);
  assert.equal(f.app.audioReactive.enabled, true); assert.equal(f.runtime.stream, stream);
  assert.equal(stream.track.stops, 0); f.runtime.stop(); assert.equal(stream.track.stops, 1);
}
// Stopping during AudioContext.resume also releases an already-acquired stream.
{
  const f = fixture(), context = deferred(), stream = streamFixture();
  f.runtime._requestInputStream = async () => stream;
  f.runtime._ensureContext = () => context.promise;
  const start = f.runtime.start(); await flush(); f.runtime.stop(); context.resolve();
  assert.equal(await start, false); assert.equal(stream.track.stops, 1);
  assert.ok(!f.events.includes('connect'));
}
// Native global capture commands must be ordered start -> stop -> restart.
for (const kind of ['input', 'display']) {
  const commands = [], startReply = deferred(), stopReply = deferred(); let starts = 0;
  const f = fixture({
    isTauriRuntime: () => true,
    [kind === 'input' ? 'startTauriInputAudioCapture' : 'startTauriSystemAudioCapture']: () => {
      commands.push('start'); return ++starts === 1 ? startReply.promise : Promise.resolve({available:true, active:true});
    },
    [kind === 'input' ? 'stopTauriInputAudioCapture' : 'stopTauriSystemAudioCapture']: () => { commands.push('stop'); return stopReply.promise; }
  });
  f.app.audioReactive.source = kind;
  const first = f.runtime.start(); await flush(); assert.deepEqual(commands, ['start']);
  f.runtime.stop(); const second = f.runtime.start(); await flush();
  assert.deepEqual(commands, ['start']); startReply.resolve({available:true, active:true});
  assert.equal(await first, false); await flush(); assert.deepEqual(commands, ['start', 'stop']);
  stopReply.resolve(); assert.equal(await second, true); assert.deepEqual(commands, ['start', 'stop', 'start']);
  assert.equal(f.runtime.active, true); assert.equal(f.frames.length, 1);
  f.runtime.stop(); await f.runtime.nativeCaptureQueue;
  assert.equal(f.runtime.nativeInputAudio || f.runtime.nativeDisplayAudio, false);
  assert.deepEqual(commands, ['start', 'stop', 'start', 'stop']);
}
{
  const permission = deferred(); let starts = 0;
  const f = fixture({isTauriRuntime: () => true, requestNativeCapturePermission: () => permission.promise,
    startTauriInputAudioCapture: async () => { starts++; return {available:true, active:true}; }});
  const start = f.runtime.start(); f.runtime.stop(); permission.resolve();
  assert.equal(await start, false); assert.equal(starts, 0);
}
// Current errors still disable the failed session and remain visible.
{
  const playing = deferred(), nodes = [], elements = [], revoked = [];
  const node = () => { const value = {connect() {}, disconnect() { this.disconnected = true; }, gain:{}}; nodes.push(value); return value; };
  const f = fixture({
    Audio: class { constructor() { elements.push(this); } play() { return playing.promise; } pause() { this.paused = true; } },
    URL:{createObjectURL: () => 'blob:audio-fixture', revokeObjectURL: url => revoked.push(url)}
  });
  f.app.audioReactive.source = 'file'; f.runtime.file = {name:'fixture.wav'};
  f.runtime.audioContext = {createMediaElementSource:node, createGain:node, createAnalyser:node};
  const start = f.runtime.start(); await flush(); f.runtime.stop(); playing.resolve();
  assert.equal(await start, false); assert.equal(elements[0].paused, true); assert.equal(elements[0].src, '');
  assert.ok(nodes.every(value => value.disconnected)); assert.deepEqual(revoked, ['blob:audio-fixture']);
  assert.deepEqual(f.frames, []); assert.ok(!f.events.includes('schedule'));
}
{
  const f = fixture(); f.runtime._requestInputStream = async () => { throw new Error('capture unavailable'); };
  await assert.rejects(f.runtime.start(), /capture unavailable/);
  assert.equal(f.runtime.active, false); assert.equal(f.app.audioReactive.enabled, false);
  assert.equal(f.runtime.status, 'capture unavailable');
}

const method = (start, end, deps = {}) => new Function(...Object.keys(deps), `return {${source.slice(source.indexOf(start), source.indexOf(end))}};`)(...Object.values(deps));
const selection = method('    _selectAudioReactivePreset(', '    async _setAudioReactiveSource(', {audioReactivePresetTuning});
const settings = method('    _audioReactiveSettingsChanged(', '    _selectAudioReactivePreset(');
const finish = method('    _finishNativeOutputTransition(', '    _syncNativeOutputMode(');
for (const preset of AUDIO_REACTIVE_PRESETS) {
  const app = {
    ...selection, audioReactive:{...AUDIO_REACTIVE_DEFAULTS, source:'file', inputDeviceId:'custom-device', enabled:true},
    params:{brightness:1.7}, audioReactiveRuntime:{updates:0, updateSettings() { this.updates++; }}, _syncAudioReactiveUi() {}
  };
  for (const {key} of AUDIO_REACTIVE_CONTROLS) app.audioReactive[key] = 0;
  assert.equal(audioReactivePresetIsCustom(app.audioReactive), true);
  assert.equal(app._selectAudioReactivePreset(preset.id), true);
  assert.equal(audioReactivePresetIsCustom(app.audioReactive), false);
  for (const {key} of AUDIO_REACTIVE_CONTROLS) assert.equal(app.audioReactive[key], preset[key] ?? AUDIO_REACTIVE_DEFAULTS[key]);
  assert.equal(app.audioReactive.source, 'file'); assert.equal(app.audioReactive.enabled, true);
  assert.equal(app.audioReactive.inputDeviceId, 'custom-device'); assert.deepEqual(app.params, {brightness:1.7});
  assert.equal(app.audioReactiveRuntime.updates, 1); assert.equal(app._selectAudioReactivePreset('__custom'), false);
}
// Edits and Stop immediately end autonomous native modulation, including an arm acknowledgement arriving late.
{
  const sent = [], reply = deferred();
  const arm = method('    async _armNativeOutputTransition(', '    _finishNativeOutputTransition(', {
    setCycleTransportRate() {}, cycleNowMs: () => 0, NATIVE_OUTPUT_TRANSITION_LEAD_MS: 80,
    sendTauriOutputState: () => reply.promise
  });
  const app = {
    ...settings, ...finish, ...arm, audioReactiveRevision:0, nativeOutputActive:true,
    transitionToken:1, running:true, _canUseNativeOutputWindow: () => true,
    _nativeOutputPayload: () => ({}), renderParams: () => ({brightness:1}),
    _syncNativeOutputWindow: (params, interval, options) => sent.push({params, options})
  };
  const arming = app._armNativeOutputTransition({}, {}, 500, 'preset', 1);
  app._audioReactiveSettingsChanged(); reply.resolve(true); await arming;
  assert.equal(app.nativeOutputTransition, null); assert.deepEqual(sent, [{params:{brightness:1}, options:{force:true}}]);
  app.nativeOutputTransition = {token:2}; app._audioReactiveSettingsChanged();
  assert.equal(app.nativeOutputTransition, null); assert.equal(sent.length, 2);
}
console.log('Audio startup cancellation, native command ordering, preset tuning and live Pop Out controls passed.');
