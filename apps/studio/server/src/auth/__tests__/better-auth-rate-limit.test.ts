import { randomUUID } from 'node:crypto';

import { assert, layer } from '@effect/vitest';
import { Effect, Layer, Logger } from 'effect';
import { describe } from 'vitest';

import { TestDatabaseLive, testDb } from '../../__tests__/support/database.ts';
import { testCipher } from '../../__tests__/support/secrets.ts';
import {
  reachableRedis,
  REDIS_DATABASES,
} from '../../__tests__/support/valkey.ts';
import { Environment, readEnv } from '../../env.ts';
import { Jobs } from '../../jobs/jobs.ts';
import { RateLimiter } from '../../rate-limit/limiter.ts';
import { RateLimitStore } from '../../rate-limit/store.ts';
import { SecretsCipher } from '../../secrets/services.ts';
import { AuthService } from '../service.ts';

// better-auth's per-address sign-in limit runs from better-auth's own promise
// callbacks (`customStorage` in auth/better-auth.ts), outside any fiber of the
// program's. What this pins is that the limiter those callbacks reach still
// runs over the services `AuthService.layer` was built with — so a denial's
// warning goes through the program's logger, not Effect's default one, which
// in a deployment is the difference between a JSON line an operator's
// pipeline reads and plain text it does not.

const url = await reachableRedis(REDIS_DATABASES.authService);

const env = readEnv();

/** Every line logged through this logger, as the message alone. */
function capturingLogger(lines: string[]): Layer.Layer<never> {
  return Logger.layer([
    Logger.make(({ message }: Logger.Options<unknown>) => {
      lines.push(
        (Array.isArray(message) ? message : [message]).map(String).join(' '),
      );
    }),
  ]);
}

/** A password sign-in as the browser sends one, through better-auth's handler. */
const signIn = (email: string) =>
  AuthService.use((auth) =>
    auth.handler(
      new Request(new URL('/api/auth/sign-in/email', env.auth?.baseUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'origin': env.auth?.baseUrl ?? '',
        },
        body: JSON.stringify({ email, password: 'not the password' }),
      }),
    ),
  );

describe.skipIf(!testDb || !url)("better-auth's sign-in limit", () => {
  layer(TestDatabaseLive)('over the application client', (suite) => {
    suite.effect("logs a denial through the program's logger", () =>
      Effect.gen(function* () {
        const lines: string[] = [];
        const liveAuth = AuthService.layer.pipe(
          Layer.provide(capturingLogger(lines)),
          Layer.provide(Layer.succeed(Environment, env)),
          Layer.provide(
            RateLimiter.layerWith({
              sign_in_address: { max: 1, windowMs: 60_000 },
            }).pipe(Layer.provide(RateLimitStore.layerOf(url ?? 'unused'))),
          ),
          Layer.provide(Layer.succeed(SecretsCipher)(testCipher())),
          Layer.provide(Jobs.layerRecording),
        );
        const email = `limited-${randomUUID()}@example.org`;

        const [first, second] = yield* Effect.all([
          signIn(email),
          signIn(email),
        ]).pipe(Effect.provide(liveAuth));

        // The first attempt is admitted and refused as a bad credential; the
        // second is better-auth's own 429.
        assert.notStrictEqual(first.status, 429);
        assert.strictEqual(second.status, 429);
        // Mutation: build the instance with `Effect.runPromise` in place of
        // `Effect.runPromiseWith(context)` → the warning goes to the default
        // logger and nothing is captured.
        assert.deepStrictEqual(
          lines.filter((line) => line.startsWith('Rate limit reached')),
          [
            'Rate limit reached for sign_in_address; callers are refused for up to 60s.',
          ],
        );
      }),
    );
  });
});
