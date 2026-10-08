import { randomUUID } from 'node:crypto';

import { Cause, Effect, Exit, Option, Redacted } from 'effect';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  AuditEventId,
  DraftId,
  MemberId,
  ProtocolId,
  StudyId,
  TeamId,
  TeamInvitationId,
} from '@codaco/studio-contract/schema/ids';

import { createStudio } from '../app.ts';
import type { AuthService, SessionPrincipal } from '../auth/service.ts';
import { MaintenanceScope, OwnerScope, Transaction } from '../db/tenant.ts';
import { readEnv } from '../env.ts';
import { resolve } from '../env/resolve.ts';
import { issueBootstrapToken } from '../setup/bootstrap.ts';
import { authServiceStub } from './support/auth.ts';
import {
  insertTeam,
  openTestDatabase,
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
import {
  openRateLimitStore,
  reachableDeniedAuditStore,
} from './support/valkey.ts';

const env = readEnv();
const limiterStore = await reachableDeniedAuditStore();

const ACTOR_ID = `rpc-errors-${randomUUID()}`;
const PRINCIPAL: SessionPrincipal = {
  kind: 'user',
  userId: ACTOR_ID,
  email: Redacted.make(`${ACTOR_ID}@example.test`),
  emailVerified: true,
  name: Redacted.make('Refused Researcher'),
  locale: null,
  sessionId: `session-${ACTOR_ID}`,
};

const INSTANCE_NAME = 'Department of Refusals';
const owner = () => ({
  name: Redacted.make('First Owner'),
  email: Redacted.make(`owner-${randomUUID()}@example.test`),
  password: Redacted.make('first-owner-password'),
});

describe('refusals that need no database', () => {
  const disposals: (() => Promise<void>)[] = [];
  const track = async (client: Promise<RpcTestClient>) => {
    const settled = await client;
    disposals.push(settled.dispose);
    return settled;
  };
  afterAll(async () => {
    for (const dispose of disposals) await dispose();
  });

  it('refuses a caller with no session', async () => {
    const client = await track(
      createRpcClient(
        createStudio(resolve({ NODE_ENV: 'test' }), {
          auth: authServiceStub(),
        }),
      ),
    );

    await expectRpcFailure(
      client.callExit(
        client.rpc('studies.list', { teamId: TeamId.make('any-team') }),
      ),
      'Unauthorized',
    );
  });

  it('dies rather than refusing when the plane was wired without a database', async () => {
    const client = await track(
      createRpcClient(
        createStudio(resolve({ NODE_ENV: 'test' }), {
          auth: authServiceStub({
            getSession: () => Effect.succeedSome(PRINCIPAL),
            getMembership: () => Effect.succeedSome({ role: 'admin' }),
          }),
        }),
      ),
    );

    const exit = await client.callExit(
      client.rpc('studies.list', { teamId: TeamId.make('any-team') }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(Cause.hasDies(exit.cause)).toBe(true);
      expect(Cause.pretty(exit.cause)).toContain('without a database');
    }
  });

  it.skipIf(!limiterStore)(
    'refuses a spent invitation budget with the interval to wait',
    async () => {
      const invitationId = TeamInvitationId.make(randomUUID());
      const limits = await openRateLimitStore(env.redis);
      disposals.push(limits.dispose);
      const client = await track(
        createRpcClient(
          createStudio(
            resolve({
              NODE_ENV: 'test',
              ...(env.redis ? { REDIS_URL: env.redis } : {}),
            }),
            {
              auth: authServiceStub({
                getSession: () => Effect.succeedSome(PRINCIPAL),
              }),
              limiter: limits.limiter({
                invitation_accept: { max: 1, windowMs: 60_000 },
              }),
            },
          ),
        ),
      );

      const spent = await client.callExit(
        client.rpc('team.acceptInvitation', { invitationId }),
      );
      expect(Exit.isFailure(spent)).toBe(true);
      if (Exit.isFailure(spent)) {
        expect(Cause.hasDies(spent.cause)).toBe(true);
        expect(Cause.pretty(spent.cause)).toContain('without a database');
      }

      const refused = await expectRpcFailure(
        client.callExit(client.rpc('team.acceptInvitation', { invitationId })),
        'RateLimited',
      );
      expect(refused.retryAfterSeconds).toBeGreaterThan(0);
    },
  );
});

describe.skipIf(!testDb)('the error map', () => {
  let database: TestDatabaseRuntime;
  let client: RpcTestClient;
  const disposals: (() => Promise<void>)[] = [];
  const claimed: Record<string, { role: string }> = {};

  async function seedTeamFor(roles: {
    row?: string | null;
    claimed?: string | null;
  }): Promise<TeamId> {
    const teamId = uniqueTeamId('rpc-errors');
    await database.run(insertTeam(teamId));
    if (roles.row) {
      await database.run(
        ownerRows(
          `INSERT INTO team_members (id, team_id, user_id, role) VALUES ($1, $2, $3, $4)`,
          [`${teamId}-actor`, teamId, PRINCIPAL.userId, roles.row],
        ),
      );
    }
    if (roles.claimed) claimed[teamId] = { role: roles.claimed };
    return TeamId.make(teamId);
  }

  async function seedMember(
    teamId: string,
    role: string,
  ): Promise<{ memberId: MemberId; userId: string }> {
    const userId = `member-${randomUUID()}`;
    const memberId = `${teamId}-target`;
    await database.run(
      ownerRows(
        `INSERT INTO "user" (id, name, email, "emailVerified") VALUES ($1, $2, $3, true)`,
        [userId, 'Target Researcher', `${userId}@example.test`],
      ),
    );
    await database.run(
      ownerRows(
        `INSERT INTO team_members (id, team_id, user_id, role) VALUES ($1, $2, $3, $4)`,
        [memberId, teamId, userId, role],
      ),
    );
    return { memberId: MemberId.make(memberId), userId };
  }

  async function seedPendingInvitation(
    teamId: string,
    email: string,
  ): Promise<TeamInvitationId> {
    const invitationId = randomUUID();
    await database.run(
      ownerRows(
        `INSERT INTO team_invitations (id, team_id, email, role, status, expires_at, inviter_id)
         VALUES ($1, $2, $3, 'member', 'pending', $4, $5)`,
        [
          invitationId,
          teamId,
          email,
          new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
          PRINCIPAL.userId,
        ],
      ),
    );
    return TeamInvitationId.make(invitationId);
  }

  async function clientAs(
    auth: Partial<AuthService['Service']>,
  ): Promise<RpcTestClient> {
    const settled = await createRpcClient(
      createStudio(env, {
        auth: authServiceStub(auth),
        services: database.services,
      }),
    );
    disposals.push(settled.dispose);
    return settled;
  }

  beforeAll(async () => {
    database = await openTestDatabase();
    await database.run(
      ownerRows(
        `INSERT INTO "user" (id, name, email, "emailVerified") VALUES ($1, $2, $3, true)`,
        [
          PRINCIPAL.userId,
          Redacted.value(PRINCIPAL.name),
          Redacted.value(PRINCIPAL.email),
        ],
      ),
    );
    client = await clientAs({
      getSession: () => Effect.succeedSome(PRINCIPAL),
      getMembership: (_userId, teamId) =>
        Effect.succeed(Option.fromNullishOr(claimed[teamId])),
      listMemberships: () =>
        Effect.succeed(
          Object.entries(claimed).map(([teamId, membership]) => ({
            teamId,
            role: membership.role,
          })),
        ),
    });
  });

  afterAll(async () => {
    for (const dispose of disposals) await dispose();
    await database.dispose();
  });

  it('refuses a team the caller is not in, and an unknown team, identically', async () => {
    const notMine = await seedTeamFor({ row: null, claimed: null });

    await expectRpcFailure(
      client.callExit(client.rpc('studies.list', { teamId: notMine })),
      'Forbidden',
    );
    await expectRpcFailure(
      client.callExit(
        client.rpc('studies.list', { teamId: TeamId.make('no-such-team') }),
      ),
      'Forbidden',
    );
  });

  it('carries an invitation token it cannot place out as the command code', async () => {
    const refused = await expectRpcFailure(
      client.callExit(
        client.rpc('team.acceptInvitation', {
          invitationId: TeamInvitationId.make(randomUUID()),
        }),
      ),
      'TeamCommandError',
    );
    expect(refused.code).toBe('FORBIDDEN');
  });

  it('refuses an audit read the caller may not make', async () => {
    const teamId = await seedTeamFor({ row: 'member', claimed: 'member' });

    await expectRpcFailure(
      client.callExit(client.rpc('audit.list', { teamId })),
      'Forbidden',
    );
  });

  it('reports a team row that went away under an audited command as not found', async () => {
    const teamId = uniqueTeamId('rpc-errors-gone');
    claimed[teamId] = { role: 'admin' };

    await expectRpcFailure(
      client.callExit(
        client.rpc('team.updateMemberRole', {
          teamId: TeamId.make(teamId),
          memberId: MemberId.make('any-member'),
          role: 'member',
        }),
      ),
      'NotFound',
    );
  });

  it('reports an audit event that is not there as not found', async () => {
    const teamId = await seedTeamFor({ row: 'admin', claimed: 'admin' });

    await expectRpcFailure(
      client.callExit(
        client.rpc('audit.get', {
          teamId,
          eventId: AuditEventId.make(randomUUID()),
        }),
      ),
      'NotFound',
    );
  });

  it('reports a locale write with no user row left as not found', async () => {
    const orphan = await clientAs({
      getSession: () =>
        Effect.succeedSome({
          ...PRINCIPAL,
          userId: `deleted-${randomUUID()}`,
        }),
    });

    await expectRpcFailure(
      orphan.callExit(orphan.rpc('account.updateLocale', { locale: null })),
      'NotFound',
    );
  });

  it('carries a conflicting invitation out as the command code', async () => {
    const teamId = await seedTeamFor({ row: 'admin', claimed: 'admin' });
    const email = `invitee-${randomUUID()}@example.test`;
    await seedPendingInvitation(teamId, email);

    const refused = await expectRpcFailure(
      client.callExit(
        client.rpc('team.createInvitation', {
          teamId,
          email: Redacted.make(email),
          role: 'member',
        }),
      ),
      'TeamCommandError',
    );
    expect(refused.code).toBe('CONFLICT');
  });

  it('carries a cancellation that raced a delivery out as its own code', async () => {
    const teamId = await seedTeamFor({ row: 'admin', claimed: 'admin' });
    const invitationId = await seedPendingInvitation(
      teamId,
      `held-${randomUUID()}@example.test`,
    );
    const held = await holdInvitation(database, invitationId);

    try {
      const refused = await expectRpcFailure(
        client.callExit(
          client.rpc('team.cancelInvitation', { teamId, invitationId }),
        ),
        'TeamCommandError',
      );
      expect(refused.code).toBe('DELIVERY_IN_PROGRESS');
    } finally {
      await held.release();
    }
  });

  it('names the domain refusal a team command fell through on', async () => {
    const teamId = await seedTeamFor({ row: 'owner', claimed: 'owner' });
    const target = await seedMember(teamId, 'member');

    const unchanged = await expectRpcFailure(
      client.callExit(
        client.rpc('team.updateMemberRole', {
          teamId,
          memberId: target.memberId,
          role: 'member',
        }),
      ),
      'TeamCommandError',
    );
    expect(unchanged.code).toBe('NO_CHANGE');

    const lastOwner = await expectRpcFailure(
      client.callExit(
        client.rpc('team.updateMemberRole', {
          teamId,
          memberId: MemberId.make(`${teamId}-actor`),
          role: 'admin',
        }),
      ),
      'TeamCommandError',
    );
    expect(lastOwner.code).toBe('LAST_OWNER');
  });

  it('carries a duplicate study id out as the study command code', async () => {
    const teamId = await seedTeamFor({ row: 'admin', claimed: 'admin' });
    const studyId = StudyId.make(randomUUID());
    await client.call(
      client.rpc('studies.create', {
        teamId,
        name: Redacted.make('The first study'),
        studyId,
        protocolId: ProtocolId.make(randomUUID()),
        draftId: DraftId.make(randomUUID()),
      }),
    );

    const refused = await expectRpcFailure(
      client.callExit(
        client.rpc('studies.create', {
          teamId,
          name: Redacted.make('A different study, the same id'),
          studyId,
          protocolId: ProtocolId.make(randomUUID()),
          draftId: DraftId.make(randomUUID()),
        }),
      ),
      'StudyCommandError',
    );
    expect(refused.code).toBe('CONFLICT');
  });

  it('carries a study creation the committed role does not allow out as the command code', async () => {
    const teamId = await seedTeamFor({ row: 'member', claimed: 'admin' });

    const refused = await expectRpcFailure(
      client.callExit(
        client.rpc('studies.create', {
          teamId,
          name: Redacted.make('A study this caller may not create'),
          studyId: StudyId.make(randomUUID()),
          protocolId: ProtocolId.make(randomUUID()),
          draftId: DraftId.make(randomUUID()),
        }),
      ),
      'StudyCommandError',
    );
    expect(refused.code).toBe('FORBIDDEN');
  });

  it('refuses a protocol line the committed role does not allow', async () => {
    const teamId = await seedTeamFor({ row: 'member', claimed: 'admin' });

    await expectRpcFailure(
      client.callExit(
        client.rpc('protocols.create', {
          teamId,
          name: Redacted.make('A line this caller may not make'),
          protocolId: ProtocolId.make(randomUUID()),
          draftId: DraftId.make(randomUUID()),
        }),
      ),
      'ProtocolAuthorizationError',
    );
  });

  describe('first-run setup', () => {
    let token: Redacted.Redacted;

    beforeEach(async () => {
      await database.run(ownerRows('delete from installation'));
      const issued = await database.run(OwnerScope.open(issueBootstrapToken()));
      if (issued.kind !== 'issued') throw new Error('expected a token');
      token = issued.token;
    });

    it('refuses a token it cannot match', async () => {
      await expectRpcFailure(
        client.callExit(
          client.rpc('setup.complete', {
            token: Redacted.make('not-the-token'),
            instanceName: INSTANCE_NAME,
            owner: owner(),
          }),
        ),
        'Unauthorized',
      );
    });

    it('reports an instance with nothing to set up as not found', async () => {
      await database.run(ownerRows('delete from installation'));

      await expectRpcFailure(
        client.callExit(
          client.rpc('setup.complete', {
            token,
            instanceName: INSTANCE_NAME,
            owner: owner(),
          }),
        ),
        'NotFound',
      );
    });

    it('says why an address it cannot adopt was refused', async () => {
      const taken = await clientAs({
        signUpEmail: () => Effect.succeed({ kind: 'emailTaken' }),
        signInEmail: () => Effect.succeed({ kind: 'refused' }),
      });

      const refused = await expectRpcFailure(
        taken.callExit(
          taken.rpc('setup.complete', {
            token,
            instanceName: INSTANCE_NAME,
            owner: owner(),
          }),
        ),
        'Conflict',
      );
      expect(refused.reason).toBe('emailTaken');
    });
  });
});

async function holdInvitation(
  database: TestDatabaseRuntime,
  invitationId: string,
): Promise<{ release: () => Promise<void> }> {
  let reportLocked: () => void = () => undefined;
  const locked = new Promise<void>((settle) => {
    reportLocked = settle;
  });
  let letGo: () => void = () => undefined;
  const released = new Promise<void>((settle) => {
    letGo = settle;
  });
  const holding = database.run(
    MaintenanceScope.open(
      Effect.gen(function* () {
        const { sql } = yield* Transaction;
        yield* sql.unsafe(
          `SELECT id FROM team_invitations WHERE id = $1 FOR UPDATE`,
          [invitationId],
        );
        reportLocked();
        yield* Effect.promise(() => released);
      }),
    ),
  );
  await Promise.race([locked, holding]);
  return {
    release: async () => {
      letGo();
      await holding.catch(() => undefined);
    },
  };
}
