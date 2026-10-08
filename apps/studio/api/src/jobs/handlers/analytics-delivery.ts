import { Effect, Option } from 'effect';

import { usageCapture } from '../../analytics/usage-events.ts';
import { Analytics, AnalyticsUndelivered } from '../../platform/analytics.ts';
import { InstallationIdentity } from '../../platform/installation-identity.ts';
import type { HandledJob, JobOutcome } from '../worker.ts';

export const analyticsDelivery = Effect.fn('job.analytics-delivery')(function* (
  job: HandledJob<'analytics-delivery'>,
): Effect.fn.Return<
  JobOutcome,
  AnalyticsUndelivered,
  Analytics | InstallationIdentity
> {
  const analytics = yield* Analytics;
  if (!analytics.enabled) return 'suppressed';
  const installationId = (yield* InstallationIdentity).current();
  if (Option.isNone(installationId)) {
    return yield* new AnalyticsUndelivered({ reason: 'installation_unknown' });
  }
  const { usage } = job.payload;
  const captured = usageCapture(usage, installationId.value);
  if (usage.event === 'researcher_signed_in') {
    yield* analytics.identify({
      distinctId: captured.distinctId,
      timestamp: captured.timestamp,
    });
  }
  yield* analytics.deliver([captured]);
  return 'completed';
});
