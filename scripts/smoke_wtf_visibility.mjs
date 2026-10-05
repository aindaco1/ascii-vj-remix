import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { findChromiumExecutable } from './lib/chromium.mjs';
const port = 4177, url = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['--input-type=module', '-e', `import {createServer} from 'vite';const s=await createServer({server:{host:'127.0.0.1',port:${port},strictPort:true,hmr:false,watch:null}});await s.listen();`], { stdio: 'ignore' });
let browser;
try {
    for (let i=0;i<100;i++) { try { if ((await fetch(url)).ok) break; } catch {} await wait(100); }
    browser = await chromium.launch({ executablePath: findChromiumExecutable({preferInstalled:true}), headless:true, args:['--enable-unsafe-webgpu','--disable-gpu-sandbox'] });
    const page = await browser.newPage({viewport:{width:1280,height:800}}), errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.text().startsWith('[wtf]'))console.log(m.text());});
    await page.addInitScript(()=>localStorage.setItem('asciline-remix-state-v1',JSON.stringify({backend:'webgl2'})));
    await page.goto(url);await page.waitForFunction(()=>window.ascilineRemix?.running);
    const result = await page.evaluate(async()=>{
        const a=window.ascilineRemix;await a.stop();
        const {protectWtfVisibility}=await import('/renderers/shared/wtf-visual-safety.js');
        const {inspectWtfTarget,sampleWtfSource,wtfCellSignal}=await import('/renderers/shared/wtf-visual-probe.js');
        const {AUDIO_REACTIVE_PRESETS,applyAudioReactiveModulation,emptyAudioReactiveFeatures}=await import('/renderers/shared/audio-reactive.js');
        const {SPATIAL_CONTRACT}=await import('/renderers/shared/spatial.js');
        const {createRenderer}=await import('/renderers/gpu/ascii/renderer/index.js');
        const sourceCanvas=document.createElement('canvas');sourceCanvas.width=192;sourceCanvas.height=108;
        const ctx=sourceCanvas.getContext('2d',{willReadFrequently:true});
        const picture=new Image();picture.src='/media/demo.svg';await picture.decode();
        const draw=scale=>{ctx.drawImage(picture,0,0,192,108);const im=ctx.getImageData(0,0,192,108);for(let i=0;i<im.data.length;i+=4)for(let c=0;c<3;c++)im.data[i+c]*=scale;ctx.putImageData(im,0,0);};
        draw(.3);
        const source={element:sourceCanvas,canvas:sourceCanvas,isImage:true,isVideo:false,width:192,height:108,ready:true,type:'image',destroy(){},updateParams(){}};
        a._staticMediaSource=()=>source;
        const initial={...a.params,visualMode:'flat',brightOutput:false,accentSubtleLimit:true,accentStyle:'off',accentAmount:0,paletteId:'none',glyphColorMode:'source',glyphMode:true,solidMode:false};
        a.params={...initial};
        const visible=sampleWtfSource(source);
        const good=protectWtfVisibility({...initial,contrastBoost:1,brightness:1.35,gamma:2.2,quantizeBits:0,bgBlend:0,glyphMode:false,solidMode:true});
        if(!await inspectWtfTarget(good,visible))throw Error('Readable fallback rejected');
        for(const bad of [
            {...initial,brightness:.1,contrastBoost:3,gamma:.3},
            {...good,glyphMode:true,solidMode:false,charset:'custom',customGlyphRamp:' '},
            {...good,glyphMode:true,solidMode:false,glyphColorMode:'fixed',glyphColor:'#000000'},
            {...good,brightness:0,bgBlend:0}
        ])if(await a._isSafeWtfTarget(bad,visible))throw Error('Blackout candidate accepted');
        const safe=a._isSafeWtfTarget;
        a._isSafeWtfTarget=()=>false;
        if(await a._makeWtfTarget(1)!==null)throw Error('Unchecked fallback escaped');
        a._isSafeWtfTarget=safe;
        a._staticMediaSource=()=>null;
        if(await a._makeWtfTarget(1)!==null)throw Error('Readback failure treated as safe');
        a._staticMediaSource=()=>source;
        draw(0);
        if(!await a._isSafeWtfTarget(good))throw Error('Black source content rejected');
        // Deterministic generation; exercise actual GPU and Canvas glyph output
        // after a bright-to-dim cut and after strong audio modulation.
        let seed=123456789;const random=Math.random;Math.random=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);
        const cases=[], targets=[], times=[];
        try {
            draw(1);
            for(let i=0;i<36;i++) {
                a.params={...initial,glyphColorMode:i%3?'source':'fixed',glyphColor:i%3?'#ffffff':'#010101',charset:'custom',customGlyphRamp:' '};
                const start=performance.now(),target=await a._makeWtfTarget(1);times.push(performance.now()-start);
                if(!target)throw Error(`No safe target ${i}`);
                if(target.brightOutput!==false||target.accentSubtleLimit!==true)throw Error('Global preference changed');
                targets.push(target);
            }
            const modes=SPATIAL_CONTRACT.visualMode.options.map(([id])=>id).filter(id=>id!=='flat');
            for(let i=0;i<modes.length;i++){
                let draws=[.95,(i+.5)/modes.length];Math.random=()=>draws.length?draws.shift():((seed=(1664525*seed+1013904223)>>>0)/4294967296);
                const target=await a._makeWtfTarget(1);
                if(!target||target.visualMode!==modes[i])throw Error(`Unsafe scene fallback ${modes[i]}`);
                targets.push(target);
            }
        }finally{Math.random=random;}
        const loud=Object.fromEntries(Object.keys(emptyAudioReactiveFeatures()).map(k=>[k,1]));
        for(const [index,target] of targets.entries()) {
            draw(.3);
            const audio={...a.audioReactive,preset:AUDIO_REACTIVE_PRESETS[index%AUDIO_REACTIVE_PRESETS.length].id,sensitivity:12,beatAmount:3,bassAmount:3,midAmount:3,trebleAmount:3,noiseFloor:0};
            const effective=protectWtfVisibility(applyAudioReactiveModulation(target,loud,audio));

            for(const backend of ['webgl2','webgpu','canvas2d']) {
                // Use the real app Canvas implementation and explicit GPU renderers.
                const params={...effective,backend,cols:96,rows:54,autoRows:false,cellWidth:6,cellHeight:8,sceneFreeze:true};
                const stage=document.createElement('div');stage.style.cssText='position:fixed;width:576px;height:432px;left:0;top:0';document.body.appendChild(stage);
                let renderer;
                if(backend==='canvas2d'){
                    a.staticRuntime.source=source;
                    ({renderer}=await a.staticRuntime._createCanvasRenderer(params,stage));
                }else renderer=await createRenderer({...params,source,targetElement:stage,preferredBackend:backend,preserveDrawingBuffer:true});
                const deadline=performance.now()+10000;
                while((renderer.pendingGlyphPages?.size||renderer.pendingGlyphRampKey)&&performance.now()<deadline)await new Promise(r=>setTimeout(r,10));
                let attachment;
                if(renderer.device){
                    await renderer.syncGlyphResources(true);
                    attachment=renderer.device.createTexture({size:[renderer.canvasWidth,renderer.canvasHeight],format:navigator.gpu.getPreferredCanvasFormat(),usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});
                    renderer.context={getCurrentTexture:()=>attachment};
                }
                renderer.renderFrame?.();renderer.draw?.();
                const canvas=renderer.canvas;
                const probe=document.createElement('canvas');probe.width=288;probe.height=216;
                const pc=probe.getContext('2d',{willReadFrequently:true});
                if(attachment){
                    const width=renderer.canvasWidth,height=renderer.canvasHeight,stride=Math.ceil(width*4/256)*256;
                    const buffer=renderer.device.createBuffer({size:stride*height,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
                    const encoder=renderer.device.createCommandEncoder();encoder.copyTextureToBuffer({texture:attachment},{buffer,bytesPerRow:stride},[width,height]);renderer.device.queue.submit([encoder.finish()]);await buffer.mapAsync(GPUMapMode.READ);
                    const raw=new Uint8Array(buffer.getMappedRange()),frame=new ImageData(width,height),bgra=navigator.gpu.getPreferredCanvasFormat().startsWith('bgra');
                    for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=y*stride+x*4,j=(y*width+x)*4;frame.data.set([raw[i+(bgra?2:0)],raw[i+1],raw[i+(bgra?0:2)],255],j);}
                    const readback=document.createElement('canvas');readback.width=width;readback.height=height;readback.getContext('2d').putImageData(frame,0,0);pc.drawImage(readback,0,0,288,216);buffer.unmap();buffer.destroy();attachment.destroy();
                }else pc.drawImage(canvas,0,0,288,216);
                const signal=wtfCellSignal(pc.getImageData(0,0,288,216).data,{backgroundColor:'#000000'});
                cases.push({index,backend,mode:target.visualMode,accent:target.accentStyle,glyphs:target.glyphMode,average:signal.average,visibleRatio:signal.visibleRatio});
                if(signal.average<5||signal.visibleRatio<.01)throw Error(`Rendered darkness ${JSON.stringify(cases.at(-1))}`);
                renderer.destroy();stage.remove();
            }
            if(index%10===0)console.log(`[wtf] rendered ${index+1}/${targets.length}`);
        }
        a.params=initial;a.wtfActive=true;
        const guarded=a._wtfRenderParams({...initial,contrastBoost:3,gamma:.2});
        if(guarded.contrastBoost!==1.1||guarded.gamma!==1.35||!a._nativeOutputPayload().params.wtfVisibilityGuard)throw Error('Live output guard missing');
        a.wtfActive=false;
        if(a._wtfRenderParams(initial)!==initial||a._nativeOutputPayload().params.wtfVisibilityGuard)throw Error('Guard leaked outside WTF');
        // Stopping WTF while an atlas/candidate check is pending must not apply
        // the now-stale result or turn the loop back on.
        const makeTarget=a._makeWtfTarget,transition=a._transitionTo;
        let release;
        a._makeWtfTarget=()=>new Promise(resolve=>{release=resolve;});
        a._transitionTo=()=>{throw Error('Stopped WTF applied a pending target');};
        a.running=true;a.wtfActive=true;a.wtfToken++;
        const pending=a._runWtfLoop(a.wtfToken);
        a._stopWtf();release(good);await pending;
        a.running=false;a._makeWtfTarget=makeTarget;a._transitionTo=transition;
        if(a.wtfActive)throw Error('Pending target restarted WTF');
        return {targets:targets.length,cases,generationMs:{max:Math.max(...times),average:times.reduce((a,b)=>a+b)/times.length},failClosed:true,blackSourceAllowed:true};
    });
    assert.deepEqual(errors,[]);
    writeFileSync(process.env.WTF_SMOKE_REPORT||'/tmp/wtf-visibility-checks.json',JSON.stringify(result,null,2));
    console.log(JSON.stringify({targets:result.targets,renders:result.cases.length,minAverage:Math.min(...result.cases.map(c=>c.average)),generationMs:result.generationMs,failClosed:result.failClosed},null,2));
} finally {await browser?.close();server.kill();}
