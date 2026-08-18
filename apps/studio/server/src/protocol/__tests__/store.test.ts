import { randomUUID } from 'node:crypto';

import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { LeaseRejectedError, SyncServer } from '@codaco/studio-sync/server';

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
import { baseProtocol, makeStoreSchema, storeDb } from './helpers.ts';

describe.skipIf(!storeDb)('ProtocolStore drafts', () => {
  let db: pg.Pool;
  let dispose: () => Promise<void>;
  let store: ProtocolStore;

  beforeAll(async () => {
    ({ db, dispose } = await makeStoreSchema());
    store = new ProtocolStore(db);
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
    const sync = new SyncServer(db);
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
    const result = await addStage(db, {
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
      addStage(db, {
        draftId,
        stage: baseProtocol().stages[0]!,
      }),
    ).rejects.toThrow(/already exists/);
    await expect(
      addStage(db, {
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
      addStage(db, { draftId, stage: { id: 'bad', type: 'Information' } }),
    ).rejects.toThrow(SectionValidationFailedError);
    for (const index of [1.5, Number.NaN]) {
      await expect(
        addStage(db, {
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
    await removeStage(db, { draftId, stageId: 'sociogram1' });

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
      removeStage(db, { draftId, stageId: 'sociogram1' }),
    ).rejects.toThrow(DraftStructureError);
  });

  it('adds and removes codebook entities', async () => {
    const { draftId } = await store.createProtocol({
      protocol: baseProtocol(),
    });
    await addCodebookEntity(db, {
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
      addCodebookEntity(db, {
        draftId,
        ref: { entity: 'node', typeId: 'place' },
        definition: {
          name: 'Place',
          color: 'node-color-seq-3',
          shape: { default: 'square' },
        },
      }),
    ).rejects.toThrow(/already exists/);

    await removeCodebookEntity(db, {
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
      addCodebookEntity(db, {
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
    const sync = createProtocolSyncServer(db);
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
    const sync = createProtocolSyncServer(db);
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
    const sync = new SyncServer(db);
    const lease = await sync.acquire(draftId, 'stageOrder', 'editor-tab');
    expect(lease).not.toBeNull();

    await addStage(db, {
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
    const sync = new SyncServer(db);
    const lease = await sync.acquire(
      draftId,
      'codebook:edge:knows',
      'editor-tab',
    );
    expect(lease).not.toBeNull();

    await removeCodebookEntity(db, {
      draftId,
      ref: { entity: 'edge', typeId: 'knows' },
    });
    await addCodebookEntity(db, {
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

  it('discardDraft removes every draft row', async () => {
    const { draftId } = await store.createProtocol({
      protocol: baseProtocol(),
    });
    const sync = new SyncServer(db);
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
