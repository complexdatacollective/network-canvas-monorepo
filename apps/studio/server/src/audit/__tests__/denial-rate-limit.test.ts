import { randomUUID } from 'node:crypto';

import { Effect, Exit, Fiber, Schema } from 'effect';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { Principal } from '@codaco/studio-contract/middleware/authenticated';
import { UserId } from '@codaco/studio-contract/schema/ids';

import { freePort } from '../../__tests__/support/entrypoint.ts';
import {
  reachableRedis,
  REDIS_DATABASES,
} from '../../__tests__/support/valkey.ts';
import { readEnv } from '../../env.ts';
import {
  createRateLimitStore,
  getRateLimitStore,
  type RateLimitStore,
} from '../../rate-limit/store.ts';
import {
  DENIAL_KEY_PREFIX,
  DeniedAuditRateLimiter,
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

describe.skipIf(!url)('the denied-attempt window', () => {
  let store: RateLimitStore;
  let clock = START;

  /** A key space of its own per case, so no two share a window. */
  let prefix = '';
  const limiterOn = (limit = 2) => {
    prefix = `test-denial-${randomUUID()}`;
    return new DeniedAuditRateLimiter({
      store,
      limit,
      windowMs: WINDOW_MS,
      keyPrefix: prefix,
      now: () => clock,
    });
  };

  /** The hash behind a key, as the summary job reads it. */
  const fieldsAt = async (key: string) => {
    const reply = await store.run((redis) => redis.hgetall(key));
    return reply as Record<string, string>;
  };

  beforeAll(() => {
    if (!url) throw new Error('unreachable: the probe guaranteed a store');
    store = createRateLimitStore(url);
  });

  afterAll(async () => {
    await store.close();
  });

  it('admits up to the limit and suppresses past it', async () => {
    clock = START;
    const limiter = limiterOn(2);
    const input = target();

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const reservation = await limiter.reserve(input);
      if (!reservation.admitted) throw new Error('expected an admission');
      await reservation.complete('denied');
    }

    expect(await limiter.reserve(input)).toEqual({
      admitted: false,
      reason: 'rate_limited',
    });
  });

  it('spends the allowance only on a confirmed denial', async () => {
    // The call sites complete with `other` for a success, a domain failure, or
    // a denial whose event could not be written — none of those wrote a row,
    // so none of them may consume what bounds how many rows can be written.
    clock = START;
    const limiter = limiterOn(1);
    const input = target();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const reservation = await limiter.reserve(input);
      if (!reservation.admitted) throw new Error('expected an admission');
      await reservation.complete('other');
    }

    const admitted = await limiter.reserve(input);
    expect(admitted.admitted).toBe(true);
    if (!admitted.admitted) throw new Error('unreachable');
    await admitted.complete('denied');
    expect((await limiter.reserve(input)).admitted).toBe(false);
  });

  it('records what it suppressed, and when it started and stopped', async () => {
    clock = START;
    const limiter = limiterOn(1);
    const input = target();
    const key = limiter.keyFor(input);

    const first = await limiter.reserve(input);
    if (!first.admitted) throw new Error('expected an admission');
    await first.complete('denied');

    clock = START + 10_000;
    expect((await limiter.reserve(input)).admitted).toBe(false);
    clock = START + 40_000;
    expect((await limiter.reserve(input)).admitted).toBe(false);

    expect(await fieldsAt(key)).toEqual({
      inflight: '0',
      spent: '1',
      suppressed: '2',
      first: String(START + 10_000),
      last: String(START + 40_000),
    });
    // The key says which team, actor and operation the summary belongs to,
    // because the worker that writes it was not there when they were denied.
    expect(parseDenialWindowKey(key, prefix)).toEqual({
      ...input,
      windowStart: Math.floor(START / WINDOW_MS) * WINDOW_MS,
    });
    // And a key written under some other prefix is not this build's to read.
    expect(parseDenialWindowKey(key, 'studio:audit-denial')).toBeNull();
  });

  it('bounds a burst that arrives all at once', async () => {
    // Without the in-flight count every member of a simultaneous burst reads
    // `spent` as zero — nobody has finished yet — and every one of them goes
    // on to write a denial row. The window cap alone bounds a sequence and
    // nothing at all in parallel.
    clock = START;
    const limiter = new DeniedAuditRateLimiter({
      store,
      limit: 3,
      maxInFlight: 5,
      windowMs: WINDOW_MS,
      keyPrefix: `test-denial-${randomUUID()}`,
      now: () => clock,
    });
    const input = target();

    const reservations = await Promise.all(
      Array.from({ length: 40 }, () => limiter.reserve(input)),
    );
    expect(reservations.filter(({ admitted }) => admitted)).toHaveLength(5);
    expect(reservations.filter(({ admitted }) => !admitted)).toHaveLength(35);

    // And once those five finish as denials, the window's own cap closes it:
    // five is past a limit of three, so nothing more is admitted this minute.
    for (const reservation of reservations) {
      if (reservation.admitted) await reservation.complete('denied');
    }
    expect((await limiter.reserve(input)).admitted).toBe(false);
  });

  it('never refuses an authorized burst for being concurrent', async () => {
    // The bound is a safety valve, not a concurrency limit on ordinary use: a
    // researcher sending six invitations at once is six reservations that all
    // complete without a denial, and refusing one of them would surface as a
    // FORBIDDEN on work the caller was entitled to do.
    clock = START;
    const limiter = limiterOn(2);
    const input = target();

    const reservations = await Promise.all(
      Array.from({ length: 6 }, () => limiter.reserve(input)),
    );
    expect(reservations.every(({ admitted }) => admitted)).toBe(true);
    await Promise.all(
      reservations.map((reservation) =>
        reservation.admitted ? reservation.complete('other') : undefined,
      ),
    );

    // None of that spent the window: two denials are still available.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const reservation = await limiter.reserve(input);
      if (!reservation.admitted) throw new Error('expected an admission');
      await reservation.complete('denied');
    }
    expect((await limiter.reserve(input)).admitted).toBe(false);
  });

  it('starts a fresh allowance in the next window', async () => {
    clock = START;
    const limiter = limiterOn(1);
    const input = target();

    const first = await limiter.reserve(input);
    if (!first.admitted) throw new Error('expected an admission');
    await first.complete('denied');
    expect((await limiter.reserve(input)).admitted).toBe(false);

    clock = START + WINDOW_MS;
    expect((await limiter.reserve(input)).admitted).toBe(true);
  });

  it('does not let a completion from a past window spend the next one', async () => {
    // The window is in the key, so a completion that arrives late writes to
    // the window it was reserved in. Nothing rolls a window over, which is
    // what makes this true without any bookkeeping.
    clock = START;
    const limiter = limiterOn(1);
    const input = target();
    const stale = await limiter.reserve(input);
    if (!stale.admitted) throw new Error('expected an admission');

    clock = START + WINDOW_MS;
    await stale.complete('denied');

    const fresh = await limiter.reserve(input);
    expect(fresh.admitted).toBe(true);
  });

  it('shares one window between two limiters on one store', async () => {
    // Two API containers are two of these. The Map this replaces gave each
    // process an allowance of its own, which is the bug (#1909).
    clock = START;
    const options = {
      store,
      limit: 2,
      windowMs: WINDOW_MS,
      keyPrefix: `test-denial-${randomUUID()}`,
      now: () => clock,
    };
    const first = new DeniedAuditRateLimiter(options);
    const second = new DeniedAuditRateLimiter(options);
    const input = target();

    for (const limiter of [first, second]) {
      const reservation = await limiter.reserve(input);
      if (!reservation.admitted) throw new Error('expected an admission');
      await reservation.complete('denied');
    }

    expect((await first.reserve(input)).admitted).toBe(false);
    expect((await second.reserve(input)).admitted).toBe(false);
  });
});

describe.skipIf(!url)('the slot around a command', () => {
  // `reservedDenial` takes the process's limiter, which reads `REDIS_URL` on
  // first use; pointing that at this file's logical database means the store
  // it memoises is the one `getRateLimitStore` hands back here, so a case can
  // hold its round trip open.
  let shared: RateLimitStore;

  beforeAll(() => {
    if (!url) throw new Error('unreachable: the probe guaranteed a store');
    vi.stubEnv('REDIS_URL', url);
    const { redis } = readEnv();
    if (!redis) throw new Error('unreachable: REDIS_URL was just set');
    shared = getRateLimitStore(redis);
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await shared.close();
  });

  const attempt = (input: ReturnType<typeof target>) =>
    reservedDenial(
      {
        operation: input.operation,
        teamId: input.teamId,
        refusal: () => 'refused' as const,
        isDenial: (error) => error === 'denied',
      },
      Effect.never,
    ).pipe(
      Effect.provideService(
        Principal,
        Principal.of({
          kind: 'user',
          userId: Schema.decodeSync(UserId)(input.actorId),
          email: 'actor@example.test',
          emailVerified: true,
          name: 'Denied Actor',
          locale: null,
          sessionId: 'denied-session',
        }),
      ),
    );

  /** Every field of the one window this team's attempts wrote. */
  const windowOf = async (input: ReturnType<typeof target>) => {
    const keys = await shared.run((redis) =>
      redis.keys(`${DENIAL_KEY_PREFIX}:${encodeURIComponent(input.teamId)}:*`),
    );
    if (!Array.isArray(keys) || keys.length !== 1) {
      throw new Error(`expected one window, found ${String(keys)}`);
    }
    const [key] = keys as [string];
    return (await shared.run((redis) => redis.hgetall(key))) as Record<
      string,
      string
    >;
  };

  it('returns the slot when the command is interrupted', async () => {
    const input = target();
    const fiber = Effect.runFork(attempt(input));
    await vi.waitFor(async () => {
      expect((await windowOf(input)).inflight).toBe('1');
    });

    const exit = await Effect.runPromise(
      Effect.andThen(Fiber.interrupt(fiber), Fiber.await(fiber)),
    );

    expect(Exit.hasInterrupts(exit)).toBe(true);
    expect(await windowOf(input)).toEqual({ inflight: '0' });
  });

  it('returns the slot when interrupted while the reservation is in flight', async () => {
    // The gap the release has to cover: Valkey has already counted the slot,
    // the reply has not reached the fiber yet, and the interrupt lands in
    // between. A slot leaked here stays counted until the window's key
    // expires, and `maxInFlight` of them refuse the actor's authorised work.
    const input = target();
    const reserved = Promise.withResolvers<void>();
    const proceed = Promise.withResolvers<void>();
    const realRun = shared.run;
    const held: RateLimitStore['run'] = async (work) => {
      shared.run = realRun;
      const reply = await realRun(work);
      reserved.resolve();
      await proceed.promise;
      return reply;
    };
    shared.run = held;

    try {
      const fiber = Effect.runFork(attempt(input));
      await reserved.promise;
      expect((await windowOf(input)).inflight).toBe('1');

      fiber.interruptUnsafe();
      proceed.resolve();
      const exit = await Effect.runPromise(Fiber.await(fiber));

      expect(Exit.hasInterrupts(exit)).toBe(true);
      expect(await windowOf(input)).toEqual({ inflight: '0' });
    } finally {
      shared.run = realRun;
      proceed.resolve();
    }
  });
});

describe('the denied-attempt window without a store', () => {
  it('admits when the store cannot be reached', async () => {
    // Fail open. Refusing instead would turn a Valkey outage into every
    // audited command in every team failing, to protect the log from events
    // the caller was going to be refused anyway.
    const closed = createRateLimitStore(
      `redis://127.0.0.1:${await freePort()}`,
    );
    try {
      const limiter = new DeniedAuditRateLimiter({ store: closed, limit: 1 });
      const input = target();
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const reservation = await limiter.reserve(input);
        expect(reservation.admitted).toBe(true);
        if (!reservation.admitted) throw new Error('unreachable');
        await reservation.complete('denied');
      }
    } finally {
      await closed.close();
    }
  });

  it('admits when none is configured', async () => {
    const limiter = new DeniedAuditRateLimiter({ limit: 1 });
    const input = target();
    const first = await limiter.reserve(input);
    expect(first.admitted).toBe(true);
    if (!first.admitted) throw new Error('unreachable');
    await first.complete('denied');
    expect((await limiter.reserve(input)).admitted).toBe(true);
  });
});
