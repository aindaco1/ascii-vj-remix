import assert from 'node:assert/strict';
import vectors from '../renderers/shared/palette-cycle-vectors.json' with { type: 'json' };
import { PALETTE_CONTRACT, validateCycleRanges, fillPaletteDisplay, createCycleTransport, setCycleTransportRate, cycleTimeAt } from '../renderers/shared/palette-cycling.js';
import { PALETTES, buildPaletteLut } from '../renderers/shared/palettes.js';
import { COLOR_CYCLE_PRESETS } from '../renderers/shared/color-cycle-presets.js';

const palette = { colors: vectors.colors, cycleRanges: validateCycleRanges(vectors.ranges, vectors.colors.length) };
const display = new Float32Array(PALETTE_CONTRACT.maxColors * 4);
for (const vector of vectors.cases) {
    fillPaletteDisplay(display, palette, { paletteCycleMode: vector.mode, paletteCycleAmount: vector.amount }, vector.time);
    vector.rgb.forEach((rgb, i) => {
        assert.deepEqual(Array.from(display.subarray(i * 4, i * 4 + 3), (c) => Math.round(c * 255)), rgb);
        const base = vectors.colors[i];
        assert.ok(Math.abs(display[i * 4 + 3] * 255 - (base[0] * .2126 + base[1] * .7152 + base[2] * .0722)) < 0.0001);
    });
}
for (const [now, expected] of vectors.clockCases) assert.ok(Math.abs(cycleTimeAt(vectors.clock, now) - expected) < 1e-9);
const clock = createCycleTransport(1, 0);
setCycleTransportRate(clock, 0, 1500);
assert.equal(cycleTimeAt(clock, 10000), 1.5);
setCycleTransportRate(clock, -2, 10000);
assert.equal(cycleTimeAt(clock, 11000), -.5);
setCycleTransportRate(clock, 2, 11000, 2000);
assert.equal(cycleTimeAt(clock, 13000), -.5);
assert.equal(cycleTimeAt(clock, 14000), 1.5);

const complete = { colors: Array.from({ length: 256 }, (_, i) => [i, 0, 255 - i]),
    cycleRanges: validateCycleRanges([{start:254,end:255,rate:1}], 256) };
fillPaletteDisplay(display, complete, {paletteCycleMode:'classic',paletteCycleAmount:1}, 1);
assert.equal(Math.round(display[254 * 4] * 255), 255);
assert.equal(Math.round(display[255 * 4] * 255), 254);
assert.equal(display[0], 0);
for (const ranges of [
    [{start:0,end:256,rate:1}], [{start:1,end:1,rate:1}], [{start:0,end:2,rate:NaN}],
    [{start:0,end:2,rate:1},{start:2,end:3,rate:1}],
    Array.from({length:9}, (_,i) => ({start:i*2,end:i*2+1,rate:1}))
]) assert.throws(() => validateCycleRanges(ranges, 256));
assert.equal(COLOR_CYCLE_PRESETS.length, 8);
for (const p of PALETTES.filter(p => p.cycleRanges.length)) {
    const lut = buildPaletteLut(p.id);
    const before = new Uint8Array(lut);
    for (const time of [0, .5, 1, 45]) fillPaletteDisplay(display, p, {paletteCycleMode:'blend',paletteCycleAmount:1}, time);
    assert.deepEqual(lut, before);
}
console.log('palette-cycling: shared vectors, phase continuity, stable luma, range validation and index 255 passed');
