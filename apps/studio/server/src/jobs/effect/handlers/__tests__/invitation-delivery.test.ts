import { randomUUID } from 'node:crypto';

import { assert, describe, layer } from '@effect/vitest';
import { Deferred, Effect, Exit, Fiber, Layer } from 'effect';
import type pg from 'pg';

import { reachableDb } from '../../../../__tests__/support/postgres.ts';
import { MailFailed, type MailNotConfigured } from '../../../../mail/mailer.ts';
import {
  DeliveryHarness,
  layerDeliveryHarness,
  layerWorker,
  readJobs,
} from '../../__tests__/support.ts';
import {
  Database,
  Transaction,
  withTenantTransaction,
} from '../../database.ts';
import {
  exitSqlState,
  FOREIGN_KEY_VIOLATION,
  INSUFFICIENT_PRIVILEGE,
} from '../../errors.ts';
import { Jobs } from '../../jobs.ts';
import { resolvedQueue } from '../../queues.ts';
import { JobWorker, type JobStep } from '../../worker.ts';
import {
  invitationDelivery,
  LOCK_HELD_ELSEWHERE,
  LOCK_HELD_ON_LAST_ATTEMPT,
} from '../invitation-delivery.ts';
import { layerRecordingMailer, RecordedMail } from './support.ts';

// `src/team/__tests__/invitation-delivery.test.ts`, ported to the native queue.
// The original file is untouched; this is a sibling, and the numbering below
// is its case order so the two can be compared row by row.
//
// Seventeen of its twenty cases are here. The three that are not are named at
// the bottom of this file with the reason, which is the same reason in each:
// they drive `createTeamInvitation` / `cancelTeamInvitation`, which are
// Promise-and-drizzle commands that stages 3 and 4 of #1927 port, not the
// queue. Nothing about the queue stopped them.

const db = await reachableDb();

const TEAM_ID = 'effect-invitation-delivery-team';
const INVITER_ID = 'effect-invitation-delivery-inviter';
const INVITER_MEMBER_ID = 'effect-invitation-delivery-inviter-member';
const PUBLIC_BASE_URL = 'https://studio.example.test';

const DELIVERY = resolvedQueue('invitation-delivery');
/** What the queue declares: eight attempts in all. */
const RETRY_LIMIT = DELIVERY.retryLimit;

type DeliveryRow = {
  attempt_count: number;
  failed_at: Date | null;
  last_error: string | null;
  sent_at: Date | null;
  suppressed_at: Date | null;
  uncertain_at: Date | null;
};

/** Studio's schema, the queue, an enqueue and a recording transport. */
const suiteLayer = Layer.mergeAll(
  Layer.unwrap(
    Effect.map(DeliveryHarness, (harness) =>
      Jobs.layer({ schema: harness.schema }),
    ),
  ),
  layerRecordingMailer,
).pipe(Layer.provideMerge(layerDeliveryHarness(db!)));

describe.skipIf(!db)('invitation delivery on the native queue', () => {
  layer(suiteLayer)('with Studio and the queue installed', (it) => {
    const seedTeam = Effect.fnUntraced(function* () {
      const { scratch } = yield* DeliveryHarness;
      yield* Effect.promise(async () => {
        await scratch.pool.query(
          `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
           VALUES ($1, 'Inviting Researcher', 'inviter@example.com', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           ON CONFLICT (id) DO NOTHING`,
          [INVITER_ID],
        );
        await scratch.pool.query(
          `INSERT INTO teams (id, name, slug) VALUES ($1, 'Invitation Delivery Team', $1)
           ON CONFLICT (id) DO NOTHING`,
          [TEAM_ID],
        );
        await scratch.pool.query(
          `INSERT INTO team_members (id, team_id, user_id, role)
           VALUES ($1, $2, $3, 'owner') ON CONFLICT (id) DO NOTHING`,
          [INVITER_MEMBER_ID, TEAM_ID, INVITER_ID],
        );
      });
    });

    type SeededInvitation = {
      invitationId: string;
      email: string;
      expiresAt: Date;
    };

    const seedInvitation = Effect.fnUntraced(function* (
      input: { status?: string; expiresAt?: Date } = {},
    ) {
      yield* seedTeam();
      const { scratch } = yield* DeliveryHarness;
      const invitationId = randomUUID();
      const email = `${invitationId}@example.com`;
      const expiresAt =
        input.expiresAt ?? new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
      yield* Effect.promise(async () => {
        await scratch.pool.query(
          `INSERT INTO team_invitations (id, team_id, email, role, status, expires_at, inviter_id)
           VALUES ($1, $2, $3, 'member', $4, $5, $6)`,
          [
            invitationId,
            TEAM_ID,
            email,
            input.status ?? 'pending',
            expiresAt,
            INVITER_ID,
          ],
        );
      });
      const seeded: SeededInvitation = { invitationId, email, expiresAt };
      return seeded;
    });

    /**
     * The delivery row, written as the application role inside a tenant
     * transaction — which is how the command writes it, minus the audit.
     */
    const enqueueDeliveryRow = Effect.fnUntraced(function* (
      invitation: SeededInvitation,
    ) {
      const deliveryId = randomUUID();
      yield* Effect.flatMap(DeliveryHarness, (harness) =>
        Effect.provideService(
          withTenantTransaction(
            TEAM_ID,
            Effect.flatMap(
              Transaction,
              ({ sql }) => sql`
                INSERT INTO team_invitation_deliveries
                  (id, invitation_id, team_id, email, role, team_label,
                   inviter_label, expires_at)
                VALUES (${deliveryId}, ${invitation.invitationId}, ${TEAM_ID},
                        ${invitation.email}, 'member', 'Invitation Delivery Team',
                        'Inviting Researcher', ${invitation.expiresAt})`,
            ),
          ),
          Database,
          harness.app,
        ),
      );
      return deliveryId;
    });

    /** The delivery row and its job, the way the command creates both. */
    const seedQueuedDelivery = Effect.fnUntraced(function* (
      invitation: SeededInvitation,
    ) {
      const harness = yield* DeliveryHarness;
      const jobs = yield* Jobs;
      const deliveryId = randomUUID();
      const jobId = yield* Effect.provideService(
        withTenantTransaction(
          TEAM_ID,
          Effect.gen(function* () {
            const { sql } = yield* Transaction;
            yield* sql`
              INSERT INTO team_invitation_deliveries
                (id, invitation_id, team_id, email, role, team_label,
                 inviter_label, expires_at)
              VALUES (${deliveryId}, ${invitation.invitationId}, ${TEAM_ID},
                      ${invitation.email}, 'member', 'Invitation Delivery Team',
                      'Inviting Researcher', ${invitation.expiresAt})`;
            return yield* jobs.enqueue('invitation-delivery', { deliveryId });
          }),
        ),
        Database,
        harness.app,
      );
      return { deliveryId, jobId };
    });

    const deliveryState = Effect.fnUntraced(function* (deliveryId: string) {
      const { scratch } = yield* DeliveryHarness;
      const row = yield* Effect.promise(async () => {
        const { rows } = await scratch.pool.query<DeliveryRow>(
          `SELECT attempt_count, failed_at, last_error, sent_at, suppressed_at,
                  uncertain_at
             FROM team_invitation_deliveries WHERE id = $1`,
          [deliveryId],
        );
        return rows[0];
      });
      if (!row) throw new Error(`no delivery row for ${deliveryId}`);
      return row;
    });

    const clearQueue = Effect.fnUntraced(function* () {
      const { scratch, schema } = yield* DeliveryHarness;
      yield* Effect.promise(async () => {
        await scratch.pool.query(`DELETE FROM ${schema}.jobs`);
      });
    });

    /**
     * Runs a handler against one job, the way the worker does — claim, run,
     * settle — with the mailer behaving however the case says.
     */
    const runDelivery = (
      deliveryId: string,
      behaviour: (
        call: number,
      ) => Effect.Effect<void, MailFailed | MailNotConfigured>,
      options: { attemptsBefore?: number } = {},
    ) =>
      Effect.gen(function* () {
        const worker = yield* JobWorker;
        const mail = yield* RecordedMail;
        yield* mail.setInvitationBehaviour((_message, call) => behaviour(call));
        yield* worker.work(
          'invitation-delivery',
          invitationDelivery({ publicBaseUrl: PUBLIC_BASE_URL }),
        );
        const jobs = yield* Jobs;
        const harness = yield* DeliveryHarness;
        const jobId = yield* Effect.provideService(
          withTenantTransaction(
            TEAM_ID,
            jobs.enqueue('invitation-delivery', { deliveryId }),
          ),
          Database,
          harness.app,
        );
        if (options.attemptsBefore !== undefined) {
          // Start the attempt ladder part-way along, the way the original
          // suite hands the handler a `retryCount`.
          yield* Effect.promise(async () => {
            await harness.scratch.pool.query(
              `UPDATE ${harness.schema}.jobs SET attempts = $2 WHERE id = $1`,
              [jobId, options.attemptsBefore],
            );
          });
        }
        return yield* worker.drainOnce('invitation-delivery');
      }).pipe(Effect.provide(layerWorker()));

    const succeeds = () => Effect.void;
    // Stage 1's `MailFailed` carries the transport's own error rather than a
    // message field; the message an operator reads off the row is that error's.
    const failsWith = (message: string) => () =>
      Effect.fail(new MailFailed({ cause: new Error(message) }));

    // ---------------------------------------------------------------- 1 ----
    it.effect('creates the delivery and its job only when it commits', () =>
      Effect.gen(function* () {
        yield* clearQueue();
        const abandoned = yield* seedInvitation();
        const harness = yield* DeliveryHarness;
        const jobs = yield* Jobs;
        const abandonedDeliveryId = randomUUID();

        const rolledBack = yield* Effect.exit(
          Effect.provideService(
            withTenantTransaction(
              TEAM_ID,
              Effect.gen(function* () {
                const { sql } = yield* Transaction;
                yield* sql`
                  INSERT INTO team_invitation_deliveries
                    (id, invitation_id, team_id, email, role, team_label,
                     inviter_label, expires_at)
                  VALUES (${abandonedDeliveryId}, ${abandoned.invitationId},
                          ${TEAM_ID}, ${abandoned.email}, 'member',
                          'Invitation Delivery Team', 'Inviting Researcher',
                          ${abandoned.expiresAt})`;
                yield* jobs.enqueue('invitation-delivery', {
                  deliveryId: abandonedDeliveryId,
                });
                return yield* Effect.fail('roll back command' as const);
              }),
            ),
            Database,
            harness.app,
          ),
        );
        assert.isTrue(Exit.isFailure(rolledBack));

        const orphans = yield* Effect.promise(async () => {
          const { rowCount } = await harness.scratch.pool.query(
            `SELECT id FROM team_invitation_deliveries WHERE invitation_id = $1`,
            [abandoned.invitationId],
          );
          return rowCount;
        });
        assert.strictEqual(orphans, 0);
        // The job was created on the command's own connection, so the rollback
        // took it too. A job that survived would send mail for an invitation
        // that does not exist.
        assert.deepStrictEqual(yield* readJobs('invitation-delivery'), []);

        const committed = yield* seedInvitation();
        const { deliveryId, jobId } = yield* seedQueuedDelivery(committed);
        const queued = yield* readJobs('invitation-delivery');
        assert.strictEqual(queued.length, 1);
        assert.strictEqual(queued[0]?.id, jobId);
        assert.strictEqual(queued[0]?.state, 'created');
        assert.deepStrictEqual(queued[0]?.payload, { deliveryId });
      }),
    );

    // ---------------------------------------------------------------- 2 ----
    it.effect('carries the delivery id and nothing else in the payload', () =>
      Effect.gen(function* () {
        yield* clearQueue();
        const invitation = yield* seedInvitation();
        const { deliveryId } = yield* seedQueuedDelivery(invitation);
        const [queued] = yield* readJobs('invitation-delivery');
        // Identifiers only (#1895): the job table is one table for every team.
        assert.deepStrictEqual(queued?.payload, { deliveryId });
      }),
    );

    // ---------------------------------------------------------------- 5 ----
    it.effect(
      'records a failed attempt and sends the snapshot on the next',
      () =>
        Effect.gen(function* () {
          yield* clearQueue();
          const invitation = yield* seedInvitation();
          const deliveryId = yield* enqueueDeliveryRow(invitation);
          const { scratch } = yield* DeliveryHarness;
          yield* Effect.promise(async () => {
            await scratch.pool.query(
              `UPDATE teams SET name = 'Renamed Team' WHERE id = $1`,
              [TEAM_ID],
            );
            await scratch.pool.query(
              `UPDATE "user" SET name = 'Renamed Inviter' WHERE id = $1`,
              [INVITER_ID],
            );
          });

          const first = yield* runDelivery(
            deliveryId,
            failsWith('SMTP temporarily unavailable'),
          );
          assert.strictEqual(first._tag, 'retrying');
          const afterFirst = yield* deliveryState(deliveryId);
          assert.strictEqual(afterFirst.attempt_count, 1);
          assert.strictEqual(afterFirst.failed_at, null);
          assert.strictEqual(
            afterFirst.last_error,
            'SMTP temporarily unavailable',
          );
          assert.strictEqual(afterFirst.sent_at, null);

          yield* clearQueue();
          const mail = yield* RecordedMail;
          mail.invitations.length = 0;
          const second = yield* runDelivery(deliveryId, succeeds);
          assert.strictEqual(second._tag, 'settled');
          // The labels are the ones the command snapshotted, not the renamed
          // team and inviter: the invitation says what it said when it was sent.
          assert.deepStrictEqual(mail.invitations.at(-1), {
            email: invitation.email,
            expiresAt: invitation.expiresAt,
            invitationUrl: `${PUBLIC_BASE_URL}/invitations/${invitation.invitationId}`,
            inviterLabel: 'Inviting Researcher',
            messageId: `<studio-invitation.${invitation.invitationId}@networkcanvas.local>`,
            role: 'member',
            teamLabel: 'Invitation Delivery Team',
          });
          const afterSecond = yield* deliveryState(deliveryId);
          assert.strictEqual(afterSecond.attempt_count, 1);
          assert.strictEqual(afterSecond.last_error, null);
          assert.instanceOf(afterSecond.sent_at, Date);
        }),
    );

    // ---------------------------------------------------------------- 6 ----
    it.effect(
      'does not retry when SMTP accepted but the marker cannot commit',
      () =>
        Effect.gen(function* () {
          yield* clearQueue();
          const invitation = yield* seedInvitation();
          const deliveryId = yield* enqueueDeliveryRow(invitation);
          const { scratch } = yield* DeliveryHarness;

          yield* Effect.promise(async () => {
            await scratch.pool.query(`
            CREATE FUNCTION interrupt_invitation_sent_finalization() RETURNS trigger AS $$
            BEGIN
              RAISE EXCEPTION 'sent finalization interrupted';
            END;
            $$ LANGUAGE plpgsql;
            CREATE TRIGGER interrupt_invitation_sent_finalization
              BEFORE UPDATE ON team_invitation_deliveries
              FOR EACH ROW
              WHEN (NEW.sent_at IS NOT NULL AND OLD.sent_at IS NULL)
              EXECUTE FUNCTION interrupt_invitation_sent_finalization();
          `);
          });

          const step = yield* Effect.ensuring(
            runDelivery(deliveryId, succeeds),
            Effect.promise(async () => {
              await scratch.pool.query(`
              DROP TRIGGER interrupt_invitation_sent_finalization
                ON team_invitation_deliveries;
              DROP FUNCTION interrupt_invitation_sent_finalization();
            `);
            }),
          );

          // Settled rather than retried: the mail has gone (#1305, #1307).
          assert.strictEqual(step._tag, 'settled');
          assert.strictEqual(
            step._tag === 'settled' ? step.outcome : undefined,
            'uncertain',
          );
          const row = yield* deliveryState(deliveryId);
          assert.strictEqual(row.attempt_count, 1);
          assert.strictEqual(row.failed_at, null);
          assert.strictEqual(row.last_error, 'sent finalization interrupted');
          assert.strictEqual(row.sent_at, null);
          assert.strictEqual(row.suppressed_at, null);
          assert.instanceOf(row.uncertain_at, Date);

          yield* clearQueue();
          const mail = yield* RecordedMail;
          mail.invitations.length = 0;
          const again = yield* runDelivery(deliveryId, succeeds);
          assert.strictEqual(again._tag, 'settled');
          assert.strictEqual(mail.invitations.length, 0);
          // Not even the attempt counter moves: an uncertain delivery is done.
          const unchanged = yield* deliveryState(deliveryId);
          assert.strictEqual(unchanged.attempt_count, 1);
          assert.instanceOf(unchanged.uncertain_at, Date);
        }),
    );

    // ---------------------------------------------------------------- 7 ----
    it.effect(
      'records the delivery failed on the attempt nothing will retry',
      () =>
        Effect.gen(function* () {
          yield* clearQueue();
          const invitation = yield* seedInvitation();
          const deliveryId = yield* enqueueDeliveryRow(invitation);

          const step = yield* runDelivery(
            deliveryId,
            failsWith('permanent SMTP failure'),
            { attemptsBefore: RETRY_LIMIT },
          );
          assert.strictEqual(step._tag, 'failed');
          const row = yield* deliveryState(deliveryId);
          assert.strictEqual(row.attempt_count, RETRY_LIMIT + 1);
          assert.instanceOf(row.failed_at, Date);
          assert.strictEqual(row.last_error, 'permanent SMTP failure');
          assert.strictEqual(row.sent_at, null);
        }),
    );

    // ---------------------------------------------------------------- 8 ----
    it.effect('stamps a failed send before it lets go of the invitation', () =>
      Effect.gen(function* () {
        yield* clearQueue();
        const invitation = yield* seedInvitation();
        const deliveryId = yield* enqueueDeliveryRow(invitation);
        const { scratch } = yield* DeliveryHarness;
        const mailBefore = yield* RecordedMail;
        mailBefore.invitations.length = 0;
        const sending = yield* Deferred.make<
          void,
          MailFailed | MailNotConfigured
        >();

        const attempt = yield* Effect.forkChild(
          runDelivery(deliveryId, () => Deferred.await(sending), {
            attemptsBefore: RETRY_LIMIT,
          }),
        );
        const mail = yield* RecordedMail;
        yield* waitFor(() => mail.invitations.length === 1);

        // Whoever is next in line for the invitation, as one statement:
        // taking the lock and settling the row cannot be interleaved from
        // here, so what this finds the instant the invitation is released is
        // exactly what the handler had written before letting go.
        const contender = Effect.promise(() =>
          scratch.maintenance.query(
            `/* lock-contender */
             WITH taken AS (
               SELECT i.id
                 FROM team_invitations i
                 JOIN team_invitation_deliveries d
                   ON d.invitation_id = i.id AND d.team_id = i.team_id
                WHERE d.id = $1
                  FOR UPDATE OF i
             )
             UPDATE team_invitation_deliveries
                SET suppressed_at = clock_timestamp(),
                    last_error = 'cancelled while the attempt was failing'
              WHERE id = $1
                AND (SELECT count(*) FROM taken) = 1
                AND sent_at IS NULL AND failed_at IS NULL
                AND suppressed_at IS NULL AND uncertain_at IS NULL`,
            [deliveryId],
          ),
        );
        const contending = yield* Effect.forkChild(contender);

        // It has to be waiting on the lock before the send fails, or it would
        // simply arrive after the handler and prove nothing.
        yield* waitForEffect(
          Effect.promise(async () => {
            const { rowCount } = await scratch.pool.query(
              `select 1 from pg_stat_activity
                where datname = current_database()
                  and wait_event_type = 'Lock'
                  and query like '%lock-contender%'`,
            );
            return rowCount === 1;
          }),
        );

        yield* Deferred.fail(
          sending,
          new MailFailed({ cause: new Error('permanent SMTP failure') }),
        );
        const step = yield* Fiber.join(attempt);
        assert.strictEqual(step._tag, 'failed');

        const result = yield* Fiber.join(contending);
        assert.strictEqual(result.rowCount, 0);
        const row = yield* deliveryState(deliveryId);
        assert.strictEqual(row.attempt_count, RETRY_LIMIT + 1);
        assert.instanceOf(row.failed_at, Date);
        assert.strictEqual(row.last_error, 'permanent SMTP failure');
        assert.strictEqual(row.suppressed_at, null);
      }),
    );

    // ---------------------------------------------------------------- 9 ----
    it.effect('dead-letters a delivery whose attempts are exhausted', () =>
      Effect.gen(function* () {
        yield* clearQueue();
        const invitation = yield* seedInvitation();
        const deliveryId = yield* enqueueDeliveryRow(invitation);

        const step = yield* runDelivery(
          deliveryId,
          failsWith('permanent SMTP failure'),
          { attemptsBefore: RETRY_LIMIT },
        );
        assert.strictEqual(step._tag, 'failed');
        const failed = step as Extract<JobStep, { _tag: 'failed' }>;
        assert.isString(failed.deadLetter);

        const rows = yield* readJobs();
        assert.deepStrictEqual(
          rows.map(({ queue, state }) => ({ queue, state })),
          [
            { queue: 'invitation-delivery', state: 'failed' },
            // The copy #1307's manual re-send works from, naming the same
            // delivery as the job that failed.
            { queue: 'invitation-delivery-dead-letter', state: 'created' },
          ],
        );
        const row = yield* deliveryState(deliveryId);
        assert.instanceOf(row.failed_at, Date);
        assert.strictEqual(row.last_error, 'permanent SMTP failure');
      }),
    );

    // --------------------------------------------------------------- 10 ----
    it.effect(
      'suppresses deliveries whose invitations are cancelled or expired',
      () =>
        Effect.gen(function* () {
          yield* clearQueue();
          const cancelled = yield* seedInvitation({ status: 'canceled' });
          const expired = yield* seedInvitation({
            expiresAt: new Date(Date.now() - 60_000),
          });
          const cancelledDelivery = yield* enqueueDeliveryRow(cancelled);
          const expiredDelivery = yield* enqueueDeliveryRow(expired);
          const mail = yield* RecordedMail;
          mail.invitations.length = 0;

          const first = yield* runDelivery(cancelledDelivery, succeeds);
          yield* clearQueue();
          const second = yield* runDelivery(expiredDelivery, succeeds);

          assert.strictEqual(
            first._tag === 'settled' ? first.outcome : undefined,
            'suppressed',
          );
          assert.strictEqual(
            second._tag === 'settled' ? second.outcome : undefined,
            'suppressed',
          );
          assert.strictEqual(mail.invitations.length, 0);
          const cancelledRow = yield* deliveryState(cancelledDelivery);
          assert.strictEqual(
            cancelledRow.last_error,
            'invitation is no longer pending',
          );
          assert.instanceOf(cancelledRow.suppressed_at, Date);
          const expiredRow = yield* deliveryState(expiredDelivery);
          assert.strictEqual(expiredRow.last_error, 'invitation expired');
          assert.instanceOf(expiredRow.suppressed_at, Date);
        }),
    );

    // --------------------------------------------------------------- 11 ----
    it.effect('sends once when two workers hold the same queue', () =>
      Effect.gen(function* () {
        yield* clearQueue();
        const invitation = yield* seedInvitation();
        const { deliveryId } = yield* seedQueuedDelivery(invitation);
        const mail = yield* RecordedMail;
        mail.invitations.length = 0;
        const sending = yield* Deferred.make<
          void,
          MailFailed | MailNotConfigured
        >();
        yield* mail.setInvitationBehaviour(() => Deferred.await(sending));

        // Two workers on one schema, exactly as two replicas are, racing for
        // the same job.
        const steps = yield* Effect.gen(function* () {
          const first = yield* JobWorker;
          yield* first.work(
            'invitation-delivery',
            invitationDelivery({ publicBaseUrl: PUBLIC_BASE_URL }),
          );
          return yield* Effect.gen(function* () {
            const second = yield* JobWorker;
            yield* second.work(
              'invitation-delivery',
              invitationDelivery({ publicBaseUrl: PUBLIC_BASE_URL }),
            );
            const racing = yield* Effect.forkChild(
              Effect.all(
                [
                  first.drainOnce('invitation-delivery'),
                  second.drainOnce('invitation-delivery'),
                ],
                { concurrency: 2 },
              ),
            );
            yield* waitFor(() => mail.invitations.length === 1);
            // The winner holds the job active and the invitation locked; this
            // is the window in which the loser would send a second copy.
            // The window in which the loser would send a second copy: real
            // time, because the loser's claim is a real round trip.
            yield* realSleep(300);
            assert.strictEqual(mail.invitations.length, 1);
            yield* Deferred.succeed(sending, undefined);
            return yield* Fiber.join(racing);
          }).pipe(Effect.provide(layerWorker()));
        }).pipe(Effect.provide(layerWorker()));

        assert.strictEqual(mail.invitations.length, 1);
        assert.deepStrictEqual(steps.map((step) => step._tag).sort(), [
          'idle',
          'settled',
        ]);
        const row = yield* deliveryState(deliveryId);
        assert.instanceOf(row.sent_at, Date);
      }),
    );

    // --------------------------------------------------------------- 12 ----
    it.effect(
      'refuses a second attempt while the first holds the invitation',
      () =>
        Effect.gen(function* () {
          yield* clearQueue();
          const invitation = yield* seedInvitation();
          const deliveryId = yield* enqueueDeliveryRow(invitation);
          const mail = yield* RecordedMail;
          mail.invitations.length = 0;
          const sending = yield* Deferred.make<
            void,
            MailFailed | MailNotConfigured
          >();

          const first = yield* Effect.forkChild(
            runDelivery(deliveryId, (call) =>
              call === 1 ? Deferred.await(sending) : Effect.void,
            ),
          );
          yield* waitFor(() => mail.invitations.length === 1);

          // The expiry of the first attempt would make the queue hand the job to
          // a second worker while the first is still inside its SMTP call.
          const second = yield* runDelivery(deliveryId, succeeds, {
            attemptsBefore: 1,
          });
          assert.strictEqual(second._tag, 'retrying');
          assert.strictEqual(mail.invitations.length, 1);
          // The refusal counted nothing: an attempt that never got the lock did
          // no work.
          const during = yield* deliveryState(deliveryId);
          assert.strictEqual(during.attempt_count, 1);
          assert.strictEqual(during.last_error, null);

          const rows = yield* readJobs('invitation-delivery');
          const refused = rows.find((row) => row.attempts === 2);
          assert.strictEqual(refused?.last_error, LOCK_HELD_ELSEWHERE);

          yield* Deferred.succeed(sending, undefined);
          const firstStep = yield* Fiber.join(first);
          assert.strictEqual(firstStep._tag, 'settled');
          const after = yield* deliveryState(deliveryId);
          assert.strictEqual(after.attempt_count, 1);
          assert.instanceOf(after.sent_at, Date);
        }),
    );

    // --------------------------------------------------------------- 13 ----
    it.effect(
      'leaves the row to its holder when the last attempt is refused',
      () =>
        Effect.gen(function* () {
          yield* clearQueue();
          const invitation = yield* seedInvitation();
          const deliveryId = yield* enqueueDeliveryRow(invitation);
          const { scratch } = yield* DeliveryHarness;
          const mail = yield* RecordedMail;
          mail.invitations.length = 0;

          const holder = yield* Effect.promise(() =>
            holdInvitation(scratch, invitation.invitationId),
          );
          const step = yield* Effect.ensuring(
            runDelivery(deliveryId, succeeds, { attemptsBefore: RETRY_LIMIT }),
            Effect.promise(() => holder.release()),
          );

          assert.strictEqual(step._tag, 'failed');
          assert.strictEqual(mail.invitations.length, 0);
          const rows = yield* readJobs('invitation-delivery');
          assert.strictEqual(
            rows.find((row) => row.state === 'failed')?.last_error,
            LOCK_HELD_ON_LAST_ATTEMPT,
          );
          // Every column, not a subset: the whole point is that this attempt
          // wrote nothing at all.
          assert.deepStrictEqual(yield* deliveryState(deliveryId), {
            attempt_count: 0,
            failed_at: null,
            last_error: null,
            sent_at: null,
            suppressed_at: null,
            uncertain_at: null,
          });
        }),
    );

    // --------------------------------------------------------------- 14 ----
    it.effect(
      'refuses a job whose payload is not one this queue declares',
      () =>
        Effect.gen(function* () {
          yield* clearQueue();
          const invitation = yield* seedInvitation();
          const deliveryId = yield* enqueueDeliveryRow(invitation);
          const { scratch, schema } = yield* DeliveryHarness;
          const mail = yield* RecordedMail;
          mail.invitations.length = 0;

          // Nothing this server enqueues looks like either of these — the
          // enqueue validates on the way in — so what they stand for is a row
          // written by an older release or by hand. The second carries a real
          // delivery id beside a field the schema does not declare.
          for (const payload of [
            '{}',
            JSON.stringify({ deliveryId, teamId: TEAM_ID }),
          ]) {
            yield* Effect.promise(async () => {
              await scratch.pool.query(
                `INSERT INTO ${schema}.jobs
                 (queue, payload, state, attempts, run_at, keep_until, created_at)
               VALUES ('invitation-delivery', $1::jsonb, 'created', 0,
                       to_timestamp(0), to_timestamp(0) + interval '1 day',
                       to_timestamp(0))`,
                [payload],
              );
            });
            const step = yield* Effect.gen(function* () {
              const worker = yield* JobWorker;
              yield* worker.work(
                'invitation-delivery',
                invitationDelivery({ publicBaseUrl: PUBLIC_BASE_URL }),
              );
              return yield* worker.drainOnce('invitation-delivery');
            }).pipe(Effect.provide(layerWorker()));
            // The decode is in the worker now (#1927 §11), not the handler, so
            // the job is killed rather than retried — and the handler never ran.
            assert.strictEqual(step._tag, 'dead');
            yield* clearQueue();
          }

          assert.strictEqual(mail.invitations.length, 0);
          assert.deepStrictEqual(yield* deliveryState(deliveryId), {
            attempt_count: 0,
            failed_at: null,
            last_error: null,
            sent_at: null,
            suppressed_at: null,
            uncertain_at: null,
          });
        }),
    );

    // --------------------------------------------------------------- 16 ----
    it.effect(
      'lets a cancellation win the lock and suppresses what follows',
      () =>
        Effect.gen(function* () {
          yield* clearQueue();
          const invitation = yield* seedInvitation();
          const deliveryId = yield* enqueueDeliveryRow(invitation);
          const { scratch } = yield* DeliveryHarness;
          const mail = yield* RecordedMail;
          mail.invitations.length = 0;

          const holder = yield* Effect.promise(() =>
            holdInvitation(scratch, invitation.invitationId),
          );
          // A cancellation holding the row is indistinguishable from another
          // attempt holding it: the handler gives up rather than sending mail for
          // an invitation someone is in the middle of withdrawing.
          const refused = yield* runDelivery(deliveryId, succeeds);
          assert.strictEqual(refused._tag, 'retrying');
          yield* Effect.promise(async () => {
            await holder.client.query(
              `UPDATE team_invitations SET status = 'canceled' WHERE id = $1`,
              [invitation.invitationId],
            );
            await holder.release();
          });

          yield* clearQueue();
          const after = yield* runDelivery(deliveryId, succeeds);
          assert.strictEqual(
            after._tag === 'settled' ? after.outcome : undefined,
            'suppressed',
          );
          assert.strictEqual(mail.invitations.length, 0);
          assert.instanceOf(
            (yield* deliveryState(deliveryId)).suppressed_at,
            Date,
          );
        }),
    );

    // --------------------------------------------------------------- 17 ----
    it.effect('lets the application enqueue but not alter delivery state', () =>
      Effect.gen(function* () {
        const invitation = yield* seedInvitation();
        yield* enqueueDeliveryRow(invitation);
        const harness = yield* DeliveryHarness;

        const refused = yield* Effect.exit(
          Effect.provideService(
            withTenantTransaction(
              TEAM_ID,
              Effect.flatMap(
                Transaction,
                ({ sql }) =>
                  sql`UPDATE team_invitation_deliveries SET sent_at = CURRENT_TIMESTAMP`,
              ),
            ),
            Database,
            harness.app,
          ),
        );
        assert.strictEqual(exitSqlState(refused), INSUFFICIENT_PRIVILEGE);
      }),
    );

    // --------------------------------------------------------------- 18 ----
    it.effect(
      'lets maintenance advance delivery state but not rewrite it',
      () =>
        Effect.gen(function* () {
          const invitation = yield* seedInvitation();
          const deliveryId = yield* enqueueDeliveryRow(invitation);
          const { scratch } = yield* DeliveryHarness;

          const advanced = yield* Effect.promise(async () => {
            const { rowCount } = await scratch.maintenance.query(
              `UPDATE team_invitation_deliveries
                SET attempt_count = attempt_count + 1
              WHERE id = $1`,
              [deliveryId],
            );
            return rowCount;
          });
          assert.strictEqual(advanced, 1);

          const rewritten = yield* Effect.promise(() =>
            scratch.maintenance
              .query(
                `UPDATE team_invitation_deliveries SET email = 'rewritten@example.com' WHERE id = $1`,
                [deliveryId],
              )
              .then(
                () => null,
                (error: unknown) => error,
              ),
          );
          assert.match(
            String(rewritten),
            /invitation delivery payload is immutable/,
          );
        }),
    );

    // --------------------------------------------------------------- 19 ----
    it.effect(
      'structurally rejects an outbox row assigned to another team',
      () =>
        Effect.gen(function* () {
          const invitation = yield* seedInvitation();
          const { scratch } = yield* DeliveryHarness;
          const error = yield* Effect.promise(() =>
            scratch.pool
              .query(
                `INSERT INTO team_invitation_deliveries (
                 id, invitation_id, team_id, email, role, team_label,
                 inviter_label, expires_at
               ) VALUES ($1, $2, 'different-team', $3, 'member', 'Other Team',
                         'Inviter', $4)`,
                [
                  randomUUID(),
                  invitation.invitationId,
                  invitation.email,
                  invitation.expiresAt,
                ],
              )
              .then(
                () => null,
                (rejected: unknown) => rejected,
              ),
          );
          assert.strictEqual(
            (error as { code?: string } | null)?.code,
            FOREIGN_KEY_VIOLATION,
          );
        }),
    );

    // --------------------------------------------------------------- 20 ----
    it.effect('sends a queued invitation end to end', () =>
      Effect.gen(function* () {
        yield* clearQueue();
        const invitation = yield* seedInvitation();
        const mail = yield* RecordedMail;
        mail.invitations.length = 0;
        yield* mail.setInvitationBehaviour(() => Effect.void);

        const { deliveryId } = yield* seedQueuedDelivery(invitation);
        const step = yield* Effect.gen(function* () {
          const worker = yield* JobWorker;
          yield* worker.work(
            'invitation-delivery',
            invitationDelivery({ publicBaseUrl: PUBLIC_BASE_URL }),
          );
          return yield* worker.drainOnce('invitation-delivery');
        }).pipe(Effect.provide(layerWorker()));

        assert.strictEqual(step._tag, 'settled');
        assert.instanceOf((yield* deliveryState(deliveryId)).sent_at, Date);
        assert.deepStrictEqual(
          mail.invitations.at(-1)?.email,
          invitation.email,
        );
        assert.strictEqual(
          mail.invitations.at(-1)?.invitationUrl,
          `${PUBLIC_BASE_URL}/invitations/${invitation.invitationId}`,
        );
        assert.strictEqual(mail.invitations.at(-1)?.role, 'member');
        const [row] = yield* readJobs('invitation-delivery');
        assert.strictEqual(row?.state, 'completed');
        assert.strictEqual(row?.outcome, 'completed');
      }),
    );

    // Not ported, and none of them for a queue reason:
    //
    //  3. 'creates the invitation, the delivery and one job in one command'
    //  4. 'refuses to create an invitation it cannot queue'
    // 15. 'refuses and audits cancellation after delivery has begun'
    //
    // All three drive `createTeamInvitation` / `cancelTeamInvitation`, which
    // are Promise-and-drizzle commands over `createTenantDb`, with the audit
    // trail attached. Porting them is stage 3 and stage 4 of #1927, not this
    // spike. Case 4 is additionally superseded: the command's optional `jobs`
    // dependency and its runtime "invitation delivery needs a job client"
    // throw are exactly what `Jobs` as a service requirement removes — a
    // command that cannot reach the queue will not compile, so there is no
    // longer a runtime case to test.
  });
});

/**
 * Holds the invitation the way an earlier attempt inside its SMTP call does,
 * and hands back the means to let go. Taken on the maintenance pool because
 * that is the role a delivery attempt would be.
 */
async function holdInvitation(
  scratch: { maintenance: pg.Pool },
  invitationId: string,
): Promise<{ client: pg.PoolClient; release: () => Promise<void> }> {
  const client = await scratch.maintenance.connect();
  await client.query('BEGIN');
  await client.query(
    `SELECT id FROM team_invitations WHERE id = $1 FOR UPDATE`,
    [invitationId],
  );
  return {
    client,
    release: async () => {
      await client.query('COMMIT').catch(() => undefined);
      client.release();
    },
  };
}

/**
 * `vi.waitFor`, in Effect. Real time rather than `Effect.sleep`, deliberately:
 * these cases wait on another *connection* doing real work, which the virtual
 * clock knows nothing about. The rest of the spike's suites run in virtual
 * time; this file is the exception and says so.
 */
const realSleep = (ms: number): Effect.Effect<void> =>
  Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));

const waitFor = (
  predicate: () => boolean,
  options: { timeoutMs?: number } = {},
): Effect.Effect<void> => waitForEffect(Effect.sync(predicate), options);

const waitForEffect = Effect.fnUntraced(function* (
  predicate: Effect.Effect<boolean>,
  options: { timeoutMs?: number } = {},
) {
  const deadline = Date.now() + (options.timeoutMs ?? 10_000);
  while (Date.now() < deadline) {
    if (yield* predicate) return;
    yield* realSleep(10);
  }
  return yield* Effect.die(new Error('waitFor timed out'));
});
