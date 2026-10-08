import { type Cron, Effect, Layer, Schema } from 'effect';
import type { HttpClient } from 'effect/http';
import type { SqlError } from 'effect/sql';

import { JOB_SCHEDULES, type JobQueueName } from '@codaco/studio-sync/jobs';

import { type MaintenanceDatabase } from '../db/client.ts';
import { Environment } from '../env.ts';
import { type Mailer } from '../mail/mailer.ts';
import type { ObjectStore } from '../storage/object-store.ts';
import { deniedAttemptsSummary } from './handlers/denied-attempts-summary.ts';
import type { DeniedAttemptsStore } from './handlers/denied-attempts/store.ts';
import { invitationDelivery } from './handlers/invitation-delivery.ts';
import { protocolStoreGc } from './handlers/protocol-store-gc.ts';
import { signInEmail } from './handlers/sign-in-email.ts';
import { updateCheck } from './handlers/update-check.ts';
import { JobWorker } from './worker.ts';

const MAIL_QUEUES = [
  'invitation-delivery',
  'sign-in-email',
] as const satisfies readonly JobQueueName[];

export class QueueUnavailable extends Schema.TaggedError<QueueUnavailable>()(
  'QueueUnavailable',
  { queue: Schema.String, reason: Schema.String },
) {
  override get message(): string {
    return this.reason;
  }
}

export const JobHandlersLive: Layer.Layer<
  never,
  Cron.CronParseError | SqlError.SqlError | QueueUnavailable,
  | JobWorker
  | MaintenanceDatabase
  | Mailer
  | Environment
  | DeniedAttemptsStore
  | HttpClient.HttpClient
  | ObjectStore
> = Layer.effectDiscard(
  Effect.gen(function* () {
    const worker = yield* JobWorker;
    const env = yield* Environment;

    for (const { queue, cron } of JOB_SCHEDULES) {
      // The schedule is named after its queue, which the tick also uses as the job's
      // `singletonKey`.
      yield* worker.schedule(queue, cron, queue, {});
    }
    yield* worker.dropUndeclaredSchedules(
      JOB_SCHEDULES.map(({ queue }) => queue),
    );

    yield* worker.work('protocol-store-gc', protocolStoreGc);

    yield* worker.work('denied-attempts-summary', deniedAttemptsSummary());

    // Before the mail gate below, and not behind it: an instance with no mail
    // transport still records the release, which is what the in-app notice
    // reads. Only the owner's email needs a transport, and the handler logs
    // once per version when there is none.
    yield* worker.work(
      'update-check',
      updateCheck({ deploymentMode: env.deploymentMode }),
    );

    // Left unworked rather than given a refusing mailer, which would retry each
    // mail job into a dead letter (#1895).
    if (env.mail === undefined || env.mail.kind === 'refuse') {
      yield* Effect.logError(
        'No mail transport is configured: mail jobs will queue until one is. Set SMTP_URL and EMAIL_FROM on the worker.',
      ).pipe(Effect.annotateLogs({ queues: MAIL_QUEUES }));
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
