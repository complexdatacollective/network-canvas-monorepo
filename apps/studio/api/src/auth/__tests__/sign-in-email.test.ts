import { assert, layer } from '@effect/vitest';
import { Effect, Layer, Predicate } from 'effect';
import { describe } from 'vitest';

import { TestDatabaseLive, testDb } from '../../__tests__/support/database.ts';
import { testCipher } from '../../__tests__/support/secrets.ts';
import { limiterWithoutStore } from '../../__tests__/support/valkey.ts';
import { Environment, readEnv } from '../../env.ts';
import { JobRefused, Jobs, RecordedJobs } from '../../jobs/jobs.ts';
import { RateLimiter } from '../../rate-limit/limiter.ts';
import { SecretsCipher } from '../../secrets/services.ts';
import { AuthService, makeSendMagicLink } from '../service.ts';

const MAGIC_LINK = {
  email: 'researcher@example.org',
  url: 'https://studio.example.org/api/auth/magic-link/verify?token=abc',
};

const refusingJobs = Layer.succeed(Jobs)(
  Jobs.of({
    enqueue: (queue) =>
      Effect.fail(new JobRefused({ queue, reason: 'the queue is gone' })),
  }),
);

const sendThroughHook = Effect.flatMap(makeSendMagicLink, (send) =>
  Effect.tryPromise({
    try: () => send(MAGIC_LINK),
    catch: (cause: unknown) => cause,
  }),
);

const env = readEnv();

const liveAuth = AuthService.layer.pipe(
  Layer.provide(Layer.succeed(Environment, env)),
  Layer.provide(Layer.succeed(RateLimiter)(limiterWithoutStore)),
  Layer.provide(Layer.succeed(SecretsCipher)(testCipher())),
);

const requestMagicLink = (email: string) =>
  AuthService.use((auth) =>
    auth.handler(
      new Request(new URL('/api/auth/sign-in/magic-link', env.auth?.baseUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'origin': env.auth?.baseUrl ?? '',
        },
        body: JSON.stringify({ email, callbackURL: '/' }),
      }),
    ),
  );

describe.skipIf(!testDb)('queueing a sign-in email', () => {
  layer(TestDatabaseLive)('over the application client', (suite) => {
    suite.effect('enqueues exactly one sign-in email carrying the link', () =>
      Effect.gen(function* () {
        const recorded = yield* RecordedJobs;
        yield* recorded.clear;

        yield* sendThroughHook;

        assert.deepStrictEqual(
          recorded.recorded.map(({ queue, payload }) => ({ queue, payload })),
          [{ queue: 'sign-in-email' as const, payload: MAGIC_LINK }],
        );
      }).pipe(Effect.provide(Jobs.layerRecording)),
    );

    suite.effect('rejects rather than resolve when the queue refuses', () =>
      Effect.gen(function* () {
        const outcome = yield* Effect.exit(sendThroughHook);
        assert.isTrue(outcome._tag === 'Failure');
      }).pipe(Effect.provide(refusingJobs)),
    );

    suite.effect(
      'fails the sign-in request when the queue refuses the link',
      () =>
        Effect.gen(function* () {
          const response = yield* requestMagicLink(
            `refused-${Date.now()}@example.org`,
          );
          assert.notStrictEqual(response.status, 200);
          assert.isAtLeast(response.status, 500);
        }).pipe(Effect.provide(liveAuth.pipe(Layer.provide(refusingJobs)))),
    );

    suite.effect('answers the sign-in request once the link is queued', () =>
      Effect.gen(function* () {
        const recorded = yield* RecordedJobs;
        yield* recorded.clear;
        const email = `queued-${Date.now()}@example.org`;

        const response = yield* requestMagicLink(email);
        assert.strictEqual(response.status, 200);
        assert.deepStrictEqual(
          recorded.recorded.map(({ queue }) => queue),
          ['sign-in-email'],
        );
        const payload = recorded.recorded[0]?.payload;
        assert.strictEqual(
          Predicate.hasProperty(payload, 'email') ? payload.email : undefined,
          email,
        );
      }).pipe(
        Effect.provide(liveAuth.pipe(Layer.provideMerge(Jobs.layerRecording))),
      ),
    );
  });
});
