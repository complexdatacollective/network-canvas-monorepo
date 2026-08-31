import type pg from 'pg';

import type { TeamRole } from '@codaco/studio-rpc';

export type LockedMember = {
  id: string;
  userId: string;
  role: string;
  name: string;
  email: string;
};

export type TeamInvitation = {
  id: string;
  email: string;
  role: string | null;
  status: string;
  expiresAt: Date;
};

export type LockedTeamInvitation = TeamInvitation & {
  isLive: boolean;
};

export type LockedMembershipSet = {
  count: number;
  existing: LockedMember | null;
};

export class TeamStore {
  async findInvitationTeamId(
    pool: pg.Pool,
    invitationId: string,
  ): Promise<string | null> {
    const rows = await pool.query<{ teamId: string }>(
      `SELECT team_id AS "teamId"
       FROM team_invitations
       WHERE id = $1`,
      [invitationId],
    );
    return rows.rows[0]?.teamId ?? null;
  }

  async lockActorAndTarget(
    client: pg.PoolClient,
    input: { teamId: string; actorUserId: string; targetMemberId: string },
  ): Promise<{ actor: LockedMember | null; target: LockedMember | null }> {
    const rows = await client.query<LockedMember>(
      `SELECT m.id, m.user_id AS "userId", m.role, u.name, u.email
       FROM team_members m
       JOIN "user" u ON u.id = m.user_id
       WHERE m.team_id = $1 AND (m.user_id = $2 OR m.id = $3)
       ORDER BY m.id
       FOR UPDATE OF m`,
      [input.teamId, input.actorUserId, input.targetMemberId],
    );
    return {
      actor:
        rows.rows.find((member) => member.userId === input.actorUserId) ?? null,
      target:
        rows.rows.find((member) => member.id === input.targetMemberId) ?? null,
    };
  }

  async lockActor(
    client: pg.PoolClient,
    teamId: string,
    actorUserId: string,
  ): Promise<LockedMember | null> {
    const rows = await client.query<LockedMember>(
      `SELECT m.id, m.user_id AS "userId", m.role, u.name, u.email
       FROM team_members m
       JOIN "user" u ON u.id = m.user_id
       WHERE m.team_id = $1 AND m.user_id = $2
       FOR UPDATE OF m`,
      [teamId, actorUserId],
    );
    return rows.rows[0] ?? null;
  }

  async countLockedOwners(
    client: pg.PoolClient,
    teamId: string,
  ): Promise<number> {
    const rows = await client.query<{ id: string }>(
      `SELECT id
       FROM team_members
       WHERE team_id = $1
         AND regexp_split_to_array(replace(role, ' ', ''), ',') @> ARRAY['owner']::text[]
       ORDER BY id
       FOR UPDATE`,
      [teamId],
    );
    return rows.rowCount ?? 0;
  }

  async updateMemberRole(
    client: pg.PoolClient,
    input: { teamId: string; memberId: string; role: TeamRole },
  ): Promise<void> {
    const updated = await client.query(
      `UPDATE team_members SET role = $3 WHERE team_id = $1 AND id = $2`,
      [input.teamId, input.memberId, input.role],
    );
    if (updated.rowCount !== 1) {
      throw new Error('locked team member disappeared before update');
    }
  }

  async hasMemberWithEmail(
    client: pg.PoolClient,
    teamId: string,
    email: string,
  ): Promise<boolean> {
    const member = await client.query(
      `SELECT 1
       FROM team_members m
       JOIN "user" u ON u.id = m.user_id
       WHERE m.team_id = $1 AND lower(u.email) = $2
       LIMIT 1`,
      [teamId, email],
    );
    return member.rowCount === 1;
  }

  async hasLivePendingInvitation(
    client: pg.PoolClient,
    teamId: string,
    email: string,
  ): Promise<boolean> {
    const invitation = await client.query(
      `SELECT 1
       FROM team_invitations
       WHERE team_id = $1 AND lower(email) = $2 AND status = 'pending'
         AND expires_at > clock_timestamp()
       LIMIT 1`,
      [teamId, email],
    );
    return invitation.rowCount === 1;
  }

  async countLivePendingInvitations(
    client: pg.PoolClient,
    teamId: string,
  ): Promise<number> {
    const rows = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count
       FROM team_invitations
       WHERE team_id = $1 AND status = 'pending'
         AND expires_at > clock_timestamp()`,
      [teamId],
    );
    return rows.rows[0]?.count ?? 0;
  }

  async createInvitation(
    client: pg.PoolClient,
    input: {
      id: string;
      teamId: string;
      email: string;
      role: TeamRole;
      inviterId: string;
    },
  ): Promise<TeamInvitation> {
    const inserted = await client.query<TeamInvitation>(
      `INSERT INTO team_invitations (
         id, team_id, email, role, status, expires_at, inviter_id
       ) VALUES ($1, $2, $3, $4, 'pending', clock_timestamp() + INTERVAL '48 hours', $5)
       RETURNING id, email, role, status, expires_at AS "expiresAt"`,
      [input.id, input.teamId, input.email, input.role, input.inviterId],
    );
    const row = inserted.rows[0];
    if (!row) throw new Error('invitation insert returned no row');
    return row;
  }

  async lockInvitation(
    client: pg.PoolClient,
    teamId: string,
    invitationId: string,
  ): Promise<LockedTeamInvitation | null> {
    const rows = await client.query<LockedTeamInvitation>(
      `SELECT id, email, role, status, expires_at AS "expiresAt",
              expires_at > clock_timestamp() AS "isLive"
       FROM team_invitations
       WHERE team_id = $1 AND id = $2
       FOR UPDATE`,
      [teamId, invitationId],
    );
    return rows.rows[0] ?? null;
  }

  async lockMembershipSet(
    client: pg.PoolClient,
    teamId: string,
    userId: string,
  ): Promise<LockedMembershipSet> {
    const rows = await client.query<LockedMember>(
      `SELECT m.id, m.user_id AS "userId", m.role, u.name, u.email
       FROM team_members m
       JOIN "user" u ON u.id = m.user_id
       WHERE m.team_id = $1
       ORDER BY m.id
       FOR UPDATE OF m`,
      [teamId],
    );
    return {
      count: rows.rowCount ?? 0,
      existing: rows.rows.find((member) => member.userId === userId) ?? null,
    };
  }

  async createMember(
    client: pg.PoolClient,
    input: {
      id: string;
      teamId: string;
      userId: string;
      role: TeamRole;
    },
  ): Promise<void> {
    await client.query(
      `INSERT INTO team_members (id, team_id, user_id, role)
       VALUES ($1, $2, $3, $4)`,
      [input.id, input.teamId, input.userId, input.role],
    );
  }

  async acceptInvitation(
    client: pg.PoolClient,
    teamId: string,
    invitationId: string,
  ): Promise<void> {
    const updated = await client.query(
      `UPDATE team_invitations SET status = 'accepted'
       WHERE team_id = $1 AND id = $2 AND status = 'pending'`,
      [teamId, invitationId],
    );
    if (updated.rowCount !== 1) {
      throw new Error('locked invitation disappeared before acceptance');
    }
  }

  async cancelInvitation(
    client: pg.PoolClient,
    teamId: string,
    invitationId: string,
  ): Promise<void> {
    const updated = await client.query(
      `UPDATE team_invitations SET status = 'canceled'
       WHERE team_id = $1 AND id = $2 AND status = 'pending'`,
      [teamId, invitationId],
    );
    if (updated.rowCount !== 1) {
      throw new Error('locked invitation disappeared before cancellation');
    }
  }
}
