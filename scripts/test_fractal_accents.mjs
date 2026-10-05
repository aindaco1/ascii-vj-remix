import assert from 'node:assert/strict';
import { SPATIAL_DEFAULTS, SPATIAL_CONTRACT, SPATIAL_TWEEN_KEYS, spatialParams, FRACTAL_VARIATIONS } from '../renderers/shared/spatial.js';
import { FRACTAL_ACCENT_PRESETS, retainedPresetAccents, randomWtfAccentParams } from '../renderers/shared/fractal-accent-presets.js';
import { renderSpatialCells } from '../renderers/shared/spatial-canvas.js';
import { processGpuCellColor, shaderHash } from '../renderers/shared/render-math.js';
import { applyAudioReactiveModulation } from '../renderers/shared/audio-reactive.js';
import { createCycleTransport } from '../renderers/shared/palette-cycling.js';

const width=64,height=48,cols=48,rows=32;
const pixels=new Uint8ClampedArray(width*height*4);
for(let y=0;y<height;y++)for(let x=0;x<width;x++)pixels.set([x*4,y*5,(x+y)%2?190:20,255],(y*width+x)*4);
const base={...SPATIAL_DEFAULTS,sceneTransport:createCycleTransport(0,0),sceneFreeze:true,
    cellWidth:8,cellHeight:12,charset:'classic-camera',glyphDepth:96,saturationBoost:1,
    contrastBoost:1,brightness:1,gamma:1,bgBlend:0,quantizeBits:0,ditherMode:'none',paletteId:'none'};
const render=(p,input=pixels,state={},now=1000)=>renderSpatialCells(p,input,width,height,cols,rows,
    (rgb,x,y)=>processGpuCellColor(...rgb,p,x,y),state,now).slice();
const luma=c=>c[0]*.2126+c[1]*.7152+c[2]*.0722;
assert.equal(SPATIAL_DEFAULTS.accentSubtleLimit,true);
assert.ok(!SPATIAL_TWEEN_KEYS.includes('accentVariation'));
assert.equal(spatialParams({accentVariation:999,accentAmount:Infinity}).accentVariation,FRACTAL_VARIATIONS.length-1);
const plain=render(base), reports=[];
for(const preset of FRACTAL_ACCENT_PRESETS){
    assert.equal(preset.params.visualMode,'flat');
    assert.equal(preset.params.backend,'auto');
    assert.equal('accentSubtleLimit' in preset.params,false);
    const p={...base,...preset.params,sceneTransport:base.sceneTransport,sceneFreeze:true};
    // A zero control is an exact bypass, including when a saved preset selected another style.
    assert.deepEqual(render({...base,accentStyle:p.accentStyle,accentAmount:0}),plain);
    assert.deepEqual(render({...base,accentStyle:p.accentStyle,accentAmount:1,accentCoverage:0}),plain);
    if(p.accentPlacement==='trails')continue;
    const unaccented=render({...p,accentAmount:0}), on=render(p);
    let changed=0,glyphChanged=0,maxLuma=0,maxChannel=0;
    for(let i=0;i<on.length;i+=4){
        const d=[0,1,2].map(c=>on[i+c]-unaccented[i+c]);
        if(d.some(n=>Math.abs(n)>=1))changed++;
        maxLuma=Math.max(maxLuma,Math.abs(luma(d)));
        maxChannel=Math.max(maxChannel,...d.map(Math.abs));
        if(Math.abs(on[i+3]-unaccented[i+3])>=2)glyphChanged++;
    }
    assert.ok(changed>50,`${preset.id} is invisible`);
    assert.ok(glyphChanged>20,`${preset.id} is invisible with fixed-color glyphs`);
    const hot=render({...p,accentAmount:1,accentCoverage:1});
    for(let i=0;i<hot.length;i+=4){
        const d=[0,1,2].map(c=>hot[i+c]-unaccented[i+c]);
        assert.ok(Math.abs(luma(d))<=42,`${preset.id}: luminance ceiling`);
        assert.ok(d.every(n=>Math.abs(n)<=57),`${preset.id}: color ceiling`);
        assert.ok(Math.abs(hot[i+3]-unaccented[i+3])<=27,`${preset.id}: glyph ceiling`);
    }
    assert.ok(FRACTAL_VARIATIONS.some((_,accentVariation)=>render({...p,accentVariation}).some((n,i)=>n!==on[i])),`${preset.id}: variants identical`);
    reports.push({preset:preset.id,changedCells:changed,glyphChanged,maxLuma,maxChannel});
}
// Every optional scene uses the same accent layer, including a single-ray glass warp.
for(const [visualMode] of SPATIAL_CONTRACT.visualMode.options)for(const recipe of FRACTAL_ACCENT_PRESETS.slice(0,5)){
    const p={...base,...recipe.params,visualMode,sceneMedia:.85,sceneFreeze:true,sceneTransport:base.sceneTransport};
    const plain=render({...p,accentStyle:'off'}), on=render(p);
    assert.ok(on.some((n,i)=>Math.abs(n-plain[i])>2),`${visualMode}/${recipe.id} is invisible`);
}
// Monochrome solid cells and fixed-color glyphs both receive color-current tone.
const mono={...base,...FRACTAL_ACCENT_PRESETS[4].params,saturationBoost:0};
const monoOff=render({...mono,accentAmount:0}),monoOn=render(mono);
assert.ok(monoOn.some((n,i)=>i%4===3&&Math.abs(n-monoOff[i])>2));
assert.ok(monoOn.some((n,i)=>i%4<3&&Math.abs(n-monoOff[i])>2));
assert.deepEqual(render({...base,accentStyle:'off',accentAmount:1}),plain);
// Built-ins retain accents; accent recipes and saved looks restore their own.
const current={...base,accentStyle:'chroma',accentAmount:.4,accentVariation:3};
assert.equal(retainedPresetAccents({readonly:true,id:'classic-camera-ascii'},current).accentAmount,.4);
assert.equal(retainedPresetAccents({readonly:true,id:'classic-camera-ascii'},{...current,accentStyle:'off'}).accentStyle,'off');
assert.deepEqual(retainedPresetAccents(FRACTAL_ACCENT_PRESETS[0],current),{});
assert.deepEqual(retainedPresetAccents({readonly:false,id:'custom'},current),{});
assert.ok(!('accentSubtleLimit' in retainedPresetAccents({readonly:true},current)));
// Deterministic draws cover every recipe/variation, Off, and bounded extremes.
assert.equal(randomWtfAccentParams(()=>.34999).accentStyle,'off');
for(let recipe=0;recipe<6;recipe++)for(let variation=0;variation<6;variation++){
    const draws=[.35,(recipe+.5)/6,0,.99999,0,.99999,0,(variation+.5)/6];
    const p=randomWtfAccentParams(()=>draws.shift());
    assert.equal(p.accentStyle,FRACTAL_ACCENT_PRESETS[recipe].params.accentStyle);
    assert.equal(p.accentPlacement,FRACTAL_ACCENT_PRESETS[recipe].params.accentPlacement);
    assert.equal(p.accentVariation,variation);
    assert.ok(p.accentAmount>=.24&&p.accentAmount<=.48);
    assert.ok(!('accentSubtleLimit' in p));
    assert.equal(draws.length,0);
}
// Enabling a near-zero accent preserves flat sample offsets and jitter.
const sampled={...base,accentAmount:.000001,accentMotion:0,sampleX:.2,sampleY:.8,jitterAmount:.4,jitterSpeed:.7};
const sampleTime=1.23;
const sampledCells=renderSpatialCells(sampled,pixels,width,height,cols,rows,(rgb,x,y)=>processGpuCellColor(...rgb,sampled,x,y),{},1000,sampleTime);
for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
    const sx=x+sampleTime*.7*7.13,sy=y+sampleTime*.7*11.71;
    const px=Math.max(0,Math.min(width-1,Math.trunc((x+.2+(shaderHash(sx,sy)-.5)*.4)*width/cols)));
    const py=Math.max(0,Math.min(height-1,Math.trunc((y+.8+(shaderHash(sx+37,sy+91)-.5)*.4)*height/rows)));
    const expected=processGpuCellColor(...pixels.slice((py*width+px)*4,(py*width+px)*4+3),sampled,x,y);
    for(let c=0;c<3;c++)assert.ok(Math.abs(sampledCells[(y*cols+x)*4+c]-expected[c])<=1);
}
const audio=applyAudioReactiveModulation({...base,accentAmount:.1,accentAudio:1},{rms:1,presence:1,beatPulse:1},{sensitivity:12});
assert.ok(audio.accentAmount>.1&&audio.accentAmount<=.13);
assert.equal(applyAudioReactiveModulation(base,{presence:1},{sensitivity:12}).accentAmount,0);
const p={...base,accentAmount:.2,accentMotion:0},state={};render(p,pixels,state,1000);
const field=state.accentField,copy=field.slice();render(p,pixels,state,2000);
assert.equal(state.accentField,field);assert.deepEqual(field,copy);
// Lace modifies only decaying history, and cannot keep an old frame alive.
const lace={...base,...FRACTAL_ACCENT_PRESETS.at(-1).params,sceneFreeze:false,sceneTransport:base.sceneTransport};
const history={},flash=new Uint8ClampedArray(pixels.length).fill(255),black=new Uint8ClampedArray(pixels.length);
const first=render(lace,flash,history,1000),firstPlain=render({...lace,accentAmount:0},flash,{},1000);
assert.deepEqual(first,firstPlain);
const plainHistory={};render({...lace,accentAmount:0},flash,plainHistory,1000);
const accentedTail=render(lace,black,history,1000+1000/60);
const plainTail=render({...lace,accentAmount:0},black,plainHistory,1000+1000/60);
assert.ok(accentedTail.some((n,i)=>i%4<3&&n<plainTail[i]-2),'lace must visibly shape a trail');
assert.ok(accentedTail.some((n,i)=>i%4===3&&n<plainTail[i]-2),'lace must change fixed-color glyph trails');
assert.ok(accentedTail.every((n,i)=>i%4===3||n<=plainTail[i]),'lace must only attenuate a trail');
const frozen=render({...lace,sceneFreeze:true},black,history,1040);
assert.deepEqual(render({...lace,sceneFreeze:true},black,history,1080),frozen,'frozen trails must remain stable');
let tail;
for(let i=6;i<=120;i++)tail=render(lace,black,history,1000+i*1000/60);
assert.ok(tail.filter((_,i)=>i%4!==3).every(n=>n<=2),'lace must decay to black');
// A preset without echo settings still gets short Trails; Off clears it.
const fallback={...lace,feedbackAmount:0},fallbackState={};
render(fallback,flash,fallbackState,1000);
assert.ok(render(fallback,black,fallbackState,1017).some((n,i)=>i%4<3&&n>0));
assert.ok(render({...fallback,accentStyle:'off'},black,fallbackState,1034).every(n=>n===0));
console.log('Fractal accents: bypass, distinct presets, variation, glyph/luminance/color bounds, audio, field reuse and trail decay passed.');
console.log(JSON.stringify(reports));
