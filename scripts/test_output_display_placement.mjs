import assert from 'node:assert/strict';
import {
  browserScreenPlacement,
  displayPreferenceIndex,
  monitorId,
  monitorLabel,
  monitorLogicalRect,
  nativeCameraOutputMode,
  nativeMirrorFrameSize,
  nativeMirrorTargetFps,
  outputDisplaysFromMonitors,
  selectBrowserScreen,
  selectMonitor
} from '../renderers/desktop/output-display.js';

function logical(value) {
  return {
    toLogical(scaleFactor) {
      return Object.fromEntries(
        Object.entries(value).map(([key, number]) => [key, number / scaleFactor])
      );
    }
  };
}

const primary = {
  name: 'Built-in Retina',
  scaleFactor: 2,
  position: { x: 0, y: 0 },
  size: { width: 1728, height: 1117 },
  workArea: {
    position: logical({ x: 0, y: 0 }),
    size: logical({ width: 3456, height: 2160 })
  }
};

const secondary = {
  name: 'Studio Display',
  scaleFactor: 1,
  position: { x: 1728, y: 0 },
  size: { width: 1920, height: 1080 },
  workArea: {
    position: { x: 1728, y: 0 },
    size: { width: 1920, height: 1040 }
  }
};

const projector = {
  name: 'Projector',
  scaleFactor: 1,
  position: { x: -1280, y: 80 },
  size: { width: 1280, height: 720 }
};

const monitors = [primary, secondary, projector];

assert.equal(displayPreferenceIndex('auto'), null);
assert.equal(displayPreferenceIndex('display:2:Projector:-1280,80,1280x720'), 2);
assert.equal(displayPreferenceIndex('display:x:bad'), null);

assert.deepEqual(monitorLogicalRect(primary), {
  position: { x: 0, y: 0 },
  size: { width: 1728, height: 1080 }
});
assert.equal(monitorId(secondary, 1), 'display:1:Studio Display:1728,0,1920x1040');
assert.equal(monitorLabel(secondary, 1), 'Studio Display 1920x1040');
assert.deepEqual(outputDisplaysFromMonitors(monitors).map((display) => display.label), [
  'Built-in Retina 1728x1080',
  'Studio Display 1920x1040',
  'Projector 1280x720'
]);

assert.equal(selectMonitor(monitors, 'auto'), secondary);
assert.equal(selectMonitor(monitors, monitorId(projector, 2)), projector);
assert.equal(selectMonitor(monitors, 'display:9:stale'), secondary);
assert.equal(selectMonitor([primary], 'auto'), primary);
assert.equal(selectMonitor([], 'auto'), null);

const browserPrimary = {
  isPrimary: true,
  availLeft: 0,
  availTop: 0,
  availWidth: 1440,
  availHeight: 900
};
const browserSecondary = {
  isPrimary: false,
  availLeft: 1440,
  availTop: 0,
  availWidth: 1920,
  availHeight: 1080
};
const browserVertical = {
  isPrimary: false,
  left: 0,
  top: -1200,
  width: 1600,
  height: 1200
};
const browserScreens = [browserPrimary, browserSecondary, browserVertical];

assert.equal(selectBrowserScreen(browserScreens, browserPrimary, 'auto'), browserSecondary);
assert.equal(selectBrowserScreen(browserScreens, browserPrimary, 'display:2:browser-vertical'), browserVertical);
assert.equal(selectBrowserScreen(browserScreens, browserPrimary, 'display:8:stale'), browserSecondary);
assert.equal(selectBrowserScreen([browserPrimary], browserPrimary, 'auto'), browserPrimary);
assert.equal(selectBrowserScreen([], browserPrimary, 'auto'), browserPrimary);
assert.deepEqual(browserScreenPlacement(browserVertical), {
  x: 0,
  y: -1200,
  width: 1600,
  height: 1200
});

const cameraParams = { sourceMode: 'static', mediaType: 'camera' };
assert.equal(nativeCameraOutputMode(cameraParams, { nativeCamera: true }, true), 'native-camera');
assert.equal(nativeCameraOutputMode(cameraParams, { nativeCamera: false, mirror: true }, true), 'mirror');
assert.equal(nativeCameraOutputMode(cameraParams, {}, true), 'mirror');
assert.equal(nativeCameraOutputMode(cameraParams, { nativeCamera: true }, false), null);
assert.equal(nativeCameraOutputMode({ sourceMode: 'static', mediaType: 'video' }, { nativeCamera: true }, true), null);

assert.equal(nativeMirrorTargetFps(60), 15);
assert.equal(nativeMirrorTargetFps(60, true), 30);
assert.equal(nativeMirrorTargetFps(24), 15);
assert.equal(nativeMirrorTargetFps(24, true), 24);
assert.equal(nativeMirrorTargetFps(2), 6);
assert.equal(nativeMirrorTargetFps(undefined), 12);
assert.deepEqual(nativeMirrorFrameSize(1920, 1080), { width: 800, height: 450 });
assert.deepEqual(nativeMirrorFrameSize(1920, 1080, false, true), { width: 960, height: 540 });
assert.deepEqual(nativeMirrorFrameSize(1920, 1080, true), { width: 640, height: 360 });
assert.deepEqual(nativeMirrorFrameSize(1280, 960, true), { width: 480, height: 360 });
assert.deepEqual(nativeMirrorFrameSize(320, 240), { width: 320, height: 240 });
assert.deepEqual(nativeMirrorFrameSize(0, 1080), { width: 0, height: 0 });

console.log('Output display placement simulation passed.');
