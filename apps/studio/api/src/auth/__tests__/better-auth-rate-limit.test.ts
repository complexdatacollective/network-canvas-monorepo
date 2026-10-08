import { randomUUID } from 'node:crypto';

import { assert, layer } from '@effect/vitest';
import { Effect, Layer, Logger, References } from 'effect';
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

const url = await reachableRedis(REDIS_DATABASES.authService);

const env = readEnv();

function capturingLogger(lines: string[]): Layer.Layer<never> {
  return Logger.layer([
    Logger.make(({ message, fiber }: Logger.Options<unknown>) => {
      lines.push(
        [
          ...(Array.isArray(message) ? message : [message]).map(String),
          JSON.stringify(fiber.getRef(References.CurrentLogAnnotations)),
        ].join(' '),
      );
    }),
  ]);
}

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

        assert.notStrictEqual(first.status, 429);
        assert.strictEqual(second.status, 429);
        assert.deepStrictEqual(
          lines.filter((line) => line.startsWith('Rate limit reached')),
          [
            'Rate limit reached; callers are refused until it resets. {"scope":"sign_in_address","retry_after_seconds":60}',
          ],
        );
      }),
    );
  });
});
