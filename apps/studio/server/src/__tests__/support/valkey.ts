import process from 'node:process';

import { readEnv } from '../../env.ts';
import {
  createRateLimitStore,
  type RateLimitStore,
} from '../../rate-limit/store.ts';

// Reaching a real Valkey, the way support/postgres.ts reaches a real Postgres:
// a suite that cannot find one is skipped locally and fails on CI, where the
// service container is part of the job and its absence is a broken workflow
// rather than a developer's machine.
//
// Each file takes a Redis logical database of its own and empties it. Vitest
// runs files in parallel processes against one server, and several of these
// scopes are keyed by the client address — which is the same address in every
// process — so a shared key space would have one file's requests spending
// another's allowance.

/* oxlint-disable-next-line node/no-process-env -- the boundary for this flag */
const CI = process.env.CI === 'true';

function unavailable(reason: string): null {
  if (CI) throw new Error(`the Studio limiter suites cannot run: ${reason}`);
  return null;
}

/** Database indices, one per suite, so no two files share a key space. */
export const REDIS_DATABASES = {
  limiter: 1,
  auditDenial: 2,
  routes: 3,
  processes: 4,
  summaryJob: 5,
  health: 6,
  workerEntrypoint: 7,
} as const;

/** `REDIS_URL` pointed at one logical database, or null when none is set. */
function scratchRedisUrl(database: number): string | null {
  const { redis } = readEnv();
  if (!redis) return null;
  const url = new URL(redis);
  url.pathname = `/${database}`;
  return url.toString();
}

/**
 * The URL of an empty logical database, or null to skip. Emptying it here
 * rather than per test is deliberate: a file's cases run in order, and each
 * one uses subjects of its own, so what has to be true is that nothing from a
 * previous *run* survives.
 */
export async function reachableRedis(database: number): Promise<string | null> {
  const url = scratchRedisUrl(database);
  if (!url) return unavailable('REDIS_URL is not set');
  const store = createRateLimitStore(url);
  try {
    if ((await store.ping()) !== 'ok') {
      return unavailable(`${url} is unreachable`);
    }
    await store.run((redis) => redis.flushdb());
    return url;
  } finally {
    await store.close();
  }
}

/** Reads a key back, for cases whose subject is what must not be in the store. */
export async function withStore<T>(
  url: string,
  work: (store: RateLimitStore) => Promise<T>,
): Promise<T> {
  const store = createRateLimitStore(url);
  try {
    return await work(store);
  } finally {
    await store.close();
  }
}
