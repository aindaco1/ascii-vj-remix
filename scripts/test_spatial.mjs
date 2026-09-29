import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { SPATIAL_DEFAULTS as defaults, SPATIAL_KEYS, spatialParams, fillSpatialUniforms, spatialGlyphRamp, specialGlyphsEnabled } from '../renderers/shared/spatial.js';
import { createCycleTransport, setCycleTransportRate, cycleTimeAt } from '../renderers/shared/palette-cycling.js';
import { traceSpatialRay, createSpatialSampler, renderSpatialCells } from '../renderers/shared/spatial-canvas.js';
import { applyAudioReactiveModulation } from '../renderers/shared/audio-reactive.js';
import { SPATIAL_PRESETS } from '../renderers/shared/spatial-presets.js';
import { processGpuCellColor } from '../renderers/shared/render-math.js';
import { spatialMediaFixture, spatialMediaDifference } from '../tests/fixtures/spatial-media.js';

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
assert.deepEqual(spatialParams({}), defaults);
const bad=spatialParams({visualMode:'bad', sceneFov:Infinity, sceneSeed:-4, sceneMedia:4, sceneFreeze:'true'});
assert.equal(bad.visualMode,'flat');assert.equal(bad.sceneFov,70);assert.equal(bad.sceneSeed,1);assert.equal(bad.sceneMedia,1);assert.equal(bad.sceneFreeze,false);
assert.equal(specialGlyphsEnabled(defaults), false);
assert.equal(spatialGlyphRamp('abc',defaults),'abc');
assert.equal([...spatialGlyphRamp('A'.repeat(96),{...defaults,edgeAmount:1})].length,96);
for(const preset of SPATIAL_PRESETS){
    assert.equal(preset.params.backend,'auto');
    assert.equal('brightOutput' in preset.params,false,'presets must preserve the global preference');
    assert.equal('mediaUrl' in preset.params,false);assert.equal('sourceMode' in preset.params,false);
    for(const key of SPATIAL_KEYS) assert.ok(key in preset.params,`${preset.id} lacks ${key}`);
}
let h=traceSpatialRay([.5,2,.5],[0,0,1],(_x,z)=>z===1?[1,1]:z===3?[4,2]:[0,0]);
near(h.distance,2.5);assert.equal(h.material,2);assert.deepEqual(h.normal,[0,0,-1]);
h=traceSpatialRay([.5,2,.5],[0,-.5,1],(_x,z)=>z===2?[1,3]:[0,0]);
near(h.distance,2);assert.deepEqual(h.normal,[0,1,0]);
h=traceSpatialRay([.5,1,.5],[-1,0,0],(x)=>x===-2?[3,1]:[0,0]);near(h.distance,1.5);
for(const direction of [[0,0,1],[0,0,-1],[1,0,0],[0,1,0],[1,0,1]]){
    h=traceSpatialRay([0,1,0],direction,()=>[0,0]);assert.equal(h.distance,40);assert.equal(h.material,0);assert.ok(h.point.every(Number.isFinite));
}
// Rectilinear camera-plane rays hit a perpendicular wall at the same depth.
for(const x of [-.6,0,.6])near(traceSpatialRay([.5,1,.5],[x,0,1],(_x,z)=>z===5?[3,1]:[0,0]).distance,4.5);
const clock=createCycleTransport(1,1000);near(cycleTimeAt(clock,2500),1.5);
setCycleTransportRate(clock,-1,2500);near(cycleTimeAt(clock,3000),1);
setCycleTransportRate(clock,0,3000);near(cycleTimeAt(clock,8000),1);
const p={...defaults,visualMode:'city',sceneWet:0,sceneRain:0,sceneGlow:0,sceneSpeed:0,sceneTransport:createCycleTransport(0,1000),cellWidth:8,cellHeight:12};
const source=()=>[.2,.4,.8];source.aspect=16/9;
const a=createSpatialSampler(p,source,16/9,0),b=createSpatialSampler(p,source,16/9,32);
for(const uv of [[.1,.2],[.4,.8],[.8,.5]])a(...uv).color.forEach((c,i)=>near(c,b(...uv).color[i]));
function decay(hz){
    const state={},out=new Float32Array(40),params={...p,feedbackAmount:.98,feedbackHalfLife:.7};let remaining=1;
    fillSpatialUniforms(out,params,120,45,10,state,1000);
    for(let i=1;i<=hz;i++){fillSpatialUniforms(out,params,120,45,10,state,1000+i*1000/hz);remaining*=out[18];}
    return remaining;
}
near(decay(30),decay(60));
const data=new Float32Array(40),state={};fillSpatialUniforms(data,p,120,45,10,state,1000);assert.equal(data[21],0);
fillSpatialUniforms(data,p,120,45,10,state,1017);assert.equal(data[21],1);
fillSpatialUniforms(data,{...p,sceneSeed:8},120,45,10,state,1034);assert.equal(data[21],0);
fillSpatialUniforms(data,p,120,45,10,state,3000);assert.equal(data[21],0);
const pixels=new Uint8ClampedArray(32*18*4).fill(255),canvasState={};
const cpu=renderSpatialCells(p,pixels,32,18,32,18,(c)=>[...c,c.reduce((a,n)=>a+n,0)/3],canvasState,1000);
assert.equal(cpu.length,32*18*4);assert.ok(cpu.some(n=>n>0));
const firstBuffer=cpu,historyBuffer=canvasState.history,secondBuffer=renderSpatialCells(p,pixels,32,18,32,18,c=>[...c,128],canvasState,1017);
assert.equal(firstBuffer,secondBuffer);assert.notEqual(historyBuffer,canvasState.history);assert.equal(renderSpatialCells(p,pixels,32,18,32,18,c=>[...c,128],canvasState,1034),firstBuffer);
const audio=applyAudioReactiveModulation(p,{bass:1,beatPulse:1,presence:1,treble:1},{sensitivity:12});
assert.ok(audio.sceneFov>=p.sceneFov&&audio.sceneFov<=110);assert.ok(audio.sceneHeight<=3);assert.equal(audio.sceneTransport,p.sceneTransport);assert.equal(audio.sceneSpeed,p.sceneSpeed);
assert.equal(applyAudioReactiveModulation({...p,visualMode:'flat'},{bass:1},{sensitivity:12}).sceneHeight,p.sceneHeight);

for (const fixture of JSON.parse(readFileSync(new URL('../tests/fixtures/spatial-uniforms.json',import.meta.url),'utf8'))) {
    const p=spatialParams(fixture.input),state={},out=new Float32Array(40);
    for(const sample of fixture.samples){fillSpatialUniforms(out,p,fixture.cols,fixture.rows,fixture.baseGlyphCount,state,sample.now);out.forEach((n,i)=>near(n,sample.expected[i]));}
}

// Dim trails must continue decaying: byte-only history would stall above black.
const trailParams={...defaults,feedbackAmount:1,feedbackHalfLife:3,sceneTransport:createCycleTransport(0,0)},trailState={};
let flash=new Uint8ClampedArray(16*4).fill(255);
renderSpatialCells(trailParams,flash,4,4,4,4,c=>[...c,255],trailState,1000);
flash.fill(0);
let tail;
for(let frame=1;frame<=270;frame++)tail=renderSpatialCells(trailParams,flash,4,4,4,4,c=>[...c,0],trailState,1000+frame*1000/30);
assert.ok(Math.abs(tail[0]-32)<=1,`three half-lives should reach 1/8 intensity, got ${tail[0]}`);

// Compare immediately across the wrap, including rays that see geometry beyond
// the seam. Equal snapshots at t=0 and t=32 alone miss nonperiodic ceiling ribs.
for (const visualMode of ['city','corridor','coast','cathedral','relief']) {
    const params={...p,visualMode,sceneMedia:0};
    const before=createSpatialSampler(params,source,16/9,31.999999);
    const after=createSpatialSampler(params,source,16/9,32.000001);
    for(let y=0;y<30;y++)for(let x=0;x<50;x++){
        const uv=[(x+.5)/50,(y+.5)/30];
        before(...uv).color.forEach((n,i)=>assert.ok(Math.abs(n-after(...uv).color[i])<.001,`${visualMode} wrap seam`));
    }
}
const mediaResponse = [];
for (const preset of SPATIAL_PRESETS.filter(p => p.params.visualMode !== 'flat')) {
    const params = {...preset.params, sceneFreeze:true, sceneOffset:2.137, sceneTransport:createCycleTransport(0,0)};
    const render = horizontal => renderSpatialCells(params, spatialMediaFixture(64,48,horizontal),64,48,96,54,
        (rgb,x,y)=>processGpuCellColor(...rgb,params,x,y),{},1000);
    const response = spatialMediaDifference(render(false),render(true));
    assert.ok(response.meanRgbDifference > 10,`${preset.id}: source detail is too weak ${JSON.stringify(response)}`);
    assert.ok(response.changedShapeFraction > .15,`${preset.id}: too few cells follow source shapes`);
    assert.ok(response.changedGlyphFraction > .1,`${preset.id}: material glyphs obscure source shapes`);
    mediaResponse.push({preset:preset.id,...response});
}
console.log('Spatial geometry, projection, wrap seams, transport, bounded audio, presets and floating-point history passed.');
console.log('Source-content response:', JSON.stringify(mediaResponse));

// Same source, time, and grid: presets must differ in their actual projected
// content, even before distinct glyph ramps or density make them look different.
const sceneFrames = SPATIAL_PRESETS.filter(p=>p.params.visualMode!=='flat').map(preset=>{
    const params={...preset.params,sceneFreeze:true,sceneOffset:2.137,sceneTransport:createCycleTransport(0,0)};
    const pixels=new Uint8ClampedArray(64*48*4);
    for(let y=0;y<48;y++)for(let x=0;x<64;x++)pixels.set([4+x*.3,3+y*.3,2+(x+y)%17,255],(y*64+x)*4);
    const cells=renderSpatialCells(params,pixels,64,48,96,54,(rgb,x,y)=>processGpuCellColor(...rgb,params,x,y),{},1000);
    return {id:preset.id,cells};
});
let minimumDifference=1;
for(let i=0;i<sceneFrames.length;i++)for(let j=i+1;j<sceneFrames.length;j++){
    const difference=spatialMediaDifference(sceneFrames[i].cells,sceneFrames[j].cells);
    minimumDifference=Math.min(minimumDifference,difference.changedShapeFraction);
    assert.ok(difference.changedShapeFraction>.2,`Similar compositions: ${sceneFrames[i].id} / ${sceneFrames[j].id}: ${JSON.stringify(difference)}`);
}
console.log('Minimum spatial preset difference on one dark source:',minimumDifference);

// Catalog removals must not invalidate saved looks; IDs and uniforms stay stable.
assert.ok(!SPATIAL_PRESETS.some(p=>p.id==='brightness-relief'));
assert.equal(SPATIAL_PRESETS.find(p=>p.id==='orbital-chamber').name,'Orbital Chamber');
assert.equal(spatialParams({visualMode:'relief'}).visualMode,'relief');
const fractalModes=['ruins','mandelbrot','mandelbulb','mandelbox'];
const patterned=(u,v)=>[fract(u*3),fract(v*2),.7];
function fract(n){return n-Math.floor(n);}
for(const visualMode of fractalModes){
    for(const detail of [2,8])for(const fractalZoom of [.5,3]){
        const p={...defaults,visualMode,fractalDetail:detail,fractalZoom,fractalMorph:detail===2?0:1};
        for(const t of [-127,0,48,127]){
            const sample=createSpatialSampler(p,patterned,16/9,t);
            for(const uv of [[0,0],[.5,.5],[1,1],[.7,.3]])assert.ok(sample(...uv).color.every(Number.isFinite),`${visualMode}: nonfinite at parameter limits`);
        }
    }
    for(const key of ['fractalZoom','fractalDetail','fractalMorph']){
        const values=key==='fractalZoom'?[.6,2]:key==='fractalDetail'?[2,8]:[0,1];
        const samplers=values.map(value=>createSpatialSampler({...defaults,visualMode,[key]:value},patterned,16/9,2.137));
        let changed=0;
        for(let y=0;y<12;y++)for(let x=0;x<20;x++){
            const uv=[(x+.5)/20,(y+.5)/12],a=samplers[0](...uv).color,b=samplers[1](...uv).color;
            if(a.some((v,i)=>Math.abs(v-b[i])>.01))changed++;
        }
        assert.ok(changed>0,`${visualMode}: ${key} has no visible effect`);
    }
}
console.log('Fractal parameter limits, live geometry controls and saved relief compatibility passed.');
