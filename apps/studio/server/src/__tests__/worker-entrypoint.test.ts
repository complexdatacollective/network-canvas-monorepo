// The worker as a deployment actually runs it: a process started from the
// image's second command (#1895). Everything here is a property of the whole
// process — what it prints at boot, that it listens on nothing, and that a
// container stop ends it cleanly — none of which an in-process test of
// `createJobWorker` can answer.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { JOB_SCHEMA } from '@codaco/studio-sync/jobs';

import { applySchema } from '../../scripts/apply.ts';
import { createJobClient } from '../jobs/client.ts';
import {
  connectionRefused,
  type Entrypoint,
  freePort,
  startEntrypoint,
} from './support/entrypoint.ts';
import { createScratchDatabase, reachableDb } from './support/postgres.ts';
import { startSilentSmtp } from './support/smtp.ts';

const db = await reachableDb();

/** drizzle-kit push against a fresh database, and it shares the CI runner. */
const APPLY_TIMEOUT_MS = 180_000;
const STOP_TIMEOUT_MS = 10_000;

/**
 * The in-flight case waits out nodemailer's greeting timeout (10 s, set in
 * src/auth/email.ts) on top of a boot, which is more than the file's default
 * budget and still well inside the 25-second graceful window the process asks
 * pg-boss for.
 */
const IN_FLIGHT_CASE_TIMEOUT_MS = 45_000;

/** Longer than the send this case is waiting out, shorter than the case. */
const IN_FLIGHT_STOP_TIMEOUT_MS = 30_000;

/**
 * The deployment's environment, minus the development lane: the committed
 * `.env.development` this suite runs under would otherwise hand the child a
 * console mailer and the lenient schema wait, which are precisely the two
 * behaviours these cases are about.
 */
function startWorker(overrides: Record<string, string>): Entrypoint {
  return startEntrypoint('src/worker.ts', {
    NODE_ENV: 'production',
    STUDIO_DEV_DEFAULTS: '',
    // No transport at all, so the worker has to say so rather than falling
    // back to the development console mailer.
    SMTP_URL: '',
    EMAIL_FROM: '',
    ...overrides,
  });
}

describe.skipIf(!db)('the worker entrypoint', () => {
  let applied: Awaited<ReturnType<typeof createScratchDatabase>>;

  beforeAll(async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    applied = await createScratchDatabase(db);
    await applySchema(applied.pool);
  }, APPLY_TIMEOUT_MS);

  afterAll(async () => {
    await applied.dispose();
  });

  it('starts, reports the missing transport, binds nothing, and stops on SIGTERM', async () => {
    const port = await freePort();
    const worker = startWorker({
      DATABASE_URL: applied.db.url,
      // Nothing should bind this; the probe below is the assertion.
      PORT: String(port),
    });
    try {
      await worker.waitForOutput(
        /Network Canvas Studio worker \d+\.\d+\.\d+.* started/,
      );
      // Unset SMTP is a supported state, not a refusal: the jobs queue until
      // a worker with mail configured returns (#1895). It only has to be loud.
      await worker.waitForOutput(/No mail transport is configured/);
      expect(worker.output()).toMatch(/invitation-delivery and sign-in-email/);

      // Two independent readings of "it binds no port": it never announced a
      // listener, and the port it was given refuses a connection.
      expect(worker.output()).not.toMatch(/listening on/i);
      expect(await connectionRefused(port)).toBe(true);

      worker.child.kill('SIGTERM');
      // A container stop is a SIGTERM and a deadline. Anything but a clean
      // zero here is a stop the orchestrator would eventually have to kill.
      const timeout = setTimeout(
        () => worker.child.kill('SIGKILL'),
        STOP_TIMEOUT_MS,
      );
      const { code, signal } = await worker.exited;
      clearTimeout(timeout);
      expect({ code, signal }).toEqual({ code: 0, signal: null });
    } finally {
      worker.child.kill('SIGKILL');
    }
  });

  it(
    'finishes a job it is running before it exits on SIGTERM',
    async () => {
      if (!db) throw new Error('unreachable: probe guaranteed a database');
      // The graceful stop is proved in-process in src/jobs/__tests__/worker.test.ts;
      // what only the real process can show is that its signal handler waits for
      // the same thing — a container stop arriving mid-send must not abandon the
      // handler and leave the job dead as 'pg-boss shut down while active'.
      const smtp = await startSilentSmtp();
      // Enqueued the way the web process does: the application role, inside its
      // own transaction, on the database the child is working.
      const jobs = createJobClient(applied.db);
      const worker = startWorker({
        DATABASE_URL: applied.db.url,
        // A transport the child will really connect to, because a console
        // mailer resolves instantly and there would be nothing in flight.
        SMTP_URL: `smtp://127.0.0.1:${smtp.port}`,
        EMAIL_FROM: 'studio@example.test',
      });
      const jobRow = async (
        jobId: string,
      ): Promise<{ state: string; output: { message?: string } | null }> => {
        const rows = await applied.pool.query<{
          state: string;
          output: { message?: string } | null;
        }>(`select state, output from ${JOB_SCHEMA}.job_common where id = $1`, [
          jobId,
        ]);
        const row = rows.rows[0];
        if (!row) throw new Error(`no job row for ${jobId}`);
        return row;
      };

      try {
        await worker.waitForOutput(
          /Network Canvas Studio worker \d+\.\d+\.\d+.* started/,
        );

        const client = await applied.pool.connect();
        let jobId: string;
        try {
          await client.query('BEGIN');
          jobId = await jobs.enqueue(client, 'sign-in-email', {
            email: 'researcher@example.org',
            url: 'https://studio.example.org/api/auth/magic-link/verify?token=abc',
          });
          await client.query('COMMIT');
        } finally {
          client.release();
        }

        // `active` is the child holding the job: the handler is inside the send
        // and the connection to the silent transport is open.
        await vi.waitFor(
          async () => expect((await jobRow(jobId)).state).toBe('active'),
          { timeout: 15_000, interval: 25 },
        );

        const signalled = Date.now();
        worker.child.kill('SIGTERM');
        const backstop = setTimeout(
          () => worker.child.kill('SIGKILL'),
          IN_FLIGHT_STOP_TIMEOUT_MS,
        );
        const { code, signal } = await worker.exited;
        clearTimeout(backstop);
        const waited = Date.now() - signalled;

        expect({ code, signal }).toEqual({ code: 0, signal: null });
        // The send cannot fail before nodemailer's greeting timeout, so an exit
        // this far after the signal is the process having waited for it. A
        // handler that was dropped would have let the process exit at once.
        expect(waited).toBeGreaterThan(2000);
        // And it is the graceful window rather than the hard backstop: the
        // process asks pg-boss for 25 seconds and backs that with 30.
        expect(waited).toBeLessThan(25_000);

        const finished = await jobRow(jobId);
        // pg-boss's ordinary failure path rather than its shutdown one: the
        // attempt ended on the transport and the job is waiting for its next
        // one, where a handler abandoned at the stop would have been failed
        // outright with 'pg-boss shut down while active'.
        expect(finished.state).toBe('retry');
        expect(finished.output?.message).toMatch(/Greeting never received/);
      } finally {
        worker.child.kill('SIGKILL');
        await jobs.stop();
        await smtp.close();
      }
    },
    IN_FLIGHT_CASE_TIMEOUT_MS,
  );

  it('refuses to run with no database at all', async () => {
    // The web process serves a useful surface without one; a worker has no
    // work, and a container that stayed up would look healthy while running
    // nothing.
    const worker = startWorker({ DATABASE_URL: '' });
    try {
      const { code } = await worker.exited;
      expect(code).toBe(1);
      expect(worker.output()).toMatch(
        /DATABASE_URL is required for the worker process/,
      );
    } finally {
      worker.child.kill('SIGKILL');
    }
  });

  it('refuses a database this build did not create', async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    // Outside development a stale or absent schema is an answer, not a
    // transient failure — the same verdict the web process boots on, reached
    // through the same boot module.
    const empty = await createScratchDatabase(db);
    const worker = startWorker({ DATABASE_URL: empty.db.url });
    try {
      const { code } = await worker.exited;
      expect(code).toBe(1);
      expect(worker.output()).toMatch(/The database has no Studio schema/);
    } finally {
      worker.child.kill('SIGKILL');
      await empty.dispose();
    }
  });
});
