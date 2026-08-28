import { randomUUID } from 'node:crypto';

import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  LeaseRejectedError,
  SyncServer,
  UnknownDraftError,
  UnknownSectionError,
} from '@codaco/studio-sync/server';
import type { TenantDb } from '@codaco/studio-sync/tenant';

import {
  DraftStructureError,
  addCodebookEntity,
  addStage,
  removeCodebookEntity,
  removeStage,
} from '../draft-structure.ts';
import { ProtocolStore } from '../store.ts';
import { createProtocolSyncServer } from '../sync.ts';
import { SectionValidationFailedError } from '../validate.ts';
import {
  TEST_TEAM_ID,
  baseProtocol,
  makeStoreSchema,
  storeDb,
  waitForLockWait,
} from './helpers.ts';

describe.skipIf(!storeDb)('ProtocolStore drafts', () => {
  let db: pg.Pool;
  let tenantDb: TenantDb;
  let dispose: () => Promise<void>;
  let store: ProtocolStore;

  beforeAll(async () => {
    ({ db, tenantDb, dispose } = await makeStoreSchema());
    store = new ProtocolStore(tenantDb);
  });
  afterAll(async () => {
    await dispose();
  });

  it('createProtocol round-trips through getDraftDocument', async () => {
    const { draftId } = await store.createProtocol({
      protocol: baseProtocol(),
    });
    expect(await store.getDraftDocument(draftId)).toEqual(baseProtocol());
  });

  it('createProtocol returns the same draft for a repeated creation identity', async () => {
    const protocolId = randomUUID();
    const draftId = randomUUID();
    const params = { protocol: baseProtocol(), protocolId, draftId };

    await expect(store.createProtocol(params)).resolves.toEqual({
      protocolId,
      draftId,
    });
    await expect(store.createProtocol(params)).resolves.toEqual({
      protocolId,
      draftId,
    });

    const rows = await db.query(
      `SELECT count(*)::int AS count FROM protocol_drafts
       WHERE protocol_id = $1 AND draft_id = $2`,
      [protocolId, draftId],
    );
    expect(rows.rows[0]).toEqual({ count: 1 });
  });

  it('reads protocol draft metadata without loading section documents', async () => {
    const { protocolId, draftId } = await store.createProtocol({
      protocol: baseProtocol(),
    });
    const getDraftSections = vi.spyOn(store, 'getDraftSections');

    await expect(
      store.getProtocolDraftMetadata(protocolId, draftId),
    ).resolves.toMatchObject({ id: protocolId, draftId });
    expect(getDraftSections).not.toHaveBeenCalled();

    getDraftSections.mockRestore();
  });

  it('createProtocol rejects a section that fails write-time validation', async () => {
    const protocol = baseProtocol();
    (protocol.stages[0] as { label?: string }).label = '';
    await expect(store.createProtocol({ protocol })).rejects.toThrow(
      SectionValidationFailedError,
    );
  });

  it('sync-engine edits are visible through getDraftDocument', async () => {
    const { draftId } = await store.createProtocol({
      protocol: baseProtocol(),
    });
    const sync = new SyncServer(tenantDb);
    const lease = await sync.acquire(draftId, 'stage:nameGenerator1', 'tab-1');
    expect(lease).not.toBeNull();
    await sync.commit({
      draftId,
      sectionId: 'stage:nameGenerator1',
      owner: 'tab-1',
      epoch: lease!.epoch,
      clientSeq: 1n,
      commands: [{ op: 'set', key: 'label', value: 'Renamed' }],
    });
    const document = (await store.getDraftDocument(draftId)) as {
      stages: { id: string; label: string }[];
    };
    expect(document.stages[0]!.label).toBe('Renamed');
  });

  it('addStage inserts section and order entry in one manifest advance', async () => {
    const { draftId } = await store.createProtocol({
      protocol: baseProtocol(),
    });
    const before = await store.getDraftSections(draftId);
    const result = await addStage(tenantDb, {
      draftId,
      stage: {
        id: 'info1',
        type: 'Information',
        label: 'About',
        title: 'About this study',
        items: [{ id: 'item1', type: 'text', content: 'Welcome.' }],
      },
      index: 1,
    });
    expect(result.manifestSeq).toBe(before.headSeq + 1n);

    const after = await store.getDraftSections(draftId);
    for (const [id, hash] of Object.entries(before.sectionHashes)) {
      if (id !== 'stageOrder') expect(after.sectionHashes[id]).toBe(hash);
    }
    const document = (await store.getDraftDocument(draftId)) as {
      stages: { id: string }[];
    };
    expect(document.stages.map((stage) => stage.id)).toEqual([
      'nameGenerator1',
      'info1',
      'sociogram1',
    ]);
  });

  it('addStage refuses duplicates, bad indexes, and invalid stages', async () => {
    const { draftId } = await store.createProtocol({
      protocol: baseProtocol(),
    });
    await expect(
      addStage(tenantDb, {
        draftId,
        stage: baseProtocol().stages[0]!,
      }),
    ).rejects.toThrow(/already exists/);
    await expect(
      addStage(tenantDb, {
        draftId,
        stage: {
          id: 'info2',
          type: 'Information',
          label: 'X',
          title: 'X',
          items: [{ id: 'item1', type: 'text', content: 'Y.' }],
        },
        index: 99,
      }),
    ).rejects.toThrow(/out of range/);
    await expect(
      addStage(tenantDb, {
        draftId,
        stage: { id: 'bad', type: 'Information' },
      }),
    ).rejects.toThrow(SectionValidationFailedError);
    for (const index of [1.5, Number.NaN]) {
      await expect(
        addStage(tenantDb, {
          draftId,
          stage: {
            id: 'info3',
            type: 'Information',
            label: 'X',
            title: 'X',
            items: [{ id: 'item1', type: 'text', content: 'Y.' }],
          },
          index,
        }),
      ).rejects.toThrow(/out of range/);
    }
  });

  it('removeStage drops the section from the manifest but keeps the row', async () => {
    const { draftId } = await store.createProtocol({
      protocol: baseProtocol(),
    });
    const before = await store.getDraftSections(draftId);
    const removedHash = before.sectionHashes['stage:sociogram1'];
    await removeStage(tenantDb, { draftId, stageId: 'sociogram1' });

    const document = (await store.getDraftDocument(draftId)) as {
      stages: { id: string }[];
    };
    expect(document.stages.map((stage) => stage.id)).toEqual([
      'nameGenerator1',
    ]);
    const row = await db.query(`SELECT 1 FROM sections WHERE hash = $1`, [
      removedHash,
    ]);
    expect(row.rowCount).toBe(1);

    await expect(
      removeStage(tenantDb, { draftId, stageId: 'sociogram1' }),
    ).rejects.toThrow(DraftStructureError);
  });

  it('adds and removes codebook entities', async () => {
    const { draftId } = await store.createProtocol({
      protocol: baseProtocol(),
    });
    await addCodebookEntity(tenantDb, {
      draftId,
      ref: { entity: 'node', typeId: 'place' },
      definition: {
        name: 'Place',
        color: 'node-color-seq-3',
        shape: { default: 'square' },
      },
    });
    let document = (await store.getDraftDocument(draftId)) as {
      codebook: { node: Record<string, unknown> };
    };
    expect(Object.keys(document.codebook.node).toSorted()).toEqual([
      'person',
      'place',
    ]);

    await expect(
      addCodebookEntity(tenantDb, {
        draftId,
        ref: { entity: 'node', typeId: 'place' },
        definition: {
          name: 'Place',
          color: 'node-color-seq-3',
          shape: { default: 'square' },
        },
      }),
    ).rejects.toThrow(/already exists/);

    await removeCodebookEntity(tenantDb, {
      draftId,
      ref: { entity: 'node', typeId: 'place' },
    });
    document = (await store.getDraftDocument(draftId)) as {
      codebook: { node: Record<string, unknown> };
    };
    expect(Object.keys(document.codebook.node)).toEqual(['person']);
  });

  it('refuses a codebook type id the assembled protocol could never validate', async () => {
    const { draftId } = await store.createProtocol({
      protocol: baseProtocol(),
    });
    await expect(
      addCodebookEntity(tenantDb, {
        draftId,
        ref: { entity: 'node', typeId: 'person type' },
        definition: {
          name: 'Person Type',
          color: 'node-color-seq-3',
          shape: { default: 'square' },
        },
      }),
    ).rejects.toThrow(DraftStructureError);
    const document = (await store.getDraftDocument(draftId)) as {
      codebook: { node: Record<string, unknown> };
    };
    expect(Object.keys(document.codebook.node)).toEqual(['person']);
  });

  it('a validating sync server rejects a lease commit that would wedge the draft', async () => {
    const { draftId } = await store.createProtocol({
      protocol: baseProtocol(),
    });
    const sync = createProtocolSyncServer(tenantDb);
    const lease = await sync.acquire(draftId, 'stageOrder', 'tab-1');
    const before = await store.getDraftSections(draftId);

    await expect(
      sync.commit({
        draftId,
        sectionId: 'stageOrder',
        owner: 'tab-1',
        epoch: lease!.epoch,
        clientSeq: 1n,
        commands: [{ op: 'unset', key: 'stages' }],
      }),
    ).rejects.toThrow(SectionValidationFailedError);

    const after = await store.getDraftSections(draftId);
    expect(after.headManifestHash).toBe(before.headManifestHash);
    expect(await store.getDraftDocument(draftId)).toEqual(baseProtocol());
  });

  it('a validating sync server rejects a stage rename of its own id', async () => {
    const { draftId } = await store.createProtocol({
      protocol: baseProtocol(),
    });
    const sync = createProtocolSyncServer(tenantDb);
    const lease = await sync.acquire(draftId, 'stage:sociogram1', 'tab-1');

    await expect(
      sync.commit({
        draftId,
        sectionId: 'stage:sociogram1',
        owner: 'tab-1',
        epoch: lease!.epoch,
        clientSeq: 1n,
        commands: [{ op: 'set', key: 'id', value: 'renamed' }],
      }),
    ).rejects.toThrow(SectionValidationFailedError);
    expect(await store.validateDraft(draftId)).toEqual({ valid: true });
  });

  it('structural ops fence the stageOrder lease, rejecting stale positional commits', async () => {
    const { draftId } = await store.createProtocol({
      protocol: baseProtocol(),
    });
    const sync = new SyncServer(tenantDb);
    const lease = await sync.acquire(draftId, 'stageOrder', 'editor-tab');
    expect(lease).not.toBeNull();

    await addStage(tenantDb, {
      draftId,
      stage: {
        id: 'infoFence',
        type: 'Information',
        label: 'Fence',
        title: 'Fence',
        items: [{ id: 'item1', type: 'text', content: 'Z.' }],
      },
      index: 0,
    });

    // The pending moveItem describes indices of the pre-insertion list.
    await expect(
      sync.commit({
        draftId,
        sectionId: 'stageOrder',
        owner: 'editor-tab',
        epoch: lease!.epoch,
        clientSeq: 1n,
        commands: [{ op: 'moveItem', key: 'stages', from: 0, to: 1 }],
      }),
    ).rejects.toThrow(LeaseRejectedError);
  });

  it('removal fences the section lease, so a re-added section rejects stale edits (ABA)', async () => {
    const { draftId } = await store.createProtocol({
      protocol: baseProtocol(),
    });
    const sync = new SyncServer(tenantDb);
    const lease = await sync.acquire(
      draftId,
      'codebook:edge:knows',
      'editor-tab',
    );
    expect(lease).not.toBeNull();

    await removeCodebookEntity(tenantDb, {
      draftId,
      ref: { entity: 'edge', typeId: 'knows' },
    });
    await addCodebookEntity(tenantDb, {
      draftId,
      ref: { entity: 'edge', typeId: 'knows' },
      definition: { name: 'Knows', color: 'edge-color-seq-2' },
    });

    await expect(
      sync.commit({
        draftId,
        sectionId: 'codebook:edge:knows',
        owner: 'editor-tab',
        epoch: lease!.epoch,
        clientSeq: 1n,
        commands: [{ op: 'set', key: 'name', value: 'Stale' }],
      }),
    ).rejects.toThrow(LeaseRejectedError);
  });

  it('a structural op that waits for a commit sees the manifest that commit wrote', async () => {
    const { draftId } = await store.createProtocol({
      protocol: baseProtocol(),
    });
    const sync = new SyncServer(tenantDb);
    const lease = await sync.acquire(draftId, 'settings', 'commit-tab');

    const blocker = await db.connect();
    await blocker.query('BEGIN');
    await blocker.query(`SELECT 1 FROM drafts WHERE id = $1 FOR UPDATE`, [
      draftId,
    ]);
    const head = await store.getDraftSections(draftId);
    const advanced = { ...head.sectionHashes, settings: 'advanced-hash' };
    await blocker.query(
      `INSERT INTO sections (team_id, hash, doc)
       VALUES ($1, 'advanced-hash', '{}'::jsonb)`,
      [TEST_TEAM_ID],
    );
    await blocker.query(
      `INSERT INTO manifests (draft_id, team_id, seq, hash, parent_hash, section_hashes)
       VALUES ($1, $5, $2, 'advanced-manifest', $3, $4)`,
      [
        draftId,
        String(head.headSeq + 1n),
        head.headManifestHash,
        advanced,
        TEST_TEAM_ID,
      ],
    );
    await blocker.query(
      `UPDATE drafts SET head_seq = $2, head_manifest_hash = 'advanced-manifest'
       WHERE id = $1`,
      [draftId, String(head.headSeq + 1n)],
    );

    const pending = removeStage(tenantDb, { draftId, stageId: 'sociogram1' });
    await waitForLockWait(db);
    await blocker.query('COMMIT');
    blocker.release();

    const result = await pending;
    expect(result.manifestSeq).toBe(head.headSeq + 2n);
    await sync.release(draftId, 'settings', 'commit-tab', lease!.epoch);
  });

  it('a validating sync server rejects a stage order the draft cannot assemble', async () => {
    const { draftId } = await store.createProtocol({
      protocol: baseProtocol(),
    });
    const sync = createProtocolSyncServer(tenantDb);
    const lease = await sync.acquire(draftId, 'stageOrder', 'tab-1');
    const before = await store.getDraftSections(draftId);

    for (const stages of [
      ['nameGenerator1', 'sociogram1', 'ghost'],
      ['nameGenerator1'],
      ['nameGenerator1', 'sociogram1', 'sociogram1'],
    ]) {
      await expect(
        sync.commit({
          draftId,
          sectionId: 'stageOrder',
          owner: 'tab-1',
          epoch: lease!.epoch,
          clientSeq: 1n,
          commands: [{ op: 'set', key: 'stages', value: stages }],
        }),
      ).rejects.toThrow(SectionValidationFailedError);
    }

    const after = await store.getDraftSections(draftId);
    expect(after.headManifestHash).toBe(before.headManifestHash);
    expect(await store.getDraftDocument(draftId)).toEqual(baseProtocol());
  });

  it('reports an unassemblable draft as invalid rather than throwing', async () => {
    const { draftId } = await store.createProtocol({
      protocol: baseProtocol(),
    });
    const sync = new SyncServer(tenantDb);
    const lease = await sync.acquire(draftId, 'stageOrder', 'tab-1');
    await sync.commit({
      draftId,
      sectionId: 'stageOrder',
      owner: 'tab-1',
      epoch: lease!.epoch,
      clientSeq: 1n,
      commands: [{ op: 'set', key: 'stages', value: ['ghost'] }],
    });

    const validation = await store.validateDraft(draftId);
    expect(validation.valid).toBe(false);
    const published = await store.publishDraft({ draftId });
    expect(published.status).toBe('invalid');
  });

  it('refuses to take over a lease whose section has been removed', async () => {
    const { draftId } = await store.createProtocol({
      protocol: baseProtocol(),
    });
    const sync = new SyncServer(tenantDb);
    await sync.acquire(draftId, 'stage:sociogram1', 'editor-tab');
    await removeStage(tenantDb, { draftId, stageId: 'sociogram1' });

    await expect(
      sync.takeover(draftId, 'stage:sociogram1', 'other-tab'),
    ).rejects.toThrow(UnknownSectionError);
  });

  it('a discarded draft rejects a queued commit and refuses to resume', async () => {
    const { draftId } = await store.createProtocol({
      protocol: baseProtocol(),
    });
    const sync = new SyncServer(tenantDb);
    const lease = await sync.acquire(draftId, 'settings', 'editor-tab');
    await store.discardDraft(draftId);

    await expect(
      sync.commit({
        draftId,
        sectionId: 'settings',
        owner: 'editor-tab',
        epoch: lease!.epoch,
        clientSeq: 1n,
        commands: [{ op: 'set', key: 'description', value: 'orphan' }],
      }),
    ).rejects.toThrow(LeaseRejectedError);
    await expect(sync.resume(draftId, 'editor-tab')).rejects.toThrow(
      UnknownDraftError,
    );
  });

  it('discardDraft removes every draft row', async () => {
    const { draftId } = await store.createProtocol({
      protocol: baseProtocol(),
    });
    const sync = new SyncServer(tenantDb);
    await sync.acquire(draftId, 'settings', 'tab-1');
    await store.discardDraft(draftId);

    for (const table of [
      'drafts',
      'manifests',
      'protocol_drafts',
      'command_log',
      'leases',
    ]) {
      const column = table === 'drafts' ? 'id' : 'draft_id';
      const res = await db.query(
        `SELECT 1 FROM ${table} WHERE ${column} = $1`,
        [draftId],
      );
      expect(res.rowCount, table).toBe(0);
    }
  });

  it('unknown drafts and versions surface as errors', async () => {
    await expect(store.getDraftDocument(randomUUID())).rejects.toThrow(
      /no draft/,
    );
    await expect(store.getVersionDocument(randomUUID())).rejects.toThrow(
      /no version/,
    );
    await expect(
      store.createDraftFromVersion({ versionId: randomUUID() }),
    ).rejects.toThrow(/no version/);
  });
});
