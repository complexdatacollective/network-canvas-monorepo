import { randomUUID } from 'node:crypto';

import type pg from 'pg';

import type { TeamRole } from '@codaco/studio-rpc';

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
 * Adds delivery to the same transaction that creates the invitation and its
 * audit event. The immutable payload is checked against the just-created
 * invitation row, so a caller cannot queue a different recipient or role.
 */
export async function enqueueInvitationDelivery(
  client: pg.PoolClient,
  input: EnqueueInvitationDeliveryInput,
): Promise<EnqueuedInvitationDelivery> {
  const deliveryId = randomUUID();
  const inserted = await client.query<EnqueuedInvitationDelivery>(
    `INSERT INTO team_invitation_deliveries (
       id, invitation_id, team_id, email, role, team_label, inviter_label, expires_at
     )
     SELECT $1, invitation.id, invitation.team_id, invitation.email,
            invitation.role, $6, $7, invitation.expires_at
     FROM team_invitations invitation
     WHERE invitation.id = $2
       AND invitation.team_id = $3
       AND lower(invitation.email) = lower($4)
       AND invitation.role = $5
       AND invitation.status = 'pending'
       AND invitation.expires_at > statement_timestamp()
       AND abs(extract(epoch FROM invitation.expires_at - $8::timestamptz)) < 0.001
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
  const row = inserted.rows[0];
  if (row) return row;

  // A command retry may legitimately encounter the already-durable row. It
  // is reusable only when every queued payload field still matches.
  const existing = await client.query<EnqueuedInvitationDelivery>(
    `SELECT id AS "deliveryId", invitation_id AS "invitationId"
     FROM team_invitation_deliveries
     WHERE invitation_id = $1
       AND team_id = $2
       AND lower(email) = lower($3)
       AND role = $4
       AND team_label = $5
       AND inviter_label = $6
       AND abs(extract(epoch FROM expires_at - $7::timestamptz)) < 0.001`,
    [
      input.invitationId,
      input.teamId,
      input.email,
      input.role,
      input.teamLabel,
      input.inviterLabel,
      input.expiresAt,
    ],
  );
  if (existing.rows[0]) return existing.rows[0];
  throw new Error(
    'invitation delivery enqueue did not match a live pending invitation',
  );
}
