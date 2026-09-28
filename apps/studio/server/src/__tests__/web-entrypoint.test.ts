// The web process as a deployment runs it: a process of its own, started from
// the image's first command (#1895). What it is here for is the property no
// in-process test of `createApp` can see — that the queue this process creates
// jobs on is not something it only has when the schema happened to be current
// the moment it booted.
import { Predicate } from 'effect';
import { describe, expect, it } from 'vitest';

import { applySchema } from '../../scripts/apply.ts';
import { JOB_SCHEMA } from '../jobs/queues.ts';
import { freePort, startEntrypoint } from './support/entrypoint.ts';
import { createScratchDatabase, reachableDb } from './support/postgres.ts';
import { reachableRedis, REDIS_DATABASES } from './support/valkey.ts';

const db = await reachableDb();

/**
 * A Redis logical database of its own, emptied first. The sign-in below counts
 * against the shipped per-address limit — ten in ten minutes — and every
 * vitest process resolves to the same loopback address, so without this the
 * file would spend, and be spent by, whatever else signed in from 127.0.0.1
 * (#1909). Null where there is no store: the process then enforces no limit,
 * which this file is not about either way.
 */
const redis = await reachableRedis(REDIS_DATABASES.webEntrypoint);

/** drizzle-kit push against a fresh database, and it shares the CI runner. */
const CASE_TIMEOUT_MS = 240_000;
const SCHEMA_WAIT_MS = 60_000;

describe.skipIf(!db)('the web entrypoint', () => {
  it(
    'queues sign-in mail against a schema that arrived after it booted',
    async () => {
      if (!db) throw new Error('unreachable: probe guaranteed a database');
      const scratch = await createScratchDatabase(db);
      const port = await freePort();
      const origin = `http://127.0.0.1:${port}`;
      const web = startEntrypoint('src/index.ts', {
        DATABASE_URL: scratch.db.url,
        PORT: String(port),
        HOST: '127.0.0.1',
        // The process's own origin, so its trusted-origin check is satisfied
        // by a request made straight to the port it bound.
        PUBLIC_URL: origin,
        ...(redis ? { REDIS_URL: redis } : {}),
      });

      try {
        // The development lane, and the reason this case exists: the process
        // comes up against a database with no schema and waits, exactly as it
        // does while `pnpm dev` runs its reset.
        await web.waitForOutput(/Database has no Studio schema/);
        await web.waitForOutput(/listening on/);

        await applySchema(scratch.pool);
        await web.waitForOutput(/Database schema current\./, SCHEMA_WAIT_MS);

        const email = `late-schema-${Date.now()}@example.org`;
        const response = await fetch(`${origin}/api/auth/sign-in/magic-link`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', origin },
          body: JSON.stringify({ email, callbackURL: '/' }),
        });
        // A web process with no queue answers this with a failure: it holds no
        // mail transport of its own, so there is nothing else for it to do
        // with a sign-in link.
        expect(response.status, await response.clone().text()).toBe(200);

        const queued = await scratch.pool.query<{ queue: string }>(
          `select queue from ${JOB_SCHEMA}.jobs`,
        );
        expect(queued.rows).toEqual([{ queue: 'sign-in-email' }]);

        // Maintenance mode, as this process is wired for it (#1901): the flag
        // `studio-api maintenance on` writes closes every surface within the
        // gate's one-second reading, and readiness names it, while liveness
        // stays up. Written here as the owner; the command's own round trip
        // is src/programs/__tests__/maintenance.test.ts's.
        await scratch.pool.query(
          `update deployment_state set maintenance = true, reason = 'Upgrading'`,
        );
        const maintenanceCheck = async (): Promise<unknown> => {
          const body: unknown = await (await fetch(`${origin}/readyz`)).json();
          return Predicate.isObject(body) &&
            Predicate.hasProperty(body, 'checks') &&
            Predicate.isObject(body.checks) &&
            Predicate.hasProperty(body.checks, 'maintenance')
            ? body.checks.maintenance
            : undefined;
        };
        await expect
          .poll(maintenanceCheck, { timeout: 5_000 })
          .toBe('failed: maintenance mode is on: Upgrading');
        const refused = await fetch(`${origin}/rpc`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', origin },
          body: '{}',
        });
        expect(refused.status).toBe(503);
        expect(refused.headers.get('retry-after')).toBe('30');
        expect(await refused.json()).toEqual({
          title: 'Down for maintenance',
          status: 503,
        });
        expect((await fetch(`${origin}/healthz`)).status).toBe(200);

        await scratch.pool.query(
          'update deployment_state set maintenance = false, reason = null',
        );
        await expect.poll(maintenanceCheck, { timeout: 5_000 }).toBe('ok');
      } finally {
        web.child.kill('SIGKILL');
        await scratch.dispose();
      }
    },
    CASE_TIMEOUT_MS,
  );
});
