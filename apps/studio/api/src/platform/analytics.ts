import { Context, Effect, Layer, Ref } from 'effect';
import { FetchHttpClient, HttpClient, HttpClientRequest } from 'effect/http';

import { POSTHOG_API_KEY } from '@codaco/shared-consts';

import { Environment } from '../env.ts';

export const POSTHOG_INGESTION_HOST = 'https://us.i.posthog.com';

const DELIVERY_TIMEOUT = '5 seconds';

export type AnalyticsCapture = {
  readonly event: string;
  readonly distinctId: string;
  readonly properties: Readonly<Record<string, unknown>>;
  readonly timestamp: string;
};

export class Analytics extends Context.Service<
  Analytics,
  {
    readonly enabled: boolean;
    readonly capture: (
      events: ReadonlyArray<AnalyticsCapture>,
    ) => Effect.Effect<void>;
  }
>()('@studio/platform/Analytics') {
  static readonly layerDisabled: Layer.Layer<Analytics> = Layer.succeed(
    Analytics,
    Analytics.of({ enabled: false, capture: () => Effect.void }),
  );

  static readonly layerPostHog: Layer.Layer<Analytics> = Layer.effect(
    Analytics,
    Effect.gen(function* () {
      const client = (yield* HttpClient.HttpClient).pipe(
        HttpClient.filterStatusOk,
      );
      const capture = Effect.fn('Analytics.capture')(
        function* (events: ReadonlyArray<AnalyticsCapture>) {
          yield* HttpClientRequest.post(
            `${POSTHOG_INGESTION_HOST}/batch/`,
          ).pipe(
            HttpClientRequest.bodyJsonUnsafe({
              api_key: POSTHOG_API_KEY,
              batch: events.map((captured) => ({
                event: captured.event,
                timestamp: captured.timestamp,
                properties: {
                  ...captured.properties,
                  distinct_id: captured.distinctId,
                },
              })),
            }),
            client.execute,
            Effect.flatMap((response) => response.text),
            Effect.timeout(DELIVERY_TIMEOUT),
          );
        },
        Effect.catch((error) =>
          Effect.logWarning('Analytics events could not be delivered').pipe(
            Effect.annotateLogs({ reason: error._tag }),
          ),
        ),
      );
      return Analytics.of({ enabled: true, capture });
    }),
  ).pipe(Layer.provide(FetchHttpClient.layer));

  static readonly layerFromEnvironment: Layer.Layer<
    Analytics,
    never,
    Environment
  > = Layer.unwrap(
    Effect.map(Environment, (env) =>
      env.telemetry ? Analytics.layerPostHog : Analytics.layerDisabled,
    ),
  );

  static readonly layerRecording: Layer.Layer<Analytics | RecordedAnalytics> =
    Layer.effectContext(
      Effect.map(Ref.make<readonly AnalyticsCapture[]>([]), (ref) =>
        Context.make(
          Analytics,
          Analytics.of({
            enabled: true,
            capture: (events) =>
              Ref.update(ref, (captured) => [...captured, ...events]),
          }),
        ).pipe(
          Context.add(
            RecordedAnalytics,
            RecordedAnalytics.of({
              captured: Ref.get(ref),
              clear: Ref.set(ref, []),
            }),
          ),
        ),
      ),
    );
}

export class RecordedAnalytics extends Context.Service<
  RecordedAnalytics,
  {
    readonly captured: Effect.Effect<readonly AnalyticsCapture[]>;
    readonly clear: Effect.Effect<void>;
  }
>()('@studio/platform/RecordedAnalytics') {}
