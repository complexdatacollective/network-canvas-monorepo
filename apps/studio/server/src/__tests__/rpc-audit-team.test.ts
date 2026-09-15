import { safe } from '@orpc/client';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../app.ts';
import type { SessionPrincipal } from '../auth/service.ts';
import { readEnv } from '../env.ts';
import { stubAuthService } from './support/auth.ts';
import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
  seedTeam,
  uniqueTeamId,
} from './support/postgres.ts';
import { createRpcClient } from './support/rpc.ts';

const TEAM_ID = uniqueTeamId('rpc-audit-team');

const db = await reachableDb();

const PRINCIPAL: SessionPrincipal = {
  kind: 'user',
  userId: 'rpc-audit-owner-user',
  email: 'rpc-audit-owner@example.com',
  emailVerified: true,
  name: 'RPC Audit Owner',
  locale: null,
  sessionId: 'rpc-audit-owner-session',
};

describe.skipIf(!db)('audited team RPC', () => {
  let pool: pg.Pool;
  let jobSchema: string;
  let dispose: () => Promise<void>;
  let membershipRole: string;
  let client: ReturnType<typeof createRpcClient>;

  beforeAll(async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    const scratch = await createScratchSchema(db);
    pool = scratch.pool;
    jobSchema = scratch.jobSchema;
    dispose = scratch.dispose;
    await provisionScratchSchema(pool);
    await seedTeam(pool, TEAM_ID);
    await pool.query(
      `INSERT INTO "user" (id, name, email, "emailVerified") VALUES
         ($1, $2, $3, true),
         ('rpc-audit-member-user', 'RPC Audit Member', 'rpc-audit-member@example.com', true)`,
      [PRINCIPAL.userId, PRINCIPAL.name, PRINCIPAL.email],
    );
    await pool.query(
      `INSERT INTO team_members (id, team_id, user_id, role) VALUES
         ('rpc-audit-owner-member', '${TEAM_ID}', $1, 'owner'),
         ('rpc-audit-target-member', '${TEAM_ID}', 'rpc-audit-member-user', 'member')`,
      [PRINCIPAL.userId],
    );
    membershipRole = 'owner';
    const auth = stubAuthService({
      getSession: () => Promise.resolve(PRINCIPAL),
      getMembership: (_userId, teamId) =>
        Promise.resolve(teamId === TEAM_ID ? { role: membershipRole } : null),
    });
    client = createRpcClient(
      createApp(readEnv(), {
        auth,
        pool: scratch.app,
        // What the web process hands the router: creating an invitation queues
        // its delivery in the same transaction (#1895).
        jobs: await scratch.createJobClient(),
      }),
    );
  });

  afterAll(async () => {
    await dispose();
  });

  it('routes role and invitation mutations through typed audited commands', async () => {
    await expect(
      client.team.updateMemberRole({
        teamId: TEAM_ID,
        memberId: 'rpc-audit-target-member',
        role: 'admin',
      }),
    ).resolves.toEqual({
      memberId: 'rpc-audit-target-member',
      role: 'admin',
    });
    const invitation = await client.team.createInvitation({
      teamId: TEAM_ID,
      email: 'rpc-invitee@example.com',
      role: 'member',
    });
    expect(invitation).toMatchObject({
      email: 'rpc-invitee@example.com',
      role: 'member',
      status: 'pending',
    });
    await expect(
      client.team.cancelInvitation({
        teamId: TEAM_ID,
        invitationId: invitation.invitationId,
      }),
    ).resolves.toEqual({
      invitationId: invitation.invitationId,
      status: 'canceled',
    });

    const queued = await pool.query<{ name: string; data: unknown }>(
      `select job.name, job.data
       from ${jobSchema}.job_common job
       join team_invitation_deliveries delivery
         on delivery.id = (job.data->>'deliveryId')::uuid
       where delivery.invitation_id = $1`,
      [invitation.invitationId],
    );
    // Exactly one, carrying the delivery id alone: the command's transaction
    // creates the invitation, its delivery row and its job together.
    expect(queued.rows).toHaveLength(1);
    expect(queued.rows[0]?.name).toBe('invitation-delivery');

    const events = await pool.query<{
      event_type: string;
      request_id: string;
    }>(
      `SELECT event_type, request_id::text
       FROM audit_events WHERE team_id = '${TEAM_ID}' ORDER BY sequence`,
    );
    expect(events.rows.map(({ event_type }) => event_type)).toEqual([
      'team.member.role_changed',
      'team.invitation.created',
      'team.invitation.cancelled',
    ]);
    expect(new Set(events.rows.map(({ request_id }) => request_id)).size).toBe(
      3,
    );
    for (const { request_id } of events.rows) {
      expect(request_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    }
  });

  it('still refuses a non-member before opening a team transaction', async () => {
    const { error } = await safe(
      client.team.createInvitation({
        teamId: 'unknown-team',
        email: 'blocked@example.com',
        role: 'member',
      }),
    );
    expect(error).toMatchObject({ code: 'FORBIDDEN' });
  });

  it('lets the authenticated invitee accept without an existing membership', async () => {
    const invitationId = 'rpc-audit-accept-invitation';
    const invitee: SessionPrincipal = {
      kind: 'user',
      userId: 'rpc-audit-invitee-user',
      email: 'rpc-audit-invitee@example.com',
      emailVerified: true,
      name: 'RPC Audit Invitee',
      locale: null,
      sessionId: 'rpc-audit-invitee-session',
    };
    await pool.query(
      `INSERT INTO "user" (id, name, email, "emailVerified")
       VALUES ($1, $2, $3, true)`,
      [invitee.userId, invitee.name, invitee.email],
    );
    await pool.query(
      `INSERT INTO team_invitations (
         id, team_id, email, role, status, expires_at, inviter_id
       ) VALUES ($1, '${TEAM_ID}', $2, 'admin', 'pending',
                 CURRENT_TIMESTAMP + INTERVAL '1 day', $3)`,
      [invitationId, invitee.email, PRINCIPAL.userId],
    );
    const inviteeAuth = stubAuthService({
      getSession: () => Promise.resolve(invitee),
      getMembership: () => Promise.resolve(null),
    });
    const inviteeClient = createRpcClient(
      createApp(readEnv(), { auth: inviteeAuth, pool }),
    );

    await expect(
      inviteeClient.team.acceptInvitation({ invitationId }),
    ).resolves.toMatchObject({
      invitationId,
      teamId: TEAM_ID,
      role: 'admin',
      status: 'accepted',
    });
    const membership = await pool.query<{ role: string }>(
      `SELECT role FROM team_members
       WHERE team_id = '${TEAM_ID}' AND user_id = $1`,
      [invitee.userId],
    );
    expect(membership.rows).toEqual([{ role: 'admin' }]);
  });
});
