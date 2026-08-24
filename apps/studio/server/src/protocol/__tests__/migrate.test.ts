import { randomUUID } from 'node:crypto';

import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type SectionDoc, canonicalize } from '@codaco/studio-sync/apply';
import { SyncServer } from '@codaco/studio-sync/server';
import type { TenantDb } from '@codaco/studio-sync/tenant';

import { migrateStoredVersionToDraft } from '../migrate.ts';
import { ProtocolStore } from '../store.ts';
import {
  TEST_TEAM_ID,
  baseProtocol,
  makeStoreSchema,
  storeDb,
} from './helpers.ts';

// Write-time validation pins new sections to the current schema, so a stored
// schema-7 version has to be seeded through the sync engine directly.
const V7_SECTIONS: Record<string, SectionDoc> = {
  'settings': { schemaVersion: 7 },
  'stageOrder': { stages: [] },
  'codebook:node:person': {
    name: 'Person',
    color: 'node-color-seq-1',
    displayVariable: 'personName',
    variables: {
      personName: { name: 'Name', type: 'text' },
    },
  },
};

describe.skipIf(!storeDb)('migrateStoredVersionToDraft', () => {
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

  async function seedV7Version(): Promise<{
    protocolId: string;
    versionId: string;
  }> {
    const protocolId = randomUUID();
    const draftId = randomUUID();
    await db.query(
      `INSERT INTO protocols (id, team_id, name) VALUES ($1, $2, $3)`,
      [protocolId, TEST_TEAM_ID, 'Legacy Protocol'],
    );
    await new SyncServer(tenantDb).createDraft(draftId, V7_SECTIONS);
    await db.query(
      `INSERT INTO protocol_drafts (draft_id, team_id, protocol_id)
       VALUES ($1, $2, $3)`,
      [draftId, TEST_TEAM_ID, protocolId],
    );
    const published = await store.publishDraft({ draftId });
    if (published.status !== 'published') {
      throw new Error(`v7 publish failed: ${published.status}`);
    }
    return { protocolId, versionId: published.versionId };
  }

  it('migrates a stored v7 version into a current-schema draft and records provenance on publish', async () => {
    const { protocolId, versionId } = await seedV7Version();
    const versions = await store.listVersions(protocolId);
    expect(versions[0]!.schemaVersion).toBe(7);

    const frozenBefore = await db.query(
      `SELECT manifest FROM protocol_versions WHERE id = $1`,
      [versionId],
    );

    const migration = await migrateStoredVersionToDraft(tenantDb, {
      versionId,
    });
    expect(migration).toMatchObject({
      protocolId,
      fromSchemaVersion: 7,
      toSchemaVersion: 8,
    });

    const document = (await store.getDraftDocument(migration.draftId)) as {
      name: string;
      schemaVersion: number;
      codebook: {
        node: Record<string, { displayVariable?: string; shape?: unknown }>;
      };
    };
    expect(document.schemaVersion).toBe(8);
    expect(document.name).toBe('Legacy Protocol');
    expect(document.codebook.node.person!.displayVariable).toBeUndefined();
    expect(document.codebook.node.person!.shape).toBeDefined();

    const published = await store.publishDraft({ draftId: migration.draftId });
    if (published.status !== 'published') throw new Error(published.status);
    const after = await store.listVersions(protocolId);
    expect(after[0]).toMatchObject({
      versionNumber: 2,
      schemaVersion: 8,
      migratedFromVersionId: versionId,
    });

    const frozenAfter = await db.query(
      `SELECT manifest FROM protocol_versions WHERE id = $1`,
      [versionId],
    );
    expect(canonicalize(frozenAfter.rows[0])).toBe(
      canonicalize(frozenBefore.rows[0]),
    );
  });

  it('migrating a current-schema version republishes as unchanged', async () => {
    const { draftId } = await store.createProtocol({
      protocol: baseProtocol(),
    });
    const published = await store.publishDraft({ draftId });
    if (published.status !== 'published') throw new Error(published.status);

    const migration = await migrateStoredVersionToDraft(tenantDb, {
      versionId: published.versionId,
    });
    expect(migration.fromSchemaVersion).toBe(8);
    expect(migration.toSchemaVersion).toBe(8);

    const republished = await store.publishDraft({
      draftId: migration.draftId,
    });
    expect(republished).toEqual({
      status: 'unchanged',
      versionId: published.versionId,
      versionNumber: published.versionNumber,
    });
  });
});
