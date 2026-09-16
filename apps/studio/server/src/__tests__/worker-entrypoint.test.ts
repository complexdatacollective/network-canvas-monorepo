// The worker as a deployment actually runs it: a process started from the
// image's second command (#1895). Everything here is a property of the whole
// process — what it prints at boot, what it binds, what its healthcheck reads,
// and that a container stop ends it cleanly — none of which an in-process test
// of `createJobWorker` can answer.
import { networkInterfaces } from 'node:os';

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
import { reachableRedis, REDIS_DATABASES } from './support/valkey.ts';

type Readiness = { status: string; checks: Record<string, string> };

/**
 * Every address this machine answers on that is not the loopback. The worker's
 * health listener must be reachable on none of them: it exists for the
 * container runtime, and a worker is not a service anything routes to.
 */
function externalAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flatMap((addresses) => addresses ?? [])
    .filter((address) => address.family === 'IPv4' && !address.internal)
    .map((address) => address.address);
}

async function readReadiness(
  port: number,
): Promise<{ status: number; body: Readiness }> {
  const response = await fetch(`http://127.0.0.1:${port}/readyz`);
  return {
    status: response.status,
    body: (await response.json()) as Readiness,
  };
}

const db = await reachableDb();
const redis = await reachableRedis(REDIS_DATABASES.workerEntrypoint);

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

/** A boot, a drizzle-kit push against a fresh database, and the retry after it. */
const READINESS_CASE_TIMEOUT_MS = 240_000;

/** The boot retry re-reads the fingerprint every three seconds. */
const SCHEMA_WAIT_MS = 60_000;

/** A boot, plus one connection attempt per external address that may be dropped. */
const LOOPBACK_CASE_TIMEOUT_MS = 60_000;

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
    // No rate-limit store either, unless a case asks for one: with one
    // configured, readiness carries a `limiter` check as well (#1909), and
    // these cases are about the database and the queue.
    REDIS_URL: '',
    ...overrides,
  });
}

/**
 * The development lane, which waits for a schema rather than exiting on one it
 * does not have. It is the only way to hold a real worker process in the state
 * the readiness case is about: up and answering, with pg-boss not connected.
 */
function startWaitingWorker(overrides: Record<string, string>): Entrypoint {
  return startEntrypoint('src/worker.ts', {
    NODE_ENV: 'development',
    STUDIO_DEV_DEFAULTS: '1',
    REDIS_URL: '',
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

  it('starts, reports the missing transport, serves no user surface, and stops on SIGTERM', async () => {
    const port = await freePort();
    const healthPort = await freePort();
    const worker = startWorker({
      DATABASE_URL: applied.db.url,
      // Nothing should bind this; the probe below is the assertion.
      PORT: String(port),
      WORKER_HEALTH_PORT: String(healthPort),
    });
    try {
      await worker.waitForOutput(
        /Network Canvas Studio worker \d+\.\d+\.\d+.* started/,
      );
      // Unset SMTP is a supported state, not a refusal: the jobs queue until
      // a worker with mail configured returns (#1895). It only has to be loud.
      await worker.waitForOutput(/No mail transport is configured/);
      expect(worker.output()).toMatch(/invitation-delivery and sign-in-email/);

      // It serves the health routes and nothing else: the port a deployment
      // would route users to refuses a connection.
      expect(await connectionRefused(port)).toBe(true);

      const live = await fetch(`http://127.0.0.1:${healthPort}/healthz`);
      expect(live.status).toBe(200);
      expect(await live.json()).toEqual({ status: 'ok' });

      // Ready, with the job connection among the checks: a worker whose
      // pg-boss had gone is exactly what the compose healthcheck is for, and
      // `db` alone would report that worker healthy.
      expect(await readReadiness(healthPort)).toEqual({
        status: 200,
        body: { status: 'ok', checks: { db: 'ok', schema: 'ok', jobs: 'ok' } },
      });

      // No Studio surface behind it: the RPC path the web process serves is
      // not mounted here.
      const rpc = await fetch(`http://127.0.0.1:${healthPort}/rpc/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      expect(rpc.status).toBe(404);

      worker.child.kill('SIGTERM');
      // A container stop is a SIGTERM and a deadline. The process exits 130
      // — `NodeRuntime.runMain`'s code for an interruption that ran every
      // finalizer and nothing else — before the deadline; any other code is a
      // finalizer that failed, and a process still alive at the deadline is a
      // stop the orchestrator would have to kill.
      const timeout = setTimeout(
        () => worker.child.kill('SIGKILL'),
        STOP_TIMEOUT_MS,
      );
      const { code, signal } = await worker.exited;
      clearTimeout(timeout);
      expect({ code, signal }).toEqual({ code: 130, signal: null });
      // The listener goes with the process, so nothing holds the port against
      // the container the deployment replaces it with.
      expect(await connectionRefused(healthPort)).toBe(true);
    } finally {
      worker.child.kill('SIGKILL');
    }
  });

  it(
    'reports jobs failing until pg-boss is connected, and ready once it is',
    async () => {
      if (!db) throw new Error('unreachable: probe guaranteed a database');
      // The state the compose healthcheck exists to catch: a container that is
      // up and answering with no queue behind it. A worker that called itself
      // ready here would be left in service running nothing.
      const scratch = await createScratchDatabase(db);
      const healthPort = await freePort();
      const worker = startWaitingWorker({
        DATABASE_URL: scratch.db.url,
        WORKER_HEALTH_PORT: String(healthPort),
      });

      try {
        await worker.waitForOutput(/Database has no Studio schema/);

        const waiting = await readReadiness(healthPort);
        expect(waiting.status).toBe(503);
        expect(waiting.body.status).toBe('failing');
        expect(waiting.body.checks.jobs).toBe('failed: not started');
        // Liveness is separate and stays 200: a container runtime would
        // restart a process that is doing exactly what it should.
        expect(
          (await fetch(`http://127.0.0.1:${healthPort}/healthz`)).status,
        ).toBe(200);

        await applySchema(scratch.pool);
        await worker.waitForOutput(
          /Network Canvas Studio worker \d+\.\d+\.\d+.* started/,
          SCHEMA_WAIT_MS,
        );

        await vi.waitFor(
          async () =>
            expect(await readReadiness(healthPort)).toEqual({
              status: 200,
              body: {
                status: 'ok',
                checks: { db: 'ok', schema: 'ok', jobs: 'ok' },
              },
            }),
          { timeout: 15_000, interval: 100 },
        );
      } finally {
        worker.child.kill('SIGKILL');
        await scratch.dispose();
      }
    },
    READINESS_CASE_TIMEOUT_MS,
  );

  it('reports the rate-limit store, degraded rather than failing', async () => {
    // The worker enforces no limit itself, but it holds the store so its
    // summary job can drain what the API processes suppressed (#1909) — and a
    // store it cannot reach is degraded, never failing: the limiter fails
    // open, so every job this process runs still runs.
    const healthPort = await freePort();
    const unreachable = await freePort();
    const worker = startWorker({
      DATABASE_URL: applied.db.url,
      WORKER_HEALTH_PORT: String(healthPort),
      REDIS_URL: `redis://127.0.0.1:${unreachable}`,
    });
    try {
      await worker.waitForOutput(
        /Network Canvas Studio worker \d+\.\d+\.\d+.* started/,
      );
      const degraded = await readReadiness(healthPort);
      expect(degraded.status).toBe(200);
      expect(degraded.body.status).toBe('degraded');
      expect(degraded.body.checks.limiter).toBe('degraded');
      expect(degraded.body.checks.jobs).toBe('ok');
    } finally {
      worker.child.kill('SIGKILL');
    }
  });

  it.skipIf(!redis)(
    'reports the rate-limit store ok while it answers',
    async () => {
      const healthPort = await freePort();
      const worker = startWorker({
        DATABASE_URL: applied.db.url,
        WORKER_HEALTH_PORT: String(healthPort),
        REDIS_URL: redis ?? '',
      });
      try {
        await worker.waitForOutput(
          /Network Canvas Studio worker \d+\.\d+\.\d+.* started/,
        );
        expect(await readReadiness(healthPort)).toEqual({
          status: 200,
          body: {
            status: 'ok',
            checks: { db: 'ok', schema: 'ok', jobs: 'ok', limiter: 'ok' },
          },
        });
      } finally {
        worker.child.kill('SIGKILL');
      }
    },
  );

  it.skipIf(externalAddresses().length === 0)(
    'binds its health listener to the loopback alone',
    async () => {
      // 127.0.0.1 is written into the source rather than taken from a
      // variable, and this is what holds it there: published, the listener
      // would let anything that can reach the host read a Studio deployment's
      // dependency status.
      const healthPort = await freePort();
      const worker = startWorker({
        DATABASE_URL: applied.db.url,
        WORKER_HEALTH_PORT: String(healthPort),
      });
      try {
        await worker.waitForOutput(
          /Network Canvas Studio worker \d+\.\d+\.\d+.* started/,
        );
        // Reachable on the loopback first, so a refusal below is the bind and
        // not a listener that never came up.
        expect(
          (await fetch(`http://127.0.0.1:${healthPort}/healthz`)).status,
        ).toBe(200);

        for (const address of externalAddresses()) {
          expect({
            address,
            refused: await connectionRefused(healthPort, address),
          }).toEqual({ address, refused: true });
        }
      } finally {
        worker.child.kill('SIGKILL');
      }
    },
    LOOPBACK_CASE_TIMEOUT_MS,
  );

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

        expect({ code, signal }).toEqual({ code: 130, signal: null });
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
