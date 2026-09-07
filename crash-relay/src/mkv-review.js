import script from './mkv-review-client.generated.js';

// Only our prebuilt browser bundle is embedded, never user report data.
export function mkvReviewPage() {
  const nonce = crypto.randomUUID();
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Review MKV Magic Report</title>
    <style nonce="${nonce}">:root{color-scheme:light dark}body{font:16px system-ui;max-width:800px;margin:40px auto;padding:0 20px}pre{white-space:pre-wrap;overflow-wrap:anywhere;border:1px solid gray;padding:16px;max-height:55vh;overflow:auto}button{font:inherit;padding:10px 16px;margin:8px 8px 8px 0}a{color:inherit}</style>
    <main><h1>Review MKV Magic report</h1><p>Sending is optional. This metadata becomes a public issue in MKV Magic’s GitHub repository. Similar symptoms update one issue; aggregation does not establish a root cause.</p>
    <p>Media, filenames, subtitle text, raw logs, and full crash incidents are not accepted. Your browser makes a normal web connection; the relay uses connection information for abuse prevention.</p>
    <pre id="preview" aria-label="Exact report metadata">No report loaded.</pre>
    <button id="send" disabled>Send Reviewed Report</button><button id="discard">Discard Browser Copy</button>
    <p id="status" role="status" aria-live="polite">Not submitted.</p></main><script nonce="${nonce}">${script}</script></html>`, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'` }
  });
}
