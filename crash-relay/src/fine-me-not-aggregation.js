import { ReviewedReportGroup } from './reviewed-report-group.js';
import { validateFineMeNotReport, fineMeNotFingerprint, fineMeNotRelayReport, fineMeNotAggregate, fineMeNotIssueBody, fineMeNotReopen, fineMeNotDigest } from './fine-me-not.js';
import { submitCrashReport } from './github.js';
const retention = 30 * 86400 * 1000;
export class FineMeNotReportGroup extends ReviewedReportGroup {
  constructor(ctx, env, submit = submitCrashReport) {
    super(ctx, env, { validate: validateFineMeNotReport, fingerprint: fineMeNotFingerprint, relayReport: fineMeNotRelayReport,
      receiptRetentionMS: retention,
      repository: 'fine-me-not', failureCode: 'fine-me-not-submit-failed', labels: () => 'bug,automated-report,needs-triage',
      aggregate: fineMeNotAggregate, issueBody: fineMeNotIssueBody, reopen: fineMeNotReopen,
      dailyLimit: async () => {
        const quota = env.FINE_ME_NOT_INBOX.get(env.FINE_ME_NOT_INBOX.idFromName('issue-quota'));
        return (await quota.fetch(new Request('https://internal/quota', { method: 'POST' }))).json();
      } }, submit);
  }
  alarm() {
    const operation = this.tail.then(async () => {
      const entries = await this.ctx.storage.list({ prefix: 'receipt:' });
      const expired = [...entries].filter(([, entry]) => entry.expires <= Date.now()).map(([key]) => key);
      for (let i = 0; i < expired.length; i += 128) await this.ctx.storage.delete(expired.slice(i, i + 128));
      if (entries.size > expired.length) await this.ctx.storage.setAlarm(Date.now() + 86400000);
    });
    this.tail = operation.catch(() => {});
    return operation;
  }
}
// A product-scoped ID ledger prevents edited retries from escaping to another
// fingerprint. Serial forwarding also bounds concurrent GitHub writes.
export class FineMeNotInbox {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; this.tail = Promise.resolve(); }
  fetch(request) { const next = this.tail.then(() => this.accept(request)).catch(() => Response.json({ error: "Reporting temporarily unavailable" }, { status: 503 })); this.tail = next.catch(() => {}); return next; }
  async alarm() {
    const entries = await this.ctx.storage.list({ prefix: 'receipt:' });
    const expired = [...entries].filter(([, e]) => e.expires <= Date.now()).map(([key]) => key);
    for (let i = 0; i < expired.length; i += 128) await this.ctx.storage.delete(expired.slice(i, i + 128));
    if (entries.size > expired.length) await this.ctx.storage.setAlarm(Date.now() + 86400000);
    await this.ctx.storage.delete('rate');
  }
  async accept(request) {
    if (new URL(request.url).pathname === '/rate') {
      const count = (await this.ctx.storage.get('rate') ?? 0) + 1;
      await this.ctx.storage.put('rate', count);
      await this.ctx.storage.setAlarm(Date.now() + 7200000);
      return Response.json(count <= 10 ? { ok: true } : { ok: false, status: 429, retryAfter: 3600 });
    }
    if (new URL(request.url).pathname === '/quota') {
      const day = new Date().toISOString().slice(0, 10);
      const old = await this.ctx.storage.get('quota');
      const count = old?.day === day ? old.count : 0;
      if (count >= 25) return Response.json({ ok: false, status: 429, error: 'Daily issue limit reached' });
      await this.ctx.storage.put('quota', { day, count: count + 1 });
      return Response.json({ ok: true });
    }
    const report = validateFineMeNotReport(await request.json());
    const now = Date.now();
    const entries = await this.ctx.storage.list({ prefix: 'receipt:' });
    const ledger = Object.fromEntries([...entries].map(([k, v]) => [k.slice(8), v]));
    for (const [id, entry] of Object.entries(ledger)) if (entry.expires <= now) { delete ledger[id]; await this.ctx.storage.delete(`receipt:${id}`); }
    const hash = await fineMeNotDigest(report);
    if (ledger[report.id]?.hash && ledger[report.id].hash !== hash) return Response.json({ error: 'Report ID belongs to a different draft' }, { status: 409 });
    if (ledger[report.id]?.receipt) return Response.json({ ...ledger[report.id].receipt, action: 'duplicate' });
    if (!ledger[report.id] && Object.keys(ledger).length >= 10000) return Response.json({ error: 'Reporting capacity reached; retry later' }, { status: 503 });
    ledger[report.id] ??= { hash, expires: now + retention };
    await this.ctx.storage.put(`receipt:${report.id}`, ledger[report.id]);
    await this.ctx.storage.setAlarm(now + 86400000);
    const fingerprint = await fineMeNotFingerprint(report);
    const group = this.env.FINE_ME_NOT_REPORT_GROUPS.get(this.env.FINE_ME_NOT_REPORT_GROUPS.idFromName(`fine-me-not:${fingerprint}`));
    const response = await group.fetch(new Request('https://internal/report', { method: 'POST', body: JSON.stringify(report) }));
    const result = await response.json();
    if (response.ok && result.ok && result.issueNumber) { ledger[report.id].receipt = result; await this.ctx.storage.put(`receipt:${report.id}`, ledger[report.id]);
    await this.ctx.storage.setAlarm(now + 86400000); }
    return Response.json(result, { status: response.status });
  }
}
