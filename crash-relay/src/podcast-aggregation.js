import { ReviewedReportGroup, reviewedRelayFailure } from './reviewed-report-group.js';
import { podcastFingerprint, podcastRelayReport, validatePodcastReport } from './podcast.js';

const adapter = {
  validate: validatePodcastReport, fingerprint: podcastFingerprint, relayReport: podcastRelayReport,
  repository: 'podcast-visualizer', failureCode: 'podcast_report_submission_failed'
};

// Keep the deployed Durable Object class and its namespace unchanged.
export class PodcastReportGroup extends ReviewedReportGroup {
  constructor(ctx, env, submit) { super(ctx, env, adapter, submit); }
}
export function podcastRelayFailure(error) { return reviewedRelayFailure(error, adapter.failureCode); }
