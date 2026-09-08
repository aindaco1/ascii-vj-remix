import { submitCrashReport, updateAggregateState } from './github.js';

export function reviewedRelayFailure(error, code) {
  const status = [400, 401, 403, 404, 409, 422, 429, 500, 502, 503, 504].includes(error?.status)
    ? error.status : null;
  const operation = ['GET', 'POST', 'PATCH'].includes(error?.providerOperation)
    ? error.providerOperation : null;
  const reason = ['integration_access', 'secondary_rate_limit', 'validation_failed', 'other']
    .includes(error?.providerReason) ? error.providerReason : null;
  return { code, providerStatus: status, providerOperation: operation, providerReason: reason };
}

// One Durable Object per product fingerprint. A serial promise queue also
// covers external GitHub awaits, where storage input gates alone do not.
export class ReviewedReportGroup {
  constructor(ctx, env, adapter, submit = submitCrashReport) {
    this.ctx = ctx;
    this.env = env;
    this.tail = Promise.resolve();
    this.submit = submit;
    this.adapter = adapter;
  }

  fetch(request) {
    const operation = this.tail.then(() => this.accept(request));
    this.tail = operation.catch(() => {});
    return operation;
  }

  async accept(request) {
    try {
      const report = this.adapter.validate(await request.json());
      const fingerprint = await this.adapter.fingerprint(report);
      const relayReport = this.adapter.relayReport(report);
      const saved = await this.ctx.storage.get('group') ?? { state: null, receipts: {}, pending: {} };
      if (saved.receipts[report.id]) {
        return Response.json({ ok: true, reportId: report.id, action: 'duplicate', issueNumber: saved.receipts[report.id], fingerprint });
      }
      if (!saved.pending[report.id]) {
        // No acknowledgement until GitHub accepts it. Save the increment first
        // so a retry after a provider/storage error cannot count it twice.
        saved.state = updateAggregateState(saved.state ?? { fingerprint, count: 0,
          firstSeen: new Date().toISOString(), versions: {}, platforms: {} }, relayReport, fingerprint, new Date().toISOString());
        if (this.adapter.groupingSummary) saved.state.grouping = this.adapter.groupingSummary(report);
        for (const field of ['versions', 'platforms']) {
          const entries = Object.entries(saved.state[field]);
          saved.state[field] = Object.fromEntries(entries.slice(-32));
        }
        saved.state.count = Math.min(saved.state.count, Number.MAX_SAFE_INTEGER);
        saved.pending[report.id] = true;
        if (Object.keys(saved.pending).length > 100) return Response.json({ error: 'Report queue full' }, { status: 503 });
        await this.ctx.storage.put('group', saved);
      }
      const result = await this.submit({ ...this.env, GITHUB_OWNER: 'aindaco1', GITHUB_REPO: this.adapter.repository,
        ...(this.adapter.labels ? { CRASH_LABELS: this.adapter.labels(report) } : {}),
        CRASH_CREATION_GUARD: {
          get: key => this.ctx.storage.get(`creation:${key}`),
          put: (key, value) => this.ctx.storage.put(`creation:${key}`, value)
        },
        CRASH_INDEX: this.storageIndex(), CRASH_UPDATE_COOLDOWN_SECONDS: '0' }, relayReport, fingerprint, saved.state);
      if (!result.issueNumber || !['created', 'updated'].includes(result.action)) {
        return Response.json({ error: 'Report not accepted' }, { status: result.status ?? 503 });
      }
      saved.receipts[report.id] = result.issueNumber;
      delete saved.pending[report.id];
      const keys = Object.keys(saved.receipts);
      for (const key of keys.slice(0, Math.max(0, keys.length - 1000))) delete saved.receipts[key];
      await this.ctx.storage.put('group', saved);
      return Response.json({ ok: true, reportId: report.id, ...result });
    } catch (error) {
      // Operator diagnostics contain no report, provider text, URL, or credentials.
      console.error(reviewedRelayFailure(error, this.adapter.failureCode));
      return Response.json({ error: 'Report could not be submitted; retry later' }, { status: 502 });
    }
  }

  storageIndex() {
    return {
      get: async key => await this.ctx.storage.get(`index:${key}`) ?? null,
      put: async (key, value) => this.ctx.storage.put(`index:${key}`, JSON.parse(value))
    };
  }
}
