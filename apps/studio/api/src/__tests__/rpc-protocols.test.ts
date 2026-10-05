import { randomUUID } from 'node:crypto';

import { Effect, Option } from 'effect';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  DraftId,
  ProtocolId,
  StageId,
  StudyId,
  TeamId,
} from '@codaco/studio-contract/schema/ids';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { createStudio } from '../app.ts';
import type { SessionPrincipal } from '../auth/service.ts';
import { MaintenanceScope, Transaction } from '../db/tenant.ts';
import { readEnv } from '../env.ts';
import { authServiceStub } from './support/auth.ts';
import {
  insertTeam,
  openTestDatabase,
  ownerAffected,
  ownerRows,
  type TestDatabaseRuntime,
  testDb,
} from './support/database.ts';
import {
  type Caller,
  createProtocolBuilderClient,
  type ProtocolBuilderTestClient,
} from './support/protocol-builder.ts';
import {
  createRpcClient,
  expectRpcFailure,
  type RpcTestClient,
} from './support/rpc.ts';

const TEAM_ID = TeamId.make('rpc-protocols-team');

type Researcher = {
  principal: SessionPrincipal;
  memberId: string;
  role: string;
};

function researcher(slug: string, role: string): Researcher {
  return {
    principal: {
      kind: 'user',
      userId: `rpc-protocols-${slug}-user`,
      email: `rpc-protocols-${slug}@example.com`,
      emailVerified: true,
      name: `RPC Protocols ${slug}`,
      locale: null,
      sessionId: `rpc-protocols-${slug}-session`,
    },
    memberId: `rpc-protocols-${slug}-member`,
    role,
  };
}

const ADMIN = researcher('admin', 'owner');
const MEMBER = researcher('member', 'member');

type CreatedStudy = {
  studyId: StudyId;
  protocolId: ProtocolId;
  draftId: DraftId;
};

describe.skipIf(!testDb)('the protocol RPC surface', () => {
  let database: TestDatabaseRuntime;
  let clients: Map<Researcher, RpcTestClient>;
  let builder: ProtocolBuilderTestClient;
  let granted: CreatedStudy;
  let ungranted: CreatedStudy;
  let orphan: { protocolId: ProtocolId; draftId: DraftId };

  const asClient = (who: Researcher) => {
    const client = clients.get(who);
    if (!client) throw new Error(`no client for ${who.principal.userId}`);
    return client;
  };

  const asBuilderCaller = (who: Researcher): Caller => ({
    principal: who.principal,
    connection: `${who.memberId}-connection`,
    tab: `${who.memberId}-tab`,
  });

  const createStudy = async (name: string): Promise<CreatedStudy> => {
    const input = {
      teamId: TEAM_ID,
      studyId: StudyId.make(randomUUID()),
      protocolId: ProtocolId.make(randomUUID()),
      draftId: DraftId.make(randomUUID()),
      name,
    };
    await asClient(ADMIN).call(asClient(ADMIN).rpc('studies.create', input));
    return {
      studyId: input.studyId,
      protocolId: input.protocolId,
      draftId: input.draftId,
    };
  };

  beforeAll(async () => {
    database = await openTestDatabase();
    await database.run(insertTeam(TEAM_ID));

    clients = new Map();
    for (const who of [ADMIN, MEMBER]) {
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
          [who.memberId, TEAM_ID, who.principal.userId, who.role],
        ),
      );
      const auth = authServiceStub({
        getSession: () => Effect.succeedSome(who.principal),
        getMembership: (_userId, teamId) =>
          Effect.succeed(
            Option.fromNullishOr(
              teamId === TEAM_ID ? { role: who.role } : null,
            ),
          ),
        listMemberships: () =>
          Effect.succeed([{ teamId: TEAM_ID, role: who.role }]),
      });
      const studio = createStudio(readEnv(), {
        auth,
        services: database.services,
      });
      clients.set(who, await createRpcClient(studio));
    }
    builder = await createProtocolBuilderClient(
      createStudio(readEnv(), {
        auth: authServiceStub({
          listMemberships: (userId) =>
            Effect.succeed(
              [ADMIN, MEMBER]
                .filter((who) => who.principal.userId === userId)
                .map((who) => ({ teamId: TEAM_ID, role: who.role })),
            ),
        }),
        services: database.services,
      }),
    );

    granted = await createStudy('Granted study');
    ungranted = await createStudy('Ungranted study');
    await database.run(
      MaintenanceScope.open(
        Effect.flatMap(Transaction, ({ sql }) =>
          sql.unsafe(
            `INSERT INTO study_role_grants
               (id, team_id, study_id, user_id, role, granted_by_user_id)
             VALUES ($1, $2, $3, $4, 'protocol_designer', $5)`,
            [
              randomUUID(),
              TEAM_ID,
              granted.studyId,
              MEMBER.principal.userId,
              ADMIN.principal.userId,
            ],
          ),
        ),
      ),
    );

    orphan = {
      protocolId: ProtocolId.make(randomUUID()),
      draftId: DraftId.make(randomUUID()),
    };
    await asClient(ADMIN).call(
      asClient(ADMIN).rpc('protocols.create', {
        teamId: TEAM_ID,
        name: 'Study-less protocol',
        ...orphan,
      }),
    );
  });

  afterAll(async () => {
    for (const client of clients.values()) await client.dispose();
    await builder.dispose();
    await database.dispose();
  });

  it('lists every line for an Admin and only granted lines for a Member', async () => {
    const forAdmin = await asClient(ADMIN).call(
      asClient(ADMIN).rpc('protocols.list', { teamId: TEAM_ID }),
    );
    expect(forAdmin.map((protocol) => protocol.id).toSorted()).toEqual(
      [granted.protocolId, ungranted.protocolId, orphan.protocolId].toSorted(),
    );

    const forMember = await asClient(MEMBER).call(
      asClient(MEMBER).rpc('protocols.list', { teamId: TEAM_ID }),
    );
    expect(forMember.map((protocol) => protocol.id)).toEqual([
      granted.protocolId,
    ]);
    expect(forMember[0]?.draftId).toBe(granted.draftId);
  });

  it('opens a granted line for a Member and refuses the rest identically', async () => {
    const opened = await asClient(MEMBER).call(
      asClient(MEMBER).rpc('protocols.draft', {
        teamId: TEAM_ID,
        protocolId: granted.protocolId,
        draftId: granted.draftId,
      }),
    );
    expect(opened.protocol.id).toBe(granted.protocolId);

    const refusals: { protocolId: ProtocolId; draftId: DraftId }[] = [
      { protocolId: ungranted.protocolId, draftId: ungranted.draftId },
      { protocolId: orphan.protocolId, draftId: orphan.draftId },
      {
        protocolId: ProtocolId.make(randomUUID()),
        draftId: DraftId.make(randomUUID()),
      },
    ];
    await Promise.all(
      refusals.map((line) =>
        expectRpcFailure(
          asClient(MEMBER).callExit(
            asClient(MEMBER).rpc('protocols.draft', {
              teamId: TEAM_ID,
              ...line,
            }),
          ),
          'Forbidden',
        ),
      ),
    );

    await Promise.all(
      [ungranted.protocolId, randomUUID()].map((protocolId) =>
        expectRpcFailure(
          builder.callExit(
            asBuilderCaller(MEMBER),
            builder.rpc('AcquireLock', {
              protocolId,
              sectionId: sectionId({ kind: 'settings' }),
            }),
          ),
          'ProtocolNotFound',
        ),
      ),
    );
  });

  it('refuses a Member’s edit of an ungranted line and commits nothing', async () => {
    const stageId = StageId.make(randomUUID());
    await expectRpcFailure(
      asClient(MEMBER).callExit(
        asClient(MEMBER).rpc('protocols.addInformationStage', {
          teamId: TEAM_ID,
          protocolId: ungranted.protocolId,
          draftId: ungranted.draftId,
          stageId,
        }),
      ),
      'Forbidden',
    );

    const draft = await asClient(ADMIN).call(
      asClient(ADMIN).rpc('protocols.draft', {
        teamId: TEAM_ID,
        protocolId: ungranted.protocolId,
        draftId: ungranted.draftId,
      }),
    );
    expect(draft.sections.stageOrder).toEqual({ stages: [] });
    expect(draft.sections[`stage:${stageId}`]).toBeUndefined();

    const grantedStageId = StageId.make(randomUUID());
    await asClient(MEMBER).call(
      asClient(MEMBER).rpc('protocols.addInformationStage', {
        teamId: TEAM_ID,
        protocolId: granted.protocolId,
        draftId: granted.draftId,
        stageId: grantedStageId,
      }),
    );
    const edited = await asClient(MEMBER).call(
      asClient(MEMBER).rpc('protocols.draft', {
        teamId: TEAM_ID,
        protocolId: granted.protocolId,
        draftId: granted.draftId,
      }),
    );
    expect(edited.sections.stageOrder).toEqual({ stages: [grantedStageId] });
  });

  it('refuses protocol creation by a team Member', async () => {
    const input = {
      teamId: TEAM_ID,
      name: 'Must not be created',
      protocolId: ProtocolId.make(randomUUID()),
      draftId: DraftId.make(randomUUID()),
    };
    await expectRpcFailure(
      asClient(MEMBER).callExit(
        asClient(MEMBER).rpc('protocols.create', input),
      ),
      'Forbidden',
    );

    expect(
      await database.run(
        ownerRows(`SELECT id FROM protocols WHERE id = $1`, [input.protocolId]),
      ),
    ).toHaveLength(0);
    expect(
      await database.run(
        ownerRows(`SELECT draft_id FROM protocol_drafts WHERE draft_id = $1`, [
          input.draftId,
        ]),
      ),
    ).toHaveLength(0);

    await expect(
      asClient(ADMIN).call(asClient(ADMIN).rpc('protocols.create', input)),
    ).resolves.toEqual({
      protocolId: input.protocolId,
      draftId: input.draftId,
    });
  });
});
