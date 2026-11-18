import assert from 'node:assert/strict';
import { WebGPURenderer } from '../renderers/gpu/ascii/renderer/webgpu/webgpu-renderer.js';

const frames = [], callbacks = [];
class Frame {
  constructor(video) { assert.equal(video.readyState, 2); this.closed = false; frames.push(this); }
  close() { assert.equal(this.closed, false); this.closed = true; }
}
globalThis.window = {
  VideoFrame:Frame, performance:{now: () => 100},
  requestAnimationFrame: callback => { callbacks.push(callback); return callbacks.length; },
  cancelAnimationFrame() {}, setInterval: () => 1, clearInterval() {}
};
const invalid = () => new DOMException('GPUDevice.createBindGroup: Unable to make bind group.', 'InvalidStateError');
let imported, failImport = false, failBind = false, submitted = 0;
const pass = {setPipeline() {}, setBindGroup() {}, dispatchWorkgroups() {}, draw() {}, end() {}};
const device = {
  queue:{writeBuffer() {}, submit() { assert.equal(imported.closed, false, 'decoded frame must outlive queue.submit'); submitted++; }},
  importExternalTexture({source}) { assert.ok(source instanceof Frame); imported = source; if (failImport) throw new DOMException('Decoder import unavailable', failImport); return {}; },
  createBindGroup() { assert.equal(imported.closed, false); if (failBind) throw invalid(); return {}; },
  createCommandEncoder: () => ({beginComputePass: () => pass, beginRenderPass: () => pass, finish: () => ({})})
};
const source = {isVideo:true, element:{readyState:1}, width:64, height:48};
const renderer = new WebGPURenderer({device, source});
Object.assign(renderer, {
  initialized:true, usesExternalVideoTexture:true, rows:4,
  syncPaletteDisplay() {}, videoComputePipeline:{getBindGroupLayout: () => ({})}, renderBindGroup:{}, nextRenderBindGroup:{},
  context:{getCurrentTexture: () => ({createView: () => ({})})}, historyView:{id:1}, nextHistoryView:{id:2}
});
renderer._renderFrame(); assert.equal(frames.length, 0, 'decoder gaps should not submit stale data');
source.element.readyState = 2;
renderer._renderFrame(); assert.equal(submitted, 1); assert.equal(renderer.frameCount, 1);
assert.equal(frames[0].closed, true); assert.equal(renderer.historyView.id, 2);
for (const name of ['InvalidStateError', 'OperationError']) {
  failImport = name; renderer._renderFrame();
  assert.equal(frames.at(-1).closed, true);
}
failImport = false;
assert.equal(renderer.frameCount, 1); assert.equal(renderer.historyView.id, 2); assert.equal(frames.at(-1).closed, true);
failBind = true; assert.throws(() => renderer._renderFrame(), {name:'InvalidStateError'});
assert.equal(renderer.frameCount, 1, 'failed frames must not count as rendered'); assert.equal(renderer.historyView.id, 2);
assert.equal(frames.at(-1).closed, true, 'errors must still release the decoder frame');
// A surfaced GPU failure must not kill requestAnimationFrame permanently.
renderer.start(); assert.throws(() => callbacks.shift()(100), {name:'InvalidStateError'});
assert.equal(callbacks.length, 1); failBind = false; callbacks.shift()(150);
assert.equal(renderer.frameCount, 2); assert.equal(submitted, 2); assert.equal(renderer.historyView.id, 1);
renderer.stop(); assert.ok(frames.every(frame => frame.closed));
console.log('WebGPU decoded-frame lifetime, failed-frame accounting and render-loop recovery passed.');

// Mirrored by the preview's failure callback. Other renderer clients retain
// their ordinary exception behavior above.
const failures = [];
const preview = new WebGPURenderer({ device, source,
  onRuntimeFailure: renderer => failures.push(renderer.runtimeFailure)
});
let throwFrame = true;
preview._renderFrame = () => {
  preview.frameOperation = 'create-command-encoder';
  if (throwFrame) throw invalid();
  preview.frameCount++;
};
preview.renderFrame();
throwFrame = false;
preview.renderFrame();
assert.equal(failures.length, 0, 'one missed frame must recover in place');
throwFrame = true;
preview.renderFrame();
preview.renderFrame();
preview.renderFrame();
assert.equal(failures.length, 1, 'repeated frame failure signals once');
assert.equal(failures[0].operation, 'create-command-encoder');
assert.equal(preview.running, false);
const loss = new AbortController();
const sharedFailures = [];
const fromDevice = () => new WebGPURenderer({ device, source, deviceLoss: loss.signal,
  onRuntimeFailure: value => sharedFailures.push(value.runtimeFailure)
});
const outgoing = fromDevice(), incoming = fromDevice(), discarded = fromDevice();
for (const view of [outgoing, incoming, discarded]) view.start();
discarded.destroy();
loss.abort('destroyed');
assert.equal(sharedFailures.length, 2);
assert.ok(sharedFailures.every(event => event.operation === 'device-lost' && event.reason === 'destroyed'));
assert.equal(incoming.running, false);
assert.equal(discarded.runtimeFailure, undefined);
console.log('Preview submission and shared-device failure handling passed.');
