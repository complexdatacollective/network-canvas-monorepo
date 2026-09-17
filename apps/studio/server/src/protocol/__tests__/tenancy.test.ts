// Cross-team isolation at the application layer: identical content dedupes per
// team, reads cannot cross the boundary, and GC in one team never collects
// another's rows.
import { randomUUID } from 'node:crypto';

import { and, eq } from 'drizzle-orm';
import { Effect } from 'effect';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  UnknownSectionDocumentError,
  UnknownSectionError,
} from '@codaco/studio-sync/server';

import { seedTeam } from '../../__tests__/support/postgres.ts';
import { testCipher } from '../../__tests__/support/secrets.ts';
import { MaintenanceDatabase } from '../../db/client.ts';
import { Transaction } from '../../db/tenant.ts';
import { gcProtocolStore } from '../../jobs/handlers/protocol-store-gc.ts';
import { PROTOCOL_TABLES } from '../schema.ts';
import {
  createProtocol,
  discardDraft,
  getDraftDocument,
  getDraftSections,
  getVersionSections,
  isReachableByCaller,
  listProtocols,
  ProtocolStoreError,
  publishDraft,
  reachableByCaller,
} from '../store.ts';
import {
  GC_OPTS,
  ageQuarantine,
  baseProtocol,
  expireLease,
  makeStoreSchema,
  makeTestSyncServer,
  storeDb,
} from './helpers.ts';

const { protocols } = PROTOCOL_TABLES;

describe.skipIf(!storeDb)('team isolation', () => {
  let db: pg.Pool;
  let schema: string;
  let dispose: () => Promise<void>;
  let inTeam: <A, E>(
    teamId: string,
    body: Effect.Effect<A, E, Transaction>,
  ) => Promise<A>;
  const cipher = testCipher();
  const inA = <A, E>(body: Effect.Effect<A, E, Transaction>) =>
    inTeam('team-a', body);
  const inB = <A, E>(body: Effect.Effect<A, E, Transaction>) =>
    inTeam('team-b', body);

  /**
   * The sweep. It is an Effect over its own maintenance client now
   * (`src/jobs/handlers/protocol-store-gc.ts`), so the scratch schema
   * goes in as a `search_path` rather than as a pool. Built per call —
   * `local: true` — because a shared layer's pool would outlive the suite.
   */
  const sweep = () =>
    Effect.runPromise(
      Effect.provide(
        gcProtocolStore(GC_OPTS),
        MaintenanceDatabase.layer({
          url: storeDb!.url,
          maxConnections: 2,
          applicationName: 'studio-tenancy-gc',
          searchPath: schema,
        }),
        { local: true },
      ),
    );

  beforeAll(async () => {
    const scratch = await makeStoreSchema();
    ({ db, schema, dispose } = scratch);
    inTeam = scratch.inTeam;
    await seedTeam(db, 'team-a');
    await seedTeam(db, 'team-b');
  });
  afterAll(async () => {
    await dispose();
  });

  it('deduplicates identical section content per team, not globally', async () => {
    const a = await inA(
      createProtocol('team-a', cipher, { protocol: baseProtocol() }),
    );
    const b = await inB(
      createProtocol('team-b', cipher, { protocol: baseProtocol() }),
    );

    const headA = await inA(getDraftSections('team-a', a.draftId));
    const headB = await inB(getDraftSections('team-b', b.draftId));
    expect(headA.sectionHashes).toEqual(headB.sectionHashes);

    const settingsHash = headA.sectionHashes.settings!;
    const rows = await db.query(
      `SELECT team_id FROM sections WHERE hash = $1 ORDER BY team_id`,
      [settingsHash],
    );
    expect(rows.rows).toEqual([{ team_id: 'team-a' }, { team_id: 'team-b' }]);
  });

  it('refuses reads across the team boundary', async () => {
    const bOnlyProtocol = { ...baseProtocol(), name: 'Only in B' };
    const b = await inB(
      createProtocol('team-b', cipher, { protocol: bOnlyProtocol }),
    );
    await expect(inA(getDraftSections('team-a', b.draftId))).rejects.toThrow(
      ProtocolStoreError,
    );

    const published = await inB(publishDraft('team-b', { draftId: b.draftId }));
    if (published.status !== 'published') {
      throw new Error(`publish failed: ${published.status}`);
    }
    await expect(
      inA(getVersionSections('team-a', published.versionId)),
    ).rejects.toThrow(ProtocolStoreError);

    const sync = makeTestSyncServer();
    await expect(
      inA(sync.acquire(b.draftId, 'settings', 'tab-a')),
    ).rejects.toThrow(UnknownSectionError);

    const bOnlySettingsHash = (await inB(getDraftSections('team-b', b.draftId)))
      .sectionHashes.settings!;
    await expect(inA(sync.getSection(bOnlySettingsHash))).rejects.toThrow(
      UnknownSectionDocumentError,
    );
    await expect(
      inB(sync.getSection(bOnlySettingsHash)),
    ).resolves.toMatchObject({ name: 'Only in B' });
  });

  it('lists only the team\u2019s own protocols', async () => {
    const { protocolId } = await inA(
      createProtocol('team-a', cipher, { protocol: baseProtocol() }),
    );
    // A team Admin's visibility, so what this asserts is the team boundary
    // rather than #1257's within-team rule (rpc-protocols.test.ts covers that).
    const seesEverything = {
      actorUserId: 'tenancy-user',
      seesEveryStudy: true,
    };
    const listedInA = await inA(listProtocols('team-a', seesEverything));
    const listedInB = await inB(listProtocols('team-b', seesEverything));
    expect(listedInA.map((p) => p.id)).toContain(protocolId);
    expect(listedInB.map((p) => p.id)).not.toContain(protocolId);
  });

  /**
   * `reachableByCaller` is one exported fragment precisely so the two
   * statements that ask "may this caller open this line" cannot answer
   * differently. This is the boundary row that would catch it if they did: a
   * line reachable only through a study the caller holds a grant on, and the
   * same line with the grant gone.
   */
  it('the list and the reachability probe agree on a boundary row', async () => {
    const { protocolId } = await inA(
      createProtocol('team-a', cipher, { protocol: baseProtocol() }),
    );
    const studyId = randomUUID();
    await db.query(
      `INSERT INTO studies (id, team_id, name, state, participation_mode, protocol_id)
       VALUES ($1, 'team-a', 'Boundary', 'draft', 'managed', $2)`,
      [studyId, protocolId],
    );
    const member = {
      actorUserId: 'tenancy-member',
      seesEveryStudy: false,
    };

    // The three readings of the one fragment: the list, the probe, and a
    // statement written here out of `reachableByCaller` itself. If the
    // fragment ever stopped saying what the two store statements embed, the
    // third would disagree with them on this row.
    const throughTheFragment = Effect.gen(function* () {
      const { tx } = yield* Transaction;
      const rows = yield* tx
        .select({ id: protocols.id })
        .from(protocols)
        .where(
          and(
            eq(protocols.teamId, 'team-a'),
            eq(protocols.id, protocolId),
            reachableByCaller(member),
          ),
        );
      return rows.length === 1;
    });

    const asked = () =>
      Promise.all([
        inA(listProtocols('team-a', member)),
        inA(isReachableByCaller('team-a', protocolId, member)),
        inA(throughTheFragment),
      ]);

    // No grant: the line is behind a study the member cannot see, so both
    // statements must refuse it.
    const [withoutGrant, reachableWithoutGrant, fragmentWithoutGrant] =
      await asked();
    expect(withoutGrant.map((row) => row.id)).not.toContain(protocolId);
    expect(reachableWithoutGrant).toBe(false);
    expect(fragmentWithoutGrant).toBe(false);

    await db.query(
      `INSERT INTO study_role_grants
         (id, team_id, study_id, user_id, role, granted_by_user_id)
       VALUES ($1, 'team-a', $2, $3, 'protocol_designer', 'tenancy-granter')`,
      [randomUUID(), studyId, member.actorUserId],
    );

    const [withGrant, reachableWithGrant, fragmentWithGrant] = await asked();
    expect(withGrant.map((row) => row.id)).toContain(protocolId);
    expect(reachableWithGrant).toBe(true);
    expect(fragmentWithGrant).toBe(true);
  });

  it('GC of one team never collects another\u2019s identical-content sections', async () => {
    // Content unique to this test, identical in both teams, so A's copy
    // becomes unreferenced on discard while B's stays pinned by its draft.
    const shared = { ...baseProtocol(), name: 'GC Shared' };
    const a = await inA(createProtocol('team-a', cipher, { protocol: shared }));
    const b = await inB(createProtocol('team-b', cipher, { protocol: shared }));
    const settingsHash = (await inB(getDraftSections('team-b', b.draftId)))
      .sectionHashes.settings!;

    await inA(discardDraft('team-a', a.draftId));
    await sweep();
    await ageQuarantine(db, 'team-a');
    await sweep();

    const survivors = await db.query(
      `SELECT team_id FROM sections WHERE hash = $1`,
      [settingsHash],
    );
    expect(
      (survivors.rows as { team_id: string }[]).map((row) => row.team_id),
    ).toEqual(['team-b']);
    expect(await inB(getDraftDocument('team-b', b.draftId))).toEqual(shared);
  });

  it('collects rows belonging to a team with no teams row', async () => {
    // The sync tables carry team_id without a foreign key into teams, and the
    // sync path never requires one to exist — so GC has to enumerate tenants
    // from the tables it sweeps. Enumerating from teams would strand these
    // rows permanently.
    const inGhost = <A, E>(body: Effect.Effect<A, E, Transaction>) =>
      inTeam('team-ghost', body);
    const sync = makeTestSyncServer();
    const draftId = randomUUID();
    await inGhost(
      sync.createDraft(draftId, {
        settings: { name: 'Ghost', description: 'first' },
      }),
    );
    const lease = await inGhost(sync.acquire(draftId, 'settings', 'ghost-tab'));
    await inGhost(
      sync.commit({
        draftId,
        sectionId: 'settings',
        owner: 'ghost-tab',
        epoch: lease!.epoch,
        clientSeq: 1n,
        commands: [{ op: 'set', key: 'description', value: 'second' }],
      }),
    );
    await inGhost(expireLease(draftId, 'settings'));

    // Reached through `drafts`: the superseded manifest is collectable.
    await sweep();
    const manifests = await db.query(
      `SELECT seq FROM manifests WHERE draft_id = $1 ORDER BY seq`,
      [draftId],
    );
    expect(manifests.rows).toEqual([{ seq: '1' }]);

    // Discarding the draft leaves the team present only in `sections`, the
    // other half of the enumeration.
    await inGhost(discardDraft('team-ghost', draftId));
    await sweep();
    await ageQuarantine(db, 'team-ghost');
    await sweep();
    const orphaned = await db.query(
      `SELECT count(*)::int AS remaining FROM sections WHERE team_id = $1`,
      ['team-ghost'],
    );
    expect(orphaned.rows[0]).toEqual({ remaining: 0 });
  });
});
