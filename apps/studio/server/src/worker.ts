import process from 'node:process';

import { serve } from '@hono/node-server';

import { createMailer } from './auth/email.ts';
import { awaitCurrentSchema } from './boot.ts';
import { createMaintenancePool } from './db/pool.ts';
import { readEnv } from './env.ts';
import { createHealthRoutes, databaseCheck, schemaCheck } from './health.ts';
import { createJobWorker, type JobWorker } from './jobs/worker.ts';
    // Beside the fingerprint check and for the same reason (#1900): the
    // worker is what signs webhook deliveries, so a keyring that cannot
    // produce a stored key id would turn every delivery for that team into a
    // failed job. The keep-alive interval is deliberately still held — the
    // check is asynchronous, and `startWorker` is what releases it.
    void verifySecretKeysOrExit(env, maintenancePool)
      .then(() => startWorker())
      .catch((error: unknown) => {
import { STUDIO_VERSION } from './version.ts';

// The worker entry: the same image as src/index.ts, started with a different
// command (#1895). It executes the jobs the web process creates and runs the
// cron schedules. It serves no surface — it imports neither the HTTP app nor
// the RPC router, which a source-policy test pins
// (src/__tests__/process-separation.test.ts) — and the one port it binds is
// the loopback health listener below, which exists because a container
// healthcheck is otherwise the one thing that cannot ask a process which
// answers nothing whether it is working (#1897, #1909).
//
// It is also the only process that holds a mail transport, which is why it is
// the only one that reads SMTP_URL and EMAIL_FROM (`withMail`).

/** Longer than the graceful stop inside `worker.stop()`, so it only ever backstops it. */
const SHUTDOWN_BACKSTOP_MS = 30_000;

const env = readEnv({ withMail: true });

// Read into locals so the guard below narrows them for the closure. `auth`
// follows the database down and cannot be undefined beside one: `resolve`
// refuses a database without a signing secret or a public URL.
const { auth, db } = env;
if (!db || !auth) {
  // The web process serves a useful surface with no database — status, the
  // client, the documented refusals. A worker without one has no work at all,
  // and a container that stayed up pretending otherwise would look healthy.
  // oxlint-disable-next-line no-console -- boot diagnostics
  console.error(
    'DATABASE_URL is required for the worker process: there are no jobs to run without a database.',
  );
  process.exit(1);
}

// Every handler runs as the cross-team maintenance role, and so does pg-boss's
// own maintenance — the application role may create a job and nothing else.
const maintenancePool = createMaintenancePool(db);

// The shared rate-limit store (#1909). The worker enforces no limit itself; it
// holds the store so that the per-minute summary job can drain the suppressed
// windows the API processes leave behind, and so that readiness reports the
// same degraded verdict the API does when it cannot be reached.
const rateLimitStore = env.redis ? getRateLimitStore(env.redis) : undefined;
const limiter = createRateLimiter(env);

let worker: JobWorker | undefined;
// `worker.start()` resolves once pg-boss is connected and the handlers are
// registered. Readiness needs that distinction: an instance that exists but
// has not started answers nothing, and `getDb()` would still reach Postgres.
let jobsStarted = false;

// 127.0.0.1 by construction, not by configuration: this listener answers the
// container runtime and nothing else, and a worker is not a service anything
// routes to. Started before the schema wait so a `docker compose up` can read
// an honest `failing` — naming the schema — rather than a refused connection.
const health = serve({
  fetch: createHealthRoutes({
    db: databaseCheck(maintenancePool),
    schema: schemaCheck(maintenancePool),
    // `degraded`, never `failed`: the limiter fails open, so a worker that
    // cannot reach it still runs every job it has — only the summary job has
    // nothing to drain.
    ...(limiter.configured ? { limiter: limiter.readiness } : {}),
    jobs: async () => {
      if (!worker || !jobsStarted) throw new Error('not started');
      // pg-boss's own connection rather than the maintenance pool: the point
      // of this check is that the queue is reachable, and the two use
      // different pools.
      await worker.boss.getDb().executeSql('select 1');
      return 'ok';
    },
  }).fetch,
  port: env.workerHealthPort,
  hostname: '127.0.0.1',
});

// The schema retry inside `awaitCurrentSchema` is deliberately unref'd, so the
// development lane's wait needs something holding the loop open. The health
// listener above does that now, but this does not depend on it: what keeps a
// waiting process alive should not be a side effect of a diagnostic surface.
// Released the moment there is a worker to keep it.
let waiting: NodeJS.Timeout | undefined = setInterval(() => undefined, 60_000);
function stopWaiting(): void {
  if (waiting === undefined) return;
  clearInterval(waiting);
  waiting = undefined;
}

/**
 * Everything this process does, once the schema is current and the keyring
 * has been shown to produce every key id in use. An arrow rather than a
 * declaration so that the `db`/`auth` guard above narrows inside it: a
 * hoisted function could be called before the guard ran, and TypeScript is
 * right to say so.
 */
const startWorker = (): void => {
  stopWaiting();
  worker = createJobWorker({
    db,
    maintenancePool,
    // `refuse` is the resolved shape of "no transport is configured", and a
    // mailer that rejects every send would turn each mail job into a retry
    // loop ending in a dead letter. Absent instead: registerJobs says so at
    // boot and the jobs wait for a worker that has one (#1895).
    mailer:
      env.mail && env.mail.kind !== 'refuse'
        ? createMailer(env.mail)
        : undefined,
    publicBaseUrl: auth.baseUrl,
    rateLimitStore,
  });
  void worker.start().then(
    () => {
      jobsStarted = true;
      // oxlint-disable-next-line no-console -- boot log
      console.log(`Network Canvas Studio worker ${STUDIO_VERSION} started`);
      return undefined;
    },
    (error: unknown) => {
      // Nothing this process does works without pg-boss, so a failed start
      // is a failed boot: exiting lets the deployment restart it rather than
      // leaving a container up that runs no jobs.
      // oxlint-disable-next-line no-console -- boot diagnostics
      console.error('Could not start the job worker:', error);
      process.exit(1);
    },
  );
};

await awaitCurrentSchema(maintenancePool, env, {
  onCurrent: () => {
    // Beside the fingerprint check and for the same reason (#1900): the
    // worker is what signs webhook deliveries, so a keyring that cannot
    // produce a stored key id would turn every delivery for that team into a
    // failed job. The keep-alive interval is deliberately still held — the
    // check is asynchronous, and `startWorker` is what releases it.
    void verifySecretKeysOrExit(env, maintenancePool)
      .then(() => startWorker())
      .catch((error: unknown) => {
        // oxlint-disable-next-line no-console -- boot diagnostics
        console.error('Boot checks failed:', error);
        process.exit(1);
      });
  },
});

// SIGTERM is how a container stop arrives. `worker.stop()` waits out in-flight
// handlers (25 s), so this backstop is longer than that and unref'd — it must
// never be the thing keeping the process alive once the rest has finished.
let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  stopWaiting();
  setTimeout(() => process.exit(1), SHUTDOWN_BACKSTOP_MS).unref();
  health.close();
  void Promise.resolve(worker?.stop())
    .catch((error: unknown) => {
      // oxlint-disable-next-line no-console -- shutdown diagnostics
      console.error('Job worker shutdown failed:', error);
    })
    .then(() => Promise.all([maintenancePool.end(), closeRateLimitStores()]))
    .catch(() => undefined)
    .finally(() => {
      process.exit(0);
    });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
