import test from 'node:test';
import assert from 'node:assert/strict';
import fixture from '../contract/fine-me-not-fixture.json' with { type: 'json' };
import { validateFineMeNotReport, fineMeNotFingerprint, fineMeNotRelayReport, fineMeNotIssueBody, fineMeNotReopen, fineMeNotAggregate } from '../src/fine-me-not.js';
import { FineMeNotReportGroup, FineMeNotInbox } from '../src/fine-me-not-aggregation.js';
import { checkFineMeNotRateLimit } from '../src/rate-limit.js';
import worker from '../src/index.js';
const report = patch => ({ ...structuredClone(fixture), id: crypto.randomUUID(), ...(patch?.events?.length === 0 ? { evidenceIndex: null } : {}), ...patch });
const request = r => new Request('https://internal/report', { method: 'POST', body: JSON.stringify(r) });
function context() {
  const data = new Map();
  return { storage: { get: async key => structuredClone(data.get(key)), put: async (k,v) => data.set(k,structuredClone(v)),
    list: async ({prefix}) => new Map([...data].filter(([k])=>k.startsWith(prefix))),
    delete: async keys => (Array.isArray(keys)?keys:[keys]).forEach(k=>data.delete(k)), setAlarm: async()=>{} }, data };
}
function namespace(make) { const objects = new Map(); return { idFromName: n=>n, get: n=>{ if (!objects.has(n)) objects.set(n,make(n)); return objects.get(n); } }; }

test('Fine Me Not contract rejects location, nested unknown fields, controls and oversized user text', () => {
  assert.equal(validateFineMeNotReport(fixture), fixture);
  for (const key of ['speed','cameraID','coordinates','routeName','url']) assert.throws(()=>validateFineMeNotReport(report({state:{[key]:'private'}})));
  assert.throws(()=>validateFineMeNotReport(report({events:[{code:'audio',values:{route:'bluetooth'},raw:'private'}]})));
  for (const notes of ['x'.repeat(2001), '\u001b[0m', '\u0000', '\u0085']) assert.throws(()=>validateFineMeNotReport(report({notes})));
  assert.doesNotThrow(()=>validateFineMeNotReport(report({notes:'🦉'.repeat(2000)})));
  assert.throws(()=>validateFineMeNotReport(report({notes:'',state:{},metadata:{},events:[]})));
});
test('known failures group across notes and versions; unrelated text-only reports stay separate', async () => {
  assert.equal(await fineMeNotFingerprint(fixture), await fineMeNotFingerprint(report({notes:'Another explanation', metadata:{version:'1.0.2'}})));
  assert.notEqual(await fineMeNotFingerprint(report({events:[]})),await fineMeNotFingerprint(report({events:[]})));
  assert.notEqual(await fineMeNotFingerprint(fixture),await fineMeNotFingerprint(report({events:[{code:'audio',values:{audio:'interrupted',route:'carPlay'}}]})));
});
test('aggregate keeps first and latest explanations, escapes hostile Markdown and preserves maintainer text', () => {
  const state = {count:7,firstSeen:'today',lastSeen:'today',versions:{'1.0.1':7}};
  for(let i=0;i<7;i++)fineMeNotAggregate(state,report({notes:`note${i}`}));
  assert.deepEqual(state.notes,['note0','note3','note4','note5','note6']);assert.equal(state.omittedNotes,2);
  fineMeNotAggregate(state,report({notes:'</pre>\n@aindaco1 <script>bad</script>\n```\nhello'}));
  const body=fineMeNotIssueBody(fineMeNotRelayReport(fixture),'fp',state);
  assert.ok(body.includes('&lt;/pre&gt;'));assert.ok(!body.includes('@aindaco1'));assert.ok(!body.includes('<script>'));
  const updated=fineMeNotIssueBody(fineMeNotRelayReport(fixture),'fp',state,`My notes\n${body}\nFix here`);
  assert.ok(updated.startsWith('My notes\n'));assert.ok(updated.endsWith('\nFix here'));
});
test('new reports honor closed issue labels and original crash build', () => {
  const relay=fineMeNotRelayReport(structuredClone(fixture));
  assert.equal(fineMeNotReopen({state:'closed',labels:[]},relay),true);
  for(const name of ['duplicate','do-not-reopen','fixed-in-build:10'])assert.equal(fineMeNotReopen({state:'closed',labels:[{name}]},relay),false);
  relay.report.context.fineMeNot.crash={build:'8'};
  assert.equal(fineMeNotReopen({state:'closed',labels:[{name:'fixed-in-build:9'}]},relay),false);
});
test('serialized relay retries count once and concurrent reports aggregate', async () => {
  const calls=[];
  const group=new FineMeNotReportGroup(context(),{},async(env,r,fp,state)=>{ calls.push(state.count); await new Promise(r=>setTimeout(r,5)); return {action:calls.length===1?'created':'updated',issueNumber:5}; });
  const a=report(),b=report({notes:'A second explanation'});
  const responses=await Promise.all([group.fetch(request(a)),group.fetch(request(a)),group.fetch(request(b))]);
  assert.deepEqual(calls,[1,2]);assert.deepEqual(await Promise.all(responses.map(async r=>(await r.json()).action)),['created','duplicate','updated']);
});
test('ID ledger rejects changed payload across fingerprints and retains confirmed receipts', async () => {
  let calls=0;
  const env={FINE_ME_NOT_REPORT_GROUPS:namespace(()=>({fetch:async req=>{calls++;const r=await req.json();return Response.json({ok:true,reportId:r.id,action:'created',issueNumber:8});}}))};
  const inbox=new FineMeNotInbox(context(),env);const a=report();
  assert.equal((await inbox.fetch(request(a))).status,200);
  assert.equal((await inbox.fetch(request({...a,events:[],evidenceIndex:null,notes:'changed'}))).status,409);
  assert.equal((await (await inbox.fetch(request(a))).json()).action,'duplicate');assert.equal(calls,1);
});
test('provider failure is not success, same draft retry does not increment twice', async () => {
  const counts=[]; const group=new FineMeNotReportGroup(context(),{},async(env,r,fp,s)=>{counts.push(s.count);return counts.length===1?{action:'pending',status:503}:{action:'created',issueNumber:9};});
  const a=report();assert.equal((await group.fetch(request(a))).status,503);assert.equal((await group.fetch(request(a))).status,200);assert.deepEqual(counts,[1,1]);
});
test('Fine Me Not rate and daily issue limits are atomic and scoped', async () => {
  const env={GITHUB_APP_PRIVATE_KEY:'synthetic-secret',FINE_ME_NOT_INBOX:namespace(()=>new FineMeNotInbox(context(),{}))};
  const req=new Request('https://example.invalid',{headers:{'CF-Connecting-IP':'192.0.2.1'}});
  const results=await Promise.all(Array.from({length:12},()=>checkFineMeNotRateLimit(req,env)));
  assert.equal(results.filter(r=>r.ok).length,10);
  const quota=env.FINE_ME_NOT_INBOX.get('issue-quota');
  const replies=await Promise.all(Array.from({length:26},async()=> (await quota.fetch(new Request('https://internal/quota',{method:'POST'}))).json()));
  assert.equal(replies.filter(r=>r.ok).length,25);
});
test('route rejects disabled, malformed and oversized reports before forwarding', async () => {
  const url='https://crash.dustwave.xyz/v1/fine-me-not/reports';
  assert.equal((await worker.fetch(new Request(url,{method:'POST'}),{})).status,503);
  const env={FINE_ME_NOT_REPORTS_ENABLED:'true',GITHUB_APP_PRIVATE_KEY:'synthetic',FINE_ME_NOT_REPORT_GROUPS:{},FINE_ME_NOT_INBOX:namespace(()=>new FineMeNotInbox(context(),{}))};
  for(const body of ['{','x'.repeat(32769),JSON.stringify({...fixture,secret:'bad'})]){
    const response=await worker.fetch(new Request(url,{method:'POST',headers:{'Content-Type':'application/json'},body}),env);
    assert.equal(response.status,400);
  }
});


test('group receipt survives the legacy 1000-entry limit and expires after 30 days', async () => {
  const ctx = context(); let count = 0;
  const group = new FineMeNotReportGroup(ctx, {}, async () => ({ action: 'updated', issueNumber: ++count }));
  const first = report(); await group.fetch(request(first));
  for (let i = 0; i < 1001; i++) await group.fetch(request(report()));
  const retry = await (await group.fetch(request(first))).json();
  assert.equal(retry.action, 'duplicate'); assert.equal(retry.issueNumber, 1); assert.equal(count, 1002);
  const receipt = ctx.data.get(`receipt:${first.id}`); receipt.expires = Date.now() - 1;
  await group.alarm(); assert.equal(ctx.data.has(`receipt:${first.id}`), false);
});
