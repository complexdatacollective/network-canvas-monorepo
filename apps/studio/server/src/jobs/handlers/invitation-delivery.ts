import type pg from 'pg';
import type { PgBoss } from 'pg-boss';

import type { TeamRole } from '@codaco/studio-rpc';
import { InvitationDeliveryJobSchema } from '@codaco/studio-sync/jobs';

import { isLockUnavailableError } from '../../db/lock.ts';
import type { InvitationMailer } from '../../mail/mailer.ts';
import { logJobOutcome } from '../log.ts';
import type { HandledJob } from './job.ts';

// Sending a team invitation, as a job (#1895). The row in
// `team_invitation_deliveries` is the record — what was sent, to whom, and how
// it ended — and the queue owns everything the hand-written dispatcher used to:
// when an attempt runs, how many there are, and what happens after the last
// one. The handler runs as `studio_maintenance`, the only role that may
// advance a delivery's state.
//
// The invitation row is locked for the length of the send, which is what makes
// "no duplicate send" true: a second attempt asks for the same lock without
// waiting and gives up, and a cancellation that cannot get it is refused
// (src/team/commands.ts) rather than left racing an SMTP call.
//
// That lock is also what says who may write how a delivery ended: a terminal
// stamp — `sent_at`, `failed_at`, `suppressed_at`, `uncertain_at` — is written
// only by the attempt holding the invitation. An attempt that could not take
// it has no standing to say the delivery failed, because the holder may be
// about to succeed. There is exactly one exception and it is named where it
// happens: a send SMTP accepted whose own transaction then died.

const QUEUE = 'invitation-delivery';

/** The column the row's own record is kept in; a longer message is cut. */
const MAX_ERROR_LENGTH = 1_000;

/** An attempt that did not wait was refused; one behind it will try again. */
const LOCK_HELD_ELSEWHERE =
  'invitation row is locked by an earlier attempt or another command; retrying later';

/**
 * The last attempt was refused the invitation. Nothing runs behind this one,
 * so the line has to say that the row is not blank by oversight: it belongs to
 * whoever is holding it, and they record how the delivery ended.
 */
const LOCK_HELD_ON_LAST_ATTEMPT =
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

export type InvitationDeliveryHandlerDeps = {
  /** Pinned to the maintenance role; see src/jobs/worker.ts. */
  maintenancePool: pg.Pool;
  mailer: InvitationMailer;
  /** The browser-facing origin the invitation link is minted against. */
  publicBaseUrl: string;
};

type DeliverableRow = {
  invitationId: string;
  email: string;
  role: TeamRole;
  teamLabel: string;
  inviterLabel: string;
  expiresAt: Date;
  terminal: boolean;
  invitationStatus: string;
  invitationIsLive: boolean;
};

function invitationMessageId(invitationId: string): string {
  return `<studio-invitation.${invitationId}@networkcanvas.local>`;
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(
    0,
    MAX_ERROR_LENGTH,
  );
}

async function rollback(client: pg.PoolClient): Promise<void> {
  // A rollback that fails leaves the connection unusable rather than the
  // delivery wrong, and the caller is already reporting something worse.
  await client.query('ROLLBACK').catch(() => undefined);
}

export function createInvitationDeliveryHandler(
  deps: InvitationDeliveryHandlerDeps,
): (jobs: HandledJob[]) => Promise<void> {
  const publicBaseUrl = new URL(deps.publicBaseUrl);

  const deliver = async (job: HandledJob): Promise<void> => {
    // pg-boss counts retries from zero; the row counts attempts from one.
    const attempt = job.retryCount + 1;
    const finalAttempt = job.retryCount >= job.retryLimit;
    const record = (
      outcome: Parameters<typeof logJobOutcome>[0]['outcome'],
      error?: unknown,
    ) =>
      logJobOutcome({ queue: QUEUE, jobId: job.id, outcome, attempt, error });

    let deliveryId: string;
    try {
      // Parsed rather than cast, as in handlers/sign-in-email.ts: `data` is
      // whatever JSON the job row holds, and the enqueue path validating it on
      // the way in says nothing about a row written by an older release or by
      // hand. Without this an absent `deliveryId` would reach `WHERE id = $1`
      // as null and the handler would report the delivery already settled.
      ({ deliveryId } = InvitationDeliveryJobSchema.parse(job.data));
    } catch (error) {
      record(finalAttempt ? 'failed' : 'retrying', error);
      throw error;
    }

    /**
     * The row's half of an attempt that failed. `last_error` every time, and
     * `failed_at` only on the attempt pg-boss will not retry — which is what
     * makes the row and the dead-letter copy agree about how the delivery
     * ended. Takes the transaction's client, not the pool: `failed_at` is a
     * terminal stamp, so it is written while this attempt still holds the
     * invitation.
     */
    const recordFailure = (
      client: pg.PoolClient,
      error: unknown,
    ): Promise<unknown> =>
      client.query(
        `UPDATE team_invitation_deliveries
            SET last_error = $2,
                failed_at = CASE
                  WHEN $3::boolean THEN clock_timestamp() ELSE NULL
                END
          WHERE id = $1
            AND ${STILL_PENDING}`,
        [deliveryId, errorMessage(error), finalAttempt],
      );

    /**
     * The invitation could not be taken: an earlier attempt still inside its
     * SMTP call, or a command holding the row. No attempt waits — waiting would
     * sit behind another attempt's whole SMTP call and then send a second copy
     * of the same mail — and nothing is written. Whoever holds the invitation
     * is the one entitled to record how the delivery ended, and on the last
     * attempt they still are: this attempt dead-letters with the row pending,
     * which is exactly its state, and the line above says so at error level.
     */
    const lockUnavailable = (): Error => {
      const refused = new Error(
        finalAttempt ? LOCK_HELD_ON_LAST_ATTEMPT : LOCK_HELD_ELSEWHERE,
      );
      record(finalAttempt ? 'failed' : 'retrying', refused);
      return refused;
    };

    /**
     * SMTP has accepted the message and the row has to say so. Terminal for
     * automatic dispatch (#1305, #1307): another attempt could duplicate the
     * mail, so the job completes and a person decides. `STILL_PENDING` is what
     * makes it safe to run from a pool connection as well as from inside the
     * send's transaction — an outcome already recorded is left standing.
     */
    const stampUncertain = (
      executor: pg.Pool | pg.PoolClient,
      reason: string,
    ): Promise<unknown> =>
      executor.query(
        `UPDATE team_invitation_deliveries
            SET uncertain_at = clock_timestamp(),
                last_error = $2
          WHERE id = $1
            AND ${STILL_PENDING}`,
        [deliveryId, reason.slice(0, MAX_ERROR_LENGTH)],
      );

    const client = await deps.maintenancePool.connect();
    try {
      // Two transactions on one connection. The first takes the invitation
      // lock and counts the attempt; the second takes it again for the send.
      // Counting is inside the lock rather than ahead of it because an attempt
      // refused the lock did no work: a send that outlived the job's expiry
      // would otherwise have every retry behind it stamp a number and give up,
      // spending the ladder on refusals while `last_error` stayed empty.
      await client.query('BEGIN');
      try {
        await client.query(
          `SELECT 1
             FROM team_invitation_deliveries d
             JOIN team_invitations i
               ON i.id = d.invitation_id AND i.team_id = d.team_id
            WHERE d.id = $1
              FOR UPDATE OF i NOWAIT`,
          [deliveryId],
        );
      } catch (error) {
        await rollback(client);
        if (!isLockUnavailableError(error)) throw error;
        throw lockUnavailable();
      }

      let stamped;
      try {
        // Committed before the send, so a process that dies mid-send still
        // leaves the attempt counted — which is what the claim did when this
        // was a lease. It is also how "there is nothing to do" is learned.
        stamped = await client.query(
          `UPDATE team_invitation_deliveries
              SET attempt_count = $2
            WHERE id = $1
              AND ${STILL_PENDING}`,
          [deliveryId, attempt],
        );
        await client.query('COMMIT');
      } catch (error) {
        await rollback(client);
        throw error;
      }
      if (stamped.rowCount === 0) {
        const known = await client.query(
          `SELECT 1 FROM team_invitation_deliveries WHERE id = $1`,
          [deliveryId],
        );
        // Both are ordinary: a delivery settles once and its job may still be
        // retried behind it, and an invitation deleted with its team takes the
        // row with it while the job outlives both.
        record(
          'completed',
          known.rowCount === 1
            ? 'the delivery had already ended'
            : 'no delivery row remains for this job',
        );
        return;
      }

      await client.query('BEGIN');

      let locked;
      try {
        // `FOR UPDATE OF i` locks the invitation and not the delivery: the
        // delivery's own writes are short, and the invitation is what a
        // cancellation contends for. Taken again because the lock above ended
        // with the transaction that counted the attempt, and taken the same
        // way: without waiting.
        locked = await client.query<DeliverableRow>(
          `SELECT d.invitation_id AS "invitationId",
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
            WHERE d.id = $1
              FOR UPDATE OF i NOWAIT`,
          [deliveryId],
        );
      } catch (error) {
        await rollback(client);
        if (!isLockUnavailableError(error)) throw error;
        // Taken between the two transactions, by a cancellation or by an
        // attempt this one overtook.
        throw lockUnavailable();
      }

      const delivery = locked.rows[0];
      if (!delivery || delivery.terminal) {
        await client.query('COMMIT');
        record(
          'completed',
          delivery
            ? 'the delivery ended while this attempt was starting'
            : 'no delivery row remains for this job',
        );
        return;
      }

      if (
        delivery.invitationStatus !== 'pending' ||
        !delivery.invitationIsLive
      ) {
        // The wording the dispatcher used, because this is the same finding:
        // the invitation stopped being deliverable before the send.
        const reason =
          delivery.invitationStatus === 'pending'
            ? 'invitation expired'
            : 'invitation is no longer pending';
        await client.query(
          `UPDATE team_invitation_deliveries
              SET suppressed_at = clock_timestamp(),
                  last_error = $2
            WHERE id = $1
              AND ${STILL_PENDING}`,
          [deliveryId, reason],
        );
        await client.query('COMMIT');
        record('suppressed', reason);
        return;
      }

      try {
        // Sent while the invitation lock is held, so a cancellation cannot
        // slip in between the check above and the message going out.
        await deps.mailer.sendTeamInvitation({
          email: delivery.email,
          expiresAt: delivery.expiresAt,
          invitationUrl: new URL(
            `/invitations/${encodeURIComponent(delivery.invitationId)}`,
            publicBaseUrl,
          ).toString(),
          inviterLabel: delivery.inviterLabel,
          messageId: invitationMessageId(delivery.invitationId),
          role: delivery.role,
          teamLabel: delivery.teamLabel,
        });
      } catch (error) {
        // Written inside the send's own transaction, while the invitation is
        // still held: `failed_at` is a terminal stamp, and only the attempt
        // holding the invitation may write one. The send has already returned,
        // so what the lock is held for now is a single statement and a commit.
        try {
          await recordFailure(client, error);
          await client.query('COMMIT');
        } catch (unrecorded) {
          // Two things failed and an operator needs both lines: the row could
          // not be told how this attempt ended, which leaves it pending —
          // which is what it is, the rollback having undone nothing else.
          await rollback(client);
          record(finalAttempt ? 'failed' : 'retrying', unrecorded);
        }
        record(finalAttempt ? 'failed' : 'retrying', error);
        // pg-boss retries, or fails the job and copies it to the dead letter
        // queue. Stamping `failed_at` first is what makes the row and that
        // copy agree about the last attempt.
        throw error;
      }

      let recorded: number | null;
      try {
        const sent = await client.query(
          `UPDATE team_invitation_deliveries
              SET sent_at = clock_timestamp(),
                  last_error = NULL
            WHERE id = $1
              AND ${STILL_PENDING}`,
          [deliveryId],
        );
        recorded = sent.rowCount;
        if (recorded !== 1) {
          // The mail is gone and the row says something else ended it. Nothing
          // can un-send it, so it is recorded the way an uncommitted send is:
          // terminal, and never retried. From inside this transaction, because
          // `uncertain_at` is a terminal stamp like any other and the
          // invitation is still held — `STILL_PENDING` then leaves whatever
          // outcome is already on the row standing.
          await stampUncertain(client, ENDED_MID_SEND);
        }
        await client.query('COMMIT');
      } catch (error) {
        await rollback(client);
        // The one terminal stamp that cannot be written under the invitation
        // lock, because the transaction holding it is the thing that failed.
        // SMTP has the message either way, so the row has to say so from a
        // fresh connection; rethrowing instead would hand the job back to
        // pg-boss and risk a second copy (#1305, #1307). Its own try, so a
        // failure to record `uncertain` is not swallowed by the code that
        // exists to record it.
        try {
          await stampUncertain(deps.maintenancePool, errorMessage(error));
        } catch (unrecorded) {
          record('uncertain', unrecorded);
          throw unrecorded;
        }
        record('uncertain', errorMessage(error));
        return;
      }
      record(
        recorded === 1 ? 'completed' : 'uncertain',
        recorded === 1 ? undefined : ENDED_MID_SEND,
      );
    } finally {
      client.release();
    }
  };

  // pg-boss always hands its handler an array; the registration below asks for
  // one job at a time, so this loop runs once. It is a loop rather than an
  // index because the contract is the array.
  return async (jobs) => {
    for (const job of jobs) await deliver(job);
  };
}

/**
 * The worker's registration. Kept beside the handler so the options that make
 * the handler's assumptions true — one job at a time, with the retry metadata
 * it counts attempts from — cannot drift away from it.
 */
export function registerInvitationDelivery(
  boss: PgBoss,
  deps: InvitationDeliveryHandlerDeps,
  options: { pollingIntervalSeconds?: number } = {},
): Promise<string> {
  return boss.work(
    QUEUE,
    {
      batchSize: 1,
      includeMetadata: true,
      // Polling is the fallback behind LISTEN/NOTIFY, so the cadence is the
      // worker's to choose; the tests turn it up to prove the notification
      // path is what delivers.
      pollingIntervalSeconds: options.pollingIntervalSeconds ?? 2,
    },
    createInvitationDeliveryHandler(deps),
  );
}
