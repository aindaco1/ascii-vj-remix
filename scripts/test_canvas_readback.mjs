#!/usr/bin/env node
import assert from 'node:assert/strict';
import { safeCanvasImageData } from '../renderers/shared/canvas-readback.js';

const image = { data: new Uint8ClampedArray([1, 2, 3, 255]) };
const context = {
  getImageData(x, y, width, height) {
    assert.deepEqual([x, y, width, height], [0, 0, 1, 1]);
    return image;
  }
};
assert.equal(safeCanvasImageData(context, 0, 0, 1, 1), image);

const securityError = Object.assign(new Error('The operation is insecure.'), {
  name: 'SecurityError',
  code: 18
});
let captured = null;
const blocked = safeCanvasImageData({
  getImageData() {
    throw securityError;
  }
}, 0, 0, 1, 1, (error) => {
  captured = error;
});
assert.equal(blocked, null);
assert.equal(captured, securityError);
assert.equal(safeCanvasImageData(null, 0, 0, 1, 1), null);

console.log('Canvas readback tests passed.');
