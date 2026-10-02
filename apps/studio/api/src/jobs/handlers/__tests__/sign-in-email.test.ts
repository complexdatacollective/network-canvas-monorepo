import { assert, describe, layer } from '@effect/vitest';
import { DateTime, Effect, Layer, Random } from 'effect';
import { TestClock } from 'effect/testing';

import { reachableDb } from '../../../__tests__/support/postgres.ts';
import { MaintenanceDatabase } from '../../../db/client.ts';
import { MailFailed, Mailer } from '../../../mail/mailer.ts';
import {
  asOwner,
  clearQueue,
  drainWith,
  enqueue as enqueueJob,
  layerJobs,
  layerQueueHarness,
  QueueHarness,
  readJobs,
} from '../../__tests__/support.ts';
import { resolvedQueue } from '../../queues.ts';
import type { JobStep } from '../../worker.ts';
import { signInEmail } from '../sign-in-email.ts';
import { layerRecordingMailer, RecordedMail } from './support.ts';

const db = await reachableDb();

const MAGIC_LINK = {
  email: 'researcher@example.org',
  url: 'https://studio.example.org/api/auth/magic-link/verify?token=abc',
};

const SIGN_IN = resolvedQueue('sign-in-email');

const SEED = 'effect-native-jobs-sign-in';

const REFUSAL = 'SMTP refused the recipient';

describe.skipIf(!db)('the sign-in email handler', () => {
  layer(Layer.mergeAll(layerQueueHarness(db!), layerRecordingMailer))(
    'with the queue installed',
    (it) => {
      const clear = Effect.flatMap(clearQueue, () =>
        Effect.flatMap(RecordedMail, (mail) => mail.clear),
      );

      const jobsLayer = layerJobs;

      const enqueue = enqueueJob('sign-in-email', MAGIC_LINK);

      const drain = drainWith('sign-in-email', signInEmail);

      const refuse = Effect.flatMap(RecordedMail, (mail) =>
        mail.setMagicLinkBehaviour(() =>
          Effect.fail(new MailFailed({ cause: new Error(REFUSAL) })),
        ),
      );

      it.effect(
        'sends the queued link exactly once and completes the job',
        () =>
          Effect.gen(function* () {
            yield* clear;
            const jobId = yield* enqueue;

            const step = yield* drain;
            assert.strictEqual(step._tag, 'settled');
            assert.strictEqual(
              step._tag === 'settled' ? step.outcome : undefined,
              'completed',
            );

            const mail = yield* RecordedMail;
            assert.deepStrictEqual(mail.magicLinks, [MAGIC_LINK]);
            const [row] = yield* readJobs('sign-in-email');
            assert.strictEqual(row?.id, jobId);
            assert.strictEqual(row?.state, 'completed');
            assert.strictEqual(row?.outcome, 'completed');
            assert.strictEqual(row?.last_error, null);
          }).pipe(Effect.provide(jobsLayer)),
      );

      it.effect(
        'retries a refused send on the ladder this queue declares',
        () =>
          Effect.gen(function* () {
            yield* clear;
            yield* enqueue;
            yield* refuse;

            const first = yield* drain.pipe(Random.withSeed(SEED));
            assert.strictEqual(first._tag, 'retrying');

            const [afterFirst] = yield* readJobs('sign-in-email');
            assert.strictEqual(afterFirst?.attempts, 1);
            assert.strictEqual(afterFirst?.last_error, REFUSAL);

            assert.strictEqual((yield* drain)._tag, 'idle');
            yield* TestClock.setTime(afterFirst!.run_at.getTime());

            const second = yield* drain;
            assert.strictEqual(second._tag, 'retrying');
            const [afterSecond] = yield* readJobs('sign-in-email');
            assert.strictEqual(afterSecond?.attempts, 2);
            const secondDelay =
              (afterSecond!.run_at.getTime() -
                DateTime.toEpochMillis(yield* DateTime.now)) /
              1000;
            assert.isAtLeast(secondDelay, SIGN_IN.retryDelay * 2);
            assert.isAtMost(secondDelay, SIGN_IN.retryDelayMax ?? Infinity);

            yield* TestClock.setTime(afterSecond!.run_at.getTime());
            const third = yield* drain;
            assert.strictEqual(third._tag, 'failed');
            const failed = third as Extract<JobStep, { _tag: 'failed' }>;
            assert.strictEqual(failed.attempt, SIGN_IN.retryLimit + 1);
            assert.strictEqual(failed.deadLetter, null);
            const rows = yield* readJobs();
            assert.strictEqual(rows.length, 1);
            assert.strictEqual(rows[0]?.state, 'failed');
            assert.strictEqual(rows[0]?.last_error, REFUSAL);

            const mail = yield* RecordedMail;
            assert.strictEqual(mail.magicLinks.length, 3);
          }).pipe(Effect.provide(jobsLayer)),
      );

      it.effect('fails the attempt when no transport is configured', () =>
        Effect.gen(function* () {
          yield* clear;
          yield* enqueue;

          const step = yield* drain.pipe(Effect.provide(Mailer.layerRefuse));
          assert.strictEqual(step._tag, 'retrying');
          const [row] = yield* readJobs('sign-in-email');
          assert.strictEqual(
            row?.last_error,
            'No SMTP transport is configured; cannot send sign-in email',
          );

          const mail = yield* RecordedMail;
          assert.deepStrictEqual(mail.magicLinks, []);
        }).pipe(Effect.provide(jobsLayer)),
      );

      it.effect('never hands the transport a payload the queue rejects', () =>
        Effect.gen(function* () {
          yield* clear;
          const jobId = yield* enqueue;
          const { schema } = yield* QueueHarness;
          yield* asOwner(
            Effect.flatMap(
              MaintenanceDatabase,
              ({ sql }) => sql`
                UPDATE ${sql(schema)}.jobs
                   SET payload = ${JSON.stringify({ email: MAGIC_LINK.email })}::jsonb
                 WHERE id = ${jobId}`,
            ),
          );

          const step = yield* drain;
          assert.strictEqual(step._tag, 'dead');
          const [row] = yield* readJobs('sign-in-email');
          assert.strictEqual(row?.state, 'dead');
          const mail = yield* RecordedMail;
          assert.deepStrictEqual(mail.magicLinks, []);
        }).pipe(Effect.provide(jobsLayer)),
      );
    },
  );
});
