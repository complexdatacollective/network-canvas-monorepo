import { readEnv } from '../../env.ts';
import {
  createRateLimitStore,
  type RateLimitStore,
} from '../../rate-limit/store.ts';
import { CI } from './env.ts';

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

function unavailable<T>(reason: string, fallback: T): T {
  if (CI) throw new Error(`the Studio limiter suites cannot run: ${reason}`);
  return fallback;
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
  webEntrypoint: 8,
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
  if (!url) return unavailable('REDIS_URL is not set', null);
  const store = createRateLimitStore(url);
  try {
    if ((await store.ping()) !== 'ok') {
      return unavailable(`${url} is unreachable`, null);
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

/**
 * Whether the process-wide store answers: `REDIS_URL` itself, which is what
 * `reserveDeniedAuditAttempt` reaches through, rather than one of the scratch
 * databases above.
 *
 * It exists because the audit denial window fails open (#1909). A case that
 * counts how many denial events one actor may write is asserting about a
 * limit that is not being applied when the store is missing, so it gets six
 * events instead of five and fails — where before the window was in memory
 * and always there. Such a case skips instead, the same way a database-backed
 * one does, and on CI this throws rather than skipping.
 *
 * It deliberately does NOT empty the database. Every file that counts a
 * denial counts in that one database, and they run in parallel, so a flush
 * here would spend another file's window.
 */
export async function reachableDeniedAuditStore(): Promise<boolean> {
  const { redis } = readEnv();
  if (!redis) return unavailable('REDIS_URL is not set', false);
  const store = createRateLimitStore(redis);
  try {
    if ((await store.ping()) === 'ok') return true;
    return unavailable(`${redis} is unreachable`, false);
  } finally {
    await store.close();
  }
}
