import { describe, expect, it } from 'vitest';

import { DeniedAuditRateLimiter } from '../denial-rate-limit.ts';

async function complete(
  reservation: ReturnType<DeniedAuditRateLimiter['reserve']>,
  outcome: 'denied' | 'other',
): Promise<void> {
  const result = await reservation;
  if (!result.admitted) throw new Error('expected admitted reservation');
  result.complete(outcome);
}

describe('denied audit rate limiter', () => {
  it('emits one exact summary for every window containing suppressed attempts', async () => {
    let now = 1_000;
    const scheduled: (() => void)[] = [];
    const summaries: unknown[] = [];
    const limiter = new DeniedAuditRateLimiter({
      limit: 1,
      windowMs: 100,
      now: () => now,
      schedule: (task) => {
        scheduled.push(task);
        return () => undefined;
      },
    });
    const denied = limiter.reserve('actor/team/operation');
    await complete(denied, 'denied');

    now = 1_010;
    expect(
      await limiter.reserve('actor/team/operation', (summary) => {
        summaries.push(summary);
      }),
    ).toEqual({ admitted: false });
    now = 1_040;
    expect(await limiter.reserve('actor/team/operation')).toEqual({
      admitted: false,
    });

    expect(scheduled).toHaveLength(1);
    expect(summaries).toEqual([]);
    now = 1_100;
    scheduled[0]!();
    scheduled[0]!();

    expect(summaries).toEqual([
      {
        suppressedCount: 2,
        firstSuppressedAt: 1_010,
        lastSuppressedAt: 1_040,
      },
    ]);
  });

  it('flushes a scheduled suppression summary before process shutdown', async () => {
    const scheduled: (() => void)[] = [];
    const summaries: unknown[] = [];
    let cancelled = 0;
    const limiter = new DeniedAuditRateLimiter({
      limit: 1,
      windowMs: 60_000,
      schedule: (task) => {
        scheduled.push(task);
        return () => {
          cancelled += 1;
        };
      },
    });
    const denied = limiter.reserve('actor/team/operation');
    await complete(denied, 'denied');
    expect(
      await limiter.reserve('actor/team/operation', (summary) => {
        summaries.push(summary);
      }),
    ).toEqual({ admitted: false });
    expect(summaries).toEqual([]);

    await expect(limiter.flush({ timeoutMs: 100 })).resolves.toBe(true);

    expect(cancelled).toBe(1);
    expect(summaries).toEqual([
      {
        suppressedCount: 1,
        firstSuppressedAt: expect.any(Number),
        lastSuppressedAt: expect.any(Number),
      },
    ]);
    scheduled[0]!();
    expect(summaries).toHaveLength(1);
  });

  it('bounds shutdown when a summary writer does not settle', async () => {
    let flushTimeout: (() => void) | undefined;
    const timeoutSignals: number[] = [];
    const limiter = new DeniedAuditRateLimiter({
      limit: 1,
      schedule: () => () => undefined,
      scheduleFlushTimeout: (task) => {
        flushTimeout = task;
        return () => undefined;
      },
      onFlushTimeout: (pendingWrites) => {
        timeoutSignals.push(pendingWrites);
      },
    });
    const denied = limiter.reserve('actor/team/operation');
    await complete(denied, 'denied');
    expect(
      await limiter.reserve(
        'actor/team/operation',
        () => new Promise<void>(() => undefined),
      ),
    ).toEqual({ admitted: false });

    const flush = limiter.flush({ timeoutMs: 100 });
    let flushSettled = false;
    void flush.then(() => {
      flushSettled = true;
      return undefined;
    });
    await Promise.resolve();
    expect(flushSettled).toBe(false);

    if (!flushTimeout) throw new Error('expected a bounded flush timeout');
    flushTimeout();
    await expect(flush).resolves.toBe(false);
    expect(timeoutSignals).toEqual([1]);
  });

  it('queues excess in-flight attempts before the database boundary', async () => {
    const limiter = new DeniedAuditRateLimiter({ limit: 2 });
    const first = limiter.reserve('actor/team/operation');
    const second = limiter.reserve('actor/team/operation');

    expect((await first).admitted).toBe(true);
    expect((await second).admitted).toBe(true);
    const third = limiter.reserve('actor/team/operation');
    let thirdSettled = false;
    void third.then(() => {
      thirdSettled = true;
      return undefined;
    });
    await Promise.resolve();
    expect(thirdSettled).toBe(false);

    await complete(first, 'other');
    expect((await third).admitted).toBe(true);
  });

  it('waits for authorization outcomes instead of rejecting an authorized burst', async () => {
    const scheduled: (() => void)[] = [];
    const summaries: unknown[] = [];
    const limiter = new DeniedAuditRateLimiter({
      limit: 5,
      schedule: (task) => {
        scheduled.push(task);
        return () => undefined;
      },
    });
    const active = Array.from({ length: 5 }, () =>
      limiter.reserve('actor/team/operation'),
    );
    const sixthPromise = Promise.resolve(
      limiter.reserve('actor/team/operation', (summary) => {
        summaries.push(summary);
      }),
    );
    let sixthSettled = false;
    void sixthPromise.then(() => {
      sixthSettled = true;
      return undefined;
    });

    await Promise.resolve();
    expect(sixthSettled).toBe(false);

    await complete(active[0]!, 'other');
    const sixth = await sixthPromise;
    expect(sixth.admitted).toBe(true);
    for (const reservation of active.slice(1)) {
      await complete(reservation, 'other');
    }
    if (!sixth.admitted) throw new Error('expected admitted reservation');
    sixth.complete('other');

    expect(scheduled).toEqual([]);
    expect(summaries).toEqual([]);
  });

  it('suppresses queued attempts only after the denial allowance is confirmed', async () => {
    let now = 1_000;
    const scheduled: (() => void)[] = [];
    const summaries: unknown[] = [];
    const limiter = new DeniedAuditRateLimiter({
      limit: 2,
      windowMs: 100,
      now: () => now,
      schedule: (task) => {
        scheduled.push(task);
        return () => undefined;
      },
    });
    const first = limiter.reserve('actor/team/operation');
    const second = limiter.reserve('actor/team/operation');
    const queued = limiter.reserve('actor/team/operation', (summary) => {
      summaries.push(summary);
    });
    let queuedSettled = false;
    void queued.then(() => {
      queuedSettled = true;
      return undefined;
    });

    await complete(first, 'denied');
    await Promise.resolve();
    expect(queuedSettled).toBe(false);

    now = 1_010;
    await complete(second, 'denied');
    expect(await queued).toEqual({ admitted: false });
    expect(scheduled).toHaveLength(1);

    now = 1_100;
    scheduled[0]!();
    expect(summaries).toEqual([
      {
        suppressedCount: 1,
        firstSuppressedAt: 1_000,
        lastSuppressedAt: 1_000,
      },
    ]);
  });

  it('retains only confirmed denials and expires them at the window boundary', async () => {
    let now = 1_000;
    const limiter = new DeniedAuditRateLimiter({
      limit: 1,
      windowMs: 100,
      now: () => now,
    });
    const denied = limiter.reserve('actor/team/operation');
    await complete(denied, 'denied');

    expect(await limiter.reserve('actor/team/operation')).toEqual({
      admitted: false,
    });
    now += 100;
    expect((await limiter.reserve('actor/team/operation')).admitted).toBe(true);
  });

  it('evicts the oldest key when the operational map reaches its bound', async () => {
    const limiter = new DeniedAuditRateLimiter({ limit: 1, maxKeys: 1 });
    const first = limiter.reserve('first');
    await complete(first, 'denied');
    const second = limiter.reserve('second');
    await complete(second, 'denied');

    expect((await limiter.reserve('first')).admitted).toBe(true);
  });

  it('fails closed instead of evicting a reservation that is in flight', async () => {
    const limiter = new DeniedAuditRateLimiter({ limit: 1, maxKeys: 1 });
    const first = limiter.reserve('first');

    expect(await limiter.reserve('second')).toEqual({ admitted: false });
    const queuedFirst = limiter.reserve('first');

    await complete(first, 'other');
    expect((await queuedFirst).admitted).toBe(true);
    await complete(queuedFirst, 'other');
    expect((await limiter.reserve('second')).admitted).toBe(true);
  });

  it('does not let a stale completion delete a replacement window', async () => {
    let now = 1_000;
    const limiter = new DeniedAuditRateLimiter({
      limit: 1,
      windowMs: 100,
      now: () => now,
    });
    const expired = limiter.reserve('actor/team/operation');

    now += 100;
    expect((await limiter.reserve('actor/team/operation')).admitted).toBe(true);
    await complete(expired, 'other');

    const queued = limiter.reserve('actor/team/operation');
    let settled = false;
    void queued.then(() => {
      settled = true;
      return undefined;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
  });

  it('does not let a stale summary timer replace or delete a newer window', async () => {
    let now = 1_000;
    const scheduled: (() => void)[] = [];
    const summaries: unknown[] = [];
    const limiter = new DeniedAuditRateLimiter({
      limit: 1,
      windowMs: 100,
      now: () => now,
      schedule: (task) => {
        scheduled.push(task);
        return () => undefined;
      },
    });
    const denied = limiter.reserve('actor/team/operation');
    await complete(denied, 'denied');
    now = 1_010;
    await limiter.reserve('actor/team/operation', (summary) => {
      summaries.push(summary);
    });

    now = 1_100;
    const replacement = limiter.reserve('actor/team/operation');
    expect((await replacement).admitted).toBe(true);
    scheduled[0]!();
    await complete(replacement, 'denied');

    expect(summaries).toEqual([
      {
        suppressedCount: 1,
        firstSuppressedAt: 1_010,
        lastSuppressedAt: 1_010,
      },
    ]);
    expect(await limiter.reserve('actor/team/operation')).toEqual({
      admitted: false,
    });
  });
});
