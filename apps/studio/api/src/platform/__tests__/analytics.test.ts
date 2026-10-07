import { describe, expect, it } from '@effect/vitest';
import { Effect, Exit, Fiber, Layer } from 'effect';
import { FetchHttpClient } from 'effect/http';
import { TestClock } from 'effect/testing';

import { POSTHOG_API_KEY } from '@codaco/shared-consts';

import { Environment, readEnv } from '../../env.ts';
import { Analytics, POSTHOG_INGESTION_HOST } from '../analytics.ts';

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
    Effect.provide(
      Analytics.layerFromEnvironment.pipe(
        Layer.provide(Layer.succeed(Environment, { ...readEnv(), telemetry })),
      ),
    ),
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
        Effect.provide(
          Analytics.layerFromEnvironment.pipe(
            Layer.provide(
              Layer.succeed(Environment, { ...readEnv(), telemetry: true }),
            ),
          ),
        ),
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
});
