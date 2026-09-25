import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { validatePaperReport, paperFingerprint, paperRelayReport } from '../src/paper-contract.mjs';
import { PaperReportGroup } from '../src/paper-aggregation.js';
import { issueBody } from '../src/github.js';
const sample = () => ({schema:'paper-diagnostic-v1',id:crypto.randomUUID(),kind:'current_state',application:{version:'0.4.0',build:'7',operatingSystem:'27.0.0',architecture:'arm64'},state:{enabled:true,pause:'none',textureSource:'bundled',intensityBucket:4,displays:1,excludedDisplays:0,floatingPanelsClear:false,battery:false,lowPower:false,schedule:'disabled',appRule:'except',events:['launch']}});
const request = r => new Request('https://crash.dustwave.xyz/v1/paper/reports',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(r)});
function storage() { const values = new Map(); return { get:async k=>structuredClone(values.get(k)),put:async(k,v)=>values.set(k,structuredClone(v)) }; }
test('Paper uses shared serialization and counts each retry ID once', async () => {
    const counts=[];
    const group = new PaperReportGroup({storage:storage()},{},async(env,payload,fp,state)=>{
        assert.equal(env.GITHUB_REPO,'paper'); assert.equal(env.GITHUB_OWNER,'aindaco1');
        assert.equal(payload.report.stack,''); counts.push(state.count);
        return {action:counts.length===1?'created':'updated',issueNumber:1};
    });
    const a=sample(),b=sample();
    const results=await Promise.all([a,a,b].map(r=>group.fetch(request(r)).then(v=>v.json())));
    assert.deepEqual(counts,[1,2]); assert.deepEqual(results.map(r=>r.action),['created','duplicate','updated']);
});
test('Paper provider failures retain a single pending count for retry',async()=>{
    let calls=0; const counts=[];
    const group=new PaperReportGroup({storage:storage()},{},async(env,payload,fp,state)=>{
        calls++; counts.push(state.count); if(calls===1)throw Object.assign(new Error('private error'),{status:503});
        return {action:'created',issueNumber:2};
    });
    const r=sample(); assert.equal((await group.fetch(request(r))).status,502);
    assert.equal((await group.fetch(request(r))).status,200); assert.deepEqual(counts,[1,1]);
});
test('Paper intake rejects unknown fields and oversized bodies before forwarding',async()=>{
    let calls=0;
    const env={PAPER_REPORTS_ENABLED:'true',RATELIMIT:storage(),PAPER_REPORT_GROUPS:{idFromName:x=>x,get:()=>({fetch:async()=>{calls++;return Response.json({ok:true});}})}};
    for(const mutate of [r=>r.rawLog='/Users/private',r=>r.application.name='private',r=>r.state.events=['private'],r=>r.extra='x'.repeat(9000)]) {
        const r=sample(); mutate(r); assert.equal((await worker.fetch(request(r),env)).status,400);
    }
    assert.equal(calls,0); assert.equal((await worker.fetch(request(sample()),env)).status,200); assert.equal(calls,1);
    assert.equal((await worker.fetch(request(sample()),{})).status,503);
});
test('Paper issue contains exactly the reviewed projection',()=>{
    const r=sample(); validatePaperReport(r);
    const body=issueBody(paperRelayReport(r),'synthetic',{count:1,versions:{},platforms:{}});
    assert.match(body,/paperDiagnostics/); assert.match(body,/"build": "7"/);
});
