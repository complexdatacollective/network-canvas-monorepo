import { randomUUID } from 'node:crypto';

import { and, eq, sql } from 'drizzle-orm';
import { Effect } from 'effect';
import type { SqlError } from 'effect/unstable/sql';

import type { TeamRole } from '@codaco/studio-rpc';

import { AUTH_TABLES } from '../db/auth-schema.ts';
import { sqlErrorsOnly } from '../db/errors.ts';
import { Transaction } from '../db/tenant.ts';
import { INVITATION_DELIVERY_TABLES } from './invitation-delivery-schema.ts';

const { invitationDeliveries } = INVITATION_DELIVERY_TABLES;
const { team_invitations: invitations } = AUTH_TABLES;

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
 * `.returning()` is what tells a queued row from a refused one: `ON CONFLICT
 * DO NOTHING` and a predicate that matches no invitation both write nothing,
 * and without it the builder answers with the driver's result object either
 * way.
 */
export const enqueueInvitationDelivery: (
  input: EnqueueInvitationDeliveryInput,
) => Effect.Effect<EnqueuedInvitationDelivery, SqlError.SqlError, Transaction> =
  Effect.fn('team.store.enqueueInvitationDelivery')(function* (
    input: EnqueueInvitationDeliveryInput,
  ) {
    const { tx } = yield* Transaction;
    const deliveryId = randomUUID();
    const inserted = yield* tx
      .insert(invitationDeliveries)
      .select((query) =>
        query
          .select({
            id: sql`${deliveryId}::uuid`.as('id'),
            invitationId: invitations.id,
            teamId: invitations.team_id,
            email: invitations.email,
            role: sql<string>`${invitations.role}`.as('role'),
            teamLabel: sql`${input.teamLabel}::text`.as('team_label'),
            inviterLabel: sql`${input.inviterLabel}::text`.as('inviter_label'),
            expiresAt: invitations.expires_at,
          })
          .from(invitations)
          .where(
            and(
              eq(invitations.id, input.invitationId),
              eq(invitations.team_id, input.teamId),
              sql`lower(${invitations.email}) = lower(${input.email})`,
              eq(invitations.role, input.role),
              eq(invitations.status, 'pending'),
              sql`${invitations.expires_at} > clock_timestamp()`,
              sql`abs(extract(
                  epoch FROM ${invitations.expires_at}
                            - ${input.expiresAt}::timestamptz
                )) < ${EXPIRY_TOLERANCE_SECONDS}`,
            ),
          ),
      )
      .onConflictDoNothing({ target: invitationDeliveries.invitationId })
      .returning({
        deliveryId: invitationDeliveries.id,
        invitationId: invitationDeliveries.invitationId,
      });
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
