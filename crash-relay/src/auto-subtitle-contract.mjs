// Canonical app-owned privacy contract, also copied verbatim into the crash relay.
// No free-form strings or user content are accepted in a shareable report.
export const reportSchema='auto-subtitle-diagnostic-v1';
export const phases=['idle','starting','timing','speech','wording','export','model','unknown'];
export const errorCodes=['none','MODEL_MISSING','PROCESSING_FAILED','CANCELLED','NATIVE_CRASH','INTERRUPTED'];
const images=['AutoSubtitle','auto-subtitle-speech','node','python3.11','SwiftUI','SwiftUICore','AppKit','CoreML','libswiftCore.dylib','libsystem_kernel.dylib'];
const signals=['SIGABRT','SIGSEGV','SIGBUS','SIGILL','SIGTRAP','SIGKILL','SIGFPE','SIGTERM','SIGPIPE'];
const exceptions=['EXC_BAD_ACCESS','EXC_BAD_INSTRUCTION','EXC_ARITHMETIC','EXC_SOFTWARE','EXC_BREAKPOINT','EXC_CRASH','EXC_RESOURCE','EXC_GUARD'];
const kinds=['current_state','workflow_failure','interrupted_job','native_crash'];
const mediaTypes=['none','mkv','mp4','mov','m4v','webm','avi','wav','mp3','m4a','flac','other'];
const version=/^[0-9]{1,8}(?:\.[0-9]{1,8}){0,3}$/;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
function requireValue(ok){if(!ok)throw new TypeError('Invalid Auto Subtitle diagnostic report');}
function object(value,keys){requireValue(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(k=>keys.includes(k)));}
function choice(value,values){requireValue(values.includes(value));}

export function validateAutoSubtitleReport(report) {
  object(report,['schema','id','kind','application','state','crash']);
  requireValue(report.schema===reportSchema&&typeof report.id==='string'&&uuid.test(report.id));choice(report.kind,kinds);
  object(report.application,['version','build','operatingSystem','architecture']);
  for(const key of ['version','build','operatingSystem'])requireValue(typeof report.application[key]==='string'&&version.test(report.application[key]));
  requireValue(report.application.architecture==='arm64');
  const s=report.state;
  object(s,['mode','phase','status','format','cleanup','improve','translated','modelInstalled','errorCode','videoType','subtitleType','progressBucket','tool','signal','exitCode']);
  choice(s.mode,['align','generate']);choice(s.phase,phases);choice(s.status,['idle','running','completed','cancelled','failed','interrupted']);
  choice(s.format,['srt','ass']);choice(s.errorCode,errorCodes);choice(s.videoType,mediaTypes);choice(s.subtitleType,['none','srt','ass','other']);
  for(const key of ['cleanup','improve','translated','modelInstalled'])requireValue(typeof s[key]==='boolean');
  requireValue(Number.isInteger(s.progressBucket)&&s.progressBucket>=-1&&s.progressBucket<=10);
  choice(s.tool,['none','engine','ffmpeg','ffprobe','speech','sync']);choice(s.signal,['none',...signals]);requireValue(Number.isInteger(s.exitCode)&&s.exitCode>=-1&&s.exitCode<=255);
  if(report.kind==='native_crash') {
    object(report.crash,['exception','signal','image','imageOffset']);choice(report.crash.exception,exceptions);
    if(report.crash.signal!==undefined)choice(report.crash.signal,signals);
    if(report.crash.image!==undefined)choice(report.crash.image,images);
    if(report.crash.imageOffset!==undefined)requireValue(Number.isInteger(report.crash.imageOffset)&&report.crash.imageOffset>=0&&report.crash.imageOffset<=1e9);
  } else requireValue(report.crash===undefined);
  requireValue(new TextEncoder().encode(JSON.stringify(report)).length<=4096);
  return report;
}
export function projectState(input,id,kind='current_state') {
  const pick=(value,values,fallback)=>values.includes(value)?value:fallback;
  const app=input.application??{},s=input.state??{};
  const report={schema:reportSchema,id,kind:pick(kind,kinds,'current_state'),application:{
    version:typeof app.version==='string'&&version.test(app.version)?app.version:'0',
    build:typeof app.build==='string'&&version.test(app.build)?app.build:'0',
    operatingSystem:typeof app.operatingSystem==='string'&&version.test(app.operatingSystem)?app.operatingSystem:'0',architecture:'arm64'},state:{
    mode:pick(s.mode,['align','generate'],'align'),phase:pick(s.phase,phases,'unknown'),
    status:pick(s.status,['idle','running','completed','cancelled','failed','interrupted'],'idle'),format:pick(s.format,['srt','ass'],'srt'),
    cleanup:s.cleanup===true,improve:s.improve===true,translated:s.translated===true,modelInstalled:s.modelInstalled===true,
    errorCode:pick(s.errorCode,errorCodes,s.status==='failed'?'PROCESSING_FAILED':'none'),videoType:pick(s.videoType,mediaTypes,'other'),subtitleType:pick(s.subtitleType,['none','srt','ass','other'],'other'),
    tool:pick(s.tool,['none','engine','ffmpeg','ffprobe','speech','sync'],'none'),signal:pick(s.signal,['none',...signals],'none'),exitCode:Number.isInteger(s.exitCode)&&s.exitCode>=-1&&s.exitCode<=255?s.exitCode:-1,
    progressBucket:Number.isInteger(s.progressBucket)&&s.progressBucket>=-1&&s.progressBucket<=10?s.progressBucket:-1}};
  return validateAutoSubtitleReport(report);
}
export function crashFacts(header,body) {
  requireValue(header.bundleID==='com.dustwave.autosubtitle'&&['AutoSubtitle','Auto Subtitle'].includes(body.procName));
  const type=body.exception?.type;choice(type,exceptions);
  const result={exception:type};
  if(signals.includes(body.exception?.signal))result.signal=body.exception.signal;
  const frames=body.threads?.[body.faultingThread]?.frames??[];
  for(const frame of frames.slice(0,12)) {
    const image=body.usedImages?.[frame.imageIndex]?.name;
    if(images.includes(image)&&Number.isInteger(frame.imageOffset)&&frame.imageOffset>=0&&frame.imageOffset<=1e9){result.image=image;result.imageOffset=frame.imageOffset;break;}
  }
  return result;
}
export function crashApplication(header,body,id) {
  const bundle=body.bundleInfo??{};
  const os=typeof body.osVersion?.train==='string'?body.osVersion.train.match(/^macOS ([0-9]{1,3}(?:\.[0-9]{1,3}){0,2})(?: \([A-Za-z0-9]+\))?$/):null;
  return projectState({application:{version:header.app_version??bundle.CFBundleShortVersionString,
    build:header.build_version??bundle.CFBundleVersion,operatingSystem:os?.[1]}},id).application;
}
export async function autoSubtitleFingerprint(input) {
  const r=validateAutoSubtitleReport(input),s=r.state,c=r.crash;
  const grouping={product:'auto-subtitle',kind:r.kind,mode:s.mode,phase:s.phase,errorCode:s.errorCode,format:s.format,tool:s.tool,signal:s.signal,exitCode:s.exitCode,
    crash:c?{exception:c.exception,signal:c.signal??null,image:c.image??null,imageOffset:c.imageOffset??null,build:r.application.build,operatingSystem:r.application.operatingSystem}:null};
  if(r.kind==='current_state')grouping.state={status:s.status,cleanup:s.cleanup,improve:s.improve,translated:s.translated,modelInstalled:s.modelInstalled,videoType:s.videoType,subtitleType:s.subtitleType,progressBucket:s.progressBucket};
  // Importing the same crash while viewing a different workflow must not split it.
  if(r.kind==='native_crash')for(const key of ['mode','phase','errorCode','format','tool','signal','exitCode'])delete grouping[key];
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(grouping)));
  return [...new Uint8Array(hash)].map(v=>v.toString(16).padStart(2,'0')).join('').slice(0,20);
}
export function autoSubtitleRelayReport(input) {
  const r=validateAutoSubtitleReport(input);
  return {app:{name:'Auto Subtitle',identifier:'com.dustwave.autosubtitle',version:r.application.version,buildProfile:r.application.build,os:`macos ${r.application.operatingSystem}`,arch:'arm64',channel:'production'},
    report:{id:r.id,kind:r.kind,surface:r.kind==='native_crash'?'native':'workflow',message:r.kind==='current_state'?'Reviewed current state':r.state.errorCode,stack:'',capturedAt:new Date().toISOString(),context:{autoSubtitleDiagnostics:r}}};
}
