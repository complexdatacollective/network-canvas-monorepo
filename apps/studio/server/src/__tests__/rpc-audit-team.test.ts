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
} from './support/postgres.ts';
import { createRpcClient } from './support/rpc.ts';

const db = await reachableDb();

const PRINCIPAL: SessionPrincipal = {
  kind: 'user',
  userId: 'rpc-audit-owner-user',
  email: 'rpc-audit-owner@example.com',
  emailVerified: true,
  name: 'RPC Audit Owner',
  sessionId: 'rpc-audit-owner-session',
  activeTeamId: null,
};

describe.skipIf(!db)('audited team RPC', () => {
  let pool: pg.Pool;
  let dispose: () => Promise<void>;
  let membershipRole: string;
  let client: ReturnType<typeof createRpcClient>;

  beforeAll(async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    const scratch = await createScratchSchema(db);
    pool = scratch.pool;
    dispose = scratch.dispose;
    await provisionScratchSchema(pool);
    await seedTeam(pool, 'rpc-audit-team');
    await pool.query(
      `INSERT INTO "user" (id, name, email, "emailVerified") VALUES
         ($1, $2, $3, true),
         ('rpc-audit-member-user', 'RPC Audit Member', 'rpc-audit-member@example.com', true)`,
      [PRINCIPAL.userId, PRINCIPAL.name, PRINCIPAL.email],
    );
    await pool.query(
      `INSERT INTO team_members (id, team_id, user_id, role) VALUES
         ('rpc-audit-owner-member', 'rpc-audit-team', $1, 'owner'),
         ('rpc-audit-target-member', 'rpc-audit-team', 'rpc-audit-member-user', 'member')`,
      [PRINCIPAL.userId],
    );
    membershipRole = 'owner';
    const auth = stubAuthService({
      getSession: () => Promise.resolve(PRINCIPAL),
      getMembership: (_userId, teamId) =>
        Promise.resolve(
          teamId === 'rpc-audit-team' ? { role: membershipRole } : null,
        ),
    });
    client = createRpcClient(
      createApp(readEnv(), {
        auth,
        invitationDeliveryAvailable: true,
        pool: scratch.app,
      }),
    );
  });

  afterAll(async () => {
    await dispose();
  });

  it('routes role and invitation mutations through typed audited commands', async () => {
    await expect(
      client.team.updateMemberRole({
        teamId: 'rpc-audit-team',
        memberId: 'rpc-audit-target-member',
        role: 'admin',
      }),
    ).resolves.toEqual({
      memberId: 'rpc-audit-target-member',
      role: 'admin',
    });
    const invitation = await client.team.createInvitation({
      teamId: 'rpc-audit-team',
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
        teamId: 'rpc-audit-team',
        invitationId: invitation.invitationId,
      }),
    ).resolves.toEqual({
      invitationId: invitation.invitationId,
      status: 'canceled',
    });

    const events = await pool.query<{
      event_type: string;
      request_id: string;
    }>(
      `SELECT event_type, request_id::text
       FROM audit_events WHERE team_id = 'rpc-audit-team' ORDER BY sequence`,
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

  it('refuses to create invitations when this instance cannot deliver email', async () => {
    const env = readEnv();
    if (!env.auth) throw new Error('test auth environment is unavailable');
    const auth = stubAuthService({
      getSession: () => Promise.resolve(PRINCIPAL),
      getMembership: (_userId, teamId) =>
        Promise.resolve(teamId === 'rpc-audit-team' ? { role: 'owner' } : null),
    });
    const unavailableClient = createRpcClient(
      createApp(
        { ...env, auth: { ...env.auth, mailer: { kind: 'refuse' } } },
        { auth, invitationDeliveryAvailable: true, pool },
      ),
    );

    const { error } = await safe(
      unavailableClient.team.createInvitation({
        teamId: 'rpc-audit-team',
        email: 'cannot-deliver@example.com',
        role: 'member',
      }),
    );

    expect(error).toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(
      await pool.query(
        `SELECT id FROM team_invitations WHERE email = 'cannot-deliver@example.com'`,
      ),
    ).toHaveProperty('rowCount', 0);
  });

  it('refuses to queue an invitation when the runtime has no dispatcher', async () => {
    const auth = stubAuthService({
      getSession: () => Promise.resolve(PRINCIPAL),
      getMembership: (_userId, teamId) =>
        Promise.resolve(teamId === 'rpc-audit-team' ? { role: 'owner' } : null),
    });
    const serverlessClient = createRpcClient(
      createApp(readEnv(), {
        auth,
        invitationDeliveryAvailable: false,
        pool,
      }),
    );

    const { error } = await safe(
      serverlessClient.team.createInvitation({
        teamId: 'rpc-audit-team',
        email: 'undrainable@example.com',
        role: 'member',
      }),
    );

    expect(error).toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(
      await pool.query(
        `SELECT id FROM team_invitations WHERE email = 'undrainable@example.com'`,
      ),
    ).toHaveProperty('rowCount', 0);
  });

  it('lets the authenticated invitee accept without an existing membership', async () => {
    const invitationId = 'rpc-audit-accept-invitation';
    const invitee: SessionPrincipal = {
      kind: 'user',
      userId: 'rpc-audit-invitee-user',
      email: 'rpc-audit-invitee@example.com',
      emailVerified: true,
      name: 'RPC Audit Invitee',
      sessionId: 'rpc-audit-invitee-session',
      activeTeamId: null,
    };
    await pool.query(
      `INSERT INTO "user" (id, name, email, "emailVerified")
       VALUES ($1, $2, $3, true)`,
      [invitee.userId, invitee.name, invitee.email],
    );
    await pool.query(
      `INSERT INTO team_invitations (
         id, team_id, email, role, status, expires_at, inviter_id
       ) VALUES ($1, 'rpc-audit-team', $2, 'admin', 'pending',
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
      teamId: 'rpc-audit-team',
      role: 'admin',
      status: 'accepted',
    });
    const membership = await pool.query<{ role: string }>(
      `SELECT role FROM team_members
       WHERE team_id = 'rpc-audit-team' AND user_id = $1`,
      [invitee.userId],
    );
    expect(membership.rows).toEqual([{ role: 'admin' }]);
  });
});
