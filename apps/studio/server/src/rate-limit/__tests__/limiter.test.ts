import { createHash, randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { freePort } from '../../__tests__/support/entrypoint.ts';
import {
  reachableRedis,
  REDIS_DATABASES,
  withStore,
} from '../../__tests__/support/valkey.ts';
import { resolve } from '../../env/resolve.ts';
import {
  createRateLimiter,
  DENIED_SCOPE_COUNTS_KEY,
} from '../../rate-limit.ts';
import {
  RATE_LIMIT_SCOPES,
  RATE_LIMITS,
  type RateLimitSettings,
} from '../scopes.ts';

// The limiter module itself (#1909). The request paths that use it are in
// src/__tests__/rate-limit-routes.test.ts; what is here is the decision, the
// key material, and what happens when the store is not there.

const url = await reachableRedis(REDIS_DATABASES.limiter);

/**
 * A limit per scope, small enough to count to and different in every scope, so
 * that a limiter applying one scope's rule to another would fail here rather
 * than pass by coincidence. The maxima are what the trip cases below count to.
 *
 * Injected in code, because that is the only way a limit is ever anything but
 * its constant: there is no environment variable behind any of these (#1909).
 */
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
};

function limiterWith(limits: Partial<RateLimitSettings> = {}) {
  return createRateLimiter(
    resolve({
      NODE_ENV: 'test',
      ...(url ? { REDIS_URL: url } : {}),
    }),
    limits,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the limits a process enforces', () => {
  it('are the constants when nothing is injected', () => {
    // Which is every deployment: `limits` is a test seam, and there is nothing
    // else left for a limit to come from now the variables are gone.
    expect(limiterWith().rules).toEqual(RATE_LIMITS);
  });

  it('are a positive count over a whole number of seconds', () => {
    // What the removed `count/window` pattern used to refuse on the way in: a
    // window of `10` meaning ten milliseconds rather than ten minutes, or a
    // count of zero refusing everybody. Written as numbers those are a typo
    // away and nothing else in the system would notice.
    const wrong = RATE_LIMIT_SCOPES.filter((scope) => {
      const { max, windowMs } = RATE_LIMITS[scope];
      return max < 1 || windowMs < 1_000 || windowMs % 1_000 !== 0;
    });
    expect(wrong).toEqual([]);
  });

  it('take an injected limit for the scope it names, and no other', () => {
    const rules = limiterWith({ rpc_user: { max: 2, windowMs: 60_000 } }).rules;
    expect(rules.rpc_user).toEqual({ max: 2, windowMs: 60_000 });
    expect(rules.rpc_team).toEqual(RATE_LIMITS.rpc_team);
    expect(rules.sign_in_address).toEqual(RATE_LIMITS.sign_in_address);
  });
});

describe.skipIf(!url)('the limiter against a real store', () => {
  it.each(RATE_LIMIT_SCOPES)(
    'lets %s through to its limit and refuses the next call',
    async (scope) => {
      const limiter = limiterWith(INJECTED);
      const subject = `${scope}-${randomUUID()}`;
      const { max } = INJECTED[scope];

      for (let call = 0; call < max; call += 1) {
        expect(await limiter.check(scope, subject)).toEqual({ allowed: true });
      }

      const refused = await limiter.check(scope, subject);
      if (refused.allowed) throw new Error(`${scope} was not refused`);
      // Positive and inside the window: a `Retry-After` of zero invites an
      // immediate retry that is refused again, and one longer than the window
      // would tell a caller to wait past the point the window reopens.
      expect(refused.retryAfterSeconds).toBeGreaterThan(0);
      expect(refused.retryAfterSeconds).toBeLessThanOrEqual(60);

      // A different subject in the same scope is a different bucket, which is
      // what keeps one caller from refusing everyone else.
      expect(await limiter.check(scope, `${subject}-other`)).toEqual({
        allowed: true,
      });
    },
  );

  it('never puts a subject in the store in clear', async () => {
    if (!url) throw new Error('unreachable: the probe guaranteed a store');
    const limiter = limiterWith(INJECTED);
    const email = `researcher-${randomUUID()}@example.org`;
    expect(await limiter.check('sign_in_email', email)).toEqual({
      allowed: true,
    });

    const keys = (await withStore(url, (store) =>
      store.run((redis) => redis.keys('studio:rl:sign_in_email:*')),
    )) as string[];
    expect(keys).toContain(
      `studio:rl:sign_in_email:${createHash('sha256').update(email).digest('hex').slice(0, 32)}`,
    );
    // Nothing anywhere in the key space spells the address out, which is the
    // property: a hashed subject is only worth having if nothing else leaks it.
    expect(JSON.stringify(keys)).not.toContain(email);
  });

  it('counts a denied call for the summary job, by scope and never by subject', async () => {
    if (!url) throw new Error('unreachable: the probe guaranteed a store');
    const read = () =>
      withStore(url, (store) =>
        store.run((redis) => redis.hgetall(DENIED_SCOPE_COUNTS_KEY)),
      ) as Promise<Record<string, string>>;
    // A delta, because the cases above have denied calls of their own: what is
    // being asserted is that one denial adds one, in this scope and no other.
    const before = await read();
    const limiter = limiterWith({
      participant_sync: { max: 1, windowMs: 60_000 },
    });
    const subject = `session-${randomUUID()}`;
    await limiter.check('participant_sync', subject);
    await limiter.check('participant_sync', subject);

    const after = await read();
    expect(Number(after.participant_sync ?? 0)).toBe(
      Number(before.participant_sync ?? 0) + 1,
    );
    expect(after.storage_read ?? '0').toBe(before.storage_read ?? '0');
    expect(JSON.stringify(after)).not.toContain(subject);
  });

  it('shares one window between two limiters on one store', async () => {
    // The property the acceptance criterion is about, at module scale: two API
    // containers are two of these, and the count they read is one count.
    // src/__tests__/rate-limit-processes.test.ts proves the same with two
    // operating-system processes.
    const first = limiterWith({ rpc_user: { max: 2, windowMs: 60_000 } });
    const second = limiterWith({ rpc_user: { max: 2, windowMs: 60_000 } });
    const subject = `user-${randomUUID()}`;

    expect(await first.check('rpc_user', subject)).toEqual({ allowed: true });
    expect(await second.check('rpc_user', subject)).toEqual({ allowed: true });
    expect((await first.check('rpc_user', subject)).allowed).toBe(false);
    expect((await second.check('rpc_user', subject)).allowed).toBe(false);
  });

  it('reports ready while the store answers', async () => {
    const limiter = limiterWith();
    expect(limiter.configured).toBe(true);
    expect(await limiter.readiness()).toBe('ok');
  });
});

describe('the limiter with no store to reach', () => {
  it('allows every call, warns once, and reports degraded', async () => {
    // A port nothing is listening on: the store is configured and unreachable,
    // which is the outage this fails open for.
    const closed = `redis://127.0.0.1:${await freePort()}`;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const limiter = createRateLimiter(
      resolve({ NODE_ENV: 'test', REDIS_URL: closed }),
      { rpc_user: { max: 1, windowMs: 60_000 } },
    );

    const subject = `user-${randomUUID()}`;
    for (let call = 0; call < 5; call += 1) {
      expect(await limiter.check('rpc_user', subject)).toEqual({
        allowed: true,
      });
    }
    // Five refused round trips, one line: this is a failing dependency, and a
    // line per request would bury everything else in the log.
    expect(
      warn.mock.calls.filter(([line]) =>
        String(line).includes('Rate limit store is unavailable'),
      ),
    ).toHaveLength(1);

    expect(limiter.configured).toBe(true);
    expect(await limiter.readiness()).toBe('degraded');
  });

  it('is not configured at all when no store is named', async () => {
    const limiter = createRateLimiter(resolve({ NODE_ENV: 'test' }));
    expect(limiter.configured).toBe(false);
    // Readiness leaves the check out entirely in that case (src/app.ts), so
    // what this asserts is only that asking is harmless.
    expect(await limiter.readiness()).toBe('ok');
    expect(await limiter.check('rpc_user', 'anyone')).toEqual({
      allowed: true,
    });
  });
});
