import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as wait} from 'node:timers/promises';
import {chromium} from 'playwright-core';
import {findChromiumExecutable} from './lib/chromium.mjs';
const port=4184,url=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['--input-type=module','-e',`import {createServer} from 'vite';const s=await createServer({server:{host:'127.0.0.1',port:${port},strictPort:true,hmr:false,watch:null}});await s.listen()`],{stdio:'ignore'});
let browser;
try {
    for(let i=0;i<100;i++){try{if((await fetch(url)).ok)break;}catch{}await wait(100);}
    browser=await chromium.launch({executablePath:findChromiumExecutable({preferInstalled:true}),headless:true,args:['--enable-unsafe-webgpu','--disable-gpu-sandbox']});
    const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>localStorage.setItem('asciline-remix-state-v1',JSON.stringify({backend:'webgl2'})));
    await page.goto(url);await page.waitForFunction(()=>window.ascilineRemix?.running);
    const results=await page.evaluate(async()=>{
        const app=window.ascilineRemix;await app.stop();
        const {createRenderer}=await import('/renderers/gpu/ascii/renderer/index.js');
        const {SPATIAL_DEFAULTS}=await import('/renderers/shared/spatial.js');
        const params={...app.params,...SPATIAL_DEFAULTS,cols:16,rows:8,autoRows:false,cellWidth:4,cellHeight:4,jitterAmount:0,feedbackAmount:0,glyphMode:true};
        const results=[];
        for(const backend of ['webgpu','webgl2','canvas2d']) for(const alpha of [0,128,255]) {
            const canvas=document.createElement('canvas');canvas.width=64;canvas.height=32;
            const ctx=canvas.getContext('2d'),data=ctx.createImageData(64,32);
            for(let i=0;i<data.data.length;i+=4){data.data[i]=160;data.data[i+1]=90;data.data[i+2]=30;data.data[i+3]=alpha;}
            ctx.putImageData(data,0,0);
            const source={canvas,element:canvas,width:64,height:32,ready:true,isImage:true,isVideo:false,type:'image',destroy(){}};
            let r,attachment;
            if(backend==='canvas2d'){
                app.loadStaticSource=async()=>source;app.params={...params,backend};await app.start();r=app.staticRuntime.renderer;r.renderFrame?.();r._renderFrame?.();
            }else{
                const target=document.createElement('div');document.body.appendChild(target);
                r=await createRenderer({...params,source,targetElement:target,preferredBackend:backend});
                if(r.getStats().backend!==backend)throw Error(`Fallback from ${backend}`);
                if(r.device){attachment=r.device.createTexture({size:[r.canvasWidth,r.canvasHeight],format:navigator.gpu.getPreferredCanvasFormat(),usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});r.context={getCurrentTexture:()=>attachment};}
                r.renderFrame();
            }
            let pixels;
            if(attachment){const w=r.canvasWidth,h=r.canvasHeight,stride=Math.ceil(w*4/256)*256;
                const b=r.device.createBuffer({size:stride*h,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
                const e=r.device.createCommandEncoder();e.copyTextureToBuffer({texture:attachment},{buffer:b,bytesPerRow:stride},[w,h]);r.device.queue.submit([e.finish()]);await b.mapAsync(GPUMapMode.READ);
                const raw=new Uint8Array(b.getMappedRange());pixels=new Uint8Array(w*h*4);for(let y=0;y<h;y++)pixels.set(raw.subarray(y*stride,y*stride+w*4),y*w*4);b.unmap();b.destroy();
            }else if(r.gl){pixels=new Uint8Array(r.canvas.width*r.canvas.height*4);r.gl.readPixels(0,0,r.canvas.width,r.canvas.height,r.gl.RGBA,r.gl.UNSIGNED_BYTE,pixels);}
            else pixels=r.ctx.getImageData(0,0,r.canvas.width,r.canvas.height).data;
            let lo=255,hi=0;for(let i=3;i<pixels.length;i+=4){lo=Math.min(lo,pixels[i]);hi=Math.max(hi,pixels[i]);}
            results.push({backend,alpha,lo,hi});if(Math.abs(lo-alpha)>1||Math.abs(hi-alpha)>1)throw Error(`Coverage changed: ${JSON.stringify(results.at(-1))}`);
            if(backend==='canvas2d')await app.stop();else r.destroy();attachment?.destroy();
        }
        return results;
    });
    assert.deepEqual(errors,[]);console.log(JSON.stringify(results,null,2));
} finally {await browser?.close();server.kill();}
