import { afterAll, describe, expect, it } from 'vitest';

import { renderSchemaDdl } from '../../scripts/render-schema-ddl.ts';
import { migrateDatabase } from '../db/migrate.ts';
import { RATE_LIMITS } from '../rate-limit/scopes.ts';
import {
  type Entrypoint,
  freePort,
  startEntrypoint,
} from './support/entrypoint.ts';
import { createScratchDatabase, reachableDb } from './support/postgres.ts';
import { reachableRedis, REDIS_DATABASES } from './support/valkey.ts';

// The acceptance criterion for #1909's limiter: it is one limit, not a limit
// per container. Two `studio-api serve` processes, the same database and the
// same Valkey, and the shipped sign-in limit — the request after it is refused
// whichever process it goes to.
//
// The limit here is the constant a deployment runs (src/rate-limit/scopes.ts),
// not a small one stated for the test: these are separate processes, and the
// only way to hand them a limit of their own would be the environment surface
// the ruling of 2026-09-15 removed. Ten requests is what counting to it costs,
// and this file empties its own Redis logical database first, so it counts
// from zero on every run.
//
// This is the property the limiters it replaces did not have. better-auth's
// sign-in counters used to live in Postgres, which at least survived a deploy,
// and the audit denial window lived in a Map, which did not survive two
// processes at all. Only a test at process scale can tell the difference:
// everything in-process passes whether the counter is shared or not.

const db = await reachableDb();
const redis = await reachableRedis(REDIS_DATABASES.processes);

/** Rendering the DDL imports drizzle-kit; the migrate itself takes a second. */
const PROVISION_TIMEOUT_MS = 180_000;

/** What the constant allows per client address; the next one is refused. */
const { max: SIGN_IN_LIMIT } = RATE_LIMITS.sign_in_address;

const running: Entrypoint[] = [];

async function startApi(env: Record<string, string>): Promise<number> {
  const port = await freePort();
  const api = startEntrypoint('src/index.ts', {
    ...env,
    PORT: String(port),
    HOST: '127.0.0.1',
  });
  running.push(api);
  await api.waitForOutput(/listening on/);
  return port;
}

afterAll(async () => {
  for (const api of running) api.child.kill('SIGTERM');
  await Promise.allSettled(running.map((api) => api.exited));
});

describe.skipIf(!db || !redis)('two API processes on one limiter', () => {
  it(
    'share the sign-in window, and the request past it is refused on either',
    async () => {
      if (!db || !redis) throw new Error('unreachable: the probes guaranteed');
      const scratch = await createScratchDatabase(db);
      try {
        await migrateDatabase(scratch.pool, await renderSchemaDdl());

        const env = {
          DATABASE_URL: scratch.db.url,
          REDIS_URL: redis,
          BETTER_AUTH_SECRET: 'a'.repeat(40),
          PUBLIC_URL: 'http://studio.test',
        };
        const [first, second] = await Promise.all([
          startApi(env),
          startApi(env),
        ]);

        const signIn = (port: number) =>
          fetch(`http://127.0.0.1:${port}/api/auth/sign-in/magic-link`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              // A fresh address each time, so the only thing these requests
              // share is the client address better-auth resolves them to —
              // which is the bucket under test.
              'Origin': 'http://studio.test',
            },
            body: JSON.stringify({
              email: `researcher-${Math.random()}@example.org`,
              callbackURL: '/',
            }),
          });

        // The window's whole allowance, split between the two processes.
        // Whether the sign-in itself succeeds is not the subject — it is
        // counted before it is served, so what is asserted is only that it was
        // not refused.
        for (let call = 0; call < SIGN_IN_LIMIT; call += 1) {
          const port = call % 2 === 0 ? first! : second!;
          expect((await signIn(port)).status).not.toBe(429);
        }

        // The next one exceeds a window that neither process could see on its
        // own: each has served about half of it.
        const refusedOnSecond = await signIn(second!);
        expect(refusedOnSecond.status).toBe(429);
        expect(refusedOnSecond.headers.get('Content-Type')).toContain(
          'application/problem+json',
        );
        expect(
          Number(refusedOnSecond.headers.get('Retry-After')),
        ).toBeGreaterThan(0);

        // And the process that was never asked for that one refuses too.
        expect((await signIn(first!)).status).toBe(429);
      } finally {
        await scratch.dispose();
      }
    },
    PROVISION_TIMEOUT_MS,
  );
});
