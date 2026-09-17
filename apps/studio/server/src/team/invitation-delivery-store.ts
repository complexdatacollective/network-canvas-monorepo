import { randomUUID } from 'node:crypto';

import { and, eq, sql } from 'drizzle-orm';
import { Effect } from 'effect';
import type { SqlError } from 'effect/unstable/sql';

import type { TeamRole } from '@codaco/studio-rpc';

import { sqlErrorsOnly } from '../db/errors.ts';
import { Transaction } from '../db/tenant.ts';
import { INVITATION_DELIVERY_TABLES } from './invitation-delivery-schema.ts';

const { invitationDeliveries } = INVITATION_DELIVERY_TABLES;

export type EnqueueInvitationDeliveryInput = {
  invitationId: string;
  teamId: string;
  email: string;
  role: TeamRole;
  teamLabel: string;
  inviterLabel: string;
  expiresAt: Date;
};

export type EnqueuedInvitationDelivery = {
  deliveryId: string;
  invitationId: string;
};

/**
 * The tolerance the two `expires_at` comparisons below are made under.
 *
 * `expires_at` is a `timestamptz`, which Postgres keeps to microseconds, and
 * the value a caller carries back in has been through a JavaScript `Date`,
 * which reaches milliseconds. An equality test would therefore fail on a row
 * the caller just wrote; a millisecond of tolerance is what closes that gap
 * without widening it to anything an attacker could aim at — two invitations
 * to the same address a millisecond apart do not exist, because the unique
 * index on `invitation_id` admits one row per invitation in the first place.
 */
const EXPIRY_TOLERANCE_SECONDS = 0.001;

/**
 * Adds delivery to the same transaction that creates the invitation and its
 * audit event.
 *
 * `INSERT … SELECT` rather than `INSERT … VALUES`: every column of the queued
 * payload is read out of the just-created invitation row under the predicate
 * below, so a caller cannot queue a different recipient, a different role or a
 * longer lifetime than the row it claims to be delivering. The label columns
 * are the only two the caller supplies, and they are the audit context the
 * combinator owns rather than anything the caller chose.
 *
 * The statement is raw because the builder has no path to `INSERT … SELECT`
 * with a correlated source: drizzle's insert takes values or a select, and the
 * predicate here has to compare the inserted columns against the very row it
 * is selecting from. It is the one hand-written statement in this module, and
 * it goes through the transaction's own `sql` client — same connection, same
 * commit — rather than through the builder.
 *
 * It reads back no timestamp: `expires_at` is written straight from the
 * invitation row, and the only instant that crosses the boundary is the
 * caller's bound `$8`, compared inside SQL. So the raw path's `timestamptz`
 * decoding (epoch milliseconds on rc.115) never applies here.
 */
export const enqueueInvitationDelivery: (
  input: EnqueueInvitationDeliveryInput,
) => Effect.Effect<EnqueuedInvitationDelivery, SqlError.SqlError, Transaction> =
  Effect.fn('team.store.enqueueInvitationDelivery')(function* (
    input: EnqueueInvitationDeliveryInput,
  ) {
    const { tx, sql: client } = yield* Transaction;
    const deliveryId = randomUUID();
    const inserted = yield* client.unsafe<EnqueuedInvitationDelivery>(
      `INSERT INTO team_invitation_deliveries (
       id, invitation_id, team_id, email, role, team_label, inviter_label,
       expires_at
     )
     SELECT $1, invitation.id, invitation.team_id, invitation.email,
            invitation.role, $6, $7, invitation.expires_at
       FROM team_invitations invitation
      WHERE invitation.id = $2
        AND invitation.team_id = $3
        AND lower(invitation.email) = lower($4)
        AND invitation.role = $5
        AND invitation.status = 'pending'
        AND invitation.expires_at > clock_timestamp()
        AND abs(extract(
              epoch FROM invitation.expires_at - $8::timestamptz
            )) < ${EXPIRY_TOLERANCE_SECONDS}
     ON CONFLICT (invitation_id) DO NOTHING
     RETURNING id AS "deliveryId", invitation_id AS "invitationId"`,
      [
        deliveryId,
        input.invitationId,
        input.teamId,
        input.email,
        input.role,
        input.teamLabel,
        input.inviterLabel,
        input.expiresAt,
      ],
    );
    const row = inserted[0];
    if (row !== undefined) return row;

    // `ON CONFLICT DO NOTHING` returns no row for two different reasons, and
    // only one of them is benign: a command retry meeting the already-durable
    // row it wrote last time, or an invitation that does not match the payload
    // at all. The re-read below tells them apart by checking every queued field,
    // so a retry is reusable and a mismatch is not.
    const existing = yield* tx
      .select({
        deliveryId: invitationDeliveries.id,
        invitationId: invitationDeliveries.invitationId,
      })
      .from(invitationDeliveries)
      .where(
        and(
          eq(invitationDeliveries.invitationId, input.invitationId),
          eq(invitationDeliveries.teamId, input.teamId),
          sql`lower(${invitationDeliveries.email}) = lower(${input.email})`,
          eq(invitationDeliveries.role, input.role),
          eq(invitationDeliveries.teamLabel, input.teamLabel),
          eq(invitationDeliveries.inviterLabel, input.inviterLabel),
          sql`abs(extract(
              epoch FROM ${invitationDeliveries.expiresAt}
                        - ${input.expiresAt}::timestamptz
            )) < ${EXPIRY_TOLERANCE_SECONDS}`,
        ),
      );
    const reused = existing[0];
    if (reused !== undefined) return reused;
    // Not a failure the caller could act on: it means the invitation this was
    // asked to deliver is not the row the command just wrote, which is a bug in
    // the command rather than a condition of the request.
    return yield* Effect.die(
      new Error(
        'invitation delivery enqueue did not match a live pending invitation',
      ),
    );
  }, sqlErrorsOnly);
