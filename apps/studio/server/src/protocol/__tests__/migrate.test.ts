import { randomUUID } from 'node:crypto';

import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import { type SectionDoc, canonicalize } from '@codaco/studio-sync/apply';
import type { TenantDb } from '@codaco/studio-sync/tenant';

import { testCipher } from '../../__tests__/support/secrets.ts';
import { ASSET_KEY_PLACEHOLDER, openAssetKey } from '../asset-keys.ts';
import { migrateStoredVersionToDraft } from '../migrate.ts';
import { ProtocolStore } from '../store.ts';
import {
  TEST_TEAM_ID,
  baseProtocol,
  makeStoreSchema,
  makeTestSyncServer,
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
    store = new ProtocolStore(tenantDb, testCipher());
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
    await makeTestSyncServer(tenantDb).createDraft(draftId, V7_SECTIONS);
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

  it('migrates a version whose API key is sealed, and leaves it sealed', async () => {
    // What is stored is redacted: an `apikey` entry with no `value`, which the
    // schema requires. `migrateProtocol` pre-validates its input and validates
    // its output, so a migration of such a version was refused outright
    // (#1900) — and a migration that put the placeholder back would write a
    // fake key into the new draft's sections.
    const KEY = 'map-key-migrated-sealed';
    const { protocolId, draftId } = await store.createProtocol({
      protocol: {
        ...baseProtocol(),
        assetManifest: {
          mapKey: { name: 'Mapbox token', type: 'apikey', value: KEY },
        },
      } as unknown as CurrentProtocol,
    });
    const published = await store.publishDraft({ draftId });
    if (published.status !== 'published') throw new Error(published.status);

    const migration = await migrateStoredVersionToDraft(tenantDb, {
      versionId: published.versionId,
    });
    expect(migration.protocolId).toBe(protocolId);

    // Still redacted, under the same asset id — which is what keeps the sealed
    // row (keyed by team, protocol and asset) reachable from the new draft.
    const document = (await store.getDraftDocument(migration.draftId)) as {
      assetManifest: Record<string, Record<string, unknown>>;
    };
    expect(document.assetManifest.mapKey).toEqual({
      name: 'Mapbox token',
      type: 'apikey',
    });

    const docs = await db.query(`SELECT doc::text AS doc FROM sections`);
    const all = (docs.rows as { doc: string }[])
      .map((row) => row.doc)
      .join('\n');
    expect(all).not.toContain(KEY);
    expect(all).not.toContain(ASSET_KEY_PLACEHOLDER);

    await expect(
      openAssetKey(tenantDb, testCipher(), {
        teamId: TEST_TEAM_ID,
        protocolId,
        assetId: 'mapKey',
      }),
    ).resolves.toBe(KEY);
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
