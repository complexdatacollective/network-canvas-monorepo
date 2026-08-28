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
    client = createRpcClient(createApp(readEnv(), { auth, pool: scratch.app }));
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
});
