import { Effect, Layer } from 'effect';
import type { PgBoss } from 'pg-boss';

import { JOB_SCHEDULES, type JobQueueName } from '@codaco/studio-sync/jobs';

import { DatabasePool } from '../db/database-pool.ts';
import { Environment } from '../env.ts';
import { Mailer, promiseMailer } from '../mail/mailer.ts';
import { getRateLimitStore } from '../rate-limit/store.ts';
import { createDeniedAttemptsSummaryHandler } from './handlers/denied-attempts-summary.ts';
import { registerInvitationDelivery } from './handlers/invitation-delivery.ts';
import { createProtocolStoreGcHandler } from './handlers/protocol-store-gc.ts';
import { createSignInEmailHandler } from './handlers/sign-in-email.ts';
import { JobWorker, QueueUnavailable } from './worker.ts';

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
 * expires. The upserts in `JobHandlersLive` and this together make the
 * declarations the whole of what a deployment runs.
 *
 * Keyed on (queue, key) because `schedule()` is: every schedule Studio
 * declares is written with the default empty key, so a row under any other key
 * came from somewhere else.
 */
const dropUndeclaredSchedules = Effect.fnUntraced(function* (boss: PgBoss) {
  const isDeclared = (name: string, key: string): boolean =>
    key === '' && JOB_SCHEDULES.some(({ queue }) => queue === name);

  const schedules = yield* Effect.promise(() => boss.getSchedules());
  for (const { name, key } of schedules) {
    if (name.startsWith(INTERNAL_QUEUE_PREFIX) || isDeclared(name, key)) {
      continue;
    }
    yield* Effect.promise(() => boss.unschedule(name, key));
  }
});

export type JobRegistrationOptions = {
  /**
   * What the registered handlers poll at. Production leaves it at the floor
   * above; a suite that has to prove delivery came from LISTEN/NOTIFY rather
   * than from a poll turns it up so that polling could not have been what
   * delivered the job.
   */
  readonly workPollingIntervalSeconds?: number;
};

export function JobHandlersLive(
  options: JobRegistrationOptions = {},
): Layer.Layer<
  never,
  QueueUnavailable,
  JobWorker | Mailer | Environment | DatabasePool
> {
  return Layer.effectDiscard(
    Effect.gen(function* () {
      const { boss } = yield* JobWorker;
      const env = yield* Environment;
      const { pool } = yield* DatabasePool;
      const mailer = yield* Mailer;
      const services = yield* Effect.context();

      const pollingIntervalSeconds =
        options.workPollingIntervalSeconds ??
        DEFAULT_WORK_POLLING_INTERVAL_SECONDS;

      const workOptions = { ...WORK_OPTIONS, pollingIntervalSeconds };

      /**
       * A registration, named so that a refusal says which queue went unworked.
       * The call itself is passed in rather than the handler, because pg-boss
       * derives a handler's shape from the options object it was given — the
       * metadata this build asks for is what makes the retry counters part of
       * the type — and that inference only happens at the call.
       */
      const register = (queue: JobQueueName, work: () => Promise<string>) =>
        Effect.tryPromise({
          try: work,
          catch: (cause) =>
            new QueueUnavailable({
              queue,
              reason: cause instanceof Error ? cause.message : String(cause),
            }),
        });

      // An upsert on (queue, key), so every worker replica registers the same
      // row and the last one to boot wins — which is how a changed cron
      // expression reaches a running deployment without anything having to
      // unschedule the old one. pg-boss coordinates the firing itself: one job
      // per schedule per minute across every replica, whatever the cadence they
      // poll at.
      for (const { queue, cron, tz } of JOB_SCHEDULES) {
        yield* Effect.tryPromise({
          try: () => boss.schedule(queue, cron, {}, { tz }),
          catch: (cause) =>
            new QueueUnavailable({
              queue,
              reason: cause instanceof Error ? cause.message : String(cause),
            }),
        });
      }
      yield* dropUndeclaredSchedules(boss);

      yield* register('protocol-store-gc', () =>
        boss.work(
          'protocol-store-gc',
          workOptions,
          createProtocolStoreGcHandler({ maintenancePool: pool }),
        ),
      );

      // Registered whether or not a rate-limit store is configured: the
      // schedule creates a job every minute either way, and a queue nothing
      // works would accumulate them. Without a store the handler has nothing to
      // read and says so in its outcome line.
      yield* register('denied-attempts-summary', () =>
        boss.work(
          'denied-attempts-summary',
          workOptions,
          createDeniedAttemptsSummaryHandler({
            maintenancePool: pool,
            store: env.redis ? getRateLimitStore(env.redis) : undefined,
          }),
        ),
      );

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
        return yield* new QueueUnavailable({
          queue: 'invitation-delivery',
          reason:
            'An invitation link cannot be minted without a public base URL: set PUBLIC_URL on the worker.',
        });
      }

      // The handlers still take a Promise-shaped transport; `promiseMailer`
      // carries this program's services into the send so a line it writes is
      // logged the way everything else here is.
      const sender = promiseMailer(mailer, services);

      yield* register('sign-in-email', () =>
        boss.work(
          'sign-in-email',
          workOptions,
          createSignInEmailHandler({ mailer: sender }),
        ),
      );

      // Both mail queues are worked only when a transport exists — MAIL_QUEUES
      // above names them as the pair that goes unworked without one. The
      // handler runs as the maintenance role on the maintenance pool and mints
      // the invitation links against the public base URL.
      yield* register('invitation-delivery', () =>
        registerInvitationDelivery(
          boss,
          {
            maintenancePool: pool,
            mailer: sender,
            publicBaseUrl: auth.baseUrl,
          },
          { pollingIntervalSeconds },
        ),
      );
    }),
  );
}
