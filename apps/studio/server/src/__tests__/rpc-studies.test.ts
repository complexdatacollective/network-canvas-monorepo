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

const TEAM_ID = 'rpc-studies-team';
const OTHER_TEAM_ID = 'rpc-studies-other-team';

type Researcher = {
  principal: SessionPrincipal;
  memberId: string;
  teamId: string;
  role: string;
};

function researcher(slug: string, teamId: string, role: string): Researcher {
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

describe.skipIf(!db)('the studies RPC', () => {
  let pool: pg.Pool;
  let appPool: pg.Pool;
  let maintenance: pg.Pool;
  let dispose: () => Promise<void>;
  let clients: Map<Researcher, ReturnType<typeof createRpcClient>>;

  const asClient = (who: Researcher) => {
    const client = clients.get(who);
    if (!client) throw new Error(`no client for ${who.principal.userId}`);
    return client;
  };

  beforeAll(async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    const scratch = await createScratchSchema(db);
    pool = scratch.pool;
    appPool = scratch.app;
    maintenance = scratch.maintenance;
    dispose = scratch.dispose;
    await provisionScratchSchema(pool);
    await seedTeam(pool, TEAM_ID);
    await seedTeam(pool, OTHER_TEAM_ID);

    clients = new Map();
    for (const who of [ADMIN, SECOND_ADMIN, MEMBER, OUTSIDER]) {
      await pool.query(
        `INSERT INTO "user" (id, name, email, "emailVerified")
         VALUES ($1, $2, $3, true)`,
        [who.principal.userId, who.principal.name, who.principal.email],
      );
      await pool.query(
        `INSERT INTO team_members (id, team_id, user_id, role)
         VALUES ($1, $2, $3, $4)`,
        [who.memberId, who.teamId, who.principal.userId, who.role],
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
        createRpcClient(createApp(readEnv(), { auth, pool: appPool })),
      );
    }
  });

  afterAll(async () => {
    await dispose();
  });

  /** Fixture rows for a tenant table: the maintenance role is the one that
   * may write across teams without a pinned tenant. */
  const grantStudyRole = (studyId: string, who: Researcher, role: string) =>
    maintenance.query(
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

  const createStudy = async (name: string) => {
    const input = {
      teamId: TEAM_ID,
      studyId: randomUUID(),
      protocolId: randomUUID(),
      draftId: randomUUID(),
      name,
    };
    await expect(asClient(ADMIN).studies.create(input)).resolves.toEqual({
      studyId: input.studyId,
      protocolId: input.protocolId,
      draftId: input.draftId,
    });
    return input;
  };

  it('creates the study, its protocol line, and the creator’s grant at once', async () => {
    const created = await createStudy('Audited study');

    expect(
      await pool.query(
        `SELECT name, state, participation_mode, protocol_id
         FROM studies WHERE id = $1 AND team_id = $2`,
        [created.studyId, TEAM_ID],
      ),
    ).toHaveProperty('rows', [
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
      await pool.query(
        `SELECT pd.draft_id FROM protocols p
         JOIN protocol_drafts pd
           ON pd.protocol_id = p.id AND pd.team_id = p.team_id
         WHERE p.id = $1 AND p.team_id = $2`,
        [created.protocolId, TEAM_ID],
      ),
    ).toHaveProperty('rows', [{ draft_id: created.draftId }]);
    expect(
      await pool.query(
        `SELECT user_id, role, pii_access, granted_by_user_id
         FROM study_role_grants WHERE study_id = $1`,
        [created.studyId],
      ),
    ).toHaveProperty('rows', [
      {
        user_id: ADMIN.principal.userId,
        role: 'manager',
        pii_access: true,
        granted_by_user_id: ADMIN.principal.userId,
      },
    ]);

    const events = await pool.query<{
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
    expect(events.rows).toEqual([
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
      asClient(ADMIN).studies.create({ ...created }),
    ).resolves.toEqual({
      studyId: created.studyId,
      protocolId: created.protocolId,
      draftId: created.draftId,
    });
    expect(
      await pool.query(
        `SELECT count(*)::int AS count FROM audit_events
         WHERE team_id = $1 AND resource_id IN ($2, $3)`,
        [TEAM_ID, created.studyId, created.protocolId],
      ),
    ).toHaveProperty('rows', [{ count: 2 }]);
    expect(
      await pool.query(
        `SELECT count(*)::int AS count FROM study_role_grants
         WHERE study_id = $1`,
        [created.studyId],
      ),
    ).toHaveProperty('rows', [{ count: 1 }]);

    // The identities are readable through the study list, so anyone who may
    // create can replay someone else's creation. That must change nothing:
    // no grant for the replayer — the one write that used to slip through,
    // unaudited — and the creator's grant untouched.
    await expect(
      asClient(SECOND_ADMIN).studies.create({ ...created }),
    ).resolves.toEqual({
      studyId: created.studyId,
      protocolId: created.protocolId,
      draftId: created.draftId,
    });
    expect(
      await pool.query(
        `SELECT user_id AS "userId", role, pii_access AS "piiAccess"
         FROM study_role_grants WHERE study_id = $1`,
        [created.studyId],
      ),
    ).toHaveProperty('rows', [
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
    await maintenance.query(
      `INSERT INTO study_waves (id, study_id, team_id, wave_number)
       VALUES ($1, $2, $3, 1)`,
      [waveId, shared.studyId, TEAM_ID],
    );
    for (const code of ['P-001', 'P-002']) {
      await maintenance.query(
        `INSERT INTO participants (id, study_id, team_id, participant_code)
         VALUES ($1, $2, $3, $4)`,
        [randomUUID(), shared.studyId, TEAM_ID, code],
      );
    }

    const forAdmin = await asClient(ADMIN).studies.list({ teamId: TEAM_ID });
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
    const forMember = await asClient(MEMBER).studies.list({ teamId: TEAM_ID });
    expect(forMember.map((study) => study.id)).toEqual([shared.studyId]);
  });

  it('resolves a study from its id alone, and refuses every study it cannot show', async () => {
    const shared = await createStudy('Resolvable study');
    await grantStudyRole(shared.studyId, MEMBER, 'data_viewer');
    const hidden = await createStudy('Hidden study');

    // No teamId in the input: a cold navigation to `/study/$studyId` has none
    // to send, so the server derives it (§6.3).
    await expect(
      asClient(ADMIN).studies.get({ studyId: shared.studyId }),
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
      asClient(MEMBER).studies.get({ studyId: shared.studyId }),
    ).resolves.toMatchObject({ teamId: TEAM_ID });

    // Three ways to be unable to see a study, one answer: a study in this
    // team the Member holds no grant on, a study in a team the caller is not
    // in, and a study that does not exist at all. Distinguishing them would
    // make this an existence oracle.
    const refusals = await Promise.all([
      safe(asClient(MEMBER).studies.get({ studyId: hidden.studyId })),
      safe(asClient(OUTSIDER).studies.get({ studyId: shared.studyId })),
      safe(asClient(OUTSIDER).studies.get({ studyId: randomUUID() })),
    ]);
    for (const { error } of refusals) {
      expect(error).toMatchObject({ code: 'FORBIDDEN' });
    }
  });

  it('refuses study creation by a team Member and records the denial', async () => {
    const input = {
      teamId: TEAM_ID,
      studyId: randomUUID(),
      protocolId: randomUUID(),
      draftId: randomUUID(),
      name: 'Must not be created',
    };
    const { error } = await safe(asClient(MEMBER).studies.create(input));
    expect(error).toMatchObject({ code: 'FORBIDDEN' });

    // Nothing committed — not the study, not the protocol line the command
    // writes before it.
    expect(
      await pool.query(`SELECT id FROM studies WHERE id = $1`, [input.studyId]),
    ).toHaveProperty('rowCount', 0);
    expect(
      await pool.query(`SELECT id FROM protocols WHERE id = $1`, [
        input.protocolId,
      ]),
    ).toHaveProperty('rowCount', 0);
    // The refusal itself is evidence a team Admin can read.
    expect(
      await pool.query<{ details: unknown }>(
        `SELECT details FROM audit_events
         WHERE team_id = $1 AND event_type = 'study.creation_denied'
           AND actor_id = $2`,
        [TEAM_ID, MEMBER.principal.userId],
      ),
    ).toHaveProperty('rows', [
      { details: { reason: 'insufficient_permission' } },
    ]);
  });
});
