// Cross-workspace isolation at the application layer: identical content
// dedupes per workspace, reads cannot cross the boundary, and GC in one
// workspace never collects another's rows.
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  SyncServer,
  UnknownSectionDocumentError,
  UnknownSectionError,
} from '@codaco/studio-sync/server';
import { createTenantDb, type TenantDb } from '@codaco/studio-sync/tenant';

import { seedWorkspace } from '../../__tests__/support/postgres.ts';
import { gcProtocolStore } from '../gc.ts';
import { ProtocolStore, ProtocolStoreError } from '../store.ts';
import {
  GC_OPTS,
  ageQuarantine,
  baseProtocol,
  makeStoreSchema,
  storeDb,
} from './helpers.ts';

describe.skipIf(!storeDb)('workspace isolation', () => {
  let db: pg.Pool;
  let dispose: () => Promise<void>;
  let tenantA: TenantDb;
  let tenantB: TenantDb;
  let storeA: ProtocolStore;
  let storeB: ProtocolStore;

  beforeAll(async () => {
    ({ db, dispose } = await makeStoreSchema());
    await seedWorkspace(db, 'ws-a');
    await seedWorkspace(db, 'ws-b');
    tenantA = createTenantDb(db, 'ws-a');
    tenantB = createTenantDb(db, 'ws-b');
    storeA = new ProtocolStore(tenantA);
    storeB = new ProtocolStore(tenantB);
  });
  afterAll(async () => {
    await dispose();
  });

  it('deduplicates identical section content per workspace, not globally', async () => {
    const a = await storeA.createProtocol({ protocol: baseProtocol() });
    const b = await storeB.createProtocol({ protocol: baseProtocol() });

    const headA = await storeA.getDraftSections(a.draftId);
    const headB = await storeB.getDraftSections(b.draftId);
    expect(headA.sectionHashes).toEqual(headB.sectionHashes);

    const settingsHash = headA.sectionHashes.settings!;
    const rows = await db.query(
      `SELECT workspace_id FROM sections WHERE hash = $1 ORDER BY workspace_id`,
      [settingsHash],
    );
    expect(rows.rows).toEqual([
      { workspace_id: 'ws-a' },
      { workspace_id: 'ws-b' },
    ]);
  });

  it('refuses reads across the workspace boundary', async () => {
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

    const syncA = new SyncServer(tenantA);
    await expect(syncA.acquire(b.draftId, 'settings', 'tab-a')).rejects.toThrow(
      UnknownSectionError,
    );

    const bOnlySettingsHash = (await storeB.getDraftSections(b.draftId))
      .sectionHashes.settings!;
    await expect(syncA.getSection(bOnlySettingsHash)).rejects.toThrow(
      UnknownSectionDocumentError,
    );
    await expect(
      new SyncServer(tenantB).getSection(bOnlySettingsHash),
    ).resolves.toMatchObject({ name: 'Only in B' });
  });

  it('lists only the workspace’s own protocols', async () => {
    const { protocolId } = await storeA.createProtocol({
      protocol: baseProtocol(),
    });
    const inA = await storeA.listProtocols();
    const inB = await storeB.listProtocols();
    expect(inA.map((p) => p.id)).toContain(protocolId);
    expect(inB.map((p) => p.id)).not.toContain(protocolId);
  });

  it('GC of one workspace never collects another’s identical-content sections', async () => {
    // Content unique to this test, identical in both workspaces, so A's copy
    // becomes unreferenced on discard while B's stays pinned by its draft.
    const shared = { ...baseProtocol(), name: 'GC Shared' };
    const a = await storeA.createProtocol({ protocol: shared });
    const b = await storeB.createProtocol({ protocol: shared });
    const settingsHash = (await storeB.getDraftSections(b.draftId))
      .sectionHashes.settings!;

    await storeA.discardDraft(a.draftId);
    await gcProtocolStore(db, GC_OPTS);
    await ageQuarantine(db, 'ws-a');
    await gcProtocolStore(db, GC_OPTS);

    const survivors = await db.query(
      `SELECT workspace_id FROM sections WHERE hash = $1`,
      [settingsHash],
    );
    expect(
      (survivors.rows as { workspace_id: string }[]).map(
        (row) => row.workspace_id,
      ),
    ).toEqual(['ws-b']);
    expect(await storeB.getDraftDocument(b.draftId)).toEqual(shared);
  });
});
