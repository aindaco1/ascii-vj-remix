import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { findChromiumExecutable } from './lib/chromium.mjs';
const port=Number(process.env.SPATIAL_SMOKE_PORT||4176),url=`http://127.0.0.1:${port}`;
// Do not let iCloud filesystem events or another build hot-reload a GPU test.
const server=spawn(process.execPath,['--input-type=module','-e',
    `import {createServer} from 'vite'; const server=await createServer({server:{host:'127.0.0.1',port:${port},strictPort:true,hmr:false,watch:null},optimizeDeps:{noDiscovery:true,include:[]}}); await server.listen();`
],{stdio:'ignore'});
let browser;
try {
    for(let i=0;i<100;i++){try{if((await fetch(url)).ok)break;}catch{}await wait(100);}
    browser=await chromium.launch({executablePath:findChromiumExecutable({preferInstalled:true}),headless:process.env.SPATIAL_SMOKE_HEADLESS === '1',args:['--enable-unsafe-webgpu','--disable-gpu-sandbox']});
    const page=await browser.newPage({viewport:{width:1440,height:1000}}), errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error'||/validation|invalid|destroyed/i.test(m.text())){errors.push(m.text());console.error(m.text());}});
    // The installed Chromium driver intermittently returns an invalid startup
    // swapchain with both the baseline and candidate WebGPU renderer. Bootstrap
    // this numerical fixture on WebGL2, then exercise WebGPU explicitly below.
    // GPU diagnostics remain fatal; native presentation has its own sweep.
    await page.addInitScript(()=>localStorage.setItem('asciline-remix-state-v1', JSON.stringify({backend:'webgl2'})));
    await page.bringToFront();
    await page.goto(url);await page.waitForFunction(()=>window.ascilineRemix?.running);
    const result=await page.evaluate(async()=>{
        const {SPATIAL_DEFAULTS}=await import('/renderers/shared/spatial.js');
        const {SPATIAL_PRESETS}=await import('/renderers/shared/spatial-presets.js');
        const {spatialMediaFixture,spatialMediaDifference}=await import('/tests/fixtures/spatial-media.js');
        const {createCycleTransport,cycleNowMs}=await import('/renderers/shared/palette-cycling.js');
        const {renderSpatialCells}=await import('/renderers/shared/spatial-canvas.js');
        const {processGpuCellColor}=await import('/renderers/shared/render-math.js');
        const {createRenderer}=await import('/renderers/gpu/ascii/renderer/index.js');
        const a=window.ascilineRemix;await a.stop();
        const initial={...a.params},sourceCanvas=document.createElement('canvas');
        sourceCanvas.width=64;sourceCanvas.height=48;
        const sourceCtx=sourceCanvas.getContext('2d'),image=sourceCtx.createImageData(64,48);
        for(let y=0;y<48;y++)for(let x=0;x<64;x++)image.data.set([x*4,y*5,(x+y)*2,255],(y*64+x)*4);
        sourceCtx.putImageData(image,0,0);
        const source={element:sourceCanvas,canvas:sourceCanvas,isImage:true,isVideo:false,width:64,height:48,type:'image',ready:true,destroy(){},updateParams(){}};
        const originalLoad=a.loadStaticSource;
        a.loadStaticSource=async()=>source;
        const cases=[],mediaResponse=[];
        const read=async r=>{
            if(r.gl){
                const out=new Uint8Array(r.cols*r.rows*4),raw=new Uint8Array(out.length),gl=r.gl;
                gl.bindFramebuffer(gl.FRAMEBUFFER,r.cellFramebuffer);gl.readPixels(0,0,r.cols,r.rows,gl.RGBA,gl.UNSIGNED_BYTE,raw);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
                for(let y=0;y<r.rows;y++)out.set(raw.subarray((r.rows-1-y)*r.cols*4,(r.rows-y)*r.cols*4),y*r.cols*4);
                if(gl.getError())throw Error('WebGL cell readback failed');return out;
            }
            const stride=Math.ceil(r.cols*4/256)*256;
            const buffer=r.device.createBuffer({size:stride*r.rows,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
            const encoder=r.device.createCommandEncoder();encoder.copyTextureToBuffer({texture:r.cellColorTexture},{buffer,bytesPerRow:stride},[r.cols,r.rows]);r.device.queue.submit([encoder.finish()]);await buffer.mapAsync(GPUMapMode.READ);
            const raw=new Uint8Array(buffer.getMappedRange()),out=new Uint8Array(r.cols*r.rows*4);
            for(let y=0;y<r.rows;y++)out.set(raw.subarray(y*stride,y*stride+r.cols*4),y*r.cols*4);buffer.unmap();buffer.destroy();return out;
        };
        for(const backend of ['webgpu','webgl2'])for(const visualMode of ['flat','city','corridor','coast','cathedral','relief','orbitals']){
            sourceCtx.putImageData(image,0,0);
            a.params={...initial,...SPATIAL_DEFAULTS,backend,visualMode,sceneSpeed:0,sceneFreeze:true,sceneOffset:2.137,sceneMedia:.3,sceneWet:.3,sceneRain:.2,sceneMaterialGlyphs:true,
                cols:96,rows:54,autoRows:false,cellWidth:8,cellHeight:12,saturationBoost:1,contrastBoost:1,brightness:1,gamma:1,bgBlend:0,quantizeBits:0,
                glyphMode:true,solidMode:false,paletteId:'none',ditherMode:'none',jitterAmount:0,sampleX:.5,sampleY:.5,charset:'asciline',glyphDepth:96,glyphOffset:0,glyphReverse:false};
            const target=document.createElement('div');document.body.appendChild(target);
            const r=await createRenderer({...a.params,source,targetElement:target,preferredBackend:backend,sceneTransport:createCycleTransport(0,0)});
            // Readback tests use a real offscreen GPU attachment; headless-shell has
            // no stable WebGPU swapchain. Visible presentation has its own smoke.
            let attachment;
            if(r.device){
                attachment=r.device.createTexture({size:[r.canvasWidth,r.canvasHeight],format:navigator.gpu.getPreferredCanvasFormat(),usage:GPUTextureUsage.RENDER_ATTACHMENT});
                r.context={getCurrentTexture:()=>attachment};
            }
            if(r.getStats().backend!==backend)throw Error(`Unexpected fallback ${backend} -> ${r.getStats().backend}`);
            Object.assign(a.sceneTransport,createCycleTransport(0,0));
            if(r.device)r.device.pushErrorScope('validation');
            r.renderFrame();
            if(r.device){const error=await r.device.popErrorScope();if(error)throw Error(`WebGPU validation: ${error.message}`);}
            const pixels=await read(r),p={...a.params,sceneTransport:a.sceneTransport},state={};
            const expected=renderSpatialCells(p,image.data,64,48,96,54,(rgb,x,y)=>processGpuCellColor(...rgb,p,x,y),state,0);
            let diff=0,bad=0,max=0,signal=0;
            for(let i=0;i<pixels.length;i++){const d=Math.abs(pixels[i]-expected[i]);if(i%4<3){diff+=d;max=Math.max(max,d);if(d>8)bad++;signal+=pixels[i];}}
            const avg=diff/(96*54*3),fraction=bad/(96*54*3);
            cases.push({backend,visualMode,avgError:avg,badFraction:fraction,maxError:max,signal:signal/(96*54*3)});
            if(avg>2||fraction>.02){
                const points=[];for(let i=0;i<pixels.length&&points.length<12;i+=4)if([0,1,2].some(c=>Math.abs(pixels[i+c]-expected[i+c])>8))points.push({x:(i/4)%96,y:Math.floor(i/384),actual:[...pixels.slice(i,i+4)],expected:[...expected.slice(i,i+4)]});
                throw Error(`CPU/GPU parity ${JSON.stringify({...cases.at(-1),points})}`);
            }
            // Frozen input/time must be bit-identical across renders.
            r.renderFrame();const again=await read(r);if(pixels.some((n,i)=>n!==again[i]))throw Error(`Freeze drift ${backend}/${visualMode}`);
            if(visualMode==='flat') {
                r.sceneFreeze=false;r.feedbackAmount=1;r.feedbackHalfLife=3;
                r.renderFrame();const flash=await read(r);r.brightness=0;
                for(let frame=0;frame<120;frame++){r.spatialState.lastMs=cycleNowMs()-100;r.renderFrame();}
                const tail=await read(r);
                let maxTailError=0;
                for(let i=0;i<tail.length;i++)if(i%4<3)maxTailError=Math.max(maxTailError,Math.abs(tail[i]-flash[i]/16));
                if(maxTailError>3)throw Error(`Feedback decay stalled ${backend}: ${maxTailError}`);
                cases.push({backend,effect:'floating-point feedback',maxTailError});
            }
            if(visualMode!=='flat') {
                const preset=SPATIAL_PRESETS.find(p=>p.params.visualMode===visualMode);
                Object.assign(r,preset.params,{cols:96,rows:54,autoRows:false,sceneFreeze:true,sceneOffset:2.137,sceneTransport:createCycleTransport(0,0)});
                // A canvas-backed moving source exercises normal frame uploads,
                // not just changing a uniform or replacing a cached texture.
                source.isVideo=true;source.isImage=false;
                const outputs=[];
                for(const horizontal of [false,true]) {
                    sourceCtx.putImageData(new ImageData(spatialMediaFixture(64,48,horizontal),64,48),0,0);
                    r.spatialState={};r.renderFrame();outputs.push(await read(r));
                }
                const response=spatialMediaDifference(...outputs);
                if(response.meanRgbDifference<=10||response.changedShapeFraction<=.15||response.changedGlyphFraction<=.1) {
                    throw Error(`Source content is obscured ${backend}/${visualMode}: ${JSON.stringify(response)}`);
                }
                mediaResponse.push({backend,preset:preset.id,...response});
                source.isVideo=false;source.isImage=true;
            }
            r.destroy();target.remove();attachment?.destroy();
        }
        // Real Canvas fallback stays inside the existing software density cap.
        a.params={...a.params,backend:'canvas2d',cols:640,autoRows:true,visualMode:'city'};await a.start();
        const c=a.staticRuntime.renderer;c.running=false;c.renderFrame();const cs=c.getStats();
        if(cs.cols>120||cs.cols*cs.rows>6000)throw Error('Software density limit regressed');
        if(!c.spatialState?.history?.some(n=>n>0))throw Error('Canvas scene is blank');
        await a.stop();a.loadStaticSource=originalLoad;
        // Presets reuse one playing video. No source selection or decoder restart.
        a.params={...initial,...SPATIAL_DEFAULTS,mediaUrl:'media/point-click-test-30s.mp4',mediaType:'video',sourceMode:'static',backend:'webgl2',muted:true};
        await a.start();const sourceBefore=a.staticRuntime.source,video=sourceBefore.element;
        if(!(video instanceof HTMLVideoElement))throw Error('Continuity check needs a real video');
        await video.play();
        await new Promise(resolve=>setTimeout(resolve,200));
        if(video.paused)throw Error('Video fixture did not start');
        const timeBefore=video.currentTime;
        for(const id of ['neon-night-drive','media-corridor','wet-coast','neon-cathedral','brightness-relief','orbital-chamber','edge-etching','phosphor-echo','classic-camera-ascii']){
            await a.applyPreset(id,{transitionSeconds:.15});
            if(a.staticRuntime.source!==sourceBefore)throw Error(`Source replaced by ${id}`);
            if(video.paused||video.currentTime<timeBefore-.1)throw Error(`Playback interrupted by ${id}: ${JSON.stringify({paused:video.paused,before:timeBefore,after:video.currentTime,readyState:video.readyState,ended:video.ended,source:a.params.mediaUrl})}`);
        }
        await a.stop();
        // New visual MIDI targets remain controls, never source/capture/output actions.
        const targets=a.midiTargetDescriptors().map(t=>t.id);
        for(const key of ['sceneSpeed','sceneFov','sceneMedia','edgeAmount','feedbackAmount'])if(!targets.includes(`visual.${key}`))throw Error(`Missing MIDI ${key}`);
        if(!targets.includes('action.visual.sceneFreeze.toggle')||!targets.includes('action.visual.sceneReset'))throw Error('Missing scene transport MIDI actions');
        if(targets.some(t=>/camera|mediaUrl|popout|sourceMode/i.test(t)))throw Error('Forbidden MIDI target');
        return {cases,mediaResponse,canvas:cs,video:{sourcePreserved:true,timeBefore,timeAfter:video.currentTime},midi:true};
    });
    assert.deepEqual(errors,[]);
    if(process.env.SPATIAL_SMOKE_REPORT){writeFileSync(process.env.SPATIAL_SMOKE_REPORT,JSON.stringify(result,null,2));}
    console.log(JSON.stringify(result,null,2));
} finally {await browser?.close();server.kill();}
