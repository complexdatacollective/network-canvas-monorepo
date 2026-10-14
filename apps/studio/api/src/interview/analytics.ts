import { Effect, Option, Schema } from 'effect';

import {
  InterviewAnalyticsEnvelope,
  InterviewAnalyticsEvents,
  InterviewExceptionProperties,
} from '@codaco/interview/analytics-events';
import { POSTHOG_APP_PROPS } from '@codaco/shared-consts';
import { ParticipantSession } from '@codaco/studio-contract/middleware/session';
import {
  type AnalyticsEvent,
  type AnalyticsInput,
  PARTICIPANT_EXCEPTION_EVENT,
  ParticipantEventTimestamp,
  ParticipantExceptionList,
} from '@codaco/studio-contract/schema/participant';

import { TenantScope } from '../db/tenant.ts';
import {
  Analytics,
  type AnalyticsCapture,
  participantDistinctId,
} from '../platform/analytics.ts';
import { enforceRateLimit } from '../rate-limit/enforce.ts';
import { readInstallationId } from '../setup/bootstrap.ts';
import { participantAnalyticsEnabled } from '../study/settings.ts';
import { STUDIO_VERSION } from '../version.ts';
import { loadSessionContext } from './store.ts';

const PARTICIPANT_APP = 'studio';
const PARTICIPANT_APP_NAME = 'Network Canvas Studio';

const STRICT = { onExcessProperty: 'error' } as const;

const WITHHELD_EVENT_PROPERTIES: ReadonlySet<string> = new Set([
  'component_stack',
]);

type ForwardingConfig = {
  readonly installationId: string;
  readonly distinctId: string;
};

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

type Catalogued = {
  readonly decode: (
    properties: unknown,
  ) => Option.Option<Readonly<Record<string, unknown>>>;
  readonly forwarded: ReadonlyArray<string>;
};

type DecodableFields = {
  readonly [key: string]: Schema.Codec<unknown, unknown>;
};

const catalogued = (
  fields: DecodableFields,
  envelope: DecodableFields = InterviewAnalyticsEnvelope.fields,
): Catalogued => {
  const decode = Schema.decodeUnknownOption(
    Schema.Struct({ ...envelope, ...fields }),
    STRICT,
  );
  return {
    decode: (properties) =>
      Option.map(
        decode(properties),
        (decoded): Readonly<Record<string, unknown>> => decoded,
      ),
    forwarded: Object.keys(fields).filter(
      (key) => !WITHHELD_EVENT_PROPERTIES.has(key),
    ),
  };
};

const CATALOGUE = new Map<string, ReadonlyArray<Catalogued>>([
  ...Object.entries(InterviewAnalyticsEvents).map(
    ([event, properties]): [string, ReadonlyArray<Catalogued>] => [
      event,
      [catalogued(properties.fields)],
    ],
  ),
  [
    PARTICIPANT_EXCEPTION_EVENT,
    InterviewExceptionProperties.members.map((member) =>
      catalogued(member.fields, {
        ...InterviewAnalyticsEnvelope.fields,
        $exception_list: ParticipantExceptionList,
      }),
    ),
  ],
]);

type DecodedEvent = {
  readonly event: string;
  readonly timestamp: string;
  readonly decoded: Readonly<Record<string, unknown>>;
  readonly forwarded: ReadonlyArray<string>;
};

const decodeTimestamp = Schema.decodeUnknownOption(ParticipantEventTimestamp);

const decodeEvent = (
  captured: typeof AnalyticsEvent.Type,
): Option.Option<DecodedEvent> => {
  const timestamp = decodeTimestamp(captured.timestamp);
  if (Option.isNone(timestamp)) return Option.none();
  const candidates = CATALOGUE.get(captured.event) ?? [];
  for (const candidate of candidates) {
    const decoded = candidate.decode(captured.properties);
    if (Option.isSome(decoded)) {
      return Option.some({
        event: captured.event,
        timestamp: timestamp.value,
        decoded: decoded.value,
        forwarded: candidate.forwarded,
      });
    }
  }
  return Option.none();
};

const decodeBatch = (
  input: typeof AnalyticsInput.Type,
): Option.Option<ReadonlyArray<DecodedEvent>> =>
  Option.all(input.events.map(decodeEvent));

const ERROR_TYPE = /^[A-Za-z][\w.]{0,99}$/;

const exceptionList = (decoded: Readonly<Record<string, unknown>>) => {
  const list = Schema.decodeUnknownOption(ParticipantExceptionList)(
    decoded.$exception_list,
  );
  const type = Option.match(list, {
    onNone: () => 'Error',
    onSome: ([first]) => (ERROR_TYPE.test(first.type) ? first.type : 'Error'),
  });
  return [
    {
      type,
      value: type,
      mechanism: { handled: true, synthetic: false },
    },
  ];
};

const forwardableEvent = (
  { event, timestamp, decoded, forwarded }: DecodedEvent,
  config: ForwardingConfig,
): AnalyticsCapture => ({
  event,
  distinctId: config.distinctId,
  timestamp,
  properties: {
    package_version: decoded.package_version,
    ...Object.fromEntries(
      forwarded.flatMap((key) =>
        Object.hasOwn(decoded, key) ? [[key, decoded[key]]] : [],
      ),
    ),
    ...(event === PARTICIPANT_EXCEPTION_EVENT && {
      $exception_list: exceptionList(decoded),
    }),
    [POSTHOG_APP_PROPS.APP]: PARTICIPANT_APP,
    [POSTHOG_APP_PROPS.APP_NAME]: PARTICIPANT_APP_NAME,
    [POSTHOG_APP_PROPS.APP_VERSION]: STUDIO_VERSION,
    [POSTHOG_APP_PROPS.HOST_VERSION]: STUDIO_VERSION,
    [POSTHOG_APP_PROPS.INSTALLATION_ID]: config.installationId,
    $process_person_profile: false,
    $geoip_disable: true,
  },
});

export const forwardParticipantEvents = Effect.fn(
  'interview.forwardParticipantEvents',
)(function* (input: typeof AnalyticsInput.Type) {
  const session = yield* ParticipantSession;
  yield* enforceRateLimit('participant_analytics', session.sessionId);
  const analytics = yield* Analytics;
  if (!analytics.enabled) return;

  const batch = decodeBatch(input);
  if (Option.isNone(batch)) return;

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

  yield* analytics.capture(
    batch.value.map((decoded) => forwardableEvent(decoded, config)),
  );
});
