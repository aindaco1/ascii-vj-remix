import { ReviewedReportGroup, reviewedRelayFailure } from './reviewed-report-group.js';
import { cutNotesFingerprint, cutNotesGrouping, cutNotesRelayReport, validateCutNotesReport } from './cutnotes.js';

const adapter = {
  validate: validateCutNotesReport,
  fingerprint: cutNotesFingerprint,
  relayReport: cutNotesRelayReport,
  groupingSummary: report => {
    const grouping = cutNotesGrouping(report);
    return { basis: 'cutnotes-issue-report-v1', kind: report.kind,
      platform: report.application.architecture,
      command: report.state?.workflow ?? 'application',
      errorCode: report.state?.failureCode ?? report.crash?.exception ?? 'current_state',
      phase: report.state?.progressStage ?? '',
      message: JSON.stringify(grouping) };
  },
  repository: 'cutnotes',
  failureCode: 'cutnotes_report_submission_failed'
};

export class CutNotesReportGroup extends ReviewedReportGroup {
  constructor(ctx, env, submit) { super(ctx, env, adapter, submit); }
}

export function cutNotesRelayFailure(error) {
  return reviewedRelayFailure(error, adapter.failureCode);
}
