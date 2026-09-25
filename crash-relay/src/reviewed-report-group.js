import { ReviewedReportGroup as SharedReportGroup } from '@dustwave/desktop-core/reviewed-report-group';
import { submitCrashReport, updateAggregateState } from './github.js';
export { reviewedRelayFailure } from '@dustwave/desktop-core/reviewed-report-group';

// Keep deployment classes, Durable Object namespaces and stored keys in this repository.
export class ReviewedReportGroup extends SharedReportGroup {
  constructor(ctx, env, adapter, submit = submitCrashReport) {
    super(ctx, env, adapter, { submit, updateAggregateState, owner: 'aindaco1' });
  }
}
