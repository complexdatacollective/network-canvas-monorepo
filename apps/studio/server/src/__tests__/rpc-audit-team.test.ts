import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  MemberId,
  TeamId,
  TeamInvitationId,
} from '@codaco/studio-contract/schema/ids';

import { createStudio } from '../app.ts';
import type { SessionPrincipal } from '../auth/service.ts';
import { readEnv } from '../env.ts';
import { stubAuthService } from './support/auth.ts';
import {
  insertTeam,
  openTestDatabase,
  ownerAffected,
  ownerRows,
  type TestDatabaseRuntime,
  testDb,
  uniqueTeamId,
} from './support/database.ts';
import {
  createRpcClient,
  expectRpcFailure,
  type RpcTestClient,
} from './support/rpc.ts';

const TEAM_ID = TeamId.make(uniqueTeamId('rpc-audit-team'));

const PRINCIPAL: SessionPrincipal = {
  kind: 'user',
  userId: 'rpc-audit-owner-user',
  email: 'rpc-audit-owner@example.com',
  emailVerified: true,
  name: 'RPC Audit Owner',
  locale: null,
  sessionId: 'rpc-audit-owner-session',
};

describe.skipIf(!testDb)('audited team RPC', () => {
  let database: TestDatabaseRuntime;
  let membershipRole: string;
  let client: RpcTestClient;
  let inviteeClients: RpcTestClient[];

  beforeAll(async () => {
    database = await openTestDatabase();
    await database.run(insertTeam(TEAM_ID));
    await database.run(
      ownerAffected(
        `INSERT INTO "user" (id, name, email, "emailVerified") VALUES
           ($1, $2, $3, true),
           ('rpc-audit-member-user', 'RPC Audit Member', 'rpc-audit-member@example.com', true)`,
        [PRINCIPAL.userId, PRINCIPAL.name, PRINCIPAL.email],
      ),
    );
    await database.run(
      ownerAffected(
        `INSERT INTO team_members (id, team_id, user_id, role) VALUES
           ('rpc-audit-owner-member', '${TEAM_ID}', $1, 'owner'),
           ('rpc-audit-target-member', '${TEAM_ID}', 'rpc-audit-member-user', 'member')`,
        [PRINCIPAL.userId],
      ),
    );
    membershipRole = 'owner';
    const auth = stubAuthService({
      getSession: () => Promise.resolve(PRINCIPAL),
      getMembership: (_userId, teamId) =>
        Promise.resolve(teamId === TEAM_ID ? { role: membershipRole } : null),
    });
    inviteeClients = [];
    client = await createRpcClient(
      createStudio(readEnv(), {
        auth,
        pool: database.appPool,
        // What the web process hands the router: creating an invitation queues
        // its delivery in the same transaction (#1895).
        services: database.services,
      }),
    );
  });

  afterAll(async () => {
    await client.dispose();
    for (const invitee of inviteeClients) await invitee.dispose();
    await database.dispose();
  });

  it('routes role and invitation mutations through typed audited commands', async () => {
    await expect(
      client.call(
        client.rpc('team.updateMemberRole', {
          teamId: TEAM_ID,
          memberId: MemberId.make('rpc-audit-target-member'),
          role: 'admin',
        }),
      ),
    ).resolves.toEqual({
      memberId: 'rpc-audit-target-member',
      role: 'admin',
    });
    const invitation = await client.call(
      client.rpc('team.createInvitation', {
        teamId: TEAM_ID,
        email: 'rpc-invitee@example.com',
        role: 'member',
      }),
    );
    expect(invitation).toMatchObject({
      email: 'rpc-invitee@example.com',
      role: 'member',
      status: 'pending',
    });
    await expect(
      client.call(
        client.rpc('team.cancelInvitation', {
          teamId: TEAM_ID,
          invitationId: invitation.invitationId,
        }),
      ),
    ).resolves.toEqual({
      invitationId: invitation.invitationId,
      status: 'canceled',
    });

    const queued = await database.run(
      ownerRows<{ queue: string; payload: unknown }>(
        `select job.queue, job.payload
         from ${database.harness.jobSchema}.jobs job
         join team_invitation_deliveries delivery
           on delivery.id = (job.payload->>'deliveryId')::uuid
         where delivery.invitation_id = $1`,
        [invitation.invitationId],
      ),
    );
    // Exactly one, carrying the delivery id alone: the command's transaction
    // creates the invitation, its delivery row and its job together.
    expect(queued).toHaveLength(1);
    expect(queued[0]?.queue).toBe('invitation-delivery');

    const events = await database.run(
      ownerRows<{ event_type: string; request_id: string }>(
        `SELECT event_type, request_id::text
         FROM audit_events WHERE team_id = '${TEAM_ID}' ORDER BY sequence`,
      ),
    );
    expect(events.map(({ event_type }) => event_type)).toEqual([
      'team.member.role_changed',
      'team.invitation.created',
      'team.invitation.cancelled',
    ]);
    expect(new Set(events.map(({ request_id }) => request_id)).size).toBe(3);
    for (const { request_id } of events) {
      expect(request_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    }
  });

  it('still refuses a non-member before opening a team transaction', async () => {
    await expectRpcFailure(
      client.callExit(
        client.rpc('team.createInvitation', {
          teamId: TeamId.make('unknown-team'),
          email: 'blocked@example.com',
          role: 'member',
        }),
      ),
      'Forbidden',
    );
  });

  it('lets the authenticated invitee accept without an existing membership', async () => {
    const invitationId = TeamInvitationId.make('rpc-audit-accept-invitation');
    const invitee: SessionPrincipal = {
      kind: 'user',
      userId: 'rpc-audit-invitee-user',
      email: 'rpc-audit-invitee@example.com',
      emailVerified: true,
      name: 'RPC Audit Invitee',
      locale: null,
      sessionId: 'rpc-audit-invitee-session',
    };
    await database.run(
      ownerAffected(
        `INSERT INTO "user" (id, name, email, "emailVerified")
         VALUES ($1, $2, $3, true)`,
        [invitee.userId, invitee.name, invitee.email],
      ),
    );
    await database.run(
      ownerAffected(
        `INSERT INTO team_invitations (
           id, team_id, email, role, status, expires_at, inviter_id
         ) VALUES ($1, '${TEAM_ID}', $2, 'admin', 'pending',
                   CURRENT_TIMESTAMP + INTERVAL '1 day', $3)`,
        [invitationId, invitee.email, PRINCIPAL.userId],
      ),
    );
    const inviteeAuth = stubAuthService({
      getSession: () => Promise.resolve(invitee),
      getMembership: () => Promise.resolve(null),
    });
    const inviteeClient = await createRpcClient(
      createStudio(readEnv(), {
        auth: inviteeAuth,
        pool: database.appPool,
        services: database.services,
      }),
    );
    inviteeClients.push(inviteeClient);

    await expect(
      inviteeClient.call(
        inviteeClient.rpc('team.acceptInvitation', { invitationId }),
      ),
    ).resolves.toMatchObject({
      invitationId,
      teamId: TEAM_ID,
      role: 'admin',
      status: 'accepted',
    });
    const membership = await database.run(
      ownerRows<{ role: string }>(
        `SELECT role FROM team_members
         WHERE team_id = '${TEAM_ID}' AND user_id = $1`,
        [invitee.userId],
      ),
    );
    expect(membership).toEqual([{ role: 'admin' }]);
  });
});
