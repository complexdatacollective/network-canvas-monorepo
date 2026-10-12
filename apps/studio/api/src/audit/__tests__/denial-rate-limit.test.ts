import { randomUUID } from 'node:crypto';

import { describe, expect, it, layer } from '@effect/vitest';
import {
  Context,
  Deferred,
  Effect,
  Exit,
  Fiber,
  Layer,
  Predicate,
  Redacted,
  Ref,
  Schema,
} from 'effect';
import { TestClock } from 'effect/testing';

import { Principal } from '@codaco/studio-contract/middleware/authenticated';
import { UserId } from '@codaco/studio-contract/schema/ids';

import { freePort } from '../../__tests__/support/entrypoint.ts';
import {
  reachableRedis,
  REDIS_DATABASES,
} from '../../__tests__/support/valkey.ts';
import { RateLimitStore, UNAVAILABLE } from '../../rate-limit/store.ts';
import {
  type DeniedAttemptsOptions,
  DeniedAttempts,
  type DeniedAuditReservation,
  parseDenialWindowKey,
  reservedDenial,
} from '../denial-rate-limit.ts';

const url = await reachableRedis(REDIS_DATABASES.auditDenial);

const WINDOW_MS = 60_000;
const START = Date.parse('2026-09-15T10:00:00.000Z');

function target() {
  return {
    teamId: `team-${randomUUID()}`,
    actorId: `actor-${randomUUID()}`,
    operation: 'audit.read',
  };
}

const windowOn = (options: DeniedAttemptsOptions) =>
  Effect.service(DeniedAttempts).pipe(
    Effect.provide(DeniedAttempts.layerWith(options)),
  );

function expectAdmission(reservation: DeniedAuditReservation) {
  if (!reservation.admitted) throw new Error('expected an admission');
  return reservation;
}

const fieldsAt = (key: string) =>
  Effect.flatMap(Effect.service(RateLimitStore), (store) =>
    Effect.map(
      store.run((redis) => redis.hgetall(key)),
      (reply): Record<string, string> =>
        Predicate.isObject(reply) ? reply : {},
    ),
  );

describe.skipIf(!url)('the denied-attempt window', () => {
  layer(RateLimitStore.layerOf(url ?? 'redis://unused'))((suite) => {
    const freshPrefix = () => `test-denial-${randomUUID()}`;
    const limiterOn = (limit = 2, keyPrefix = freshPrefix()) =>
      windowOn({ limit, windowMs: WINDOW_MS, keyPrefix });

    suite.effect('admits up to the limit and suppresses past it', () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(START);
        const limiter = yield* limiterOn(2);
        const input = target();

        for (let attempt = 0; attempt < 2; attempt += 1) {
          yield* expectAdmission(yield* limiter.reserve(input)).complete(
            'denied',
          );
        }

        expect(yield* limiter.reserve(input)).toEqual({
          admitted: false,
          reason: 'rate_limited',
        });
      }),
    );

    suite.effect('spends the allowance only on a confirmed denial', () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(START);
        const limiter = yield* limiterOn(1);
        const input = target();

        for (let attempt = 0; attempt < 5; attempt += 1) {
          yield* expectAdmission(yield* limiter.reserve(input)).complete(
            'other',
          );
        }

        yield* expectAdmission(yield* limiter.reserve(input)).complete(
          'denied',
        );
        expect((yield* limiter.reserve(input)).admitted).toBe(false);
      }),
    );

    suite.effect(
      'records what it suppressed, and when it started and stopped',
      () =>
        Effect.gen(function* () {
          yield* TestClock.setTime(START);
          const prefix = freshPrefix();
          const limiter = yield* limiterOn(1, prefix);
          const input = target();
          const key = yield* limiter.keyFor(input);

          yield* expectAdmission(yield* limiter.reserve(input)).complete(
            'denied',
          );

          yield* TestClock.setTime(START + 10_000);
          expect((yield* limiter.reserve(input)).admitted).toBe(false);
          yield* TestClock.setTime(START + 40_000);
          expect((yield* limiter.reserve(input)).admitted).toBe(false);

          expect(yield* fieldsAt(key)).toEqual({
            inflight: '0',
            spent: '1',
            suppressed: '2',
            first: String(START + 10_000),
            last: String(START + 40_000),
          });
          expect(parseDenialWindowKey(key, prefix)).toEqual({
            ...input,
            windowStart: Math.floor(START / WINDOW_MS) * WINDOW_MS,
          });
          expect(parseDenialWindowKey(key, 'studio:audit-denial')).toBeNull();
        }),
    );

    suite.effect('bounds a burst that arrives all at once', () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(START);
        const limiter = yield* windowOn({
          limit: 3,
          maxInFlight: 5,
          windowMs: WINDOW_MS,
          keyPrefix: freshPrefix(),
        });
        const input = target();

        const reservations = yield* Effect.all(
          Array.from({ length: 40 }, () => limiter.reserve(input)),
          { concurrency: 'unbounded' },
        );
        expect(reservations.filter(({ admitted }) => admitted)).toHaveLength(5);
        expect(reservations.filter(({ admitted }) => !admitted)).toHaveLength(
          35,
        );

        for (const reservation of reservations) {
          if (reservation.admitted) yield* reservation.complete('denied');
        }
        expect((yield* limiter.reserve(input)).admitted).toBe(false);
      }),
    );

    suite.effect('never refuses an authorized burst for being concurrent', () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(START);
        const limiter = yield* limiterOn(2);
        const input = target();

        const reservations = yield* Effect.all(
          Array.from({ length: 6 }, () => limiter.reserve(input)),
          { concurrency: 'unbounded' },
        );
        expect(reservations.every(({ admitted }) => admitted)).toBe(true);
        yield* Effect.all(
          reservations.map((reservation) =>
            reservation.admitted ? reservation.complete('other') : Effect.void,
          ),
          { concurrency: 'unbounded' },
        );

        for (let attempt = 0; attempt < 2; attempt += 1) {
          yield* expectAdmission(yield* limiter.reserve(input)).complete(
            'denied',
          );
        }
        expect((yield* limiter.reserve(input)).admitted).toBe(false);
      }),
    );

    suite.effect('starts a fresh allowance in the next window', () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(START);
        const limiter = yield* limiterOn(1);
        const input = target();

        yield* expectAdmission(yield* limiter.reserve(input)).complete(
          'denied',
        );
        expect((yield* limiter.reserve(input)).admitted).toBe(false);

        yield* TestClock.setTime(START + WINDOW_MS);
        expect((yield* limiter.reserve(input)).admitted).toBe(true);
      }),
    );

    suite.effect(
      'does not let a completion from a past window spend the next one',
      () =>
        Effect.gen(function* () {
          yield* TestClock.setTime(START);
          const limiter = yield* limiterOn(1);
          const input = target();
          const stale = expectAdmission(yield* limiter.reserve(input));

          yield* TestClock.setTime(START + WINDOW_MS);
          yield* stale.complete('denied');

          expect((yield* limiter.reserve(input)).admitted).toBe(true);
        }),
    );

    suite.effect(
      'does not recreate a window that expired while its attempt was in flight',
      () =>
        Effect.gen(function* () {
          yield* TestClock.setTime(START);
          const store = yield* RateLimitStore;
          const limiter = yield* limiterOn(1);
          const input = target();
          const key = yield* limiter.keyFor(input);
          const reservation = expectAdmission(yield* limiter.reserve(input));

          yield* store.run((redis) => redis.del(key));
          yield* reservation.complete('denied');

          expect(yield* store.run((redis) => redis.exists(key))).toBe(0);
        }),
    );

    suite.effect('shares one window between two limiters on one store', () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(START);
        const keyPrefix = freshPrefix();
        const first = yield* limiterOn(2, keyPrefix);
        const second = yield* limiterOn(2, keyPrefix);
        const input = target();

        for (const limiter of [first, second]) {
          yield* expectAdmission(yield* limiter.reserve(input)).complete(
            'denied',
          );
        }

        expect((yield* first.reserve(input)).admitted).toBe(false);
        expect((yield* second.reserve(input)).admitted).toBe(false);
      }),
    );
  });
});

type NextRun =
  | { readonly _tag: 'pass' }
  | { readonly _tag: 'unavailable' }
  | {
      readonly _tag: 'hold';
      readonly reserved: Deferred.Deferred<void>;
      readonly proceed: Deferred.Deferred<void>;
    };

class StoreControl extends Context.Service<
  StoreControl,
  { readonly next: (run: NextRun) => Effect.Effect<void> }
>()('@studio/audit/test/StoreControl') {}

const ControlledStore = (storeUrl: string) =>
  Layer.effectContext(
    Effect.gen(function* () {
      const real = yield* RateLimitStore;
      const next = yield* Ref.make<NextRun>({ _tag: 'pass' });
      return Context.make(
        RateLimitStore,
        RateLimitStore.of({
          ...real,
          run: (work) =>
            Effect.flatMap(Ref.getAndSet(next, { _tag: 'pass' }), (run) => {
              if (run._tag === 'unavailable') {
                return Effect.succeed(UNAVAILABLE);
              }
              if (run._tag === 'pass') return real.run(work);
              return real.run(work).pipe(
                Effect.tap(() => Deferred.succeed(run.reserved, undefined)),
                Effect.tap(() => Deferred.await(run.proceed)),
              );
            }),
        }),
      ).pipe(
        Context.add(
          StoreControl,
          StoreControl.of({ next: (run) => Ref.set(next, run) }),
        ),
      );
    }),
  ).pipe(Layer.provide(RateLimitStore.layerOf(storeUrl)));

describe.skipIf(!url)('the slot around a command', () => {
  const keyPrefix = `test-denial-${randomUUID()}`;

  layer(
    DeniedAttempts.layerWith({ keyPrefix }).pipe(
      Layer.provideMerge(ControlledStore(url ?? 'redis://unused')),
    ),
  )((suite) => {
    const principal = (input: ReturnType<typeof target>) =>
      Principal.of({
        kind: 'user',
        userId: Schema.decodeSync(UserId)(input.actorId),
        email: Redacted.make('actor@example.test'),
        emailVerified: true,
        name: Redacted.make('Denied Actor'),
        locale: null,
        sessionId: 'denied-session',
      });

    const attempt = <R>(
      input: ReturnType<typeof target>,
      command: Effect.Effect<never, never, R>,
    ) =>
      reservedDenial(
        {
          operation: input.operation,
          teamId: input.teamId,
          refusal: () => 'refused' as const,
          isDenial: (error) => error === 'denied',
        },
        command,
      ).pipe(Effect.provideService(Principal, principal(input)));

    const windowOf = Effect.fnUntraced(function* (
      input: ReturnType<typeof target>,
    ) {
      const store = yield* RateLimitStore;
      const keys = yield* store.run((redis) =>
        redis.keys(`${keyPrefix}:${encodeURIComponent(input.teamId)}:*`),
      );
      if (!Array.isArray(keys) || keys.length !== 1) {
        return yield* Effect.die(
          new Error(`expected one window, found ${String(keys)}`),
        );
      }
      const [key] = keys;
      return yield* fieldsAt(String(key));
    });

    suite.effect('returns the slot when the command is interrupted', () =>
      Effect.gen(function* () {
        const input = target();
        const started = yield* Deferred.make<void>();
        const fiber = yield* Effect.forkChild(
          attempt(
            input,
            Effect.andThen(Deferred.succeed(started, undefined), Effect.never),
          ),
        );
        yield* Deferred.await(started);
        expect((yield* windowOf(input)).inflight).toBe('1');

        yield* Fiber.interrupt(fiber);
        const exit = yield* Fiber.await(fiber);

        expect(Exit.hasInterrupts(exit)).toBe(true);
        expect(yield* windowOf(input)).toEqual({ inflight: '0' });
      }),
    );

    suite.effect(
      'returns the slot when interrupted while the reservation is in flight',
      () =>
        Effect.gen(function* () {
          const control = yield* StoreControl;
          const input = target();
          const reserved = yield* Deferred.make<void>();
          const proceed = yield* Deferred.make<void>();
          yield* control.next({ _tag: 'hold', reserved, proceed });

          const fiber = yield* Effect.forkChild(attempt(input, Effect.never));
          yield* Deferred.await(reserved);
          expect((yield* windowOf(input)).inflight).toBe('1');

          yield* Effect.sync(() => fiber.interruptUnsafe());
          yield* Deferred.succeed(proceed, undefined);
          const exit = yield* Fiber.await(fiber);

          expect(Exit.hasInterrupts(exit)).toBe(true);
          expect(yield* windowOf(input)).toEqual({ inflight: '0' });
        }),
    );

    suite.effect(
      'leaves another request’s slot alone when the store could not count this one',
      () =>
        Effect.gen(function* () {
          const control = yield* StoreControl;
          const attempts = yield* DeniedAttempts;
          const input = target();

          const counted = expectAdmission(yield* attempts.reserve(input));
          expect((yield* windowOf(input)).inflight).toBe('1');

          yield* control.next({ _tag: 'unavailable' });
          const uncounted = expectAdmission(yield* attempts.reserve(input));
          yield* uncounted.complete('denied');

          expect(yield* windowOf(input)).toEqual({ inflight: '1' });

          yield* counted.complete('other');
          expect(yield* windowOf(input)).toEqual({ inflight: '0' });
        }),
    );
  });
});

describe('the denied-attempt window without a store', () => {
  it.effect('admits when the store cannot be reached', () =>
    Effect.gen(function* () {
      const closed = `redis://127.0.0.1:${yield* Effect.promise(() => freePort())}`;
      yield* Effect.gen(function* () {
        const limiter = yield* windowOn({ limit: 1 });
        const input = target();
        for (let attempt = 0; attempt < 3; attempt += 1) {
          yield* expectAdmission(yield* limiter.reserve(input)).complete(
            'denied',
          );
        }
      }).pipe(Effect.provide(RateLimitStore.layerOf(closed)));
    }),
  );

  it.effect('admits when none is configured', () =>
    Effect.gen(function* () {
      const limiter = yield* windowOn({ limit: 1 });
      const input = target();
      yield* expectAdmission(yield* limiter.reserve(input)).complete('denied');
      expect((yield* limiter.reserve(input)).admitted).toBe(true);
    }).pipe(Effect.provide(RateLimitStore.layerAbsent)),
  );
});
