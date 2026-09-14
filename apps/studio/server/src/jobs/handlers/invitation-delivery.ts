import type pg from 'pg';
import type { JobWithMetadata, PgBoss } from 'pg-boss';

import type { TeamRole } from '@codaco/studio-rpc';
import type { InvitationDeliveryJob } from '@codaco/studio-sync/jobs';

import type { InvitationMailer } from '../../auth/email.ts';
import { isLockUnavailableError } from '../../db/lock.ts';
import { logJobOutcome } from '../log.ts';

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

const QUEUE = 'invitation-delivery';

/** The column the row's own record is kept in; a longer message is cut. */
const MAX_ERROR_LENGTH = 1_000;

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

/**
 * What the handler reads off a job, taken from pg-boss's own metadata type so
 * that a renamed field fails the typecheck rather than a deployment. A test
 * fabricates one of these rather than a whole `JobWithMetadata`.
 */
export type InvitationDeliveryJobView = Pick<
  JobWithMetadata<InvitationDeliveryJob>,
  'id' | 'data' | 'retryCount' | 'retryLimit'
>;

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
): (jobs: InvitationDeliveryJobView[]) => Promise<void> {
  const publicBaseUrl = new URL(deps.publicBaseUrl);

  const deliver = async (job: InvitationDeliveryJobView): Promise<void> => {
    const { deliveryId } = job.data;
    // pg-boss counts retries from zero; the row counts attempts from one.
    const attempt = job.retryCount + 1;
    const finalAttempt = job.retryCount >= job.retryLimit;
    const record = (
      outcome: Parameters<typeof logJobOutcome>[0]['outcome'],
      error?: unknown,
    ) =>
      logJobOutcome({ queue: QUEUE, jobId: job.id, outcome, attempt, error });

    // Before anything else, and on its own transaction: a process that dies
    // mid-send still leaves the attempt counted, which is what the claim did
    // when this was a lease. It is also how "there is nothing to do" is
    // learned without taking a lock.
    const stamped = await deps.maintenancePool.query(
      `UPDATE team_invitation_deliveries
          SET attempt_count = $2
        WHERE id = $1
          AND ${STILL_PENDING}`,
      [deliveryId, attempt],
    );
    if (stamped.rowCount === 0) {
      const known = await deps.maintenancePool.query(
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

    /**
     * SMTP has accepted the message and Studio could not record that it did.
     * Terminal for automatic dispatch (#1305, #1307): another attempt could
     * duplicate the mail, so the job completes and a person decides. Only a
     * failure to record even that is worth rethrowing.
     */
    const recordUncertain = async (reason: string): Promise<void> => {
      try {
        await deps.maintenancePool.query(
          `UPDATE team_invitation_deliveries
              SET uncertain_at = clock_timestamp(),
                  last_error = $2
            WHERE id = $1
              AND ${STILL_PENDING}`,
          [deliveryId, reason.slice(0, MAX_ERROR_LENGTH)],
        );
      } catch (error) {
        record('uncertain', error);
        throw error;
      }
      record('uncertain', reason);
    };

    const client = await deps.maintenancePool.connect();
    try {
      await client.query('BEGIN');

      let locked;
      try {
        // `FOR UPDATE OF i` locks the invitation and not the delivery: the
        // delivery's own writes are short, and the invitation is what a
        // cancellation contends for. NOWAIT because an attempt that waited
        // would sit behind another attempt's whole SMTP call and then send a
        // second copy of the same mail.
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
        // An earlier attempt of this job still owns the invitation. Nothing is
        // written to the row: that attempt is the one entitled to record how
        // it ended, and it may yet succeed.
        const inProgress = new Error(
          'delivery still in progress from an earlier attempt',
        );
        record(finalAttempt ? 'failed' : 'retrying', inProgress);
        throw inProgress;
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
        // The lock is released before the record is written, so a transport
        // that hung until the job expired does not keep the invitation locked
        // while this attempt tidies up.
        await rollback(client);
        await deps.maintenancePool.query(
          `UPDATE team_invitation_deliveries
              SET last_error = $2,
                  failed_at = CASE
                    WHEN $3::boolean THEN clock_timestamp() ELSE NULL
                  END
            WHERE id = $1
              AND ${STILL_PENDING}`,
          [deliveryId, errorMessage(error), finalAttempt],
        );
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
        await client.query('COMMIT');
        recorded = sent.rowCount;
      } catch (error) {
        // Narrow on purpose: only the write and its commit are guarded here,
        // so a failure to record `uncertain` is not caught by the handler that
        // exists to record it.
        await rollback(client);
        await recordUncertain(errorMessage(error));
        return;
      }
      if (recorded === 1) {
        record('completed');
        return;
      }
      // The mail is gone and the row says something else ended it. Nothing can
      // un-send it, so this is recorded the way an uncommitted send is:
      // terminal, and never retried.
      await recordUncertain(
        'the delivery had already ended when its send completed',
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
