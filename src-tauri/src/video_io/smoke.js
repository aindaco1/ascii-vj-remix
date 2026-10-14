// Executed only by the explicit ASCILINE_VIDEO_IO_SMOKE installed-app fixture.
(async () => {
    const invoke = window.__TAURI_INTERNALS__.invoke;
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const until = async test => { for (let n=0;n<120;n++) { if(await test()) return; await wait(100); } throw Error('Video I/O fixture timed out'); };
    const report = {ok:false, protocol:OPTIONS.protocol, backend:OPTIONS.backend};
    try {
        await until(() => window.ascilineRemix?.videoIo?.available);
        const app=window.ascilineRemix, io=app.videoIo;
        app.audioReactive.enabled=false; await app.audioReactiveRuntime.stop();
        app.params={...app.params, backend:OPTIONS.backend, visualMode:'flat', accentStyle:'off', accentAmount:0, feedbackAmount:0, jitterAmount:0, fps:60};
        await app.restart();
        await until(async () => {await io.discover(OPTIONS.protocol);return io.sources.some(s=>s.name.includes('SDK proof'));});
        const index=io.sources.findIndex(s=>s.name.includes('SDK proof'));
        await io.select(String(index));
        await until(()=>app.staticRuntime.source?.width>1);
        const source=app.staticRuntime.source;
        report.inputSize=[source.width,source.height];
        const pixels=source.context.getImageData(0,0,source.width,source.height).data;
        let lo=255,hi=0;for(let i=3;i<pixels.length;i+=4){lo=Math.min(lo,pixels[i]);hi=Math.max(hi,pixels[i]);}
        report.inputAlpha=[lo,hi];if(lo>2||hi<253)throw Error('Input coverage was lost');
        Object.assign(io.config,{ndi:true,syphon:io.capabilities.syphonAvailable,name:'ASCII VJ Remix Video Smoke',width:1920,height:1080,fps:60});
        await io.configure();await io.openPopout();
        await until(async()=>{const s=await invoke('get_video_io_status');return s.frames>20&&s.ndi==='sending'&&(!io.config.syphon||s.syphon==='sharing');});
        const before=await invoke('get_video_io_status');
        let previous=before.input;report.disconnects=0;report.reconnections=0;
        const deadline=Date.now()+OPTIONS.durationMs;
        while(Date.now()<deadline){await wait(200);const state=await invoke('get_video_io_status');
            if(previous==='connected'&&state.input==='disconnected')report.disconnects++;
            if(previous==='disconnected'&&state.input==='connected')report.reconnections++;
            previous=state.input;
        }
        report.finalInputSize=[source.width,source.height];
        if(OPTIONS.requireReconnect&&(!report.disconnects||!report.reconnections))throw Error('Source did not disconnect and reconnect');
        const after=await invoke('get_video_io_status');report.frames=after.frames-before.frames;report.dropped=after.dropped;report.popout=after.popout;
        report.resolvedBackend=app.staticRuntime.getStats()?.backend;
        if(report.frames<Math.max(120,OPTIONS.durationMs/1000*15)||!report.popout)throw Error('Shared output stalled');
        report.ok=true;
    } catch(error) {report.error=String(error);}
    await invoke('plugin:event|emit_to',{target:{kind:'App'},event:'asciline-video-io-smoke-result',payload:report});
})()
