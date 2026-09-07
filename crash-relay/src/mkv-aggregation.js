import { ReviewedReportGroup } from './reviewed-report-group.js';
import { mkvFingerprint, mkvGrouping, mkvRelayReport, validateMkvReport } from './mkv.js';

export class MkvReportGroup extends ReviewedReportGroup {
  constructor(ctx, env, submit) {
    super(ctx, env, { validate: validateMkvReport, fingerprint: mkvFingerprint, relayReport: mkvRelayReport,
      groupingSummary: report => ({ basis: 'mkv-magic-issue-report-v1', kind: report.kind,
        platform: report.architecture, command: report.action, message: mkvGrouping(report) }),
      repository: 'mkv-magic', failureCode: 'mkv_report_submission_failed' }, submit);
  }
}
