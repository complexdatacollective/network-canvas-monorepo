// #1257's visibility rule across the whole protocol surface: a protocol line
// is reachable only through a study the caller can see, so what `studies.list`
// omits and `studies.get` refuses cannot be read, leased, or edited through the
// protocol behind it either.
import { randomUUID } from 'node:crypto';

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

const TEAM_ID = 'rpc-protocols-team';

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
  studyId: string;
  protocolId: string;
  draftId: string;
};

describe.skipIf(!db)('the protocol RPC surface', () => {
  let pool: pg.Pool;
  let maintenance: pg.Pool;
  let dispose: () => Promise<void>;
  let clients: Map<Researcher, ReturnType<typeof createRpcClient>>;
  /** A study the Member holds a study-role grant on. */
  let granted: CreatedStudy;
  /** A study of the same team that nobody granted the Member. */
  let ungranted: CreatedStudy;
  /** A protocol line no study references: the Admin-only case. */
  let orphan: { protocolId: string; draftId: string };

  const asClient = (who: Researcher) => {
    const client = clients.get(who);
    if (!client) throw new Error(`no client for ${who.principal.userId}`);
    return client;
  };

  const createStudy = async (name: string): Promise<CreatedStudy> => {
    const input = {
      teamId: TEAM_ID,
      studyId: randomUUID(),
      protocolId: randomUUID(),
      draftId: randomUUID(),
      name,
    };
    await asClient(ADMIN).studies.create(input);
    return {
      studyId: input.studyId,
      protocolId: input.protocolId,
      draftId: input.draftId,
    };
  };

  beforeAll(async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    const scratch = await createScratchSchema(db);
    pool = scratch.pool;
    maintenance = scratch.maintenance;
    dispose = scratch.dispose;
    await provisionScratchSchema(pool);
    await seedTeam(pool, TEAM_ID);

    clients = new Map();
    for (const who of [ADMIN, MEMBER]) {
      await pool.query(
        `INSERT INTO "user" (id, name, email, "emailVerified")
         VALUES ($1, $2, $3, true)`,
        [who.principal.userId, who.principal.name, who.principal.email],
      );
      await pool.query(
        `INSERT INTO team_members (id, team_id, user_id, role)
         VALUES ($1, $2, $3, $4)`,
        [who.memberId, TEAM_ID, who.principal.userId, who.role],
      );
      const auth = stubAuthService({
        getSession: () => Promise.resolve(who.principal),
        getMembership: (_userId, teamId) =>
          Promise.resolve(teamId === TEAM_ID ? { role: who.role } : null),
        listMemberships: () =>
          Promise.resolve([{ teamId: TEAM_ID, role: who.role }]),
      });
      clients.set(
        who,
        createRpcClient(createApp(readEnv(), { auth, pool: scratch.app })),
      );
    }

    granted = await createStudy('Granted study');
    ungranted = await createStudy('Ungranted study');
    // The maintenance role is the one that may write a fixture row across
    // teams without a pinned tenant.
    await maintenance.query(
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
    );

    orphan = { protocolId: randomUUID(), draftId: randomUUID() };
    await asClient(ADMIN).protocols.create({
      teamId: TEAM_ID,
      name: 'Study-less protocol',
      ...orphan,
    });
  });

  afterAll(async () => {
    await dispose();
  });

  it('lists every line for an Admin and only granted lines for a Member', async () => {
    const forAdmin = await asClient(ADMIN).protocols.list({ teamId: TEAM_ID });
    expect(forAdmin.map((protocol) => protocol.id).toSorted()).toEqual(
      [granted.protocolId, ungranted.protocolId, orphan.protocolId].toSorted(),
    );

    // The Member's own list is the answer `studies.list` gives them, read
    // through the other tier: one study, one line.
    const forMember = await asClient(MEMBER).protocols.list({
      teamId: TEAM_ID,
    });
    expect(forMember.map((protocol) => protocol.id)).toEqual([
      granted.protocolId,
    ]);
    expect(forMember[0]?.draftId).toBe(granted.draftId);
  });

  it('opens a granted line for a Member and refuses the rest identically', async () => {
    const opened = await asClient(MEMBER).protocols.draft({
      teamId: TEAM_ID,
      protocolId: granted.protocolId,
      draftId: granted.draftId,
    });
    expect(opened.protocol.id).toBe(granted.protocolId);

    // Four ways to be unable to reach a line, one answer: a line behind a
    // study this Member holds no grant on, a line no study references at all,
    // a line that does not exist, and a lease on one of them. Distinguishing
    // them would make the protocol surface the existence oracle `studies.get`
    // refuses to be.
    const refusals = await Promise.all([
      safe(
        asClient(MEMBER).protocols.draft({
          teamId: TEAM_ID,
          protocolId: ungranted.protocolId,
          draftId: ungranted.draftId,
        }),
      ),
      safe(
        asClient(MEMBER).protocols.draft({
          teamId: TEAM_ID,
          protocolId: orphan.protocolId,
          draftId: orphan.draftId,
        }),
      ),
      safe(
        asClient(MEMBER).protocols.draft({
          teamId: TEAM_ID,
          protocolId: randomUUID(),
          draftId: randomUUID(),
        }),
      ),
      safe(
        asClient(MEMBER).protocols.acquireSection({
          teamId: TEAM_ID,
          protocolId: ungranted.protocolId,
          draftId: ungranted.draftId,
          sectionId: 'settings',
          clientId: randomUUID(),
        }),
      ),
    ]);
    for (const { error } of refusals) {
      expect(error).toMatchObject({ code: 'FORBIDDEN' });
    }
  });

  it('refuses a Member’s edit of an ungranted line and commits nothing', async () => {
    const stageId = randomUUID();
    const { error } = await safe(
      asClient(MEMBER).protocols.addInformationStage({
        teamId: TEAM_ID,
        protocolId: ungranted.protocolId,
        draftId: ungranted.draftId,
        stageId,
      }),
    );
    expect(error).toMatchObject({ code: 'FORBIDDEN' });

    // Read back through the Admin, who can see the line: the refusal has to
    // mean the draft is untouched, not merely that the Member was told no.
    const draft = await asClient(ADMIN).protocols.draft({
      teamId: TEAM_ID,
      protocolId: ungranted.protocolId,
      draftId: ungranted.draftId,
    });
    expect(draft.sections.stageOrder).toEqual({ stages: [] });
    expect(draft.sections[`stage:${stageId}`]).toBeUndefined();

    // The same edit on the line they were granted goes through, so the refusal
    // above is about the study behind the line rather than about the procedure
    // being closed to Members altogether.
    const grantedStageId = randomUUID();
    await asClient(MEMBER).protocols.addInformationStage({
      teamId: TEAM_ID,
      protocolId: granted.protocolId,
      draftId: granted.draftId,
      stageId: grantedStageId,
    });
    const edited = await asClient(MEMBER).protocols.draft({
      teamId: TEAM_ID,
      protocolId: granted.protocolId,
      draftId: granted.draftId,
    });
    expect(edited.sections.stageOrder).toEqual({ stages: [grantedStageId] });
  });

  it('refuses protocol creation by a team Member', async () => {
    // A line created here belongs to no study, so nobody but an Admin or Owner
    // could ever reach it — the rule `studies.create` already applies.
    const input = {
      teamId: TEAM_ID,
      name: 'Must not be created',
      protocolId: randomUUID(),
      draftId: randomUUID(),
    };
    const { error } = await safe(asClient(MEMBER).protocols.create(input));
    expect(error).toMatchObject({ code: 'FORBIDDEN' });

    expect(
      await pool.query(`SELECT id FROM protocols WHERE id = $1`, [
        input.protocolId,
      ]),
    ).toHaveProperty('rowCount', 0);
    expect(
      await pool.query(
        `SELECT draft_id FROM protocol_drafts WHERE draft_id = $1`,
        [input.draftId],
      ),
    ).toHaveProperty('rowCount', 0);

    // The same request from an Admin creates the line, so the refusal is the
    // role and not the input.
    await expect(asClient(ADMIN).protocols.create(input)).resolves.toEqual({
      protocolId: input.protocolId,
      draftId: input.draftId,
    });
  });
});
