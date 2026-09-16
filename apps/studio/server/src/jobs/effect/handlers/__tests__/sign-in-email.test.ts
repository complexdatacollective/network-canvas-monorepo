import { assert, describe, layer } from '@effect/vitest';
import { DateTime, Duration, Effect, Layer, Random } from 'effect';
import { TestClock } from 'effect/testing';

import { reachableDb } from '../../../../__tests__/support/postgres.ts';
import { MailFailed, Mailer } from '../../../../mail/mailer.ts';
import {
  asApp,
  asOwner,
  layerQueueHarness,
  layerWorker,
  QueueHarness,
  readJobs,
} from '../../__tests__/support.ts';
import { Database, withTransaction } from '../../database.ts';
import { Jobs } from '../../jobs.ts';
import { resolvedQueue } from '../../queues.ts';
import { backoffSeconds, JobWorker, type JobStep } from '../../worker.ts';
import { signInEmail } from '../sign-in-email.ts';
import { layerRecordingMailer, RecordedMail } from './support.ts';

// `src/jobs/__tests__/sign-in-email-handler.test.ts`, ported to the native
// queue. Its cases are the same four facts — a queued link is sent once and
// the job completes, a refused send walks the queue's own ladder, the last
// attempt is the end of it because this queue has no dead letter, and a
// payload the queue does not declare never reaches the transport — with two
// differences that are the port's, not the handler's:
//
//  - Its "works no mail queue without a transport" case is about the worker's
//    registration, which stage 3 wires. What is left of it here is the fact
//    the registration exists to avoid: with no transport the attempt fails
//    like any other, and the reason lands on the row.
//  - Its "woken by the notify rather than by its poll" case is the worker's,
//    not the handler's: W1's notify.test.ts owns it.
//
// Everything below runs in virtual time against a real Postgres.

const db = await reachableDb();

const MAGIC_LINK = {
  email: 'researcher@example.org',
  url: 'https://studio.example.org/api/auth/magic-link/verify?token=abc',
};

/** What the queue declares: three attempts in all, 5s doubling to a 60s cap. */
const SIGN_IN = resolvedQueue('sign-in-email');

/** A pinned seed, so the jittered backoff below has one answer. */
const SEED = 'effect-native-jobs-sign-in';

const REFUSAL = 'SMTP refused the recipient';

describe.skipIf(!db)('the sign-in email handler', () => {
  layer(Layer.mergeAll(layerQueueHarness(db!), layerRecordingMailer))(
    'with the queue installed',
    (it) => {
      const clear = Effect.gen(function* () {
        const { schema } = yield* QueueHarness;
        yield* asOwner(
          Effect.flatMap(Database, ({ sql }) =>
            sql.unsafe(`DELETE FROM ${schema}.jobs`),
          ),
        );
        yield* Effect.flatMap(RecordedMail, (mail) => mail.clear);
      });

      const jobsLayer = Layer.unwrap(
        Effect.map(QueueHarness, (harness) =>
          Jobs.layer({ schema: harness.schema }),
        ),
      );

      const enqueue = Effect.flatMap(Jobs, (jobs) =>
        asApp(withTransaction(jobs.enqueue('sign-in-email', MAGIC_LINK))),
      );

      /** One claim-run-settle step with the handler registered. */
      const drain = Effect.gen(function* () {
        const worker = yield* JobWorker;
        yield* worker.work('sign-in-email', signInEmail);
        return yield* worker.drainOnce('sign-in-email');
      }).pipe(Effect.provide(layerWorker()));

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

            // The same draw, from the same seed: `drainOnce` asks `Random` once.
            const delay = yield* backoffSeconds(SIGN_IN, 1).pipe(
              Random.withSeed(SEED),
            );
            // Between half and all of retryDelay * 2^1, which is the bound the
            // formula guarantees whatever the seed — asserted beside the exact
            // value so a changed seed cannot quietly make the exact check
            // vacuous.
            assert.isAtLeast(delay, SIGN_IN.retryDelay);
            assert.isAtMost(delay, SIGN_IN.retryDelay * 2);
            const now = yield* DateTime.now;
            const [afterFirst] = yield* readJobs('sign-in-email');
            assert.strictEqual(
              afterFirst?.run_at,
              DateTime.toDate(
                DateTime.addDuration(now, Duration.seconds(delay)),
              ).getTime(),
            );
            assert.strictEqual(afterFirst?.attempts, 1);
            assert.strictEqual(afterFirst?.last_error, REFUSAL);

            // Not claimable until virtual time reaches the delay.
            assert.strictEqual((yield* drain)._tag, 'idle');
            yield* TestClock.setTime(afterFirst!.run_at);

            const second = yield* drain;
            assert.strictEqual(second._tag, 'retrying');
            const [afterSecond] = yield* readJobs('sign-in-email');
            assert.strictEqual(afterSecond?.attempts, 2);
            // The cap the queue declares, which the second rung is well inside:
            // doubling from five seconds reaches sixty only after several more.
            const secondDelay =
              (afterSecond!.run_at -
                DateTime.toEpochMillis(yield* DateTime.now)) /
              1000;
            assert.isAtLeast(secondDelay, SIGN_IN.retryDelay * 2);
            assert.isAtMost(secondDelay, SIGN_IN.retryDelayMax ?? Infinity);

            yield* TestClock.setTime(afterSecond!.run_at);
            const third = yield* drain;
            assert.strictEqual(third._tag, 'failed');
            const failed = third as Extract<JobStep, { _tag: 'failed' }>;
            assert.strictEqual(failed.attempt, SIGN_IN.retryLimit + 1);
            // A sign-in link is useless by the time anyone could act on a
            // dead-lettered copy, so the queue names no dead letter and there is
            // nowhere for a copy to go. Both halves: the step says it made none,
            // and the whole table still holds only this job.
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

          // Registering the queue without a transport is what stage 3's
          // registration exists to avoid (#1895): the worker leaves the mail
          // queues unworked rather than burning the ladder while an operator
          // is still setting SMTP up. Until that wiring lands, a send
          // attempted anyway is an ordinary failed attempt — and the reason
          // an operator reads is on the row.
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
          // A row an older release or a hand edit left behind: the enqueue
          // validated on the way in, so this is the only way to make one. The
          // payload alone is rewritten, in place, rather than a row being
          // fabricated — the columns beside it are the enqueue's own.
          yield* asOwner(
            Effect.flatMap(
              Database,
              ({ sql }) => sql`
                UPDATE ${sql(schema)}.jobs
                   SET payload = ${JSON.stringify({ email: MAGIC_LINK.email })}::jsonb
                 WHERE id = ${jobId}`,
            ),
          );

          const step = yield* drain;
          // The decode is the worker's (#1927 §11), so the job is killed
          // rather than retried — no ladder can make a malformed address
          // deliverable — and the handler never ran.
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
