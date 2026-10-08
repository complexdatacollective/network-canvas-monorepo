import { randomUUID } from 'node:crypto';

import { and, eq, sql } from 'drizzle-orm';
import { Effect, Redacted } from 'effect';
import type { SqlError } from 'effect/sql';

import type { TeamRole } from '@codaco/studio-contract/schema/team';

import { AUTH_TABLES } from '../db/auth-schema.ts';
import { sqlErrorsOnly } from '../db/errors.ts';
import { Transaction } from '../db/tenant.ts';
import { INVITATION_DELIVERY_TABLES } from './invitation-delivery-schema.ts';

const { invitationDeliveries } = INVITATION_DELIVERY_TABLES;
const { team_invitations: invitations } = AUTH_TABLES;

export type EnqueueInvitationDeliveryInput = {
  invitationId: string;
  teamId: string;
  email: Redacted.Redacted;
  role: TeamRole;
  teamLabel: Redacted.Redacted;
  inviterLabel: Redacted.Redacted;
  expiresAt: Date;
};

export type EnqueuedInvitationDelivery = {
  deliveryId: string;
  invitationId: string;
};

/**
 * `timestamptz` keeps microseconds and a JavaScript `Date` milliseconds, so
 * an equality test would fail on a row the caller just wrote.
 */
const EXPIRY_TOLERANCE_SECONDS = 0.001;

/**
 * `INSERT … SELECT`: every queued column is read out of the invitation row, so
 * a caller cannot queue a different recipient, role or lifetime.
 */
export const enqueueInvitationDelivery: (
  input: EnqueueInvitationDeliveryInput,
) => Effect.Effect<EnqueuedInvitationDelivery, SqlError.SqlError, Transaction> =
  Effect.fn('team.store.enqueueInvitationDelivery')(function* (
    input: EnqueueInvitationDeliveryInput,
  ) {
    const { tx } = yield* Transaction;
    const deliveryId = randomUUID();
    const email = Redacted.value(input.email);
    const teamLabel = Redacted.value(input.teamLabel);
    const inviterLabel = Redacted.value(input.inviterLabel);
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
            teamLabel: sql`${teamLabel}::text`.as('team_label'),
            inviterLabel: sql`${inviterLabel}::text`.as('inviter_label'),
            expiresAt: invitations.expires_at,
          })
          .from(invitations)
          .where(
            and(
              eq(invitations.id, input.invitationId),
              eq(invitations.team_id, input.teamId),
              sql`lower(${invitations.email}) = lower(${email})`,
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
          sql`lower(${invitationDeliveries.email}) = lower(${email})`,
          eq(invitationDeliveries.role, input.role),
          eq(invitationDeliveries.teamLabel, teamLabel),
          eq(invitationDeliveries.inviterLabel, inviterLabel),
          sql`abs(extract(
              epoch FROM ${invitationDeliveries.expiresAt}
                        - ${input.expiresAt}::timestamptz
            )) < ${EXPIRY_TOLERANCE_SECONDS}`,
        ),
      );
    const reused = existing[0];
    if (reused !== undefined) return reused;
    return yield* Effect.die(
      new Error(
        'invitation delivery enqueue did not match a live pending invitation',
      ),
    );
  }, sqlErrorsOnly);
