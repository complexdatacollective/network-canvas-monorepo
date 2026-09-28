// #1257's visibility rule across the whole protocol surface: a protocol line
// is reachable only through a study the caller can see, so what `studies.list`
// omits and `studies.get` refuses cannot be read, leased, or edited through the
// protocol behind it either.
import { randomUUID } from 'node:crypto';

import { safe } from '@orpc/client';
import { createRouterClient } from '@orpc/server';
import { Effect, Option } from 'effect';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  DraftId,
  ProtocolId,
  StageId,
  StudyId,
  TeamId,
} from '@codaco/studio-contract/schema/ids';

import { createStudio } from '../app.ts';
import type { SessionPrincipal } from '../auth/service.ts';
import { MaintenanceScope, Transaction } from '../db/tenant.ts';
import { readEnv } from '../env.ts';
import { createProtocolBuilderRuntime } from '../protocol-builder/runtime.ts';
import { createRpcRouter } from '../rpc.ts';
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

/** The two team roles #1257 separates, in one team. */
const ADMIN = researcher('admin', 'owner');
const MEMBER = researcher('member', 'member');

/** One study, and the protocol line `studies.create` gave it. */
type CreatedStudy = {
  studyId: StudyId;
  protocolId: ProtocolId;
  draftId: DraftId;
};

describe.skipIf(!testDb)('the protocol RPC surface', () => {
  let database: TestDatabaseRuntime;
  let clients: Map<Researcher, RpcTestClient>;
  /**
   * The same researchers on the protocol-builder host, which is still an oRPC
   * router served over `/ws` until stage 8 — so it is driven in process here
   * rather than through the rpc plane, which no longer carries it.
   */
  let builderClients: Map<
    Researcher,
    ReturnType<typeof createRouterClient<ReturnType<typeof createRpcRouter>>>
  >;
  /** A study the Member holds a study-role grant on. */
  let granted: CreatedStudy;
  /** A study of the same team that nobody granted the Member. */
  let ungranted: CreatedStudy;
  /** A protocol line no study references: the Admin-only case. */
  let orphan: { protocolId: ProtocolId; draftId: DraftId };

  const asClient = (who: Researcher) => {
    const client = clients.get(who);
    if (!client) throw new Error(`no client for ${who.principal.userId}`);
    return client;
  };

  const asBuilderClient = (who: Researcher) => {
    const client = builderClients.get(who);
    if (!client) throw new Error(`no client for ${who.principal.userId}`);
    return client;
  };

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
    builderClients = new Map();
    // One runtime for both researchers: a lock one of them holds has to be
    // visible to the other, which is what makes a refusal mean anything.
    const protocolBuilder = createProtocolBuilderRuntime();
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
        pool: database.appPool,
        services: database.services,
      });
      clients.set(who, await createRpcClient(studio));
      builderClients.set(
        who,
        createRouterClient(
          createRpcRouter({
            ...studio.rpc,
            auth: studio.auth,
            limiter: studio.limiter,
            protocolBuilder,
          }),
          {
            context: {
              principal: who.principal,
              requestId: randomUUID(),
              connectionId: `${who.memberId}-connection`,
              clientSessionId: `${who.memberId}-tab`,
            },
          },
        ),
      );
    }

    granted = await createStudy('Granted study');
    ungranted = await createStudy('Ungranted study');
    // The maintenance role is the one that may write a fixture row across
    // teams without a pinned tenant.
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
    await database.dispose();
  });

  it('lists every line for an Admin and only granted lines for a Member', async () => {
    const forAdmin = await asClient(ADMIN).call(
      asClient(ADMIN).rpc('protocols.list', { teamId: TEAM_ID }),
    );
    expect(forAdmin.map((protocol) => protocol.id).toSorted()).toEqual(
      [granted.protocolId, ungranted.protocolId, orphan.protocolId].toSorted(),
    );

    // The Member's own list is the answer `studies.list` gives them, read
    // through the other tier: one study, one line.
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

    // Three ways to be unable to reach a line, one answer: a line behind a
    // study this Member holds no grant on, a line no study references at all,
    // and a line that does not exist. Distinguishing them would make the
    // protocol surface the existence oracle `studies.get` refuses to be.
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

    // The same rule on the editing surface. The protocol-builder host takes no
    // teamId — it derives the tenant from the caller's own memberships — so it
    // answers in its own words, and the words have to be the same for a line
    // this Member holds no grant on as for a protocol id nobody ever made.
    const locks = await Promise.all([
      safe(
        asBuilderClient(MEMBER).protocolBuilder.acquireLock({
          protocolId: ungranted.protocolId,
          sectionId: 'settings',
        }),
      ),
      safe(
        asBuilderClient(MEMBER).protocolBuilder.acquireLock({
          protocolId: randomUUID(),
          sectionId: 'settings',
        }),
      ),
    ]);
    for (const { error } of locks) {
      expect(error).toMatchObject({ code: 'PROTOCOL_NOT_FOUND' });
    }
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

    // Read back through the Admin, who can see the line: the refusal has to
    // mean the draft is untouched, not merely that the Member was told no.
    const draft = await asClient(ADMIN).call(
      asClient(ADMIN).rpc('protocols.draft', {
        teamId: TEAM_ID,
        protocolId: ungranted.protocolId,
        draftId: ungranted.draftId,
      }),
    );
    expect(draft.sections.stageOrder).toEqual({ stages: [] });
    expect(draft.sections[`stage:${stageId}`]).toBeUndefined();

    // The same edit on the line they were granted goes through, so the refusal
    // above is about the study behind the line rather than about the procedure
    // being closed to Members altogether.
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
    // A line created here belongs to no study, so nobody but an Admin or Owner
    // could ever reach it — the rule `studies.create` already applies.
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

    // The same request from an Admin creates the line, so the refusal is the
    // role and not the input.
    await expect(
      asClient(ADMIN).call(asClient(ADMIN).rpc('protocols.create', input)),
    ).resolves.toEqual({
      protocolId: input.protocolId,
      draftId: input.draftId,
    });
  });
});
