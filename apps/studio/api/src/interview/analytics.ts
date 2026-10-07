import { createHash } from 'node:crypto';

import { Effect } from 'effect';

import { POSTHOG_APP_PROPS } from '@codaco/shared-consts';
import { ParticipantSession } from '@codaco/studio-contract/middleware/session';
import type {
  AnalyticsEvent,
  AnalyticsInput,
} from '@codaco/studio-contract/schema/participant';

import { TenantScope } from '../db/tenant.ts';
import { Analytics, type AnalyticsCapture } from '../platform/analytics.ts';
import { enforceRateLimit } from '../rate-limit/enforce.ts';
import { readInstallationId } from '../setup/bootstrap.ts';
import { participantAnalyticsEnabled } from '../study/settings.ts';
import { STUDIO_VERSION } from '../version.ts';
import { loadSessionContext } from './store.ts';

const EXCEPTION_EVENT = '$exception';

const PARTICIPANT_APP = 'studio';
const PARTICIPANT_APP_NAME = 'Network Canvas Studio';

const WITHHELD_PROPERTIES = new Set([
  'distinct_id',
  'token',
  'api_key',
  '$set',
  '$set_once',
  '$unset',
  '$groups',
  '$ip',
  '$anon_distinct_id',
  '$session_id',
  '$current_url',
  '$lib',
]);

type ForwardingConfig = {
  readonly installationId: string;
  readonly distinctId: string;
};

const participantDistinctId = (installationId: string, sessionId: string) =>
  `participant:${createHash('sha256').update(`${installationId}:${sessionId}`).digest('hex').slice(0, 32)}`;

export const participantAnalyticsConfig = Effect.fn(
  'interview.participantAnalyticsConfig',
)(function* (sessionId: string, studySettings: unknown) {
  const analytics = yield* Analytics;
  if (!analytics.enabled || !participantAnalyticsEnabled(studySettings)) {
    return null;
  }
  const installationId = yield* readInstallationId();
  if (installationId === null) return null;
  return {
    installationId,
    distinctId: participantDistinctId(installationId, sessionId),
  } satisfies ForwardingConfig;
});

const forwardableEvent = (
  captured: typeof AnalyticsEvent.Type,
  config: ForwardingConfig,
): AnalyticsCapture | null => {
  if (captured.event.startsWith('$') && captured.event !== EXCEPTION_EVENT) {
    return null;
  }
  const properties = Object.fromEntries(
    Object.entries(captured.properties).filter(
      ([key]) => !WITHHELD_PROPERTIES.has(key),
    ),
  );
  return {
    event: captured.event,
    distinctId: config.distinctId,
    timestamp: captured.timestamp,
    properties: {
      ...properties,
      [POSTHOG_APP_PROPS.APP]: PARTICIPANT_APP,
      [POSTHOG_APP_PROPS.APP_NAME]: PARTICIPANT_APP_NAME,
      [POSTHOG_APP_PROPS.APP_VERSION]: STUDIO_VERSION,
      [POSTHOG_APP_PROPS.HOST_VERSION]: STUDIO_VERSION,
      [POSTHOG_APP_PROPS.INSTALLATION_ID]: config.installationId,
      $process_person_profile: false,
      $geoip_disable: true,
    },
  };
};

export const forwardParticipantEvents = Effect.fn(
  'interview.forwardParticipantEvents',
)(function* (input: typeof AnalyticsInput.Type) {
  const session = yield* ParticipantSession;
  yield* enforceRateLimit('participant_analytics', session.sessionId);
  const analytics = yield* Analytics;
  if (!analytics.enabled) return;

  const config = yield* TenantScope.open(
    session.access,
    Effect.gen(function* () {
      const context = yield* loadSessionContext(session.sessionId);
      if (context === null) return null;
      return yield* participantAnalyticsConfig(
        session.sessionId,
        context.studySettings,
      );
    }),
  );
  if (config === null) return;

  const events = input.events.flatMap((captured) => {
    const forwardable = forwardableEvent(captured, config);
    return forwardable === null ? [] : [forwardable];
  });
  if (events.length === 0) return;
  yield* analytics.capture(events);
});
