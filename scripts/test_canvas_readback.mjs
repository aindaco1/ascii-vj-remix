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

const { uploadStaticImage } = await import('../renderers/shared/canvas-readback.js');
const pixels = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]);
let reads = 0;
const source = {isImage: true, width: 1, height: 2,
  canvas: {getContext: () => ({getImageData: () => { reads++; return {data:pixels,width:1,height:2}; }})}};
const blockedUpload = () => { throw securityError; };
let uploaded;
uploadStaticImage(source, blockedUpload, data => { uploaded = [...data]; }, true);
assert.deepEqual(uploaded, [0, 0, 255, 255, 255, 0, 0, 255]);
uploadStaticImage(source, blockedUpload, data => { uploaded = [...data]; });
assert.deepEqual(uploaded, [...pixels]);
assert.equal(reads, 1);
assert.throws(() => uploadStaticImage({isImage:true,canvas:{getContext:()=>({getImageData:blockedUpload})}}, blockedUpload, () => assert.fail('tainted data uploaded')), {name:'SecurityError'});
assert.throws(() => uploadStaticImage({isVideo:true}, blockedUpload, () => assert.fail('video readback')), {name:'SecurityError'});
let directCalls = 0;
uploadStaticImage(source, () => { directCalls++; }, () => assert.fail('unneeded readback'));
assert.equal(directCalls, 1);
console.log('Readable-image upload recovery, orientation, caching and tainted-image rejection passed.');
