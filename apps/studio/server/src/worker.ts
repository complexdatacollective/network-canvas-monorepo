import process from 'node:process';

import { createMailer } from './auth/email.ts';
import { awaitCurrentSchema } from './boot.ts';
import { createMaintenancePool } from './db/pool.ts';
import { readEnv } from './env.ts';
import { createJobWorker, type JobWorker } from './jobs/worker.ts';
import { STUDIO_VERSION } from './version.ts';

// The worker entry: the same image as src/index.ts, started with a different
// command (#1895). It executes the jobs the web process creates, runs the cron
// schedules, and binds no port — nothing here serves a request, and it imports
// neither the HTTP app nor the RPC router, which a source-policy test pins
// (src/__tests__/process-separation.test.ts).
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

let worker: JobWorker | undefined;

// Until pg-boss is running this process owns no timer and no open socket, and
// the schema retry inside `awaitCurrentSchema` is deliberately unref'd — so
// without something holding the loop the development lane's wait would end the
// process rather than wait. Released the moment there is a worker to keep it.
let waiting: NodeJS.Timeout | undefined = setInterval(() => undefined, 60_000);
function stopWaiting(): void {
  if (waiting === undefined) return;
  clearInterval(waiting);
  waiting = undefined;
}

await awaitCurrentSchema(maintenancePool, env, {
  onCurrent: () => {
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
    });
    void worker.start().then(
      () => {
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
  void Promise.resolve(worker?.stop())
    .catch((error: unknown) => {
      // oxlint-disable-next-line no-console -- shutdown diagnostics
      console.error('Job worker shutdown failed:', error);
    })
    .then(() => maintenancePool.end())
    .catch(() => undefined)
    .finally(() => {
      process.exit(0);
    });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
