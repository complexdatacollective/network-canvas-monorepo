import type { Cause } from 'effect';
import { Effect, Exit, Redacted, Schema } from 'effect';
import type { SqlError } from 'effect/sql';

import type { TeamRole } from '@codaco/studio-contract/schema/team';

import { type MaintenanceDatabase } from '../../db/client.ts';
import { MaintenanceScope, Transaction } from '../../db/tenant.ts';
import { Mailer } from '../../mail/mailer.ts';
import {
  causeError,
  deepestMessage,
  isLockUnavailableCause,
} from '../errors.ts';
import type { HandledJob, JobOutcome } from '../worker.ts';

const QUEUE = 'invitation-delivery';

const MAX_ERROR_LENGTH = 1_000;

export const LOCK_HELD_ELSEWHERE =
  'invitation row is locked by an earlier attempt or another command; retrying later';

export const LOCK_HELD_ON_LAST_ATTEMPT =
  'invitation row is locked by an earlier attempt or another command on the last attempt; how this delivery ended is for the holder to record';

const ENDED_MID_SEND = 'the delivery had already ended when its send completed';

const STILL_PENDING = `sent_at IS NULL
     AND failed_at IS NULL
     AND suppressed_at IS NULL
     AND uncertain_at IS NULL`;

export class DeliveryAttemptFailed extends Schema.TaggedError<DeliveryAttemptFailed>()(
  'DeliveryAttemptFailed',
  { message: Schema.String },
) {}

export type InvitationDeliveryDeps = {
  readonly publicBaseUrl: string;
};

type DeliverableRow = {
  readonly invitationId: string;
  readonly email: string;
  readonly role: TeamRole;
  readonly teamLabel: string;
  readonly inviterLabel: string;
  readonly expiresAt: Date;
  readonly terminal: boolean;
  readonly invitationStatus: string;
  readonly invitationIsLive: boolean;
};

function invitationMessageId(invitationId: string): string {
  return `<studio-invitation.${invitationId}@networkcanvas.local>`;
}

const cut = (message: string): string => message.slice(0, MAX_ERROR_LENGTH);

export const invitationDelivery = (deps: InvitationDeliveryDeps) => {
  const publicBaseUrl = new URL(deps.publicBaseUrl);

  return Effect.fn('job.invitation-delivery')(function* (
    job: HandledJob<'invitation-delivery'>,
  ): Effect.fn.Return<
    JobOutcome,
    DeliveryAttemptFailed | SqlError.SqlError,
    MaintenanceDatabase | Mailer
  > {
    const { deliveryId } = job.payload;
    const mailer = yield* Mailer;

    const lockUnavailable = new DeliveryAttemptFailed({
      message: job.finalAttempt
        ? LOCK_HELD_ON_LAST_ATTEMPT
        : LOCK_HELD_ELSEWHERE,
    });

    // Counted inside the lock: an attempt refused the lock did no work.
    const counted = yield* Effect.exit(
      MaintenanceScope.open(
        Effect.gen(function* () {
          const { sql } = yield* Transaction;
          yield* sql`
            SELECT 1
              FROM team_invitation_deliveries d
              JOIN team_invitations i
                ON i.id = d.invitation_id AND i.team_id = d.team_id
             WHERE d.id = ${deliveryId}
               FOR UPDATE OF i NOWAIT`;
          const stamped = yield* sql<{ id: string }>`
            UPDATE team_invitation_deliveries
               SET attempt_count = ${job.attempt}
             WHERE id = ${deliveryId}
               AND ${sql.literal(STILL_PENDING)}
            RETURNING id`;
          return stamped.length;
        }),
      ),
    );

    if (Exit.isFailure(counted)) {
      if (isLockUnavailableCause(counted.cause)) return yield* lockUnavailable;
      return yield* Effect.failCause(counted.cause);
    }

    if (counted.value === 0) {
      const known = yield* MaintenanceScope.open(
        Effect.flatMap(
          Transaction,
          ({ sql }) =>
            sql<{
              id: string;
            }>`SELECT id FROM team_invitation_deliveries WHERE id = ${deliveryId}`,
        ),
      );
      yield* (
        known.length === 1
          ? Effect.logInfo('the delivery had already ended')
          : Effect.logInfo('no delivery row remains for this job')
      ).pipe(Effect.annotateLogs({ queue: QUEUE, job_id: job.id }));
      return 'completed';
    }

    const attempt = yield* Effect.exit(
      MaintenanceScope.open(
        Effect.gen(function* () {
          const { sql } = yield* Transaction;
          const locked = yield* sql<DeliverableRow>`
            SELECT d.invitation_id AS "invitationId",
                   d.email,
                   d.role,
                   d.team_label AS "teamLabel",
                   d.inviter_label AS "inviterLabel",
                   d.expires_at AS "expiresAt",
                   num_nonnulls(
                     d.sent_at, d.failed_at, d.suppressed_at, d.uncertain_at
                   ) > 0 AS terminal,
                   i.status AS "invitationStatus",
                   i.expires_at > clock_timestamp() AS "invitationIsLive"
              FROM team_invitation_deliveries d
              JOIN team_invitations i
                ON i.id = d.invitation_id AND i.team_id = d.team_id
             WHERE d.id = ${deliveryId}
               FOR UPDATE OF i NOWAIT`;

          const delivery = locked[0];
          if (delivery === undefined || delivery.terminal) {
            return { kind: 'settled', outcome: 'completed' } as const;
          }

          if (
            delivery.invitationStatus !== 'pending' ||
            !delivery.invitationIsLive
          ) {
            const reason =
              delivery.invitationStatus === 'pending'
                ? 'invitation expired'
                : 'invitation is no longer pending';
            yield* sql`
              UPDATE team_invitation_deliveries
                 SET suppressed_at = clock_timestamp(),
                     last_error = ${reason}
               WHERE id = ${deliveryId}
                 AND ${sql.literal(STILL_PENDING)}`;
            return { kind: 'settled', outcome: 'suppressed' } as const;
          }

          // Sent while the invitation lock is held, so a cancellation cannot slip in.
          const sent = yield* Effect.exit(
            mailer.sendTeamInvitation({
              email: Redacted.make(delivery.email),
              expiresAt: delivery.expiresAt,
              invitationUrl: Redacted.make(
                new URL(
                  `/invitations/${encodeURIComponent(delivery.invitationId)}`,
                  publicBaseUrl,
                ).toString(),
              ),
              inviterLabel: Redacted.make(delivery.inviterLabel),
              messageId: invitationMessageId(delivery.invitationId),
              role: delivery.role,
              teamLabel: Redacted.make(delivery.teamLabel),
            }),
          );

          if (Exit.isFailure(sent)) {
            const message = cut(
              failureMessage(sent.cause) ?? 'the mail transport failed',
            );
            // Written while the invitation is still held: only the attempt holding it may
            // write a terminal stamp.
            yield* sql`
              UPDATE team_invitation_deliveries
                 SET last_error = ${message},
                     failed_at = CASE
                       WHEN ${job.finalAttempt} THEN clock_timestamp() ELSE NULL
                     END
               WHERE id = ${deliveryId}
                 AND ${sql.literal(STILL_PENDING)}`;
            // Returned rather than failed, so this transaction commits the row above.
            return { kind: 'failed', message } as const;
          }

          const recorded = yield* sql<{ id: string }>`
            UPDATE team_invitation_deliveries
               SET sent_at = clock_timestamp(),
                   last_error = NULL
             WHERE id = ${deliveryId}
               AND ${sql.literal(STILL_PENDING)}
            RETURNING id`;

          if (recorded.length !== 1) {
            yield* sql`
              UPDATE team_invitation_deliveries
                 SET uncertain_at = clock_timestamp(),
                     last_error = ${ENDED_MID_SEND}
               WHERE id = ${deliveryId}
                 AND ${sql.literal(STILL_PENDING)}`;
            return { kind: 'settled', outcome: 'uncertain' } as const;
          }

          return { kind: 'settled', outcome: 'completed' } as const;
        }),
      ),
    );

    if (Exit.isFailure(attempt)) {
      if (isLockUnavailableCause(attempt.cause)) {
        return yield* lockUnavailable;
      }
      // Written from a fresh transaction, because the one holding the lock failed. SMTP
      // may already have the message, so failing would risk a second copy (#1305, #1307).
      const reason = cut(failureMessage(attempt.cause) ?? 'the attempt failed');
      yield* MaintenanceScope.open(
        Effect.flatMap(
          Transaction,
          ({ sql }) => sql`
            UPDATE team_invitation_deliveries
               SET uncertain_at = clock_timestamp(),
                   last_error = ${reason}
             WHERE id = ${deliveryId}
               AND ${sql.literal(STILL_PENDING)}`,
        ),
      );
      yield* Effect.logError(
        'the delivery attempt failed; its outcome is uncertain',
        attempt.cause,
      ).pipe(Effect.annotateLogs({ queue: QUEUE, job_id: job.id }));
      return 'uncertain';
    }

    if (attempt.value.kind === 'failed') {
      return yield* new DeliveryAttemptFailed({
        message: attempt.value.message,
      });
    }
    return attempt.value.outcome;
  });
};

const failureMessage = (cause: Cause.Cause<unknown>): string | undefined =>
  deepestMessage(causeError(cause));
