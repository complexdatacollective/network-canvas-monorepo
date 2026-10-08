import { describe, expect, it } from '@effect/vitest';
import { Effect, Exit, Fiber, Layer } from 'effect';
import { FetchHttpClient } from 'effect/http';
import { TestClock } from 'effect/testing';

import { POSTHOG_API_KEY } from '@codaco/shared-consts';

import { Environment, readEnv } from '../../env.ts';
import {
  Analytics,
  AnalyticsUndelivered,
  POSTHOG_INGESTION_HOST,
} from '../analytics.ts';
import { InstallationIdentity } from '../installation-identity.ts';
import { knownInstallation } from './support/installation.ts';

type Sent = { readonly url: string; readonly body: unknown };

const recordingFetch = (sent: Sent[], status = 200): typeof fetch =>
  ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url =
      input instanceof Request ? input.url : new URL(String(input)).href;
    const body = new Response(init?.body ?? null).text();
    return body.then((text) => {
      sent.push({ url, body: text === '' ? null : JSON.parse(text) });
      return new Response('{}', { status });
    });
  }) as typeof fetch;

const INSTALLATION_ID = '0d5a4a52-8c3e-4c1e-9b8e-0e5a1b2c3d4e';

const analyticsUnder = (
  telemetry: boolean,
  installation: Layer.Layer<InstallationIdentity> = knownInstallation(
    INSTALLATION_ID,
  ),
) =>
  Analytics.layerFromEnvironment.pipe(
    Layer.provide(Layer.succeed(Environment, { ...readEnv(), telemetry })),
    Layer.provide(installation),
  );

const captureUnder = (telemetry: boolean, sent: Sent[], status?: number) =>
  Effect.gen(function* () {
    const analytics = yield* Analytics;
    yield* analytics.capture([
      {
        event: 'stage_entered',
        distinctId: 'page-pseudonym',
        timestamp: '2026-10-07T09:00:00.000Z',
        properties: { stage_type: 'NameGenerator' },
      },
    ]);
    return analytics.enabled;
  }).pipe(
    Effect.provide(analyticsUnder(telemetry)),
    Effect.provideService(FetchHttpClient.Fetch, recordingFetch(sent, status)),
  );

describe('Analytics', () => {
  it.effect(
    'sends nothing and reports itself disabled with telemetry off',
    () =>
      Effect.gen(function* () {
        const sent: Sent[] = [];
        const enabled = yield* captureUnder(false, sent);
        expect(enabled).toBe(false);
        expect(sent).toEqual([]);
      }),
  );

  it.effect('sends a batch to Codaco’s PostHog project with telemetry on', () =>
    Effect.gen(function* () {
      const sent: Sent[] = [];
      const enabled = yield* captureUnder(true, sent);
      expect(enabled).toBe(true);
      expect(sent).toEqual([
        {
          url: `${POSTHOG_INGESTION_HOST}/batch/`,
          body: {
            api_key: POSTHOG_API_KEY,
            batch: [
              {
                event: 'stage_entered',
                timestamp: '2026-10-07T09:00:00.000Z',
                properties: {
                  stage_type: 'NameGenerator',
                  distinct_id: 'page-pseudonym',
                  installation_id: INSTALLATION_ID,
                  $groups: { installation: INSTALLATION_ID },
                  $geoip_disable: true,
                },
              },
            ],
          },
        },
      ]);
    }),
  );

  it.effect('gives up on a delivery PostHog never answers', () =>
    Effect.gen(function* () {
      const hanging = (() => new Promise<Response>(() => {})) as typeof fetch;
      const fiber = yield* Effect.gen(function* () {
        const analytics = yield* Analytics;
        yield* analytics.capture([
          {
            event: 'stage_entered',
            distinctId: 'participant:page-pseudonym',
            timestamp: '2026-10-07T09:00:00.000Z',
            properties: {},
          },
        ]);
      }).pipe(
        Effect.provide(analyticsUnder(true)),
        Effect.provideService(FetchHttpClient.Fetch, hanging),
        Effect.forkChild,
      );
      yield* TestClock.adjust('5 seconds');
      const exit = yield* Fiber.await(fiber);
      expect(Exit.isSuccess(exit)).toBe(true);
    }),
  );

  it.effect('swallows a refused delivery rather than failing the caller', () =>
    Effect.gen(function* () {
      const sent: Sent[] = [];
      const enabled = yield* captureUnder(true, sent, 500);
      expect(enabled).toBe(true);
      expect(sent).toHaveLength(1);
    }),
  );

  it.effect(
    'identifies a researcher by account id alone, in the installation and team groups',
    () =>
      Effect.gen(function* () {
        const sent: Sent[] = [];
        yield* Effect.gen(function* () {
          const analytics = yield* Analytics;
          yield* analytics.identify({
            distinctId: 'account-1',
            timestamp: '2026-10-08T09:00:00.000Z',
            groups: { team: 'team-1' },
          });
        }).pipe(
          Effect.provide(analyticsUnder(true)),
          Effect.provideService(FetchHttpClient.Fetch, recordingFetch(sent)),
        );
        expect(sent).toEqual([
          {
            url: `${POSTHOG_INGESTION_HOST}/batch/`,
            body: {
              api_key: POSTHOG_API_KEY,
              batch: [
                {
                  event: '$identify',
                  timestamp: '2026-10-08T09:00:00.000Z',
                  properties: {
                    distinct_id: 'account-1',
                    installation_id: INSTALLATION_ID,
                    $groups: { installation: INSTALLATION_ID, team: 'team-1' },
                    $geoip_disable: true,
                  },
                },
              ],
            },
          },
        ]);
      }),
  );

  it.effect('fails a delivery PostHog refuses, so the job retries', () =>
    Effect.gen(function* () {
      const sent: Sent[] = [];
      const error = yield* Effect.gen(function* () {
        const analytics = yield* Analytics;
        yield* analytics.deliver([
          {
            event: 'study_created',
            distinctId: 'account-1',
            timestamp: '2026-10-08T09:00:00.000Z',
            properties: {},
          },
        ]);
      }).pipe(
        Effect.provide(analyticsUnder(true)),
        Effect.provideService(FetchHttpClient.Fetch, recordingFetch(sent, 503)),
        Effect.flip,
      );
      expect(sent).toHaveLength(1);
      expect(error).toBeInstanceOf(AnalyticsUndelivered);
      expect(error.reason).toBe('request_failed');
    }),
  );

  it.effect(
    'sends nothing and fails the delivery before the installation id is known',
    () =>
      Effect.gen(function* () {
        const sent: Sent[] = [];
        const error = yield* Effect.gen(function* () {
          const analytics = yield* Analytics;
          yield* analytics.deliver([
            {
              event: 'study_created',
              distinctId: 'account-1',
              timestamp: '2026-10-08T09:00:00.000Z',
              properties: {},
            },
          ]);
        }).pipe(
          Effect.provide(analyticsUnder(true, InstallationIdentity.layer)),
          Effect.provideService(FetchHttpClient.Fetch, recordingFetch(sent)),
          Effect.flip,
        );
        expect(sent).toEqual([]);
        expect(error.reason).toBe('installation_unknown');
      }),
  );
});
