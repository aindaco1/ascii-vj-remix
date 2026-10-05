import assert from 'node:assert/strict';
import { protectWtfVisibility } from '../renderers/shared/wtf-visual-safety.js';
import { wtfCellSignal } from '../renderers/shared/wtf-visual-probe.js';
import { processGpuCellColor } from '../renderers/shared/render-math.js';
import { AUDIO_REACTIVE_DEFAULTS, AUDIO_REACTIVE_PRESETS, applyAudioReactiveModulation, emptyAudioReactiveFeatures } from '../renderers/shared/audio-reactive.js';
const base={contrastBoost:3,brightness:.3,gamma:.3,bgBlend:.8,quantizeBits:6,saturationBoost:1,brightOutput:false,accentSubtleLimit:false,visualMode:'flat'};
const safe=protectWtfVisibility(base);
assert.equal(base.contrastBoost,3);
assert.equal(safe.brightOutput,false);assert.equal(safe.accentSubtleLimit,false);
assert.deepEqual(protectWtfVisibility(safe),safe);
assert.deepEqual([safe.contrastBoost,safe.brightness,safe.gamma,safe.bgBlend,safe.quantizeBits],[1.1,1,1.35,.25,3]);
assert.ok(processGpuCellColor(40,40,40,safe).slice(0,3).every(v=>v>30),'visible shadows must survive');
assert.deepEqual(processGpuCellColor(0,0,0,{...safe,bgBlend:0}),[0,0,0],'do not synthesize light in black input');
const loud=Object.fromEntries(Object.keys(emptyAudioReactiveFeatures()).map(k=>[k,1]));
for(const preset of AUDIO_REACTIVE_PRESETS){
    const audio=applyAudioReactiveModulation(safe,loud,{...AUDIO_REACTIVE_DEFAULTS,preset:preset.id,sensitivity:12,beatAmount:3,bassAmount:3,midAmount:3,trebleAmount:3,noiseFloor:0});
    const live=protectWtfVisibility(audio);
    assert.ok(processGpuCellColor(40,40,40,live).slice(0,3).every(v=>v>30),preset.id);
}
const cells=Uint8Array.from([200,200,200,127,160,160,160,255]);
const p={backgroundColor:'#000000',glyphColorMode:'fixed',glyphColor:'#000000'};
assert.equal(wtfCellSignal(cells,p,new Float32Array([.2,.4])).average,0,'fixed black glyphs are not bright cells');
assert.equal(wtfCellSignal(cells,{...p,glyphColor:'#ffffff'},new Float32Array(2)).average,0,'blank glyph ramps are not bright cells');
assert.ok(wtfCellSignal(cells,{...p,glyphColor:'#ffffff'},new Float32Array([.2,.4])).average>50);
console.log('WTF shadow, glyph coverage, fixed-color, preference, and audio-limit checks passed.');
