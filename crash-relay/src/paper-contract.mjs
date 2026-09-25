// Paper owns this strict public projection. The relay copy must remain byte-identical.
export const schema = 'paper-diagnostic-v1';
export const events = ['launch','loginLaunch','cleanQuit','toggled','importFailed','operationFailed','recovery','shortcutUnavailable','sleep','wake','displaysChanged','powerChanged'];
const pauses = ['none','disabled','display_excluded','comparing','snoozed','app_excluded','app_not_included','battery','low_power','schedule'];
const images = ['Paper','Sparkle','SwiftUI','SwiftUICore','AppKit','QuartzCore','Metal','libswiftCore.dylib','libsystem_kernel.dylib'];
const signals = ['SIGABRT','SIGSEGV','SIGBUS','SIGILL','SIGTRAP','SIGKILL','SIGFPE','SIGTERM','SIGPIPE'];
const exceptions = ['EXC_BAD_ACCESS','EXC_BAD_INSTRUCTION','EXC_ARITHMETIC','EXC_SOFTWARE','EXC_BREAKPOINT','EXC_CRASH','EXC_RESOURCE','EXC_GUARD'];
const version = /^[0-9]{1,8}(?:\.[0-9]{1,8}){0,3}$/;
function requireValue(ok) { if (!ok) throw new TypeError('Invalid Paper diagnostic report'); }
function object(value, keys) { requireValue(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(k => keys.includes(k))); }
function integer(value, max) { requireValue(Number.isInteger(value) && value >= 0 && value <= max); }
function choice(value, values) { requireValue(values.includes(value)); }
function versions(value) { for (const k of ['version','build','operatingSystem']) requireValue(typeof value[k] === 'string' && version.test(value[k])); }
export function validatePaperReport(r) {
    object(r,['schema','id','kind','application','state','crash']);
    requireValue(r.schema === schema && typeof r.id === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(r.id));
    choice(r.kind,['current_state','native_crash']);
    object(r.application,['version','build','operatingSystem','architecture']); versions(r.application); requireValue(r.application.architecture === 'arm64');
    const s = r.state;
    object(s,['enabled','pause','textureSource','intensityBucket','displays','excludedDisplays','floatingPanelsClear','battery','lowPower','schedule','appRule','events']);
    for (const k of ['enabled','floatingPanelsClear','battery','lowPower']) requireValue(typeof s[k] === 'boolean');
    choice(s.pause,pauses); choice(s.textureSource,['bundled','imported']); integer(s.intensityBucket,9);
    integer(s.displays,16); integer(s.excludedDisplays,16); requireValue(s.excludedDisplays <= s.displays);
    choice(s.schedule,['disabled','fixed','sunsetToSunrise','sunriseToSunset']); choice(s.appRule,['except','only']);
    requireValue(Array.isArray(s.events) && s.events.length <= 20); s.events.forEach(e => choice(e,events));
    if (r.kind === 'native_crash') {
        const c = r.crash;
        object(c,['exception','signal','image','imageOffset','version','build','operatingSystem']); versions(c); choice(c.exception,exceptions);
        if (c.signal !== undefined) choice(c.signal,signals);
        if (c.image !== undefined) choice(c.image,images);
        if (c.imageOffset !== undefined) integer(c.imageOffset,1e9);
        requireValue((c.image === undefined) === (c.imageOffset === undefined));
        for (const k of ['version','build','operatingSystem']) requireValue(c[k] === r.application[k]);
    } else requireValue(r.crash === undefined);
    requireValue(new TextEncoder().encode(JSON.stringify(r)).length <= 8192);
    return r;
}
export async function paperFingerprint(input) {
    const r = validatePaperReport(input), s = r.state, c = r.crash;
    const grouping = r.kind === 'native_crash'
        ? { product:'paper',kind:r.kind,exception:c.exception,signal:c.signal??null,image:c.image??null,imageOffset:c.imageOffset??null,build:c.build,operatingSystem:c.operatingSystem }
        : { product:'paper',kind:r.kind,pause:s.pause,textureSource:s.textureSource,schedule:s.schedule,appRule:s.appRule,
            failure:[...s.events].reverse().find(e => ['importFailed','operationFailed','recovery','shortcutUnavailable'].includes(e)) ?? 'none' };
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(grouping)));
    return [...new Uint8Array(hash)].map(v => v.toString(16).padStart(2,'0')).join('').slice(0,20);
}
export function paperRelayReport(input) {
    const r = validatePaperReport(input);
    return { app:{name:'Paper',identifier:'xyz.dustwave.paper',version:r.application.version,buildProfile:r.application.build,os:`macos ${r.application.operatingSystem}`,arch:'arm64',channel:'production'},
        report:{id:r.id,kind:r.kind,surface:r.kind==='native_crash'?'native':'overlay',message:r.crash?.exception??'Reviewed Paper state',stack:'',capturedAt:new Date().toISOString(),context:{paperDiagnostics:r}} };
}
