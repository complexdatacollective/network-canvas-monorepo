// Cross-team isolation at the application layer: identical content dedupes per
// team, reads cannot cross the boundary, and GC in one team never collects
// another's rows.
import { randomUUID } from 'node:crypto';

import { Effect } from 'effect';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  UnknownSectionDocumentError,
  UnknownSectionError,
} from '@codaco/studio-sync/server';
import { createTenantDb, type TenantDb } from '@codaco/studio-sync/tenant';

import { seedTeam } from '../../__tests__/support/postgres.ts';
import { testCipher } from '../../__tests__/support/secrets.ts';
import { Database } from '../../jobs/effect/database.ts';
import { gcProtocolStore } from '../../jobs/effect/handlers/protocol-store-gc.ts';
import { ProtocolStore, ProtocolStoreError } from '../store.ts';
import {
  GC_OPTS,
  ageQuarantine,
  baseProtocol,
  expireLease,
  makeStoreSchema,
  makeTestSyncServer,
  storeDb,
} from './helpers.ts';

describe.skipIf(!storeDb)('team isolation', () => {
  let db: pg.Pool;
  let app: pg.Pool;
  let schema: string;
  let dispose: () => Promise<void>;
  let tenantA: TenantDb;
  let tenantB: TenantDb;
  let storeA: ProtocolStore;
  let storeB: ProtocolStore;

  /**
   * The sweep. It is an Effect over its own maintenance client now
   * (`src/jobs/effect/handlers/protocol-store-gc.ts`), so the scratch schema
   * goes in as a `search_path` rather than as a pool. Built per call —
   * `local: true` — because a shared layer's pool would outlive the suite.
   */
  const sweep = () =>
    Effect.runPromise(
      Effect.provide(
        gcProtocolStore(GC_OPTS),
        Database.layer('maintenance', {
          url: storeDb!.url,
          maxConnections: 2,
          applicationName: 'studio-tenancy-gc',
          searchPath: schema,
        }),
        { local: true },
      ),
    );

  beforeAll(async () => {
    ({ db, app, dispose } = await makeStoreSchema());
    const current = await db.query<{ schema: string }>(
      'select current_schema() as schema',
    );
    schema = current.rows[0]!.schema;
    await seedTeam(db, 'team-a');
    await seedTeam(db, 'team-b');
    tenantA = createTenantDb(app, 'team-a');
    tenantB = createTenantDb(app, 'team-b');
    storeA = new ProtocolStore(tenantA, testCipher());
    storeB = new ProtocolStore(tenantB, testCipher());
  });
  afterAll(async () => {
    await dispose();
  });

  it('deduplicates identical section content per team, not globally', async () => {
    const a = await storeA.createProtocol({ protocol: baseProtocol() });
    const b = await storeB.createProtocol({ protocol: baseProtocol() });

    const headA = await storeA.getDraftSections(a.draftId);
    const headB = await storeB.getDraftSections(b.draftId);
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
    const b = await storeB.createProtocol({ protocol: bOnlyProtocol });
    await expect(storeA.getDraftSections(b.draftId)).rejects.toThrow(
      ProtocolStoreError,
    );

    const published = await storeB.publishDraft({ draftId: b.draftId });
    if (published.status !== 'published') {
      throw new Error(`publish failed: ${published.status}`);
    }
    await expect(
      storeA.getVersionSections(published.versionId),
    ).rejects.toThrow(ProtocolStoreError);

    const syncA = makeTestSyncServer(tenantA);
    await expect(syncA.acquire(b.draftId, 'settings', 'tab-a')).rejects.toThrow(
      UnknownSectionError,
    );

    const bOnlySettingsHash = (await storeB.getDraftSections(b.draftId))
      .sectionHashes.settings!;
    await expect(syncA.getSection(bOnlySettingsHash)).rejects.toThrow(
      UnknownSectionDocumentError,
    );
    await expect(
      makeTestSyncServer(tenantB).getSection(bOnlySettingsHash),
    ).resolves.toMatchObject({ name: 'Only in B' });
  });

  it('lists only the team’s own protocols', async () => {
    const { protocolId } = await storeA.createProtocol({
      protocol: baseProtocol(),
    });
    // A team Admin's visibility, so what this asserts is the team boundary
    // rather than #1257's within-team rule (rpc-protocols.test.ts covers that).
    const seesEverything = {
      actorUserId: 'tenancy-user',
      seesEveryStudy: true,
    };
    const inA = await storeA.listProtocols(seesEverything);
    const inB = await storeB.listProtocols(seesEverything);
    expect(inA.map((p) => p.id)).toContain(protocolId);
    expect(inB.map((p) => p.id)).not.toContain(protocolId);
  });

  it('GC of one team never collects another’s identical-content sections', async () => {
    // Content unique to this test, identical in both teams, so A's copy
    // becomes unreferenced on discard while B's stays pinned by its draft.
    const shared = { ...baseProtocol(), name: 'GC Shared' };
    const a = await storeA.createProtocol({ protocol: shared });
    const b = await storeB.createProtocol({ protocol: shared });
    const settingsHash = (await storeB.getDraftSections(b.draftId))
      .sectionHashes.settings!;

    await storeA.discardDraft(a.draftId);
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
    expect(await storeB.getDraftDocument(b.draftId)).toEqual(shared);
  });

  it('collects rows belonging to a team with no teams row', async () => {
    // The sync tables carry team_id without a foreign key into teams, and the
    // sync path never requires one to exist — so GC has to enumerate tenants
    // from the tables it sweeps. Enumerating from teams would strand these
    // rows permanently.
    const ghost = createTenantDb(app, 'team-ghost');
    const sync = makeTestSyncServer(ghost);
    const draftId = randomUUID();
    await sync.createDraft(draftId, {
      settings: { name: 'Ghost', description: 'first' },
    });
    const lease = await sync.acquire(draftId, 'settings', 'ghost-tab');
    await sync.commit({
      draftId,
      sectionId: 'settings',
      owner: 'ghost-tab',
      epoch: lease!.epoch,
      clientSeq: 1n,
      commands: [{ op: 'set', key: 'description', value: 'second' }],
    });
    await expireLease(ghost, draftId, 'settings');

    // Reached through `drafts`: the superseded manifest is collectable.
    await sweep();
    const manifests = await db.query(
      `SELECT seq FROM manifests WHERE draft_id = $1 ORDER BY seq`,
      [draftId],
    );
    expect(manifests.rows).toEqual([{ seq: '1' }]);

    // Discarding the draft leaves the team present only in `sections`, the
    // other half of the enumeration.
    await new ProtocolStore(ghost, testCipher()).discardDraft(draftId);
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
