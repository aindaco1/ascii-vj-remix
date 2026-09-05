import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WebGPURenderer } from '../renderers/gpu/ascii/renderer/webgpu/webgpu-renderer.js';
import { syncNativePreviewGeometry } from '../renderers/shared/native-preview-geometry.js';

// Execute the actual controller methods, with OS/UI boundaries stubbed. This
// guards ordering, not just the presence of policy strings in app.js.
const appSource = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const methods = appSource.slice(appSource.indexOf('    async _switchStaticSource('), appSource.indexOf('    async _prepareForSourceSwitch('));
const events = [];
const Controller = new Function('normalizeParams', 'isCameraParams', 'sendTauriOutputState', `return class { ${methods} }`)(
  (params) => params,
  (params) => params.mediaType === 'camera',
  async (payload) => { events.push(`native:${payload.mediaType}`); return true; }
);
function fixture(windows = true) {
  const app = new Controller();
  Object.assign(app, {
    params: { sourceMode: 'static', mediaType: 'camera', mediaUrl: 'camera:' },
    nativeOutputCapabilities: { nativeCameraPreviewBridge: windows },
    nativeOutputActive: true,
    nativeOutputExclusiveCameraActive: true,
    running: true,
    _prepareForSourceSwitch: async () => false,
    _syncInputs() {}, _persist() {}, _applyVisualState() {}, _syncPresetToolbar() {}, _renderSourceList() {},
    _stopCameraStream() { events.push('stop-browser-camera'); },
    _stopNativeOutputMirror() {},
    _nativeOutputPayload() { return this.params; },
    async _openNativeOutputWindow(options) {
      assert.equal(options.sourceSwitch, true);
      assert.equal(options.deferPreviewRestart, true);
      events.push('native:camera');
      this.nativeOutputExclusiveCameraActive = true;
    },
    async _restartStaticSourceFast() { events.push(`preview:${this.params.mediaType}`); },
    _syncNativeOutputWindow() { events.push(`sync:${this.params.mediaType}`); }
  });
  return app;
}
const app = fixture();
let finishOldSync;
app.nativeOutputSyncPromise = new Promise((resolve) => { finishOldSync = resolve; });
const image = app._switchStaticSource({ mediaType: 'image', mediaUrl: 'demo.svg' });
const camera = app._switchStaticSource({ mediaType: 'camera', mediaUrl: 'camera:' });
await new Promise(setImmediate);
assert.equal(app.params.mediaType, 'camera', 'must drain prior IPC before changing source identity');
assert.deepEqual(events, []);
finishOldSync();
await Promise.all([image, camera]);
assert.deepEqual(events, [
  'stop-browser-camera', 'native:image', 'preview:image', 'sync:image',
  'native:camera', 'preview:camera', 'sync:camera'
]);
assert.equal(app.nativeOutputSourceSwitching, false);
assert.equal(app.nativeOutputExclusiveCameraActive, true);
assert.equal(app.nativeOutputSourceSwitchPromise, null);

events.length = 0;
const mac = fixture(false);
await mac._switchStaticSource({ mediaType: 'image', mediaUrl: 'demo.svg' });
assert.deepEqual(events, ['stop-browser-camera', 'preview:image'], 'non-Windows lifecycle must remain unchanged');

events.length = 0;
const failed = fixture();
failed._restartStaticSourceFast = async () => { throw new Error('decode failed'); };
await assert.rejects(failed._switchStaticSource({ mediaType: 'image', mediaUrl: 'bad.png' }), /decode failed/);
assert.equal(failed.nativeOutputSourceSwitching, false, 'failed loads must release the sync guard');
assert.equal(failed.nativeOutputSourceSwitchPromise, null);
assert.equal(failed.nativeOutputExclusiveCameraActive, false);

const activateMethod = appSource.slice(appSource.indexOf('    async _activateCameraSource('), appSource.indexOf('    async _activateCustomSource('));
const Activation = new Function('normalizeParams', 'cameraSourceName', 'CAMERA_MEDIA_URL', `return class { ${activateMethod} }`)(
  (params) => params, () => 'Camera', 'camera:'
);
const activation = new Activation();
Object.assign(activation, {
  params: {}, nativeOutputCapabilities: { nativeCameraPreviewBridge: true },
  _clearLocalObjectUrl() {},
  _ensureCameraMixer() { throw new Error('camera acquired before queued handoff'); },
  async _switchStaticSource(params) { assert.equal(params.mediaType, 'camera'); }
});
await activation._activateCameraSource();

const metaMethod = appSource.slice(appSource.indexOf('    _nativeCameraOutputMeta('), appSource.indexOf('    _nativeOutputParams('));
const Metadata = new Function('selectedCameraDeviceIds', 'cameraConstraintKey', `return class { ${metaMethod} }`)(
  () => ['camera-1'], (params) => `${params.cameraResolution}:${params.cameraFps}`
);
const metadata = new Metadata();
Object.assign(metadata, {
  params: { cameraResolution: 'auto', cameraFps: 30 },
  nativeOutputCapabilities: { nativeCameraPreviewBridge: true },
  cameraStreams: new Map([['camera-1', { getVideoTracks: () => [{ getSettings: () => ({ width: 640, height: 480 }) }] }]]),
  _canUseNativeCameraOutputWindow: () => true,
  _cameraDeviceLabel: () => 'Webcam',
});
const beforeRelease = metadata._nativeCameraOutputMeta();
metadata.cameraStreams.clear();
assert.deepEqual(metadata._nativeCameraOutputMeta(), beforeRelease,
  'releasing the browser camera must not change native source identity/resolution');
metadata.params.cameraResolution = '1280x720';
assert.equal(metadata._nativeCameraOutputMeta().captureWidth, null, 'a deliberate constraint change invalidates cached metadata');
console.log('Windows camera lifecycle ordering passed.');

const preview = Object.create(WebGPURenderer.prototype);
preview.source = { isNativeOutputPreview: true, width: 480, height: 360 };
preview.canvas = { style: {} };
let textures = 0;
preview._createCellTexture = () => { textures++; };
preview._createStableBindGroups = () => {};
const acid = { cols: 620, autoRows: true, cellWidth: 1, cellHeight: 2, aspectCorrection: 1 };
syncNativePreviewGeometry(preview, acid);
assert.deepEqual([preview.cols, preview.rows, preview.canvasWidth, preview.canvasHeight], [620, 233, 620, 466]);
preview.source.width = 640;
syncNativePreviewGeometry(preview);
assert.deepEqual([preview.cols, preview.rows, preview.canvasWidth, preview.canvasHeight], [620, 174, 620, 348]);
assert.equal(preview.canvas.style.aspectRatio, '640 / 360');
const arcade = { ...acid, cols: 520, cellWidth: 2, cellHeight: 3 };
syncNativePreviewGeometry(preview, arcade);
assert.deepEqual([preview.cols, preview.rows, preview.canvasWidth, preview.canvasHeight], [520, 195, 1040, 585]);
syncNativePreviewGeometry(preview, arcade);
assert.equal(textures, 3, 'steady frames must reuse GPU geometry resources');
preview.source.isNativeOutputPreview = false;
syncNativePreviewGeometry(preview, acid);
assert.equal(textures, 3, 'ordinary media renderers are untouched');
console.log('Native preview geometry resize and preset regression passed.');
