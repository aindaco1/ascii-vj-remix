import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { projectState, autoSubtitleFingerprint, validateAutoSubtitleReport, autoSubtitleRelayReport } from '../src/auto-subtitle-contract.mjs';
import { AutoSubtitleReportGroup } from '../src/auto-subtitle-aggregation.js';
import { issueBody } from '../src/github.js';
const report=()=>projectState({state:{status:'failed',phase:'timing',errorCode:'PROCESSING_FAILED'}},crypto.randomUUID(),'workflow_failure');
const request=r=>new Request('https://crash.dustwave.xyz/v1/auto-subtitle/reports',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(r)});
function storage(){const values=new Map();return {get:async key=>structuredClone(values.get(key)),put:async(key,value)=>values.set(key,structuredClone(value))};}
test('Auto Subtitle uses shared serialized grouping, fixed repository and idempotent retries',async()=>{
  const ctx={storage:storage()},counts=[];
  const group=new AutoSubtitleReportGroup(ctx,{},async(env,payload,fingerprint,state)=>{
    assert.equal(env.GITHUB_REPO,'auto-subtitle');assert.equal(env.GITHUB_OWNER,'aindaco1');
    assert.equal(env.CRASH_LABELS,'diagnostic,automated-report,needs-triage');
    counts.push(state.count);assert.equal(payload.report.stack,'');
    return {action:counts.length===1?'created':'updated',issueNumber:12};
  });
  const a=report(),b=report();
  const results=await Promise.all([a,a,b].map(r=>group.fetch(request(r)).then(response=>response.json())));
  assert.deepEqual(counts,[1,2]);assert.deepEqual(results.map(r=>r.action),['created','duplicate','updated']);
});
test('Auto Subtitle intake accepts reviewed state and rejects secrets and oversized objects before dispatch',async()=>{
  let calls=0;
  const env={AUTO_SUBTITLE_REPORTS_ENABLED:'true',RATELIMIT:storage(),AUTO_SUBTITLE_REPORT_GROUPS:{idFromName:x=>x,get:()=>({fetch:async()=>{calls++;return Response.json({ok:true});}})}};
  for(const value of [{...report(),rawLog:'/Users/private'}, {...report(),extra:'x'.repeat(5000)}])assert.equal((await worker.fetch(request(value),env)).status,400);
  assert.equal(calls,0);assert.equal((await worker.fetch(request(report()),env)).status,200);assert.equal(calls,1);
  assert.equal((await worker.fetch(request(projectState({},crypto.randomUUID())),env)).status,200);assert.equal(calls,2);
  assert.equal((await worker.fetch(request(report()),{})).status,503);
});
test('Swift and JavaScript object ordering cannot split identical crashes',async()=>{
  const a=report();a.kind='native_crash';a.crash={exception:'EXC_BAD_ACCESS',signal:'SIGSEGV',image:'AutoSubtitle',imageOffset:88};
  const b=structuredClone(a);b.crash={imageOffset:88,image:'AutoSubtitle',signal:'SIGSEGV',exception:'EXC_BAD_ACCESS'};
  assert.equal(await autoSubtitleFingerprint(a),await autoSubtitleFingerprint(b));
  b.crash.rawStack='secret';assert.throws(()=>validateAutoSubtitleReport(b));
});
test('GitHub issues include the reviewed Auto Subtitle projection and preserve release build numbers',()=>{
  const state=projectState({application:{version:'1.0.0',build:'10000'}},crypto.randomUUID());
  const rendered=issueBody(autoSubtitleRelayReport(state),'testfingerprint',{count:1,versions:{},platforms:{}});
  assert.match(rendered,/autoSubtitleDiagnostics/);
  assert.match(rendered,/"kind": "current_state"/);
  assert.match(rendered,/"build": "10000"/);
});
