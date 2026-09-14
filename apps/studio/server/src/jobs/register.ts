import type { PgBoss } from 'pg-boss';

import { JOB_SCHEDULES, type JobQueueName } from '@codaco/studio-sync/jobs';

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

  await boss.work(
    'protocol-store-gc',
    { ...WORK_OPTIONS, pollingIntervalSeconds },
    createProtocolStoreGcHandler({ maintenancePool: deps.maintenancePool }),
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
