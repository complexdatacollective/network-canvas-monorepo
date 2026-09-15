// The web process as a deployment runs it: a process of its own, started from
// the image's first command (#1895). What it is here for is the property no
// in-process test of `createApp` can see — that the queue this process creates
// jobs on is not something it only has when the schema happened to be current
// the moment it booted.
import { describe, expect, it } from 'vitest';

import { JOB_SCHEMA } from '@codaco/studio-sync/jobs';

import { applySchema } from '../../scripts/apply.ts';
import { freePort, startEntrypoint } from './support/entrypoint.ts';
import { createScratchDatabase, reachableDb } from './support/postgres.ts';

const db = await reachableDb();

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

        const queued = await scratch.pool.query<{ name: string }>(
          `select name from ${JOB_SCHEMA}.job_common`,
        );
        expect(queued.rows).toEqual([{ name: 'sign-in-email' }]);
      } finally {
        web.child.kill('SIGKILL');
        await scratch.dispose();
      }
    },
    CASE_TIMEOUT_MS,
  );
});
