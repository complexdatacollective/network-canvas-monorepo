import { describe, expect, it } from 'vitest';

import { DeniedAuditRateLimiter } from '../denial-rate-limit.ts';

function complete(
  reservation: ReturnType<DeniedAuditRateLimiter['reserve']>,
  outcome: 'denied' | 'other',
): void {
  if (!reservation.admitted) throw new Error('expected admitted reservation');
  reservation.complete(outcome);
}

describe('denied audit rate limiter', () => {
  it('emits one exact summary for every window containing suppressed attempts', () => {
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
    complete(denied, 'denied');

    now = 1_010;
    expect(
      limiter.reserve('actor/team/operation', (summary) => {
        summaries.push(summary);
      }),
    ).toEqual({ admitted: false });
    now = 1_040;
    expect(limiter.reserve('actor/team/operation')).toEqual({
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

  it('counts in-flight attempts before the database boundary', () => {
    const limiter = new DeniedAuditRateLimiter({ limit: 2 });
    const first = limiter.reserve('actor/team/operation');
    const second = limiter.reserve('actor/team/operation');

    expect(first.admitted).toBe(true);
    expect(second.admitted).toBe(true);
    expect(limiter.reserve('actor/team/operation')).toEqual({
      admitted: false,
    });

    complete(first, 'other');
    expect(limiter.reserve('actor/team/operation').admitted).toBe(true);
  });

  it('retains only confirmed denials and expires them at the window boundary', () => {
    let now = 1_000;
    const limiter = new DeniedAuditRateLimiter({
      limit: 1,
      windowMs: 100,
      now: () => now,
    });
    const denied = limiter.reserve('actor/team/operation');
    complete(denied, 'denied');

    expect(limiter.reserve('actor/team/operation')).toEqual({
      admitted: false,
    });
    now += 100;
    expect(limiter.reserve('actor/team/operation').admitted).toBe(true);
  });

  it('evicts the oldest key when the operational map reaches its bound', () => {
    const limiter = new DeniedAuditRateLimiter({ limit: 1, maxKeys: 1 });
    const first = limiter.reserve('first');
    complete(first, 'denied');
    const second = limiter.reserve('second');
    complete(second, 'denied');

    expect(limiter.reserve('first').admitted).toBe(true);
  });

  it('fails closed instead of evicting a reservation that is in flight', () => {
    const limiter = new DeniedAuditRateLimiter({ limit: 1, maxKeys: 1 });
    const first = limiter.reserve('first');

    expect(limiter.reserve('second')).toEqual({ admitted: false });
    expect(limiter.reserve('first')).toEqual({ admitted: false });

    complete(first, 'other');
    expect(limiter.reserve('second').admitted).toBe(true);
  });

  it('does not let a stale completion delete a replacement window', () => {
    let now = 1_000;
    const limiter = new DeniedAuditRateLimiter({
      limit: 1,
      windowMs: 100,
      now: () => now,
    });
    const expired = limiter.reserve('actor/team/operation');

    now += 100;
    expect(limiter.reserve('actor/team/operation').admitted).toBe(true);
    complete(expired, 'other');

    expect(limiter.reserve('actor/team/operation')).toEqual({
      admitted: false,
    });
  });

  it('does not let a stale summary timer replace or delete a newer window', () => {
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
    complete(denied, 'denied');
    now = 1_010;
    limiter.reserve('actor/team/operation', (summary) => {
      summaries.push(summary);
    });

    now = 1_100;
    const replacement = limiter.reserve('actor/team/operation');
    expect(replacement.admitted).toBe(true);
    scheduled[0]!();
    complete(replacement, 'denied');

    expect(summaries).toEqual([
      {
        suppressedCount: 1,
        firstSuppressedAt: 1_010,
        lastSuppressedAt: 1_010,
      },
    ]);
    expect(limiter.reserve('actor/team/operation')).toEqual({
      admitted: false,
    });
  });
});
