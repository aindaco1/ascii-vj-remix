import { validateMkvReport } from './mkv.js';

const status = document.querySelector('#status');
const send = document.querySelector('#send');
const preview = document.querySelector('#preview');
const discard = document.querySelector('#discard');
let report;
const storageKey = 'mkv-reviewed-report';
try {
  const fragment = location.hash.slice(1);
  history.replaceState(null, '', location.pathname);
  const raw = fragment ? atob(decodeURIComponent(fragment)) : sessionStorage.getItem(storageKey);
  if (!raw || raw.length > 4096) throw new Error();
  report = validateMkvReport(JSON.parse(raw));
  sessionStorage.setItem(storageKey, JSON.stringify(report));
  preview.textContent = JSON.stringify(report, null, 2);
  send.disabled = false;
  status.textContent = 'Not submitted. Review the exact metadata, then choose Send.';
} catch {
  status.textContent = 'No valid report. Open Help > Report a Problem in MKV Magic and continue from there.';
}
send.addEventListener('click', async () => {
  if (!report || send.disabled) return;
  send.disabled = true;
  discard.disabled = true;
  status.textContent = 'Sending reviewed report…';
  try {
    const response = await fetch('/v1/mkv-magic/reports', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(report),
      credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(15000) });
    if (!response.ok || !response.body) throw new Error();
    const reader = response.body.getReader();
    let raw = ''; let size = 0;
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 4096) { await reader.cancel(); throw new Error(); }
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
    const receipt = JSON.parse(raw);
    if (receipt.ok !== true || receipt.reportId !== report.id || !Number.isSafeInteger(receipt.issueNumber)
      || receipt.issueNumber < 1 || !['created', 'updated', 'duplicate'].includes(receipt.action)) throw new Error();
    sessionStorage.removeItem(storageKey);
    status.textContent = 'Accepted. Similar reports are grouped in ';
    const link = document.createElement('a');
    link.href = 'https://github.com/aindaco1/mkv-magic/issues/' + receipt.issueNumber;
    link.textContent = 'GitHub issue #' + receipt.issueNumber;
    link.rel = 'noreferrer'; status.append(link);
  } catch {
    status.textContent = 'Submission was not confirmed. Check your connection and retry; the same report ID prevents duplicate counting within the relay retention window.';
    send.disabled = false;
  } finally {
    discard.disabled = false;
  }
});
discard.addEventListener('click', () => {
  if (discard.disabled) return;
  sessionStorage.removeItem(storageKey); report = null; send.disabled = true;
  preview.textContent = ''; status.textContent = 'Browser copy discarded. Nothing further will be sent.';
});
