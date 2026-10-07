import { randomUUID } from 'node:crypto';

import type { Effect } from 'effect';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CURRENT_SCHEMA_VERSION,
  type CurrentProtocol,
} from '@codaco/protocol-validation';
import { type SectionDoc, canonicalize } from '@codaco/studio-sync/apply';

import { testCipher } from '../../__tests__/support/secrets.ts';
import type { Transaction } from '../../db/tenant.ts';
import { ASSET_KEY_PLACEHOLDER, openAssetKey } from '../asset-keys.ts';
import { migrateStoredVersionToDraft } from '../migrate.ts';
import {
  createProtocol,
  getDraftDocument,
  listVersions,
  publishDraft,
} from '../store.ts';
import {
  TEST_TEAM_ID,
  baseProtocol,
  makeStoreSchema,
  makeTestSyncServer,
  type StoreSchema,
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

// A stored schema-8 version whose person name is marked encrypted, under the
// given experiments.
const v8EncryptedSections = (
  experiments: SectionDoc | undefined,
): Record<string, SectionDoc> => ({
  'settings': {
    name: 'Legacy Protocol',
    schemaVersion: 8,
    ...(experiments !== undefined && { experiments }),
  },
  'stageOrder': { stages: [] },
  'codebook:node:person': {
    name: 'Person',
    color: 'node-color-seq-1',
    shape: { default: 'circle' },
    variables: {
      personName: { name: 'Name', type: 'text', encrypted: true },
    },
  },
});

describe.skipIf(!storeDb)('migrateStoredVersionToDraft', () => {
  let store: StoreSchema;
  let run: <A, E>(body: Effect.Effect<A, E, Transaction>) => Promise<A>;
  const cipher = testCipher();

  beforeAll(async () => {
    store = await makeStoreSchema();
    run = (body) => store.inTeam(TEST_TEAM_ID, body);
  });
  afterAll(async () => {
    await store.dispose();
  });

  async function seedVersion(
    storedSections: Record<string, SectionDoc>,
  ): Promise<{
    protocolId: string;
    versionId: string;
  }> {
    const protocolId = randomUUID();
    const draftId = randomUUID();
    await store.affected(
      `INSERT INTO protocols (id, team_id, name) VALUES ($1, $2, $3)`,
      [protocolId, TEST_TEAM_ID, 'Legacy Protocol'],
    );
    await run(makeTestSyncServer().createDraft(draftId, storedSections));
    await store.affected(
      `INSERT INTO protocol_drafts (draft_id, team_id, protocol_id)
       VALUES ($1, $2, $3)`,
      [draftId, TEST_TEAM_ID, protocolId],
    );
    const published = await run(publishDraft(TEST_TEAM_ID, { draftId }));
    if (published.status !== 'published') {
      throw new Error(`seeded publish failed: ${published.status}`);
    }
    return { protocolId, versionId: published.versionId };
  }

  it('migrates a stored v7 version into a current-schema draft and records provenance on publish', async () => {
    const { protocolId, versionId } = await seedVersion(V7_SECTIONS);
    const versions = await run(listVersions(TEST_TEAM_ID, protocolId));
    expect(versions[0]!.schemaVersion).toBe(7);

    const frozenBefore = await store.rows(
      `SELECT manifest FROM protocol_versions WHERE id = $1`,
      [versionId],
    );

    const migration = await run(
      migrateStoredVersionToDraft(TEST_TEAM_ID, { versionId }),
    );
    expect(migration).toMatchObject({
      protocolId,
      fromSchemaVersion: 7,
      toSchemaVersion: CURRENT_SCHEMA_VERSION,
    });

    const document = (await run(
      getDraftDocument(TEST_TEAM_ID, migration.draftId),
    )) as {
      name: string;
      schemaVersion: number;
      codebook: {
        node: Record<string, { displayVariable?: string; shape?: unknown }>;
      };
    };
    expect(document.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(document.name).toBe('Legacy Protocol');
    expect(document.codebook.node.person!.displayVariable).toBeUndefined();
    expect(document.codebook.node.person!.shape).toBeDefined();

    const published = await run(
      publishDraft(TEST_TEAM_ID, { draftId: migration.draftId }),
    );
    if (published.status !== 'published') throw new Error(published.status);
    const after = await run(listVersions(TEST_TEAM_ID, protocolId));
    expect(after[0]).toMatchObject({
      versionNumber: 2,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      migratedFromVersionId: versionId,
    });

    const frozenAfter = await store.rows(
      `SELECT manifest FROM protocol_versions WHERE id = $1`,
      [versionId],
    );
    expect(canonicalize(frozenAfter[0])).toBe(canonicalize(frozenBefore[0]));
  });

  async function migratedDraftOf(versionId: string) {
    const migration = await run(
      migrateStoredVersionToDraft(TEST_TEAM_ID, { versionId }),
    );
    return run(getDraftDocument(TEST_TEAM_ID, migration.draftId));
  }

  it('keeps a stored v8 version’s attributes encrypted when its experiments turned encryption on', async () => {
    // Values already collected for them are ciphertext.
    const { versionId } = await seedVersion(
      v8EncryptedSections({ encryptedVariables: true }),
    );

    const document = await migratedDraftOf(versionId);

    expect(document).toHaveProperty(
      'codebook.node.person.variables.personName.encrypted',
      true,
    );
    expect(document).not.toHaveProperty('experiments');
  });

  it.each([
    ['absent', undefined],
    ['off', { encryptedVariables: false }],
  ])(
    'unmarks a stored v8 version’s encrypted attributes when encryption was %s',
    async (_description, experiments) => {
      const { versionId } = await seedVersion(v8EncryptedSections(experiments));

      const document = await migratedDraftOf(versionId);

      expect(document).toHaveProperty(
        'codebook.node.person.variables.personName.type',
        'text',
      );
      expect(document).not.toHaveProperty(
        'codebook.node.person.variables.personName.encrypted',
      );
      expect(document).not.toHaveProperty('experiments');
    },
  );

  it('migrates a version whose API key is sealed, and leaves it sealed', async () => {
    // What is stored is redacted: an `apikey` entry with no `value`, which the
    // schema requires. `migrateProtocol` pre-validates its input and validates
    // its output, so a migration of such a version was refused outright
    // (#1900) — and a migration that put the placeholder back would write a
    // fake key into the new draft's sections.
    const KEY = 'map-key-migrated-sealed';
    const { protocolId, draftId } = await run(
      createProtocol(TEST_TEAM_ID, cipher, {
        protocol: {
          ...baseProtocol(),
          assetManifest: {
            mapKey: { name: 'Mapbox token', type: 'apikey', value: KEY },
          },
        } as unknown as CurrentProtocol,
      }),
    );
    const published = await run(publishDraft(TEST_TEAM_ID, { draftId }));
    if (published.status !== 'published') throw new Error(published.status);

    const migration = await run(
      migrateStoredVersionToDraft(TEST_TEAM_ID, {
        versionId: published.versionId,
      }),
    );
    expect(migration.protocolId).toBe(protocolId);

    // Still redacted, under the same asset id — which is what keeps the sealed
    // row (keyed by team, protocol and asset) reachable from the new draft.
    const document = (await run(
      getDraftDocument(TEST_TEAM_ID, migration.draftId),
    )) as {
      assetManifest: Record<string, Record<string, unknown>>;
    };
    expect(document.assetManifest.mapKey).toEqual({
      name: 'Mapbox token',
      type: 'apikey',
    });

    const docs = await store.rows<{ doc: string }>(
      `SELECT doc::text AS doc FROM sections`,
    );
    const all = docs.map((row) => row.doc).join('\n');
    expect(all).not.toContain(KEY);
    expect(all).not.toContain(ASSET_KEY_PLACEHOLDER);

    await expect(
      run(
        openAssetKey(cipher, {
          teamId: TEST_TEAM_ID,
          protocolId,
          assetId: 'mapKey',
        }),
      ),
    ).resolves.toBe(KEY);
  });

  it('migrating a current-schema version republishes as unchanged', async () => {
    const { draftId } = await run(
      createProtocol(TEST_TEAM_ID, cipher, { protocol: baseProtocol() }),
    );
    const published = await run(publishDraft(TEST_TEAM_ID, { draftId }));
    if (published.status !== 'published') throw new Error(published.status);

    const migration = await run(
      migrateStoredVersionToDraft(TEST_TEAM_ID, {
        versionId: published.versionId,
      }),
    );
    expect(migration.fromSchemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migration.toSchemaVersion).toBe(CURRENT_SCHEMA_VERSION);

    const republished = await run(
      publishDraft(TEST_TEAM_ID, { draftId: migration.draftId }),
    );
    expect(republished).toEqual({
      status: 'unchanged',
      versionId: published.versionId,
      versionNumber: published.versionNumber,
    });
  });
});
