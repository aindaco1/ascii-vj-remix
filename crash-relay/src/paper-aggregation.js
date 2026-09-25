import { ReviewedReportGroup } from './reviewed-report-group.js';
import { validatePaperReport, paperFingerprint, paperRelayReport } from './paper-contract.mjs';
const adapter = {
    validate: validatePaperReport, fingerprint: paperFingerprint, relayReport: paperRelayReport,
    labels: report => `${report.kind === 'native_crash' ? 'crash' : 'diagnostic'},automated-report,needs-triage`,
    repository: 'paper', failureCode: 'paper_report_submission_failed'
};
export class PaperReportGroup extends ReviewedReportGroup {
    constructor(ctx, env, submit) { super(ctx, env, adapter, submit); }
}
