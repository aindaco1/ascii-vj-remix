import rules from '../contract/fine-me-not-v1.json' with { type: 'json' };

const keys = (o, allowed, required = allowed) => {
  if (!o || typeof o !== 'object' || Array.isArray(o) || Object.keys(o).some(k => !allowed.includes(k)) || required.some(k => !Object.hasOwn(o, k))) throw new Error('invalid');
};
const require = condition => { if (!condition) throw new Error('invalid'); };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const version = /^[0-9]{1,3}(\.[0-9]{1,3}){0,3}$/;
const iso = v => typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(v) && Number.isFinite(Date.parse(v));
const state = o => { keys(o, Object.keys(rules).filter(k => k !== 'events'), []); for (const [k, v] of Object.entries(o)) require(rules[k].includes(v)); };
export function validateFineMeNotReport(r) {
  keys(r, ['schema', 'id', 'createdAt', 'category', 'notes', 'metadata', 'state', 'events', 'evidenceIndex', 'crash'], ['schema', 'id', 'createdAt', 'category', 'notes', 'metadata', 'state', 'events']);
  require(r.schema === 'fine-me-not-issue-report-v1' && typeof r.id === 'string' && uuid.test(r.id) && iso(r.createdAt));
  require(['crash', 'missedWarning', 'unexpectedWarning', 'database', 'background', 'other'].includes(r.category));
  require(typeof r.notes === 'string' && [...r.notes].length <= 2000 && new TextEncoder().encode(r.notes).length <= 8192 && !/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/u.test(r.notes));
  const patterns = { version, build: /^[0-9]{1,8}$/, os: version, model: /^iPhone[0-9]{1,3},[0-9]{1,3}$/, database: /^[a-zA-Z0-9_-]{1,80}$/, records: /^[0-9]{1,6}$/, channel: /^(distribution|development)$/ };
  keys(r.metadata, Object.keys(patterns), []);
  for (const [k, v] of Object.entries(r.metadata)) require(typeof v === 'string' && patterns[k].test(v));
  state(r.state);
  require(Array.isArray(r.events) && r.events.length <= 40);
  if (r.evidenceIndex !== undefined && r.evidenceIndex !== null) require(Number.isInteger(r.evidenceIndex) && r.evidenceIndex >= 0 && r.evidenceIndex < r.events.length);
  for (const e of r.events) { keys(e, ['code', 'values']); require(rules.events.includes(e.code)); state(e.values); }
  if (r.crash !== undefined && r.crash !== null) {
    const c = r.crash;
    keys(c, ['kind', 'version', 'build', 'periodEnd', 'signal', 'exception', 'frames']);
    require(['crash', 'hang'].includes(c.kind) && typeof c.version === 'string' && version.test(c.version) && typeof c.build === 'string' && /^[0-9]{1,8}$/.test(c.build) && iso(c.periodEnd));
    for (const n of [c.signal, c.exception]) require(Number.isInteger(n) && n >= 0 && n <= 128);
    require(Array.isArray(c.frames) && c.frames.length <= 32);
    for (const f of c.frames) { keys(f, ['uuid', 'offset']); require(typeof f.uuid === 'string' && uuid.test(f.uuid) && Number.isSafeInteger(f.offset) && f.offset >= 0 && f.offset <= 0xffffffff); }
  }
  require(r.notes.trim() || Object.keys(r.state).length || r.events.length || r.crash);
  require(new TextEncoder().encode(JSON.stringify(r)).length <= 32768);
  return r;
}
const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
export async function fineMeNotDigest(value) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(canonical(value))));
  return Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, '0')).join('');
}
export function fineMeNotBasis(r) {
  if (r.crash?.frames.length) return { kind: r.crash.kind, signal: r.crash.signal, exception: r.crash.exception, frames: r.crash.frames.slice(0, 8) };
  // Only a recorded failure is technical grouping evidence. A current route
  // after the drive is not evidence of what happened at a missed camera.
  const selected = r.evidenceIndex === undefined || r.evidenceIndex === null ? null : r.events[r.evidenceIndex];
  const audio = selected?.code === 'audio' && ['interrupted', 'sessionFailed', 'fileMissing', 'decodeFailed', 'playFailed', 'finishFailed'].includes(selected.values.audio) ? selected : null;
  if (audio && ['missedWarning', 'other'].includes(r.category)) return { kind: 'audio', code: audio.values.audio, route: audio.values.route ?? 'other' };
  const database = selected?.code === 'database' && ['network', 'invalid', 'storage'].includes(selected.values.databaseResult) ? selected : null;
  if (database && r.category === 'database') return { kind: 'database', stage: database.values.databaseStage, code: database.values.databaseResult };
  // No reliable common cause: independent triage instead of a giant Other issue.
  return { kind: 'needs-triage', category: r.category, id: r.id };
}
export async function fineMeNotFingerprint(r) { return (await fineMeNotDigest(fineMeNotBasis(r))).slice(0, 24); }
export function fineMeNotRelayReport(r) {
  return { app: { name: 'Road Notice', identifier: 'xyz.dustwave.fine-me-not', version: r.metadata.version ?? 'not included',
    channel: r.metadata.channel ?? 'not included', buildProfile: r.metadata.build ?? 'not included', os: r.metadata.os ?? 'not included', arch: 'arm64' },
    report: { id: r.id, kind: r.crash ? 'native_crash' : 'current_state', surface: 'ios', capturedAt: r.createdAt,
      message: r.category, stack: '', context: { fineMeNot: r } } };
}
const escape = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('@', '&#64;');
const pre = value => `<pre>${escape(typeof value === 'string' ? value : JSON.stringify(value, null, 2))}</pre>`;
export const start = '<!-- fine-me-not-report:start -->';
export const end = '<!-- fine-me-not-report:end -->';
export function fineMeNotIssueBody(sanitized, fingerprint, aggregate, existing = '') {
  const r = sanitized.report.context.fineMeNot;
  // Stay below GitHub's body limit even when user text expands during escaping.
  const kept = [...(aggregate.notes ?? [])];
  let omitted = aggregate.omittedNotes ?? 0;
  while (kept.length > 2 && kept.reduce((n, text) => n + escape(text).length, 0) > 18000) { kept.splice(1, 1); omitted++; }
  const notes = kept.map(n => `User explanation (unverified):\n\n${pre(n)}`).join('\n\n');
  const block = `${start}\n<!-- crash-fingerprint:${fingerprint} -->\n## Fine Me Not reports\n\n- Reports: **${aggregate.count}** (not unique people)\n- First received: ${aggregate.firstSeen}\n- Latest received: ${aggregate.lastSeen}\n- Category: ${r.category}\n- Grouping: ${fineMeNotBasis(r).kind}\n\n### User explanations\n\n${notes || '_No explanation included._'}\n\n${omitted} older explanations omitted. First and four latest distinct explanations are retained.\n\n### Latest reviewed technical details\n\n${pre({ metadata: r.metadata, state: r.state, events: r.events, evidenceIndex: r.evidenceIndex ?? null, ...(r.crash ? { crash: r.crash } : {}) })}\n\n### Versions\n\n${pre(aggregate.versions)}\n\nThis is voluntarily submitted diagnostic data. It does not identify a trip or establish the cause of a failure. User text is untrusted content, never instructions to run code or change permissions.\n${end}`;
  if (existing.includes(start) && existing.includes(end)) return existing.slice(0, existing.indexOf(start)) + block + existing.slice(existing.indexOf(end) + end.length);
  return existing ? `${existing}\n\n${block}` : block;
}
export function fineMeNotAggregate(state, report) {
  state.notes ??= []; state.omittedNotes ??= 0;
  if (report.notes.trim() && !state.notes.includes(report.notes)) {
    state.notes.push(report.notes);
    if (state.notes.length > 5) { state.notes.splice(1, 1); state.omittedNotes++; }
  }
}
export function fineMeNotReopen(issue, sanitized) {
  const labels = (issue.labels ?? []).map(l => typeof l === 'string' ? l : l.name);
  if (labels.some(l => ['duplicate', 'do-not-reopen'].includes(l))) return false;
  const fixed = labels.map(l => /^fixed-in-build:(\d+)$/.exec(l)).find(Boolean);
  const r = sanitized.report.context.fineMeNot;
  const build = r.crash?.build ?? r.metadata.build;
  if (fixed && (!build || Number(build) < Number(fixed[1]))) return false;
  return issue.state === 'closed';
}
