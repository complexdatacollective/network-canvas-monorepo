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
});
