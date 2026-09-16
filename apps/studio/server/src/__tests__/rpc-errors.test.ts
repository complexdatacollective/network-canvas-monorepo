// Every refusal the oRPC boundary used to spell as an `ORPCError` code, as the
// tagged error it is now — one case per row of the mapping table on #1930
// (slice plan S1 §6.1).
//
// The point of gathering them in one file is that the table is a contract with
// the client: a screen branches on `_tag`, and `TeamCommandError({ code })`
// carries the domain's own vocabulary rather than the transport's. A row proved
// only inside the suite that happens to exercise it would be a rule nobody could
// read off.
//
// Two rows deliberately changed meaning and are asserted as such: the
// `INTERNAL_SERVER_ERROR` rows are gone, because a plane wired without a
// database is a deployment bug and now dies rather than answering a typed error
// a client could act on; and `DELIVERY_IN_PROGRESS` is no longer flattened into
// `CONFLICT`.
import { randomUUID } from 'node:crypto';

import { Cause, Exit } from 'effect';
import type pg from 'pg';
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
import { readEnv } from '../env.ts';
import { resolve } from '../env/resolve.ts';
import { issueBootstrapToken } from '../setup/bootstrap.ts';
import { stubAuthService } from './support/auth.ts';
import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
  seedTeam,
  uniqueTeamId,
} from './support/postgres.ts';
import {
  createRpcClient,
  expectRpcFailure,
  type RpcTestClient,
} from './support/rpc.ts';
import { reachableDeniedAuditStore } from './support/valkey.ts';

const env = readEnv();
const db = await reachableDb();
/**
 * The process-wide store, not one of the scratch logical databases: the one
 * limiter case below counts against subjects that are fresh UUIDs, so it needs
 * no key space of its own — and taking one would mean flushing a database
 * another file is counting in. This probe answers whether `REDIS_URL` is
 * reachable and deliberately empties nothing.
 */
const limiterStore = await reachableDeniedAuditStore();

const ACTOR_ID = `rpc-errors-${randomUUID()}`;
const PRINCIPAL: SessionPrincipal = {
  kind: 'user',
  userId: ACTOR_ID,
  email: `${ACTOR_ID}@example.test`,
  emailVerified: true,
  name: 'Refused Researcher',
  locale: null,
  sessionId: `session-${ACTOR_ID}`,
};

const INSTANCE_NAME = 'Department of Refusals';
const owner = () => ({
  name: 'First Owner',
  email: `owner-${randomUUID()}@example.test`,
  password: 'first-owner-password',
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

  // §6.1 row 1: `UNAUTHORIZED` with no principal. It is not declared on any
  // procedure — it is the `Authenticated` middleware's own error, so it reaches
  // every authenticated procedure's client union automatically.
  it('refuses a caller with no session', async () => {
    const client = await track(
      createRpcClient(
        createStudio(resolve({ NODE_ENV: 'test' }), {
          auth: stubAuthService(),
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

  // §6.1's `INTERNAL_SERVER_ERROR` rows, which the table deletes. There is no
  // typed error for a plane with no database any more: a deployment that wired
  // one is broken, and a client must not be handed a refusal it could act on.
  it('dies rather than refusing when the plane was wired without a database', async () => {
    const client = await track(
      createRpcClient(
        createStudio(resolve({ NODE_ENV: 'test' }), {
          auth: stubAuthService({
            getSession: () => Promise.resolve(PRINCIPAL),
            getMembership: () => Promise.resolve({ role: 'admin' }),
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
      // The wiring defect itself, not some other death on the way to it.
      expect(Cause.pretty(exit.cause)).toContain('without a database pool');
    }
  });

  // §6.1's last row: `TOO_MANY_REQUESTS` + `data.retryAfter` becomes
  // `RateLimited({ retryAfterSeconds })`. The per-user and per-team scopes are
  // proved on an ordinary procedure in rpc-team.test.ts; this is the third
  // scope, `invitation_accept`, which is charged per invitation token before
  // anything is looked up — so a guessed token costs nothing to refuse, and the
  // refusal arrives before the database is asked for at all.
  it.skipIf(!limiterStore)(
    'refuses a spent invitation budget with the interval to wait',
    async () => {
      const invitationId = TeamInvitationId.make(randomUUID());
      const client = await track(
        createRpcClient(
          createStudio(
            resolve({
              NODE_ENV: 'test',
              ...(env.redis ? { REDIS_URL: env.redis } : {}),
            }),
            {
              auth: stubAuthService({
                getSession: () => Promise.resolve(PRINCIPAL),
              }),
              limits: { invitation_accept: { max: 1, windowMs: 60_000 } },
            },
          ),
        ),
      );

      // The first call spends the window and then dies on the absent pool; the
      // second never reaches it.
      const spent = await client.callExit(
        client.rpc('team.acceptInvitation', { invitationId }),
      );
      expect(Exit.isFailure(spent)).toBe(true);

      const refused = await expectRpcFailure(
        client.callExit(client.rpc('team.acceptInvitation', { invitationId })),
        'RateLimited',
      );
      expect(refused.retryAfterSeconds).toBeGreaterThan(0);
    },
  );
});

describe.skipIf(!db)('the error map', () => {
  let scratch: Awaited<ReturnType<typeof createScratchSchema>>;
  let client: RpcTestClient;
  const disposals: (() => Promise<void>)[] = [];
  /** What the session's team lookup answers, per team, for this file's actor. */
  const claimed: Record<string, { role: string }> = {};

  /**
   * A team whose membership row says one thing and whose session lookup says
   * another, which is the shape of every "locked membership lost the role" row:
   * the command re-reads the committed role inside its own transaction, so the
   * stale answer the caller was admitted on is not the one that decides.
   */
  async function seedTeamFor(roles: {
    row?: string | null;
    claimed?: string | null;
  }): Promise<TeamId> {
    const teamId = uniqueTeamId('rpc-errors');
    await seedTeam(scratch.pool, teamId);
    if (roles.row) {
      await scratch.pool.query(
        `INSERT INTO team_members (id, team_id, user_id, role) VALUES ($1, $2, $3, $4)`,
        [`${teamId}-actor`, teamId, PRINCIPAL.userId, roles.row],
      );
    }
    if (roles.claimed) claimed[teamId] = { role: roles.claimed };
    return TeamId.make(teamId);
  }

  /** A second member of a team, for the commands that address one. */
  async function seedMember(
    teamId: string,
    role: string,
  ): Promise<{ memberId: MemberId; userId: string }> {
    const userId = `member-${randomUUID()}`;
    const memberId = `${teamId}-target`;
    await scratch.pool.query(
      `INSERT INTO "user" (id, name, email, "emailVerified") VALUES ($1, $2, $3, true)`,
      [userId, 'Target Researcher', `${userId}@example.test`],
    );
    await scratch.pool.query(
      `INSERT INTO team_members (id, team_id, user_id, role) VALUES ($1, $2, $3, $4)`,
      [memberId, teamId, userId, role],
    );
    return { memberId: MemberId.make(memberId), userId };
  }

  async function seedPendingInvitation(
    teamId: string,
    email: string,
  ): Promise<TeamInvitationId> {
    const invitationId = randomUUID();
    await scratch.pool.query(
      `INSERT INTO team_invitations (id, team_id, email, role, status, expires_at, inviter_id)
       VALUES ($1, $2, $3, 'member', 'pending', $4, $5)`,
      [
        invitationId,
        teamId,
        email,
        new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        PRINCIPAL.userId,
      ],
    );
    return TeamInvitationId.make(invitationId);
  }

  /** A client whose session and memberships this case decides for itself. */
  async function clientAs(auth: Partial<AuthService>): Promise<RpcTestClient> {
    const settled = await createRpcClient(
      createStudio(env, { auth: stubAuthService(auth), pool: scratch.app }),
    );
    disposals.push(settled.dispose);
    return settled;
  }

  beforeAll(async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    scratch = await createScratchSchema(db);
    await provisionScratchSchema(scratch.pool);
    await scratch.pool.query(
      `INSERT INTO "user" (id, name, email, "emailVerified") VALUES ($1, $2, $3, true)`,
      [PRINCIPAL.userId, PRINCIPAL.name, PRINCIPAL.email],
    );
    client = await clientAs({
      getSession: () => Promise.resolve(PRINCIPAL),
      getMembership: (_userId, teamId) =>
        Promise.resolve(claimed[teamId] ?? null),
      listMemberships: () =>
        Promise.resolve(
          Object.entries(claimed).map(([teamId, membership]) => ({
            teamId,
            role: membership.role,
          })),
        ),
    });
  });

  afterAll(async () => {
    for (const dispose of disposals) await dispose();
    await scratch.dispose();
  });

  // §6.1 row 3: `FORBIDDEN` for a non-member, an unknown team, an unreachable
  // study or protocol. One answer for all of them, so the boundary is not an
  // existence oracle.
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

  // §6.1 row 4: an audit read the caller's committed role does not grant is the
  // same `Forbidden` as the plain denial — telling them apart would make the
  // audit log's own suppression observable from outside.
  it('refuses an audit read the caller may not make', async () => {
    const teamId = await seedTeamFor({ row: 'member', claimed: 'member' });

    await expectRpcFailure(
      client.callExit(client.rpc('audit.list', { teamId })),
      'Forbidden',
    );
  });

  // §6.1 row 5: `AuditCommandTeamNotFoundError` — the team row went away under
  // an audited command.
  it('reports a team row that went away under an audited command as not found', async () => {
    // Admitted by the session lookup, and there is no team row behind it: the
    // audited command locks the team and finds nothing.
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

  // §6.1 row 7: an event row that raced away between resolving the team and
  // reading it. (Its other half, `studies.counts`, cannot be produced without
  // racing a purge against a study `openStudy` has just resolved.)
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

  // §6.1 row 8: the user row went away under a locale write. A session can
  // outlive its user row only by a hard-delete race.
  it('reports a locale write with no user row left as not found', async () => {
    const orphan = await clientAs({
      getSession: () =>
        Promise.resolve({
          ...PRINCIPAL,
          userId: `deleted-${randomUUID()}`,
        }),
    });

    await expectRpcFailure(
      orphan.callExit(orphan.rpc('account.updateLocale', { locale: null })),
      'NotFound',
    );
  });

  // §6.1 row 9: `TeamCommandError({ code: 'CONFLICT' })`, where the oRPC
  // boundary said `CONFLICT` and no more.
  it('carries a conflicting invitation out as the command code', async () => {
    const teamId = await seedTeamFor({ row: 'admin', claimed: 'admin' });
    const email = `invitee-${randomUUID()}@example.test`;
    await seedPendingInvitation(teamId, email);

    const refused = await expectRpcFailure(
      client.callExit(
        client.rpc('team.createInvitation', { teamId, email, role: 'member' }),
      ),
      'TeamCommandError',
    );
    expect(refused.code).toBe('CONFLICT');
  });

  // §6.1 row 10, the row that changed: a cancellation that raced a delivery
  // holding the invitation `FOR UPDATE NOWAIT` is `DELIVERY_IN_PROGRESS` and
  // NOT `Conflict` — the caller can retry it, which a conflict does not say.
  it('carries a cancellation that raced a delivery out as its own code', async () => {
    const teamId = await seedTeamFor({ row: 'admin', claimed: 'admin' });
    const invitationId = await seedPendingInvitation(
      teamId,
      `held-${randomUUID()}@example.test`,
    );
    const held = await holdInvitation(scratch.maintenance, invitationId);

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

  // §6.1 row 11: the `BAD_REQUEST` fallthrough. `NO_CHANGE`, `LAST_OWNER` and
  // `INVALID_ROLE` all left as one transport code; each says which one it is
  // now.
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

    // The same procedure, a different refusal: the team's only owner cannot
    // demote themselves.
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

  // §6.1 row 12: a duplicate study id is `StudyCommandError({ code: 'CONFLICT' })`.
  it('carries a duplicate study id out as the study command code', async () => {
    const teamId = await seedTeamFor({ row: 'admin', claimed: 'admin' });
    const studyId = StudyId.make(randomUUID());
    await client.call(
      client.rpc('studies.create', {
        teamId,
        name: 'The first study',
        studyId,
        protocolId: ProtocolId.make(randomUUID()),
        draftId: DraftId.make(randomUUID()),
      }),
    );

    const refused = await expectRpcFailure(
      client.callExit(
        client.rpc('studies.create', {
          teamId,
          name: 'A different study, the same id',
          studyId,
          protocolId: ProtocolId.make(randomUUID()),
          draftId: DraftId.make(randomUUID()),
        }),
      ),
      'StudyCommandError',
    );
    expect(refused.code).toBe('CONFLICT');
  });

  // §6.1 row 13: a locked membership that lost the role is
  // `StudyCommandError({ code: 'FORBIDDEN' })`, not the shared `Forbidden` —
  // the refusal came from inside the command's transaction.
  it('carries a study creation the committed role does not allow out as the command code', async () => {
    const teamId = await seedTeamFor({ row: 'member', claimed: 'admin' });

    const refused = await expectRpcFailure(
      client.callExit(
        client.rpc('studies.create', {
          teamId,
          name: 'A study this caller may not create',
          studyId: StudyId.make(randomUUID()),
          protocolId: ProtocolId.make(randomUUID()),
          draftId: DraftId.make(randomUUID()),
        }),
      ),
      'StudyCommandError',
    );
    expect(refused.code).toBe('FORBIDDEN');
  });

  // §6.1 row 14: the protocol tier's own refusal, for the same window.
  it('refuses a protocol line the committed role does not allow', async () => {
    const teamId = await seedTeamFor({ row: 'member', claimed: 'admin' });

    await expectRpcFailure(
      client.callExit(
        client.rpc('protocols.create', {
          teamId,
          name: 'A line this caller may not make',
          protocolId: ProtocolId.make(randomUUID()),
          draftId: DraftId.make(randomUUID()),
        }),
      ),
      'ProtocolAuthorizationError',
    );
  });

  // §6.1 rows 2, 6 and 15, which all belong to the one public procedure.
  describe('first-run setup', () => {
    let token: string;

    beforeEach(async () => {
      await scratch.pool.query('delete from installation');
      const issued = await issueBootstrapToken(scratch.pool);
      if (issued.kind !== 'issued') throw new Error('expected a token');
      token = issued.token;
    });

    // Row 2: a wrong token and no token are one answer, and it says no more
    // than that.
    it('refuses a token it cannot match', async () => {
      await expectRpcFailure(
        client.callExit(
          client.rpc('setup.complete', {
            token: 'not-the-token',
            instanceName: INSTANCE_NAME,
            owner: owner(),
          }),
        ),
        'Unauthorized',
      );
    });

    // Row 6: an instance with no installation row at all is closed, exactly as
    // an owned one is — neither can be set up from here.
    it('reports an instance with nothing to set up as not found', async () => {
      await scratch.pool.query('delete from installation');

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

    // Row 15: an address whose password the caller cannot produce. The reason
    // is machine-readable now, where the boundary had only the CONFLICT code.
    it('says why an address it cannot adopt was refused', async () => {
      const taken = await clientAs({
        signUpEmail: () => Promise.resolve({ kind: 'emailTaken' }),
        signInEmail: () => Promise.resolve({ kind: 'refused' }),
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

/**
 * Holds an invitation row the way a delivery attempt inside its SMTP call holds
 * it, and hands back the means to let go. On the maintenance pool, because that
 * is the role a delivery attempt runs as.
 */
async function holdInvitation(
  pool: pg.Pool,
  invitationId: string,
): Promise<{ release: () => Promise<void> }> {
  const held = await pool.connect();
  await held.query('BEGIN');
  await held.query(`SELECT id FROM team_invitations WHERE id = $1 FOR UPDATE`, [
    invitationId,
  ]);
  return {
    release: async () => {
      await held.query('COMMIT').catch(() => undefined);
      held.release();
    },
  };
}
