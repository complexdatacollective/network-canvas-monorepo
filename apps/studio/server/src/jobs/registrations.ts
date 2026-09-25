import { type Cron, Effect, Layer, Schema } from 'effect';
import type { SqlError } from 'effect/unstable/sql';

import { JOB_SCHEDULES, type JobQueueName } from '@codaco/studio-sync/jobs';

import { type MaintenanceDatabase } from '../db/client.ts';
import { Environment } from '../env.ts';
import { type Mailer } from '../mail/mailer.ts';
import { deniedAttemptsSummary } from './handlers/denied-attempts-summary.ts';
import type { DeniedAttemptsStore } from './handlers/denied-attempts/store.ts';
import { invitationDelivery } from './handlers/invitation-delivery.ts';
import { protocolStoreGc } from './handlers/protocol-store-gc.ts';
import { signInEmail } from './handlers/sign-in-email.ts';
import { JobWorker } from './worker.ts';

// Which queues this worker actually works, and what recurring work it declares.
// Registration is separated from the worker so a deployment's capabilities are
// one readable list, and so a suite can build the worker and observe exactly
// what it registered.
//
// A queue with no handler registered here is not claimed from at all
// (`pollQueue`, worker.ts): its jobs sit `created` and wait for a replica that
// does register one. That is the mechanism the mail branch below relies on.

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
 * A queue this process cannot work for a reason a deployment has to fix.
 * Nothing the worker does works without the queue it names, so this fails the
 * layer rather than being logged and carried on from — unlike a missing mail
 * transport, which is a state an operator is allowed to be mid-way through.
 */
export class QueueUnavailable extends Schema.TaggedError<QueueUnavailable>()(
  'QueueUnavailable',
  { queue: Schema.String, reason: Schema.String },
) {
  override get message(): string {
    return this.reason;
  }
}

/**
 * Every handler this deployment runs, and the schedule rows that create their
 * recurring jobs.
 *
 * The schedules are upserted before any handler is registered, and the
 * undeclared ones dropped, so the declarations in `JOB_SCHEDULES` are the whole
 * of what a deployment runs: the schedule table is state, not configuration —
 * removing a schedule from the declarations only stops a new release from
 * writing it, and the row a previous release left keeps coming due on a queue
 * nothing works.
 */
export const JobHandlersLive: Layer.Layer<
  never,
  Cron.CronParseError | SqlError.SqlError | QueueUnavailable,
  JobWorker | MaintenanceDatabase | Mailer | Environment | DeniedAttemptsStore
> = Layer.effectDiscard(
  Effect.gen(function* () {
    const worker = yield* JobWorker;
    const env = yield* Environment;

    for (const { queue, cron } of JOB_SCHEDULES) {
      // The schedule is named after its queue, which is also what the tick
      // uses as the job's `singletonKey` — so a sweep that runs longer than
      // its cadence leaves one unfinished occurrence rather than a backlog.
      yield* worker.schedule(queue, cron, queue, {});
    }
    yield* worker.dropUndeclaredSchedules(
      JOB_SCHEDULES.map(({ queue }) => queue),
    );

    yield* worker.work('protocol-store-gc', protocolStoreGc);

    // Worked whether or not a rate-limit store is configured: the schedule
    // creates a job every minute either way, and a queue nothing works would
    // accumulate them. Without a store the handler has nothing to read and
    // says so in its outcome line (`DeniedAttemptsStore.layerAbsent`).
    yield* worker.work('denied-attempts-summary', deniedAttemptsSummary());

    // `refuse` is the resolved shape of "no transport is configured", and a
    // mailer that rejects every send would turn each mail job into a retry
    // loop ending in a dead letter. The queues are left unworked instead and
    // the jobs wait for a worker that has one (#1895).
    if (env.mail === undefined || env.mail.kind === 'refuse') {
      yield* Effect.logError(
        `No mail transport is configured: ${MAIL_QUEUES.join(' and ')} jobs will queue until one is. Set SMTP_URL and EMAIL_FROM on the worker.`,
      );
      return;
    }

    const auth = env.auth;
    if (!auth) {
      yield* new QueueUnavailable({
        queue: 'invitation-delivery',
        reason:
          'An invitation link cannot be minted without a public base URL: set PUBLIC_URL on the worker.',
      });
      return;
    }

    yield* worker.work('sign-in-email', signInEmail);
    yield* worker.work(
      'invitation-delivery',
      invitationDelivery({ publicBaseUrl: auth.baseUrl }),
    );
  }),
);
