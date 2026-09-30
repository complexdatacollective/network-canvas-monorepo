import type { PgBoss } from 'pg-boss';

import { JOB_SCHEDULES, type JobQueueName } from '@codaco/studio-sync/jobs';

import { createDeniedAttemptsSummaryHandler } from './handlers/denied-attempts-summary.ts';
import { registerInvitationDelivery } from './handlers/invitation-delivery.ts';
import { createProtocolStoreGcHandler } from './handlers/protocol-store-gc.ts';
import { createSignInEmailHandler } from './handlers/sign-in-email.ts';
import type { JobWorkerDeps } from './worker.ts';

// Which queues this worker actually works, and what recurring work it asks
// pg-boss to create. Registration is separated from the instance so a
// deployment's capabilities are one readable list, and so the tests can start
// a worker and observe exactly what it registered.

/**
 * The queues that need a mail transport. Unset SMTP is a supported state
 * rather than a refusal (#1895): jobs accumulate and send when a worker with
 * mail configured returns, so this only has to be loud.
 */
const MAIL_QUEUES = [
  'invitation-delivery',
  'sign-in-email',
] as const satisfies readonly JobQueueName[];

/**
 * pg-boss's floor is 0.5 s, and LISTEN/NOTIFY is what actually delivers a job
 * (measured at ~10 ms on a local database), so polling is the fallback for a
 * notification that was missed rather than the delivery path. Half a second
 * keeps that fallback quick enough that a person waiting on a sign-in email
 * cannot tell the difference.
 */
const DEFAULT_WORK_POLLING_INTERVAL_SECONDS = 0.5;

/** Every handler takes one job at a time and needs its retry counters. */
const WORK_OPTIONS = { batchSize: 1, includeMetadata: true } as const;

/**
 * pg-boss's own queues, which it schedules nothing on today but which a later
 * release could. A schedule row this build did not declare is Studio's to
 * remove; one belonging to the library is not.
 */
const INTERNAL_QUEUE_PREFIX = '__pgboss__';

/**
 * The schedule table is state, not configuration: removing a schedule from
 * JOB_SCHEDULES only stops a new deployment from writing it, and the row a
 * previous release left keeps coming due — creating a job every hour on a
 * queue no worker registers a handler for, which then sits until its retention
 * expires. The upserts above and this together make the declarations the whole
 * of what a deployment runs.
 *
 * Keyed on (queue, key) because `schedule()` is: every schedule Studio
 * declares is written with the default empty key, so a row under any other key
 * came from somewhere else.
 */
async function dropUndeclaredSchedules(boss: PgBoss): Promise<void> {
  const isDeclared = (name: string, key: string): boolean =>
    key === '' && JOB_SCHEDULES.some(({ queue }) => queue === name);

  for (const { name, key } of await boss.getSchedules()) {
    if (name.startsWith(INTERNAL_QUEUE_PREFIX) || isDeclared(name, key)) {
      continue;
    }
    await boss.unschedule(name, key);
  }
}

export async function registerJobs(
  boss: PgBoss,
  deps: JobWorkerDeps,
): Promise<void> {
  const pollingIntervalSeconds =
    deps.workPollingIntervalSeconds ?? DEFAULT_WORK_POLLING_INTERVAL_SECONDS;

  // An upsert on (queue, key), so every worker replica registers the same row
  // and the last one to boot wins — which is how a changed cron expression
  // reaches a running deployment without anything having to unschedule the old
  // one. pg-boss coordinates the firing itself: one job per schedule per
  // minute across every replica, whatever the cadence they poll at.
  for (const { queue, cron, tz } of JOB_SCHEDULES) {
    await boss.schedule(queue, cron, {}, { tz });
  }
  await dropUndeclaredSchedules(boss);

  await boss.work(
    'protocol-store-gc',
    { ...WORK_OPTIONS, pollingIntervalSeconds },
    createProtocolStoreGcHandler({ maintenancePool: deps.maintenancePool }),
  );

  // Registered whether or not a rate-limit store is configured: the schedule
  // creates a job every minute either way, and a queue nothing works would
  // accumulate them. Without a store the handler has nothing to read and says
  // so in its outcome line.
  await boss.work(
    'denied-attempts-summary',
    { ...WORK_OPTIONS, pollingIntervalSeconds },
    createDeniedAttemptsSummaryHandler({
      maintenancePool: deps.maintenancePool,
      store: deps.rateLimitStore,
    }),
  );

  if (!deps.mailer) {
    // oxlint-disable-next-line no-console -- background worker diagnostics
    console.error(
      `No mail transport is configured: ${MAIL_QUEUES.join(' and ')} jobs will queue until one is. Set SMTP_URL and EMAIL_FROM on the worker.`,
    );
    return;
  }

  await boss.work(
    'sign-in-email',
    { ...WORK_OPTIONS, pollingIntervalSeconds },
    createSignInEmailHandler({ mailer: deps.mailer }),
  );

  // Both mail queues are worked only when a transport exists — MAIL_QUEUES
  // above names them as the pair that goes unworked without one. The handler
  // runs as the maintenance role on `deps.maintenancePool` and mints the
  // invitation links against `deps.publicBaseUrl`.
  await registerInvitationDelivery(
    boss,
    {
      maintenancePool: deps.maintenancePool,
      mailer: deps.mailer,
      publicBaseUrl: deps.publicBaseUrl,
    },
    { pollingIntervalSeconds },
  );
}
