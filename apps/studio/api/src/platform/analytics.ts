import { createHash } from 'node:crypto';

import { Context, Effect, Layer, Option, Predicate, Ref, Schema } from 'effect';
import { FetchHttpClient, HttpClient, HttpClientRequest } from 'effect/http';

import { POSTHOG_API_KEY, POSTHOG_APP_PROPS } from '@codaco/shared-consts';

import { Environment } from '../env.ts';
import { InstallationIdentity } from './installation-identity.ts';

export const POSTHOG_INGESTION_HOST = 'https://us.i.posthog.com';

const DELIVERY_TIMEOUT = '5 seconds';

const INSTALLATION_GROUP = 'installation';
const TEAM_GROUP = 'team';

export type AnalyticsGroups = {
  readonly team?: string | undefined;
};

export type AnalyticsCapture = {
  readonly uuid?: string | undefined;
  readonly event: string;
  readonly distinctId: string;
  readonly properties: Readonly<Record<string, unknown>>;
  readonly timestamp: string;
  readonly groups?: AnalyticsGroups | undefined;
};

export type AnalyticsIdentity = {
  readonly uuid?: string | undefined;
  readonly distinctId: string;
  readonly timestamp: string;
  readonly groups?: AnalyticsGroups | undefined;
};

const IDENTIFY_EVENT = '$identify';

export class AnalyticsUndelivered extends Schema.TaggedError<AnalyticsUndelivered>()(
  'AnalyticsUndelivered',
  {
    reason: Schema.Literals([
      'installation_unknown',
      'request_failed',
      'timed_out',
    ]),
  },
) {
  override get message(): string {
    return `analytics events were not delivered: ${this.reason}`;
  }
}

export const participantDistinctId = (
  installationId: string,
  sessionId: string,
) =>
  `participant:${createHash('sha256').update(`${installationId}:${sessionId}`).digest('hex').slice(0, 32)}`;

export const stableEventUuid = (seed: string): string => {
  const hex = createHash('sha256').update(seed).digest('hex');
  const variant = ((Number.parseInt(hex[16] ?? '0', 16) & 0x3) | 0x8).toString(
    16,
  );
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
};

const identifyCapture = (identity: AnalyticsIdentity): AnalyticsCapture => ({
  uuid: identity.uuid,
  event: IDENTIFY_EVENT,
  distinctId: identity.distinctId,
  timestamp: identity.timestamp,
  properties: {},
  groups: identity.groups,
});

const wireEvent = (captured: AnalyticsCapture, installationId: string) => ({
  ...(captured.uuid === undefined ? {} : { uuid: captured.uuid }),
  event: captured.event,
  timestamp: captured.timestamp,
  properties: {
    ...captured.properties,
    distinct_id: captured.distinctId,
    [POSTHOG_APP_PROPS.INSTALLATION_ID]: installationId,
    ...(captured.groups?.team === undefined
      ? {}
      : { team_id: captured.groups.team }),
    $groups: {
      [INSTALLATION_GROUP]: installationId,
      ...(captured.groups?.team === undefined
        ? {}
        : { [TEAM_GROUP]: captured.groups.team }),
    },
    $geoip_disable: true,
  },
});

const suppliedInstallationId = (
  events: ReadonlyArray<AnalyticsCapture>,
): Option.Option<string> => {
  const supplied = events[0]?.properties[POSTHOG_APP_PROPS.INSTALLATION_ID];
  return Predicate.isString(supplied) ? Option.some(supplied) : Option.none();
};

export class Analytics extends Context.Service<
  Analytics,
  {
    readonly enabled: boolean;
    readonly capture: (
      events: ReadonlyArray<AnalyticsCapture>,
    ) => Effect.Effect<void>;
    readonly deliver: (
      events: ReadonlyArray<AnalyticsCapture>,
    ) => Effect.Effect<void, AnalyticsUndelivered>;
    readonly identify: (
      identity: AnalyticsIdentity,
    ) => Effect.Effect<void, AnalyticsUndelivered>;
  }
>()('@studio/platform/Analytics') {
  static readonly layerDisabled: Layer.Layer<Analytics> = Layer.succeed(
    Analytics,
    Analytics.of({
      enabled: false,
      capture: () => Effect.void,
      deliver: () => Effect.void,
      identify: () => Effect.void,
    }),
  );

  static readonly layerPostHog: Layer.Layer<
    Analytics,
    never,
    InstallationIdentity
  > = Layer.effect(
    Analytics,
    Effect.gen(function* () {
      const identity = yield* InstallationIdentity;
      const client = (yield* HttpClient.HttpClient).pipe(
        HttpClient.filterStatusOk,
      );

      const send = Effect.fnUntraced(function* (
        events: ReadonlyArray<AnalyticsCapture>,
        installationId: string,
      ) {
        yield* HttpClientRequest.post(`${POSTHOG_INGESTION_HOST}/batch/`).pipe(
          HttpClientRequest.bodyJsonUnsafe({
            api_key: POSTHOG_API_KEY,
            batch: events.map((captured) =>
              wireEvent(captured, installationId),
            ),
          }),
          client.execute,
          Effect.flatMap((response) => response.text),
          Effect.mapError(
            () => new AnalyticsUndelivered({ reason: 'request_failed' }),
          ),
          Effect.timeoutOrElse({
            duration: DELIVERY_TIMEOUT,
            orElse: () =>
              Effect.fail(new AnalyticsUndelivered({ reason: 'timed_out' })),
          }),
        );
      });

      const deliver = Effect.fn('Analytics.deliver')(function* (
        events: ReadonlyArray<AnalyticsCapture>,
      ) {
        if (events.length === 0) return;
        const installationId = identity.current();
        if (Option.isNone(installationId)) {
          return yield* new AnalyticsUndelivered({
            reason: 'installation_unknown',
          });
        }
        yield* send(events, installationId.value);
      });

      const capture = Effect.fn('Analytics.capture')(
        function* (events: ReadonlyArray<AnalyticsCapture>) {
          if (events.length === 0) return;
          const installationId = Option.orElse(identity.current(), () =>
            suppliedInstallationId(events),
          );
          if (Option.isNone(installationId)) {
            return yield* new AnalyticsUndelivered({
              reason: 'installation_unknown',
            });
          }
          yield* send(events, installationId.value);
        },
        Effect.catch((error) =>
          Effect.logWarning('Analytics events could not be delivered').pipe(
            Effect.annotateLogs({ reason: error.reason }),
          ),
        ),
      );

      const identify = Effect.fn('Analytics.identify')(function* (
        identified: AnalyticsIdentity,
      ) {
        yield* deliver([identifyCapture(identified)]);
      });

      return Analytics.of({ enabled: true, capture, deliver, identify });
    }),
  ).pipe(Layer.provide(FetchHttpClient.layer));

  static readonly layerFromEnvironment: Layer.Layer<
    Analytics,
    never,
    Environment | InstallationIdentity
  > = Layer.unwrap(
    Effect.map(Environment, (env) =>
      env.telemetry ? Analytics.layerPostHog : Analytics.layerDisabled,
    ),
  );

  static readonly layerRecording: Layer.Layer<Analytics | RecordedAnalytics> =
    Layer.effectContext(
      Effect.gen(function* () {
        const ref = yield* Ref.make<readonly AnalyticsCapture[]>([]);
        const refusing = yield* Ref.make(false);
        const record = (events: ReadonlyArray<AnalyticsCapture>) =>
          Ref.update(ref, (captured) => [...captured, ...events]);
        const deliver = (events: ReadonlyArray<AnalyticsCapture>) =>
          Effect.flatMap(Ref.get(refusing), (refused) =>
            refused
              ? Effect.fail(
                  new AnalyticsUndelivered({ reason: 'request_failed' }),
                )
              : record(events),
          );
        return Context.make(
          Analytics,
          Analytics.of({
            enabled: true,
            capture: record,
            deliver,
            identify: (identity) => deliver([identifyCapture(identity)]),
          }),
        ).pipe(
          Context.add(
            RecordedAnalytics,
            RecordedAnalytics.of({
              captured: Ref.get(ref),
              clear: Ref.set(ref, []),
              refuse: (refuse) => Ref.set(refusing, refuse),
            }),
          ),
        );
      }),
    );
}

export class RecordedAnalytics extends Context.Service<
  RecordedAnalytics,
  {
    readonly captured: Effect.Effect<readonly AnalyticsCapture[]>;
    readonly clear: Effect.Effect<void>;
    readonly refuse: (refuse: boolean) => Effect.Effect<void>;
  }
>()('@studio/platform/RecordedAnalytics') {}
