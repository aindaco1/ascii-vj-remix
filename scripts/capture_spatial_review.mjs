// Reproducible visual review of actual WebGL output; --fractals selects the new scenes.
// Run with an output PNG path; no user media or native profile is read.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { findChromiumExecutable } from './lib/chromium.mjs';

const server = await createServer({ server: { host: '127.0.0.1', port: 4177, strictPort: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true, include: [] } });
let browser;
try {
    await server.listen();
    browser = await chromium.launch({ executablePath: findChromiumExecutable({ preferInstalled: true }), headless: true });
    const page = await browser.newPage({ viewport: { width: 1680, height: process.argv.includes('--fractals') ? 825 : 1150 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.addInitScript(() => localStorage.setItem('asciline-remix-state-v1', JSON.stringify({ backend: 'webgl2' })));
    await page.goto('http://127.0.0.1:4177');
    await page.waitForFunction(() => window.ascilineRemix?.running);
    const results = await page.evaluate(async (fractals) => {
        const { SPATIAL_PRESETS } = await import('/renderers/shared/spatial-presets.js');
        const { createRenderer } = await import('/renderers/gpu/ascii/renderer/index.js');
        const { createCycleTransport } = await import('/renderers/shared/palette-cycling.js');
        const app = window.ascilineRemix;
        await app.stop();
        document.head.insertAdjacentHTML('beforeend', `<style>
          body{display:block!important;overflow:auto!important;margin:0;padding:28px;background:#101114;color:#f4f4f5;font:15px system-ui}
          h1{font:600 26px system-ui;margin:0 0 6px}p{color:#a6aab2;margin:0 0 22px}
          #review{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}figure{margin:0;background:#08090b;border:1px solid #343740}
          figcaption{padding:10px 12px;font-size:15px}figure img{width:100%;aspect-ratio:16/9;object-fit:contain;display:block}
          .stage{position:fixed;left:-3000px;top:0;width:1280px;height:720px}
        </style>`);
        document.body.innerHTML = `<h1>${fractals?'Fractal scenes · Bright Output off':'Bright Output + spatial scenes'}</h1><p>The same source in every view. Actual renderer output with each preset’s own composition, frozen for comparison. No audio modulation.</p><main id="review"></main>`;
        const gallery = document.querySelector('#review');
        const add = (name, url) => {
            const figure = document.createElement('figure');
            const caption = document.createElement('figcaption');caption.textContent = name;
            const img = document.createElement('img');img.src = url;
            figure.append(caption,img);gallery.appendChild(figure);
        };
        const canvas = document.createElement('canvas');canvas.width = 640;canvas.height = 360;
        const ctx = canvas.getContext('2d'), picture = new Image();picture.src = '/media/demo.svg';await picture.decode();
        ctx.drawImage(picture,0,0,640,360);
        const pixels = ctx.getImageData(0,0,640,360);
        for(let i=0;i<pixels.data.length;i+=4)for(let c=0;c<3;c++)pixels.data[i+c]=Math.round(pixels.data[i+c]*(fractals?1:.075));
        ctx.putImageData(pixels,0,0);
        add(fractals?'Input · Demo image':'Input · 7.5% source brightness',canvas.toDataURL());
        const source = {element:canvas,canvas,isImage:true,isVideo:false,width:640,height:360,ready:true,type:'image',destroy(){},updateParams(){}};
        const scenes = SPATIAL_PRESETS.filter(p=>fractals?['ruins','mandelbrot','mandelbulb','mandelbox'].includes(p.params.visualMode):p.params.visualMode!=='flat');
        const views = [
            {name:'Classic Camera ASCII · Bright output OFF', params:{...app._allPresets().find(p=>p.id==='classic-camera-ascii').params,brightOutput:false}},
            ...(!fractals?[{name:'Classic Camera ASCII · Bright output ON', params:{...app._allPresets().find(p=>p.id==='classic-camera-ascii').params,brightOutput:true}}]:[]),
            ...scenes.map(p=>({...p,params:{...p.params,brightOutput:!fractals}}))
        ];
        const results=[];
        for(const view of views){
            const stage=document.createElement('div');stage.className='stage';document.body.appendChild(stage);
            const params={...app.params,...view.params,sceneFreeze:true,sceneOffset:(view.params.sceneOffset||0)+2.137,sceneTransport:createCycleTransport(0,0),sampleX:.5,sampleY:.5,jitterAmount:0};
            const renderer=await createRenderer({...params,source,targetElement:stage,preferredBackend:'webgl2',preserveDrawingBuffer:true});
            // Glyph pages load asynchronously; capture only after the actual
            // ramp is present (otherwise non-Latin/block presets look blank).
            const deadline=performance.now()+10000;
            while(renderer.pendingGlyphPages.size && performance.now()<deadline)await new Promise(r=>setTimeout(r,20));
            if(renderer.pendingGlyphPages.size)throw Error('Glyph atlas did not finish loading');
            renderer.renderFrame();
            const output=renderer.canvas.toDataURL();
            add(view.name,output);
            const sample=document.createElement('canvas');sample.width=320;sample.height=180;
            const sc=sample.getContext('2d');sc.drawImage(renderer.canvas,0,0,320,180);
            const values=sc.getImageData(0,0,320,180).data;
            let luma=0;for(let i=0;i<values.length;i+=4)luma+=values[i]*.2126+values[i+1]*.7152+values[i+2]*.0722;
            results.push({name:view.name,meanDisplayedLuma:luma/(320*180)});
            renderer.destroy();stage.remove();
        }
        await Promise.all([...gallery.querySelectorAll('img')].map(img=>img.decode()));
        return results;
    }, process.argv.includes('--fractals'));
    assert.deepEqual(errors, []);
    await page.screenshot({ path: process.argv[2] || '/tmp/ascii-bright-spatial-review.png', fullPage: true });
    console.log(JSON.stringify(results,null,2));
} finally {
    await browser?.close();
    await server.close();
}
