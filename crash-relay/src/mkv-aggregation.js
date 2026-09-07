import { ReviewedReportGroup } from './reviewed-report-group.js';
import { mkvFingerprint, mkvRelayReport, validateMkvReport } from './mkv.js';

export class MkvReportGroup extends ReviewedReportGroup {
  constructor(ctx, env, submit) {
    super(ctx, env, { validate: validateMkvReport, fingerprint: mkvFingerprint, relayReport: mkvRelayReport,
      repository: 'mkv-magic', failureCode: 'mkv_report_submission_failed' }, submit);
  }
}
