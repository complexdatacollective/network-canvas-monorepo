import { randomUUID } from 'node:crypto';

import { assert, describe, layer } from '@effect/vitest';
import {
  Cause,
  Deferred,
  Effect,
  Exit,
  Fiber,
  Layer,
  Predicate,
  Scope,
} from 'effect';

import { TENANT_ROLES } from '@codaco/studio-sync/rls';

import {
  affectedRows,
  ownerRows,
  refusalOf,
  TestDatabase,
  testDb,
} from '../../../__tests__/support/database.ts';
import { testDeniedAttempts } from '../../../__tests__/support/valkey.ts';
import { provideCaller } from '../../../audit/actor.ts';
import { AuditSignal } from '../../../audit/signal.ts';
import type { SessionPrincipal } from '../../../auth/service.ts';
import { MaintenanceDatabase, Database } from '../../../db/client.ts';
import {
  MaintenanceScope,
  Transaction,
  unsafeMakeTeamAccess,
} from '../../../db/tenant.ts';
import { RequestId } from '../../../http/middleware/request-id.ts';
import { MailFailed, type MailNotConfigured } from '../../../mail/mailer.ts';
import { principalOf } from '../../../rpc/authenticated.ts';
import {
  cancelTeamInvitation,
  createTeamInvitation,
} from '../../../team/commands.ts';
import {
  asMaintenance,
  DeliveryHarness,
  drainWith,
  layerDeliveryHarness,
  layerJobs,
  layerWorker,
  readJobs,
} from '../../__tests__/support.ts';
import {
  exitSqlState,
  FOREIGN_KEY_VIOLATION,
  INSUFFICIENT_PRIVILEGE,
} from '../../errors.ts';
import { JobRefused, Jobs } from '../../jobs.ts';
import { resolvedQueue } from '../../queues.ts';
import { maintenanceTeamAccess } from '../../team-access.ts';
import { JobWorker, type JobStep } from '../../worker.ts';
import {
  invitationDelivery,
  LOCK_HELD_ELSEWHERE,
  LOCK_HELD_ON_LAST_ATTEMPT,
} from '../invitation-delivery.ts';
import { layerRecordingMailer, RecordedMail } from './support.ts';

const TEAM_ID = 'effect-invitation-delivery-team';
const INVITER_ID = 'effect-invitation-delivery-inviter';
const INVITER_MEMBER_ID = 'effect-invitation-delivery-inviter-member';
const PUBLIC_BASE_URL = 'https://studio.example.test';

const PRINCIPAL: SessionPrincipal = {
  kind: 'user',
  userId: INVITER_ID,
  email: 'inviter@example.com',
  emailVerified: true,
  name: 'Inviting Researcher',
  locale: null,
  sessionId: 'effect-invitation-delivery-session',
};

const DELIVERY = resolvedQueue('invitation-delivery');
const RETRY_LIMIT = DELIVERY.retryLimit;

type DeliveryRow = {
  attempt_count: number;
  failed_at: Date | null;
  last_error: string | null;
  sent_at: Date | null;
  suppressed_at: Date | null;
  uncertain_at: Date | null;
};

const suiteLayer = Layer.mergeAll(
  layerJobs,
  layerRecordingMailer,
  testDeniedAttempts,
).pipe(Layer.provideMerge(layerDeliveryHarness));

describe.skipIf(!testDb)('invitation delivery on the native queue', () => {
  layer(suiteLayer)('with Studio and the queue installed', (it) => {
    const seedTeam = Effect.fnUntraced(function* () {
      yield* Effect.orDie(
        ownerRows(
          `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
           VALUES ($1, 'Inviting Researcher', 'inviter@example.com', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           ON CONFLICT (id) DO NOTHING`,
          [INVITER_ID],
        ),
      );
      yield* Effect.orDie(
        ownerRows(
          `INSERT INTO teams (id, name, slug) VALUES ($1, 'Invitation Delivery Team', $1)
           ON CONFLICT (id) DO NOTHING`,
          [TEAM_ID],
        ),
      );
      yield* Effect.orDie(
        ownerRows(
          `INSERT INTO team_members (id, team_id, user_id, role)
           VALUES ($1, $2, $3, 'owner') ON CONFLICT (id) DO NOTHING`,
          [INVITER_MEMBER_ID, TEAM_ID, INVITER_ID],
        ),
      );
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
      const invitationId = randomUUID();
      const email = `${invitationId}@example.com`;
      const expiresAt =
        input.expiresAt ?? new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
      yield* Effect.orDie(
        ownerRows(
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
        ),
      );
      const seeded: SeededInvitation = { invitationId, email, expiresAt };
      return seeded;
    });

    const enqueueDeliveryRow = Effect.fnUntraced(function* (
      invitation: SeededInvitation,
    ) {
      const deliveryId = randomUUID();
      yield* Effect.flatMap(DeliveryHarness, (harness) =>
        Effect.provideService(
          MaintenanceScope.openTenant(
            maintenanceTeamAccess(TEAM_ID),
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
          MaintenanceDatabase,
          harness.app,
        ),
      );
      return deliveryId;
    });

    const seedQueuedDelivery = Effect.fnUntraced(function* (
      invitation: SeededInvitation,
    ) {
      const harness = yield* DeliveryHarness;
      const jobs = yield* Jobs;
      const deliveryId = randomUUID();
      const jobId = yield* Effect.provideService(
        MaintenanceScope.openTenant(
          maintenanceTeamAccess(TEAM_ID),
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
        MaintenanceDatabase,
        harness.app,
      );
      return { deliveryId, jobId };
    });

    const deliveryState = Effect.fnUntraced(function* (deliveryId: string) {
      const [row] = yield* Effect.orDie(
        ownerRows<DeliveryRow>(
          `SELECT attempt_count, failed_at, last_error, sent_at, suppressed_at,
                  uncertain_at
             FROM team_invitation_deliveries WHERE id = $1`,
          [deliveryId],
        ),
      );
      if (!row) throw new Error(`no delivery row for ${deliveryId}`);
      return row;
    });

    const clearQueue = Effect.fnUntraced(function* () {
      const { schema } = yield* DeliveryHarness;
      yield* Effect.orDie(ownerRows(`DELETE FROM ${schema}.jobs`));
    });

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
          MaintenanceScope.openTenant(
            maintenanceTeamAccess(TEAM_ID),
            jobs.enqueue('invitation-delivery', { deliveryId }),
          ),
          MaintenanceDatabase,
          harness.app,
        );
        if (options.attemptsBefore !== undefined) {
          yield* Effect.orDie(
            ownerRows(
              `UPDATE ${harness.schema}.jobs SET attempts = $2 WHERE id = $1`,
              [jobId, options.attemptsBefore],
            ),
          );
        }
        return yield* worker.drainOnce('invitation-delivery');
      }).pipe(Effect.provide(layerWorker()));

    const succeeds = () => Effect.void;
    const failsWith = (message: string) => () =>
      Effect.fail(new MailFailed({ cause: new Error(message) }));

    it.effect(
      'creates the delivery and its job only when it commits, carrying the delivery id and nothing else',
      () =>
        Effect.gen(function* () {
          yield* clearQueue();
          const abandoned = yield* seedInvitation();
          const harness = yield* DeliveryHarness;
          const jobs = yield* Jobs;
          const abandonedDeliveryId = randomUUID();

          const rolledBack = yield* Effect.exit(
            Effect.provideService(
              MaintenanceScope.openTenant(
                maintenanceTeamAccess(TEAM_ID),
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
              MaintenanceDatabase,
              harness.app,
            ),
          );
          assert.isTrue(Exit.isFailure(rolledBack));

          const orphans = yield* Effect.orDie(
            ownerRows(
              `SELECT id FROM team_invitation_deliveries WHERE invitation_id = $1`,
              [abandoned.invitationId],
            ),
          );
          assert.strictEqual(orphans.length, 0);
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

    it.effect(
      'records a failed attempt and sends the snapshot, end to end, on the next',
      () =>
        Effect.gen(function* () {
          yield* clearQueue();
          const invitation = yield* seedInvitation();
          const deliveryId = yield* enqueueDeliveryRow(invitation);
          yield* Effect.orDie(
            ownerRows(`UPDATE teams SET name = 'Renamed Team' WHERE id = $1`, [
              TEAM_ID,
            ]),
          );
          yield* Effect.orDie(
            ownerRows(
              `UPDATE "user" SET name = 'Renamed Inviter' WHERE id = $1`,
              [INVITER_ID],
            ),
          );

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
          const [row] = yield* readJobs('invitation-delivery');
          assert.strictEqual(row?.state, 'completed');
          assert.strictEqual(row?.outcome, 'completed');
        }),
    );

    it.effect(
      'does not retry when SMTP accepted but the marker cannot commit',
      () =>
        Effect.gen(function* () {
          yield* clearQueue();
          const invitation = yield* seedInvitation();
          const deliveryId = yield* enqueueDeliveryRow(invitation);

          yield* Effect.orDie(
            ownerRows(`
            CREATE FUNCTION interrupt_invitation_sent_finalization() RETURNS trigger AS $$
            BEGIN
              RAISE EXCEPTION 'sent finalization interrupted';
            END;
            $$ LANGUAGE plpgsql`),
          );
          yield* Effect.orDie(
            ownerRows(`
            CREATE TRIGGER interrupt_invitation_sent_finalization
              BEFORE UPDATE ON team_invitation_deliveries
              FOR EACH ROW
              WHEN (NEW.sent_at IS NOT NULL AND OLD.sent_at IS NULL)
              EXECUTE FUNCTION interrupt_invitation_sent_finalization()`),
          );

          const step = yield* Effect.ensuring(
            runDelivery(deliveryId, succeeds),
            Effect.orDie(
              Effect.andThen(
                ownerRows(`
              DROP TRIGGER interrupt_invitation_sent_finalization
                ON team_invitation_deliveries`),
                ownerRows(
                  'DROP FUNCTION interrupt_invitation_sent_finalization()',
                ),
              ),
            ),
          );

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
          const unchanged = yield* deliveryState(deliveryId);
          assert.strictEqual(unchanged.attempt_count, 1);
          assert.instanceOf(unchanged.uncertain_at, Date);
        }),
    );

    it.effect('stamps a failed send before it lets go of the invitation', () =>
      Effect.gen(function* () {
        yield* clearQueue();
        const invitation = yield* seedInvitation();
        const deliveryId = yield* enqueueDeliveryRow(invitation);
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

        const contender = asMaintenance(
          MaintenanceScope.open(
            Effect.flatMap(Transaction, ({ sql }) =>
              affectedRows(
                sql.unsafe(
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
              ),
            ),
          ),
        );
        const contending = yield* Effect.forkChild(contender);

        yield* waitForEffect(
          Effect.map(
            Effect.orDie(
              ownerRows(
                `select 1 from pg_stat_activity
                  where datname = current_database()
                    and wait_event_type = 'Lock'
                    and query like '%lock-contender%'`,
              ),
            ),
            (rows) => rows.length === 1,
          ),
        );

        yield* Deferred.fail(
          sending,
          new MailFailed({ cause: new Error('permanent SMTP failure') }),
        );
        const step = yield* Fiber.join(attempt);
        assert.strictEqual(step._tag, 'failed');

        const contended = yield* Fiber.join(contending);
        assert.strictEqual(contended, 0);
        const row = yield* deliveryState(deliveryId);
        assert.strictEqual(row.attempt_count, RETRY_LIMIT + 1);
        assert.instanceOf(row.failed_at, Date);
        assert.strictEqual(row.last_error, 'permanent SMTP failure');
        assert.strictEqual(row.suppressed_at, null);
      }),
    );

    it.effect(
      'records the delivery failed on the attempt nothing will retry, and dead-letters it',
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
          const failed = step as Extract<JobStep, { _tag: 'failed' }>;
          assert.isString(failed.deadLetter);

          const row = yield* deliveryState(deliveryId);
          assert.strictEqual(row.attempt_count, RETRY_LIMIT + 1);
          assert.instanceOf(row.failed_at, Date);
          assert.strictEqual(row.last_error, 'permanent SMTP failure');
          assert.strictEqual(row.sent_at, null);

          const rows = yield* readJobs();
          assert.deepStrictEqual(
            rows.map(({ queue, state }) => ({ queue, state })),
            [
              { queue: 'invitation-delivery', state: 'failed' },
              { queue: 'invitation-delivery-dead-letter', state: 'created' },
            ],
          );
        }),
    );

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
            yield* realSleep(300);
            assert.strictEqual(mail.invitations.length, 1);
            yield* Deferred.succeed(sending, undefined);
            return yield* Fiber.join(racing);
          }).pipe(Effect.provide(layerWorker()));
        }).pipe(Effect.provide(layerWorker()));

        assert.strictEqual(mail.invitations.length, 1);
        assert.deepStrictEqual(steps.map((step) => step._tag).toSorted(), [
          'idle',
          'settled',
        ]);
        const row = yield* deliveryState(deliveryId);
        assert.instanceOf(row.sent_at, Date);
      }),
    );

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

          const second = yield* runDelivery(deliveryId, succeeds, {
            attemptsBefore: 1,
          });
          assert.strictEqual(second._tag, 'retrying');
          assert.strictEqual(mail.invitations.length, 1);
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

    it.effect(
      'leaves the row to its holder when the last attempt is refused',
      () =>
        Effect.gen(function* () {
          yield* clearQueue();
          const invitation = yield* seedInvitation();
          const deliveryId = yield* enqueueDeliveryRow(invitation);
          const mail = yield* RecordedMail;
          mail.invitations.length = 0;

          const holder = yield* holdInvitation(invitation.invitationId);
          const step = yield* Effect.ensuring(
            runDelivery(deliveryId, succeeds, { attemptsBefore: RETRY_LIMIT }),
            holder.release,
          );

          assert.strictEqual(step._tag, 'failed');
          assert.strictEqual(mail.invitations.length, 0);
          const rows = yield* readJobs('invitation-delivery');
          assert.strictEqual(
            rows.find((row) => row.state === 'failed')?.last_error,
            LOCK_HELD_ON_LAST_ATTEMPT,
          );
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

    it.effect(
      'refuses a job whose payload is not one this queue declares',
      () =>
        Effect.gen(function* () {
          yield* clearQueue();
          const invitation = yield* seedInvitation();
          const deliveryId = yield* enqueueDeliveryRow(invitation);
          const { schema } = yield* DeliveryHarness;
          const mail = yield* RecordedMail;
          mail.invitations.length = 0;

          for (const payload of [
            '{}',
            JSON.stringify({ deliveryId, teamId: TEAM_ID }),
          ]) {
            yield* Effect.orDie(
              ownerRows(
                `INSERT INTO ${schema}.jobs
                 (queue, payload, state, attempts, run_at, keep_until, created_at)
               VALUES ('invitation-delivery', $1::jsonb, 'created', 0,
                       to_timestamp(0), to_timestamp(0) + interval '1 day',
                       to_timestamp(0))`,
                [payload],
              ),
            );
            const step = yield* drainWith(
              'invitation-delivery',
              invitationDelivery({ publicBaseUrl: PUBLIC_BASE_URL }),
            );
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

    it.effect(
      'lets a cancellation win the lock and suppresses what follows',
      () =>
        Effect.gen(function* () {
          yield* clearQueue();
          const invitation = yield* seedInvitation();
          const deliveryId = yield* enqueueDeliveryRow(invitation);
          const mail = yield* RecordedMail;
          mail.invitations.length = 0;

          const holder = yield* holdInvitation(invitation.invitationId);
          const refused = yield* runDelivery(deliveryId, succeeds);
          assert.strictEqual(refused._tag, 'retrying');
          yield* holder.query(
            `UPDATE team_invitations SET status = 'canceled' WHERE id = $1`,
            [invitation.invitationId],
          );
          yield* holder.release;

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

    it.effect('lets the application enqueue but not alter delivery state', () =>
      Effect.gen(function* () {
        const invitation = yield* seedInvitation();
        yield* enqueueDeliveryRow(invitation);
        const harness = yield* DeliveryHarness;

        const refused = yield* Effect.exit(
          Effect.provideService(
            MaintenanceScope.openTenant(
              maintenanceTeamAccess(TEAM_ID),
              Effect.flatMap(
                Transaction,
                ({ sql }) =>
                  sql`UPDATE team_invitation_deliveries SET sent_at = CURRENT_TIMESTAMP`,
              ),
            ),
            MaintenanceDatabase,
            harness.app,
          ),
        );
        assert.strictEqual(exitSqlState(refused), INSUFFICIENT_PRIVILEGE);
      }),
    );

    it.effect(
      'lets maintenance advance delivery state but not rewrite it',
      () =>
        Effect.gen(function* () {
          const invitation = yield* seedInvitation();
          const deliveryId = yield* enqueueDeliveryRow(invitation);

          const advanced = yield* Effect.orDie(
            asMaintenance(
              MaintenanceScope.open(
                Effect.flatMap(Transaction, ({ sql }) =>
                  affectedRows(
                    sql.unsafe(
                      `UPDATE team_invitation_deliveries
                        SET attempt_count = attempt_count + 1
                      WHERE id = $1`,
                      [deliveryId],
                    ),
                  ),
                ),
              ),
            ),
          );
          assert.strictEqual(advanced, 1);

          const rewritten = yield* refusalOf(
            asMaintenance(
              MaintenanceScope.open(
                Effect.flatMap(
                  Transaction,
                  ({ sql }) =>
                    sql`UPDATE team_invitation_deliveries SET email = 'rewritten@example.com' WHERE id = ${deliveryId}`,
                ),
              ),
            ),
          );
          assert.match(
            rewritten.message,
            /invitation delivery payload is immutable/,
          );
        }),
    );

    it.effect(
      'structurally rejects an outbox row assigned to another team',
      () =>
        Effect.gen(function* () {
          const invitation = yield* seedInvitation();
          const refused = yield* refusalOf(
            ownerRows(
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
            ),
          );
          assert.strictEqual(refused.state, FOREIGN_KEY_VIOLATION);
        }),
    );

    const asInviter = <A, E, R>(command: Effect.Effect<A, E, R>) =>
      Effect.flatMap(DeliveryHarness, (harness) =>
        command.pipe(
          provideCaller(principalOf(PRINCIPAL)),
          Effect.provideService(RequestId, RequestId.of(randomUUID())),
          Effect.provide(Jobs.layer({ schema: harness.schema })),
          Effect.provideService(Database, harness.app),
          Effect.provide(AuditSignal.layer),
        ),
      );

    it.effect('creates the invitation, the delivery and one job in one', () =>
      Effect.gen(function* () {
        yield* clearQueue();
        yield* seedTeam();
        const email = `${randomUUID()}@example.com`;

        const created = yield* asInviter(
          createTeamInvitation(unsafeMakeTeamAccess(TEAM_ID, 'owner'), {
            email,
            role: 'member',
          }),
        );

        const [delivery] = yield* Effect.orDie(
          ownerRows<{ id: string }>(
            `SELECT id FROM team_invitation_deliveries WHERE invitation_id = $1`,
            [created.invitationId],
          ),
        );
        const deliveryId = delivery?.id;
        assert.isString(deliveryId);
        const queued = yield* readJobs('invitation-delivery');
        assert.strictEqual(queued.length, 1);
        assert.strictEqual(queued[0]?.state, 'created');
        assert.deepStrictEqual(queued[0]?.payload, { deliveryId });
      }),
    );

    it.effect('leaves no invitation behind when the enqueue fails', () =>
      Effect.gen(function* () {
        yield* clearQueue();
        yield* seedTeam();
        const harness = yield* DeliveryHarness;
        const email = `${randomUUID()}@example.com`;

        const refusal = yield* Effect.exit(
          createTeamInvitation(unsafeMakeTeamAccess(TEAM_ID, 'owner'), {
            email,
            role: 'member',
          }).pipe(
            provideCaller(principalOf(PRINCIPAL)),
            Effect.provideService(RequestId, RequestId.of(randomUUID())),
            Effect.provideService(
              Jobs,
              Jobs.of({
                enqueue: (queue) =>
                  Effect.flatMap(Transaction, () =>
                    Effect.fail(
                      new JobRefused({ queue, reason: 'the queue is gone' }),
                    ),
                  ),
              }),
            ),
            Effect.provideService(Database, harness.app),
            Effect.provide(AuditSignal.layer),
          ),
        );
        assert.isTrue(Exit.isFailure(refusal));

        const invitations = yield* Effect.orDie(
          ownerRows(
            `SELECT id FROM team_invitations WHERE team_id = $1 AND email = $2`,
            [TEAM_ID, email],
          ),
        );
        assert.strictEqual(invitations.length, 0);
        assert.deepStrictEqual(yield* readJobs('invitation-delivery'), []);
      }),
    );

    it.effect('refuses and audits cancellation after delivery has begun', () =>
      Effect.gen(function* () {
        yield* clearQueue();
        const invitation = yield* seedInvitation();
        const held = yield* holdInvitation(invitation.invitationId);

        const exit = yield* Effect.exit(
          asInviter(
            cancelTeamInvitation(unsafeMakeTeamAccess(TEAM_ID, 'owner'), {
              invitationId: invitation.invitationId,
            }),
          ),
        ).pipe(Effect.ensuring(held.release));
        const refusal: unknown = Exit.isFailure(exit)
          ? Cause.squash(exit.cause)
          : undefined;
        assert.strictEqual(
          Predicate.hasProperty(refusal, 'code') &&
            Predicate.isString(refusal.code)
            ? refusal.code
            : refusal,
          'DELIVERY_IN_PROGRESS',
        );

        const rows = {
          status: yield* Effect.orDie(
            ownerRows<{ status: string }>(
              `SELECT status FROM team_invitations WHERE id = $1`,
              [invitation.invitationId],
            ),
          ),
          audited: yield* Effect.orDie(
            ownerRows<{
              event_type: string;
              outcome: string;
              details: unknown;
            }>(
              `SELECT event_type, outcome, details FROM audit_events
                WHERE team_id = $1 AND subject_id = $2`,
              [TEAM_ID, invitation.invitationId],
            ),
          ),
        };
        assert.deepStrictEqual(rows.status, [{ status: 'pending' }]);
        assert.deepStrictEqual(rows.audited, [
          {
            event_type: 'team.invitation.cancellation_failed',
            outcome: 'failed',
            details: { failureCode: 'delivery_in_progress' },
          },
        ]);
      }),
    );
  });
});

const holdInvitation = Effect.fnUntraced(function* (invitationId: string) {
  const harness = yield* TestDatabase;
  const scope = yield* Scope.make();
  const held = yield* Effect.orDie(
    Scope.provide(scope)(harness.owner.sql.reserve),
  );
  const query = (statement: string, params: ReadonlyArray<unknown> = []) =>
    Effect.asVoid(Effect.orDie(held.executeRaw(statement, params)));
  yield* query('BEGIN');
  yield* query(`SET LOCAL ROLE ${TENANT_ROLES.maintenance}`);
  yield* query(`SET LOCAL search_path TO ${harness.schema}`);
  yield* query(`SELECT id FROM team_invitations WHERE id = $1 FOR UPDATE`, [
    invitationId,
  ]);
  return {
    query,
    release: Effect.andThen(
      Effect.ignore(held.executeRaw('COMMIT', [])),
      Scope.close(scope, Exit.void),
    ),
  };
});

const realSleep = (ms: number): Effect.Effect<void> =>
  Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));

const waitFor = (
  predicate: () => boolean,
  options: { timeoutMs?: number } = {},
): Effect.Effect<void> => waitForEffect(Effect.sync(predicate), options);

const waitForEffect = Effect.fnUntraced(function* <R>(
  predicate: Effect.Effect<boolean, never, R>,
  options: { timeoutMs?: number } = {},
) {
  const deadline = Date.now() + (options.timeoutMs ?? 10_000);
  while (Date.now() < deadline) {
    if (yield* predicate) return;
    yield* realSleep(10);
  }
  yield* Effect.die(new Error('waitFor timed out'));
});
