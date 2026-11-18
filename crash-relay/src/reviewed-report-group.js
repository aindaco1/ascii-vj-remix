import { ReviewedReportGroup as SharedReportGroup } from '@dustwave/desktop-core/reviewed-report-group';
import { aggregateArtifact, writeIssueArtifact } from './issue-artifacts.js';
import { submitCrashReport, updateAggregateState } from './github.js';
export { reviewedRelayFailure } from '@dustwave/desktop-core/reviewed-report-group';

// Keep deployment classes, Durable Object namespaces and stored keys in this repository.
export class ReviewedReportGroup extends SharedReportGroup {
  constructor(ctx, env, adapter, submit = submitCrashReport) {
    super(ctx, env, { ...adapter, issueArtifact: aggregateArtifact }, { submit, updateAggregateState, owner: 'aindaco1',
      writeIssueArtifact: env.ISSUE_ARTIFACTS_ENABLED === 'true' ? writeIssueArtifact : undefined });
  }
}
