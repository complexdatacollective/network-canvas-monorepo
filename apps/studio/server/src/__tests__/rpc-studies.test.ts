import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  DraftId,
  ProtocolId,
  StudyId,
  TeamId,
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
  maintenanceRows,
} from './support/database.ts';
import {
  createRpcClient,
  expectRpcFailure,
  type RpcTestClient,
} from './support/rpc.ts';

// The payloads are branded, so the ids are built through the contract's own
// schemas rather than passed as bare strings.
const TEAM_ID = TeamId.make(uniqueTeamId('rpc-studies-team'));
const OTHER_TEAM_ID = TeamId.make('rpc-studies-other-team');

type Researcher = {
  principal: SessionPrincipal;
  memberId: string;
  teamId: TeamId;
  role: string;
};

function researcher(slug: string, teamId: TeamId, role: string): Researcher {
  return {
    principal: {
      kind: 'user',
      userId: `rpc-studies-${slug}-user`,
      email: `rpc-studies-${slug}@example.com`,
      emailVerified: true,
      name: `RPC Studies ${slug}`,
      locale: null,
      sessionId: `rpc-studies-${slug}-session`,
    },
    memberId: `rpc-studies-${slug}-member`,
    teamId,
    role,
  };
}

/** The team Admin who creates studies, the Member who may not, and a
 * researcher in another team entirely — the three answers #1257's matrix
 * gives about one study. */
const ADMIN = researcher('admin', TEAM_ID, 'owner');
/** A second administrator of the same team, for the replay-by-another case. */
const SECOND_ADMIN = researcher('second-admin', TEAM_ID, 'admin');
const MEMBER = researcher('member', TEAM_ID, 'member');
const OUTSIDER = researcher('outsider', OTHER_TEAM_ID, 'owner');

describe.skipIf(!testDb)('the studies RPC', () => {
  /**
   * The scratch schema and the Effect data layer over it, which is what every
   * `/rpc` handler runs its reads and writes on. Shared by every Studio rather
   * than built per Studio: the clients underneath it are connection pools.
   */
  let database: TestDatabaseRuntime;
  let clients: Map<Researcher, RpcTestClient>;

  const asClient = (who: Researcher) => {
    const client = clients.get(who);
    if (!client) throw new Error(`no client for ${who.principal.userId}`);
    return client;
  };

  beforeAll(async () => {
    database = await openTestDatabase();
    await database.run(insertTeam(TEAM_ID));
    await database.run(insertTeam(OTHER_TEAM_ID));

    clients = new Map();
    for (const who of [ADMIN, SECOND_ADMIN, MEMBER, OUTSIDER]) {
      await database.run(
        ownerAffected(
          `INSERT INTO "user" (id, name, email, "emailVerified")
           VALUES ($1, $2, $3, true)`,
          [who.principal.userId, who.principal.name, who.principal.email],
        ),
      );
      await database.run(
        ownerAffected(
          `INSERT INTO team_members (id, team_id, user_id, role)
           VALUES ($1, $2, $3, $4)`,
          [who.memberId, who.teamId, who.principal.userId, who.role],
        ),
      );
      const auth = stubAuthService({
        getSession: () => Promise.resolve(who.principal),
        getMembership: (_userId, teamId) =>
          Promise.resolve(teamId === who.teamId ? { role: who.role } : null),
        listMemberships: () =>
          Promise.resolve([{ teamId: who.teamId, role: who.role }]),
      });
      clients.set(
        who,
        await createRpcClient(
          createStudio(readEnv(), {
            auth,
            pool: database.appPool,
            services: database.services,
          }),
        ),
      );
    }
  });

  afterAll(async () => {
    for (const client of clients.values()) await client.dispose();
    await database.dispose();
  });

  /** Fixture rows for a tenant table: the maintenance role is the one that
   * may write across teams without a pinned tenant. */
  const asMaintenance = (text: string, params: ReadonlyArray<unknown>) =>
    database.run(maintenanceRows(text, params));

  const grantStudyRole = (studyId: string, who: Researcher, role: string) =>
    asMaintenance(
      `INSERT INTO study_role_grants
         (id, team_id, study_id, user_id, role, granted_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        randomUUID(),
        who.teamId,
        studyId,
        who.principal.userId,
        role,
        ADMIN.principal.userId,
      ],
    );

  const ownerQuery = <A extends object = Record<string, unknown>>(
    text: string,
    params: ReadonlyArray<unknown>,
  ) => database.run(ownerRows<A>(text, params));

  const createStudy = async (name: string) => {
    const input = {
      teamId: TEAM_ID,
      studyId: StudyId.make(randomUUID()),
      protocolId: ProtocolId.make(randomUUID()),
      draftId: DraftId.make(randomUUID()),
      name,
    };
    await expect(
      asClient(ADMIN).call(asClient(ADMIN).rpc('studies.create', input)),
    ).resolves.toEqual({
      studyId: input.studyId,
      protocolId: input.protocolId,
      draftId: input.draftId,
    });
    return input;
  };

  it('creates the study, its protocol line, and the creator’s grant at once', async () => {
    const created = await createStudy('Audited study');

    expect(
      await ownerQuery(
        `SELECT name, state, participation_mode, protocol_id
         FROM studies WHERE id = $1 AND team_id = $2`,
        [created.studyId, TEAM_ID],
      ),
    ).toEqual([
      {
        name: 'Audited study',
        state: 'draft',
        participation_mode: 'managed',
        protocol_id: created.protocolId,
      },
    ]);
    // The protocol line exists and is editable: without it the study has
    // nothing for the editor to open.
    expect(
      await ownerQuery(
        `SELECT pd.draft_id FROM protocols p
         JOIN protocol_drafts pd
           ON pd.protocol_id = p.id AND pd.team_id = p.team_id
         WHERE p.id = $1 AND p.team_id = $2`,
        [created.protocolId, TEAM_ID],
      ),
    ).toEqual([{ draft_id: created.draftId }]);
    expect(
      await ownerQuery(
        `SELECT user_id, role, pii_access, granted_by_user_id
         FROM study_role_grants WHERE study_id = $1`,
        [created.studyId],
      ),
    ).toEqual([
      {
        user_id: ADMIN.principal.userId,
        role: 'manager',
        pii_access: true,
        granted_by_user_id: ADMIN.principal.userId,
      },
    ]);

    const events = await ownerQuery<{
      event_type: string;
      category: string;
      resource_type: string;
      resource_id: string;
      resource_label: string;
      details: unknown;
    }>(
      `SELECT event_type, category, resource_type, resource_id,
              resource_label, details
       FROM audit_events
       WHERE team_id = $1 AND resource_id IN ($2, $3)
       ORDER BY sequence`,
      [TEAM_ID, created.studyId, created.protocolId],
    );
    expect(events).toEqual([
      {
        event_type: 'study.created',
        category: 'study',
        resource_type: 'study',
        resource_id: created.studyId,
        resource_label: 'Audited study',
        details: {
          protocolId: created.protocolId,
          draftId: created.draftId,
          participationMode: 'managed',
          creatorRole: 'manager',
        },
      },
      {
        event_type: 'protocol.created',
        category: 'protocol',
        resource_type: 'protocol',
        resource_id: created.protocolId,
        resource_label: 'Audited study',
        details: { draftId: created.draftId },
      },
    ]);

    // The caller may retry after losing the first response. Returning the
    // existing identity is not a second creation: no second study, no second
    // grant, and no second pair of events.
    await expect(
      asClient(ADMIN).call(
        asClient(ADMIN).rpc('studies.create', { ...created }),
      ),
    ).resolves.toEqual({
      studyId: created.studyId,
      protocolId: created.protocolId,
      draftId: created.draftId,
    });
    expect(
      await ownerQuery(
        `SELECT count(*)::int AS count FROM audit_events
         WHERE team_id = $1 AND resource_id IN ($2, $3)`,
        [TEAM_ID, created.studyId, created.protocolId],
      ),
    ).toEqual([{ count: 2 }]);
    expect(
      await ownerQuery(
        `SELECT count(*)::int AS count FROM study_role_grants
         WHERE study_id = $1`,
        [created.studyId],
      ),
    ).toEqual([{ count: 1 }]);

    // The identities are readable through the study list, so anyone who may
    // create can replay someone else's creation. That must change nothing:
    // no grant for the replayer — the one write that used to slip through,
    // unaudited — and the creator's grant untouched.
    await expect(
      asClient(SECOND_ADMIN).call(
        asClient(SECOND_ADMIN).rpc('studies.create', { ...created }),
      ),
    ).resolves.toEqual({
      studyId: created.studyId,
      protocolId: created.protocolId,
      draftId: created.draftId,
    });
    expect(
      await ownerQuery(
        `SELECT user_id AS "userId", role, pii_access AS "piiAccess"
         FROM study_role_grants WHERE study_id = $1`,
        [created.studyId],
      ),
    ).toEqual([
      { userId: ADMIN.principal.userId, role: 'manager', piiAccess: true },
    ]);
  });

  it('shows a team Admin every study and a Member only their own', async () => {
    const shared = await createStudy('Shared study');
    const unshared = await createStudy('Unshared study');
    await grantStudyRole(shared.studyId, MEMBER, 'coordinator');
    // One wave and two participants, so the counts the picker shows are
    // answered per study rather than as a constant.
    const waveId = randomUUID();
    await asMaintenance(
      `INSERT INTO study_waves (id, study_id, team_id, wave_number)
       VALUES ($1, $2, $3, 1)`,
      [waveId, shared.studyId, TEAM_ID],
    );
    for (const code of ['P-001', 'P-002']) {
      await asMaintenance(
        `INSERT INTO participants (id, study_id, team_id, participant_code)
         VALUES ($1, $2, $3, $4)`,
        [randomUUID(), shared.studyId, TEAM_ID, code],
      );
    }

    const forAdmin = await asClient(ADMIN).call(
      asClient(ADMIN).rpc('studies.list', { teamId: TEAM_ID }),
    );
    // Newest first, which is the order the composite index is declared in.
    expect(forAdmin.map((study) => study.name)).toEqual([
      'Unshared study',
      'Shared study',
      'Audited study',
    ]);
    expect(forAdmin.find((study) => study.id === shared.studyId)).toEqual({
      id: shared.studyId,
      name: 'Shared study',
      state: 'draft',
      participationMode: 'managed',
      protocolId: shared.protocolId,
      createdAt: expect.any(Date),
      waveCount: 1,
      participantCount: 2,
    });
    expect(forAdmin.find((study) => study.id === unshared.studyId)).toEqual(
      expect.objectContaining({ waveCount: 0, participantCount: 0 }),
    );

    // #1257: a team Member sees only the studies they hold a grant on.
    const forMember = await asClient(MEMBER).call(
      asClient(MEMBER).rpc('studies.list', { teamId: TEAM_ID }),
    );
    expect(forMember.map((study) => study.id)).toEqual([shared.studyId]);
  });

  it('resolves a study from its id alone, and refuses every study it cannot show', async () => {
    const shared = await createStudy('Resolvable study');
    await grantStudyRole(shared.studyId, MEMBER, 'data_viewer');
    const hidden = await createStudy('Hidden study');

    // No teamId in the input: a cold navigation to `/study/$studyId` has none
    // to send, so the server derives it (§6.3).
    await expect(
      asClient(ADMIN).call(
        asClient(ADMIN).rpc('studies.get', { studyId: shared.studyId }),
      ),
    ).resolves.toEqual({
      teamId: TEAM_ID,
      study: expect.objectContaining({
        id: shared.studyId,
        name: 'Resolvable study',
        protocolId: shared.protocolId,
      }),
      // What the editor is addressed by, resolved through the study rather
      // than by treating the study id as a protocol id.
      protocolDraftId: shared.draftId,
    });
    await expect(
      asClient(MEMBER).call(
        asClient(MEMBER).rpc('studies.get', { studyId: shared.studyId }),
      ),
    ).resolves.toMatchObject({ teamId: TEAM_ID });

    // Three ways to be unable to see a study, one answer: a study in this
    // team the Member holds no grant on, a study in a team the caller is not
    // in, and a study that does not exist at all. Distinguishing them would
    // make this an existence oracle.
    const refusals: [RpcTestClient, StudyId][] = [
      [asClient(MEMBER), hidden.studyId],
      [asClient(OUTSIDER), shared.studyId],
      [asClient(OUTSIDER), StudyId.make(randomUUID())],
    ];
    await Promise.all(
      refusals.map(([who, studyId]) =>
        expectRpcFailure(
          who.callExit(who.rpc('studies.get', { studyId })),
          'Forbidden',
        ),
      ),
    );
  });

  it('refuses study creation by a team Member and records the denial', async () => {
    const input = {
      teamId: TEAM_ID,
      studyId: StudyId.make(randomUUID()),
      protocolId: ProtocolId.make(randomUUID()),
      draftId: DraftId.make(randomUUID()),
      name: 'Must not be created',
    };
    // The command's own refusal, with its own code: `StudyCommandError` is no
    // longer flattened into a bare status on the way out, so `FORBIDDEN` —
    // the code the oRPC plane answered with — is now a field on the declared
    // error rather than the whole of it.
    const refused = await expectRpcFailure(
      asClient(MEMBER).callExit(asClient(MEMBER).rpc('studies.create', input)),
      'StudyCommandError',
    );
    expect(refused.code).toBe('FORBIDDEN');

    // Nothing committed — not the study, not the protocol line the command
    // writes before it.
    expect(
      await ownerQuery(`SELECT id FROM studies WHERE id = $1`, [input.studyId]),
    ).toHaveLength(0);
    expect(
      await ownerQuery(`SELECT id FROM protocols WHERE id = $1`, [
        input.protocolId,
      ]),
    ).toHaveLength(0);
    // The refusal itself is evidence a team Admin can read.
    expect(
      await ownerQuery(
        `SELECT details FROM audit_events
         WHERE team_id = $1 AND event_type = 'study.creation_denied'
           AND actor_id = $2`,
        [TEAM_ID, MEMBER.principal.userId],
      ),
    ).toEqual([{ details: { reason: 'insufficient_permission' } }]);
  });
});
