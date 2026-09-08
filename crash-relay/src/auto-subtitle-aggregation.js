import { ReviewedReportGroup } from './reviewed-report-group.js';
import { validateAutoSubtitleReport, autoSubtitleFingerprint, autoSubtitleRelayReport } from './auto-subtitle-contract.mjs';

const adapter={
  validate:validateAutoSubtitleReport,
  fingerprint:autoSubtitleFingerprint,relayReport:autoSubtitleRelayReport,
  labels:report=>`${report.kind==='native_crash'?'crash':'diagnostic'},automated-report,needs-triage`,
  repository:'auto-subtitle',failureCode:'auto_subtitle_report_submission_failed'
};
export class AutoSubtitleReportGroup extends ReviewedReportGroup {
  constructor(ctx,env,submit){super(ctx,env,adapter,submit);}
}
