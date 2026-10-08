import { createHash, randomUUID } from 'node:crypto';

import { describe, expect, it, layer } from '@effect/vitest';
import { Effect, Layer, Logger, Predicate } from 'effect';
import { TestClock } from 'effect/testing';

import { freePort } from '../../__tests__/support/entrypoint.ts';
import {
  reachableRedis,
  REDIS_DATABASES,
} from '../../__tests__/support/valkey.ts';
import { DENIED_SCOPE_COUNTS_KEY, RateLimiter } from '../limiter.ts';
import {
  RATE_LIMIT_SCOPES,
  RATE_LIMITS,
  type RateLimitSettings,
} from '../scopes.ts';
import { RateLimitStore } from '../store.ts';

const url = await reachableRedis(REDIS_DATABASES.limiter);

const INJECTED: RateLimitSettings = {
  sign_in_address: { max: 1, windowMs: 60_000 },
  sign_in_email: { max: 2, windowMs: 60_000 },
  invitation_accept: { max: 3, windowMs: 60_000 },
  participant_redeem_address: { max: 4, windowMs: 60_000 },
  participant_redeem_link: { max: 5, windowMs: 60_000 },
  participant_sync: { max: 6, windowMs: 60_000 },
  rpc_user: { max: 7, windowMs: 60_000 },
  rpc_team: { max: 8, windowMs: 60_000 },
  storage_read: { max: 9, windowMs: 60_000 },
  public_api: { max: 10, windowMs: 60_000 },
  ws_upgrade: { max: 11, windowMs: 60_000 },
  api_docs: { max: 12, windowMs: 60_000 },
  participant_session: { max: 13, windowMs: 60_000 },
  participant_analytics: { max: 14, windowMs: 60_000 },
};

const limiterWith = (limits: Partial<RateLimitSettings> = {}) =>
  Effect.service(RateLimiter).pipe(
    Effect.provide(RateLimiter.layerWith(limits)),
  );

function capturingLogger(lines: string[]): Layer.Layer<never> {
  return Logger.layer([
    Logger.make(({ message }: Logger.Options<unknown>) => {
      lines.push(
        (Array.isArray(message) ? message : [message]).map(String).join(' '),
      );
    }),
  ]);
}

describe('the limits a process enforces', () => {
  it.effect('are the constants when nothing is injected', () =>
    Effect.gen(function* () {
      const limiter = yield* Effect.service(RateLimiter);
      expect(limiter.rules).toEqual(RATE_LIMITS);
    }).pipe(
      Effect.provide(RateLimiter.layer),
      Effect.provide(RateLimitStore.layerAbsent),
    ),
  );

  it('are a positive count over a whole number of seconds', () => {
    const wrong = RATE_LIMIT_SCOPES.filter((scope) => {
      const { max, windowMs } = RATE_LIMITS[scope];
      return max < 1 || windowMs < 1_000 || windowMs % 1_000 !== 0;
    });
    expect(wrong).toEqual([]);
  });

  it.effect('take an injected limit for the scope it names, and no other', () =>
    Effect.gen(function* () {
      const { rules } = yield* limiterWith({
        rpc_user: { max: 2, windowMs: 60_000 },
      });
      expect(rules.rpc_user).toEqual({ max: 2, windowMs: 60_000 });
      expect(rules.rpc_team).toEqual(RATE_LIMITS.rpc_team);
      expect(rules.sign_in_address).toEqual(RATE_LIMITS.sign_in_address);
    }).pipe(Effect.provide(RateLimitStore.layerAbsent)),
  );
});

describe.skipIf(!url)('the limiter against a real store', () => {
  layer(
    RateLimiter.layerWith(INJECTED).pipe(
      Layer.provideMerge(RateLimitStore.layerOf(url ?? 'redis://unused')),
    ),
  )((suite) => {
    for (const scope of RATE_LIMIT_SCOPES) {
      suite.effect(
        `lets ${scope} through to its limit and refuses the next call`,
        () =>
          Effect.gen(function* () {
            const limiter = yield* RateLimiter;
            const subject = `${scope}-${randomUUID()}`;
            const { max } = INJECTED[scope];

            for (let call = 0; call < max; call += 1) {
              expect(yield* limiter.check(scope, subject)).toEqual({
                allowed: true,
              });
            }

            const refused = yield* limiter.check(scope, subject);
            if (refused.allowed) throw new Error(`${scope} was not refused`);
            expect(refused.retryAfterSeconds).toBeGreaterThan(0);
            expect(refused.retryAfterSeconds).toBeLessThanOrEqual(60);

            expect(yield* limiter.check(scope, `${subject}-other`)).toEqual({
              allowed: true,
            });
          }),
      );
    }

    suite.effect('never puts a subject in the store in clear', () =>
      Effect.gen(function* () {
        const limiter = yield* RateLimiter;
        const store = yield* RateLimitStore;
        const email = `researcher-${randomUUID()}@example.org`;
        expect(yield* limiter.check('sign_in_email', email)).toEqual({
          allowed: true,
        });

        const reply = yield* store.run((redis) =>
          redis.keys('studio:rl:sign_in_email:*'),
        );
        const keys = Array.isArray(reply) ? reply : [];
        expect(keys).toContain(
          `studio:rl:sign_in_email:${createHash('sha256').update(email).digest('hex').slice(0, 32)}`,
        );
        expect(JSON.stringify(keys)).not.toContain(email);
      }),
    );

    suite.effect(
      'counts a denied call for the summary job, by scope and never by subject',
      () =>
        Effect.gen(function* () {
          const store = yield* RateLimitStore;
          const read = Effect.map(
            store.run((redis) => redis.hgetall(DENIED_SCOPE_COUNTS_KEY)),
            (reply): Record<string, string> =>
              Predicate.isObject(reply) ? reply : {},
          );
          const before = yield* read;
          const limiter = yield* limiterWith({
            participant_sync: { max: 1, windowMs: 60_000 },
          });
          const subject = `session-${randomUUID()}`;
          yield* limiter.check('participant_sync', subject);
          yield* limiter.check('participant_sync', subject);

          const after = yield* read;
          expect(Number(after.participant_sync ?? 0)).toBe(
            Number(before.participant_sync ?? 0) + 1,
          );
          expect(after.storage_read ?? '0').toBe(before.storage_read ?? '0');
          expect(JSON.stringify(after)).not.toContain(subject);
        }),
    );

    suite.effect('shares one window between two limiters on one store', () =>
      Effect.gen(function* () {
        const first = yield* limiterWith({
          rpc_user: { max: 2, windowMs: 60_000 },
        });
        const second = yield* limiterWith({
          rpc_user: { max: 2, windowMs: 60_000 },
        });
        const subject = `user-${randomUUID()}`;

        expect(yield* first.check('rpc_user', subject)).toEqual({
          allowed: true,
        });
        expect(yield* second.check('rpc_user', subject)).toEqual({
          allowed: true,
        });
        expect((yield* first.check('rpc_user', subject)).allowed).toBe(false);
        expect((yield* second.check('rpc_user', subject)).allowed).toBe(false);
      }),
    );

    suite.effect(
      "logs a scope's denials once a minute, naming the scope and never the subject",
      () =>
        Effect.gen(function* () {
          const lines: string[] = [];
          const limiter = yield* limiterWith({
            participant_redeem_link: { max: 1, windowMs: 60_000 },
          });
          const subject = `link-${randomUUID()}`;
          const denials = () =>
            lines.filter((line) => line.startsWith('Rate limit reached'));
          const deny = Effect.gen(function* () {
            const decision = yield* limiter.check(
              'participant_redeem_link',
              subject,
            );
            expect(decision.allowed).toBe(false);
          }).pipe(Effect.provide(capturingLogger(lines)));

          yield* limiter.check('participant_redeem_link', subject);
          yield* deny;
          yield* deny;
          expect(denials()).toEqual([
            'Rate limit reached for participant_redeem_link; callers are refused for up to 60s.',
          ]);

          yield* TestClock.adjust('59 seconds');
          yield* deny;
          expect(denials()).toHaveLength(1);

          yield* TestClock.adjust('2 seconds');
          yield* deny;
          expect(denials()).toHaveLength(2);
          expect(denials()[1]).toContain('participant_redeem_link');
          expect(lines.join('\n')).not.toContain(subject);
        }),
    );

    suite.effect('reports ready while the store answers', () =>
      Effect.gen(function* () {
        const limiter = yield* RateLimiter;
        expect(limiter.configured).toBe(true);
        expect(yield* limiter.readiness).toBe('ok');
      }),
    );
  });
});

describe('the limiter with no store to reach', () => {
  it.effect('allows every call, warns once, and reports degraded', () =>
    Effect.gen(function* () {
      const closed = `redis://127.0.0.1:${yield* Effect.promise(() => freePort())}`;
      const lines: string[] = [];
      // ioredis reports a failed connection both to the command that asked and
      // as an 'error' event.
      const logger = capturingLogger(lines);
      yield* Effect.gen(function* () {
        const limiter = yield* RateLimiter;
        const subject = `user-${randomUUID()}`;
        for (let call = 0; call < 5; call += 1) {
          expect(yield* limiter.check('rpc_user', subject)).toEqual({
            allowed: true,
          });
        }
        expect(
          lines.filter((line) =>
            line.includes('Rate limit store is unavailable'),
          ),
        ).toHaveLength(1);

        expect(limiter.configured).toBe(true);
        expect(yield* limiter.readiness).toBe('degraded');
      }).pipe(
        Effect.provide(
          RateLimiter.layerWith({
            rpc_user: { max: 1, windowMs: 60_000 },
          }).pipe(
            Layer.provide(RateLimitStore.layerOf(closed)),
            Layer.provide(logger),
          ),
        ),
        Effect.provide(logger),
      );
    }),
  );

  it.effect('is not configured at all when no store is named', () =>
    Effect.gen(function* () {
      const limiter = yield* RateLimiter;
      expect(limiter.configured).toBe(false);
      expect(yield* limiter.readiness).toBe('ok');
      expect(yield* limiter.check('rpc_user', 'anyone')).toEqual({
        allowed: true,
      });
    }).pipe(
      Effect.provide(RateLimiter.layer),
      Effect.provide(RateLimitStore.layerAbsent),
    ),
  );
});
