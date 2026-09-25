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

// The window that caps how many denial events one actor can write into one
// team's audit log for one operation (#1909). What it used to be — a Map, a
// waiter queue and a flush at shutdown — is gone: the state is in Valkey, the
// summaries are the worker's (src/jobs/handlers/denied-attempts-summary.ts),
// and nothing waits. What survives from the old contract is what the call
// sites depend on: the allowance is spent only by a confirmed denial, it
// resets at the window boundary, and past it the attempt is suppressed rather
// than written.
//
// The window is chosen from Effect's `Clock`, so these cases move a window
// boundary with `TestClock` — which `layer(…)` installs — rather than through
// an injected `now`.

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

/** A denial window of its own over whichever store the case runs on. */
const windowOn = (options: DeniedAttemptsOptions) =>
  Effect.service(DeniedAttempts).pipe(
    Effect.provide(DeniedAttempts.layerWith(options)),
  );

/** The admitted half of a reservation, or the case fails. */
function expectAdmission(reservation: DeniedAuditReservation) {
  if (!reservation.admitted) throw new Error('expected an admission');
  return reservation;
}

/** The hash behind a key, as the summary job reads it. */
const fieldsAt = (key: string) =>
  Effect.flatMap(Effect.service(RateLimitStore), (store) =>
    Effect.map(
      store.run((redis) => redis.hgetall(key)),
      (reply): Record<string, string> =>
        Predicate.isObject(reply) ? reply : {},
    ),
  );

describe.skipIf(!url)('the denied-attempt window', () => {
  // Never built when the probe found no store: the describe is skipped.
  layer(RateLimitStore.layerOf(url ?? 'redis://unused'))((suite) => {
    /** A key space of its own per case, so no two share a window. */
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
      // The call sites complete with `other` for a success, a domain failure,
      // or a denial whose event could not be written — none of those wrote a
      // row, so none of them may consume what bounds how many rows can be
      // written.
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
          // The key says which team, actor and operation the summary belongs
          // to, because the worker that writes it was not there when they were
          // denied.
          expect(parseDenialWindowKey(key, prefix)).toEqual({
            ...input,
            windowStart: Math.floor(START / WINDOW_MS) * WINDOW_MS,
          });
          // And a key written under some other prefix is not this build's to
          // read.
          expect(parseDenialWindowKey(key, 'studio:audit-denial')).toBeNull();
        }),
    );

    suite.effect('bounds a burst that arrives all at once', () =>
      // Without the in-flight count every member of a simultaneous burst reads
      // `spent` as zero — nobody has finished yet — and every one of them goes
      // on to write a denial row. The window cap alone bounds a sequence and
      // nothing at all in parallel.
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

        // And once those five finish as denials, the window's own cap closes
        // it: five is past a limit of three, so nothing more is admitted this
        // minute.
        for (const reservation of reservations) {
          if (reservation.admitted) yield* reservation.complete('denied');
        }
        expect((yield* limiter.reserve(input)).admitted).toBe(false);
      }),
    );

    suite.effect('never refuses an authorized burst for being concurrent', () =>
      // The bound is a safety valve, not a concurrency limit on ordinary use: a
      // researcher sending six invitations at once is six reservations that
      // all complete without a denial, and refusing one of them would surface
      // as a FORBIDDEN on work the caller was entitled to do.
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

        // None of that spent the window: two denials are still available.
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
        // The window is in the key, so a completion that arrives late writes
        // to the window it was reserved in. Nothing rolls a window over, which
        // is what makes this true without any bookkeeping.
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
        // `COMPLETE_SCRIPT`'s guard: a window whose key has gone — expired, or
        // taken by the summary job — must not come back holding a negative
        // `inflight` and a `spent` from the attempt that outlived it.
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
      // Two API containers are two of these. The Map this replaces gave each
      // process an allowance of its own, which is the bug (#1909).
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

/** What the next store operation does, for the cases that need one to misbehave. */
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

/**
 * The real store, with the next operation steerable: answered as unreachable
 * without touching Valkey, or run for real and then held open. Every other
 * operation passes straight through.
 */
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
        email: 'actor@example.test',
        emailVerified: true,
        name: 'Denied Actor',
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

    /** Every field of the one window this team's attempts wrote. */
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
        // The gap the release has to cover: Valkey has already counted the
        // slot, the reply has not reached the fiber yet, and the interrupt
        // lands in between. A slot leaked here stays counted until the
        // window's key expires, and `maxInFlight` of them refuse the actor's
        // authorised work.
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
        // A reservation admitted because the store could not answer was never
        // counted, so completing it has nothing to give back. Running the
        // completion anyway would decrement the counter a concurrent request's
        // reservation holds, and a window whose `inflight` is freed that way
        // lets past `maxInFlight` the burst it exists to bound.
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
    // Fail open. Refusing instead would turn a Valkey outage into every
    // audited command in every team failing, to protect the log from events
    // the caller was going to be refused anyway.
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
