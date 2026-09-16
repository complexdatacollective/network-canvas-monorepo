import type { Cause } from 'effect';
import { DateTime, Effect, Exit, Schema } from 'effect';
import type { SqlError } from 'effect/unstable/sql';

import type { TeamRole } from '@codaco/studio-rpc';

import { Mailer } from '../../../mail/mailer.ts';
import { type Database, Transaction, withTransaction } from '../database.ts';
import {
  causeError,
  deepestMessage,
  isLockUnavailableCause,
} from '../errors.ts';
import type { HandledJob, JobOutcome } from '../worker.ts';

// `invitation-delivery` as an Effect (#1927 §11): the same state machine
// src/jobs/handlers/invitation-delivery.ts runs today, with pg-boss's job
// metadata replaced by `HandledJob` and its two pool transactions replaced by
// two `withTransaction` calls on the maintenance `Database`.
//
// The transport is stage 1's `Mailer` (src/mail/mailer.ts), the one every
// other sender already uses: `sendTeamInvitation` fails with `MailFailed` when
// a transport refused the message and with `MailNotConfigured` when there is
// no transport at all. Neither is distinguished here — both mean this attempt
// did not send, and both carry a message an operator reads off the row.
//
// What the port did not change: the delivery row is still the record; the
// invitation is still locked `FOR UPDATE … NOWAIT` for the length of the send,
// which is what makes "no duplicate send" true; a terminal stamp is still
// written only by the attempt holding the invitation; and the one exception —
// a send SMTP accepted whose own transaction then died — is still recorded
// from outside that transaction.
//
// What the port did change, and had to:
//
//  - The outcome is a value, not the absence of a throw. `completed`,
//    `suppressed` and `uncertain` are returned; a failure is the error channel,
//    and `JobWorker` decides `retrying` or `failed` from the attempt counters.
//  - Recording a failure and then failing is the commit-then-fail shape of
//    §10: an `Effect` that fails inside `withTransaction` rolls the
//    transaction back, so the row's `last_error`/`failed_at` would be lost. The
//    exit is captured, the row is written, the transaction commits, and the
//    attempt fails outside it.

const QUEUE = 'invitation-delivery';

/** The column the row's own record is kept in; a longer message is cut. */
const MAX_ERROR_LENGTH = 1_000;

/** An attempt that did not wait was refused; one behind it will try again. */
export const LOCK_HELD_ELSEWHERE =
  'invitation row is locked by an earlier attempt or another command; retrying later';

/**
 * The last attempt was refused the invitation. Nothing runs behind this one,
 * so the line has to say that the row is not blank by oversight: it belongs to
 * whoever is holding it, and they record how the delivery ended.
 */
export const LOCK_HELD_ON_LAST_ATTEMPT =
  'invitation row is locked by an earlier attempt or another command on the last attempt; how this delivery ended is for the holder to record';

/** What a send that outlived the row it was for is recorded as. */
const ENDED_MID_SEND = 'the delivery had already ended when its send completed';

/**
 * A delivery that has not ended yet. Repeated in every statement that writes
 * an outcome so none of them can overwrite one that is already recorded —
 * `uncertain_at` above all, which exists to stop a second send.
 */
const STILL_PENDING = `sent_at IS NULL
     AND failed_at IS NULL
     AND suppressed_at IS NULL
     AND uncertain_at IS NULL`;

/** The delivery attempt itself failed and the queue should decide. */
export class DeliveryAttemptFailed extends Schema.TaggedError<DeliveryAttemptFailed>()(
  'DeliveryAttemptFailed',
  { message: Schema.String },
) {}

export type InvitationDeliveryDeps = {
  /** The browser-facing origin the invitation link is minted against. */
  readonly publicBaseUrl: string;
};

type DeliverableRow = {
  readonly invitationId: string;
  readonly email: string;
  readonly role: TeamRole;
  readonly teamLabel: string;
  readonly inviterLabel: string;
  /** rc.115 decodes `timestamptz` as epoch milliseconds. */
  readonly expiresAt: number;
  readonly terminal: boolean;
  readonly invitationStatus: string;
  readonly invitationIsLive: boolean;
};

function invitationMessageId(invitationId: string): string {
  return `<studio-invitation.${invitationId}@networkcanvas.local>`;
}

const cut = (message: string): string => message.slice(0, MAX_ERROR_LENGTH);

/**
 * The delivery handler. Takes the decoded payload the worker handed it, so
 * there is no parse here: `JobWorker.work` decodes against the queue's schema
 * before the handler sees a job, and a payload that will not decode never
 * reaches this code (§11).
 */
export const invitationDelivery = (deps: InvitationDeliveryDeps) => {
  const publicBaseUrl = new URL(deps.publicBaseUrl);

  return Effect.fn('job.invitation-delivery')(function* (
    job: HandledJob<'invitation-delivery'>,
  ): Effect.fn.Return<
    JobOutcome,
    DeliveryAttemptFailed | SqlError.SqlError,
    Database | Mailer
  > {
    const { deliveryId } = job.payload;
    const mailer = yield* Mailer;

    /**
     * The invitation could not be taken: an earlier attempt still inside its
     * SMTP call, or a command holding the row. No attempt waits — waiting
     * would sit behind another attempt's whole SMTP call and then send a
     * second copy of the same mail — and nothing is written.
     */
    const lockUnavailable = new DeliveryAttemptFailed({
      message: job.finalAttempt
        ? LOCK_HELD_ON_LAST_ATTEMPT
        : LOCK_HELD_ELSEWHERE,
    });

    // The first of two transactions: take the invitation, count the attempt,
    // commit. Counting is inside the lock rather than ahead of it because an
    // attempt refused the lock did no work — a send that outlived the job's
    // expiry would otherwise have every retry behind it stamp a number and
    // give up, spending the ladder on refusals while `last_error` stayed empty.
    const counted = yield* Effect.exit(
      withTransaction(
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
      // Both are ordinary: a delivery settles once and its job may still be
      // retried behind it, and an invitation deleted with its team takes the
      // row with it while the job outlives both.
      const known = yield* withTransaction(
        Effect.flatMap(
          Transaction,
          ({ sql }) =>
            sql<{
              id: string;
            }>`SELECT id FROM team_invitation_deliveries WHERE id = ${deliveryId}`,
        ),
      );
      yield* Effect.logInfo(
        `${QUEUE} ${job.id}: ${
          known.length === 1
            ? 'the delivery had already ended'
            : 'no delivery row remains for this job'
        }`,
      );
      return 'completed';
    }

    // The second transaction: take the invitation again — the first ended with
    // the commit that counted the attempt — and hold it for the send.
    const attempt = yield* Effect.exit(
      withTransaction(
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
            // The wording the dispatcher used, because this is the same
            // finding: the invitation stopped being deliverable before the
            // send.
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

          // Sent while the invitation lock is held, so a cancellation cannot
          // slip in between the check above and the message going out.
          const sent = yield* Effect.exit(
            mailer.sendTeamInvitation({
              email: delivery.email,
              expiresAt: DateTime.toDate(
                DateTime.makeUnsafe(delivery.expiresAt),
              ),
              invitationUrl: new URL(
                `/invitations/${encodeURIComponent(delivery.invitationId)}`,
                publicBaseUrl,
              ).toString(),
              inviterLabel: delivery.inviterLabel,
              messageId: invitationMessageId(delivery.invitationId),
              role: delivery.role,
              teamLabel: delivery.teamLabel,
            }),
          );

          if (Exit.isFailure(sent)) {
            const message = cut(
              failureMessage(sent.cause) ?? 'the mail transport failed',
            );
            // Written inside the send's own transaction, while the invitation
            // is still held: `failed_at` is a terminal stamp, and only the
            // attempt holding the invitation may write one. `last_error` every
            // time, `failed_at` only on the attempt the queue will not retry —
            // which is what makes the row and the dead-letter copy agree about
            // how the delivery ended.
            yield* sql`
              UPDATE team_invitation_deliveries
                 SET last_error = ${message},
                     failed_at = CASE
                       WHEN ${job.finalAttempt} THEN clock_timestamp() ELSE NULL
                     END
               WHERE id = ${deliveryId}
                 AND ${sql.literal(STILL_PENDING)}`;
            // Commit-then-fail: returned rather than failed, so this
            // transaction commits the row above. The attempt fails outside it.
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
            // The mail is gone and the row says something else ended it.
            // Nothing can un-send it, so it is recorded the way an uncommitted
            // send is: terminal, and never retried.
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
        // Taken between the two transactions, by a cancellation or by an
        // attempt this one overtook.
        return yield* lockUnavailable;
      }
      // The one terminal stamp that cannot be written under the invitation
      // lock, because the transaction holding it is the thing that failed.
      // SMTP may already have the message, so the row has to say so from a
      // fresh transaction; failing instead would hand the job back to the
      // queue and risk a second copy (#1305, #1307).
      const reason = cut(failureMessage(attempt.cause) ?? 'the attempt failed');
      yield* withTransaction(
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
      yield* Effect.logError(`${QUEUE} ${job.id}: uncertain — ${reason}`);
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

/** The message a failure carries, whichever reason it arrived as. */
const failureMessage = (cause: Cause.Cause<unknown>): string | undefined =>
  deepestMessage(causeError(cause));
