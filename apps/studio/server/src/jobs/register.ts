import type { PgBoss } from 'pg-boss';

import type { JobQueueName } from '@codaco/studio-sync/jobs';

import type { JobWorkerDeps } from './worker.ts';

// Which queues this worker actually works. Registration is separated from the
// instance so a deployment's capabilities are one readable list, and so the
// tests can start a worker that supervises and schedules without registering
// any handler.

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
 * `boss` is what the handlers register against; none exist yet. They arrive
 * with their consumers: invitation delivery and sign-in email in #1895's own
 * steps, the protocol-store sweep with the cron registration, and the runners
 * of #1521, #1291, #1305, #1520 and #1268 in their own issues.
 */
export function registerJobs(boss: PgBoss, deps: JobWorkerDeps): Promise<void> {
  if (!deps.mailer) {
    // oxlint-disable-next-line no-console -- background worker diagnostics
    console.error(
      `No mail transport is configured: ${MAIL_QUEUES.join(' and ')} jobs will queue until one is. Set SMTP_URL and EMAIL_FROM on the worker.`,
    );
  }
  return Promise.resolve();
}
