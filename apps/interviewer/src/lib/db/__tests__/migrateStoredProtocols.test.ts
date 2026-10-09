// fake-indexeddb must be imported before Dexie opens a database.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getInterviewProgress } from '@codaco/interview';
import { COMPATIBLE_PROTOCOL_SCHEMA_VERSION } from '@codaco/interview/protocol-schema-version';
import {
  type CurrentProtocol,
  hashProtocol,
  migrateProtocol,
  validateProtocol,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNetwork,
} from '@codaco/shared-consts';

import { db } from '../db';
import { migrateStoredProtocols } from '../migrateStoredProtocols';
import { deleteProtocol } from '../protocols';
import {
  decryptAsset,
  decryptProtocol,
  decryptSession,
  encryptAsset,
  encryptProtocol,
  encryptSession,
} from '../recordCrypto';
import { setSessionDek } from '../sessionKey';
import { updateSession } from '../sessions';
import type { StoredProtocol, StoredSession } from '../types';

async function makeDek(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
}

const network: NcNetwork = {
  ego: { [entityPrimaryKeyProperty]: 'ego', [entityAttributesProperty]: {} },
  nodes: [],
  edges: [],
};

// A v7 protocol document. `displayVariable` and `iconVariant` are both rewritten
// by the v7→v8 migration, so migrating this changes the codebook — and
// therefore the structural hash the row is stored under.
function v7Document(): Record<string, unknown> {
  return {
    schemaVersion: 7,
    codebook: {
      node: {
        person: {
          name: 'Person',
          color: 'node-color-seq-1',
          iconVariant: 'add-a-person',
          displayVariable: 'name',
          variables: { name: { name: 'Name', type: 'text' } },
        },
      },
      edge: {},
      ego: {},
    },
    stages: [],
  };
}

// A v7 document the migration cannot read at all: `stages` is not an array, so
// protocol-validation rejects it before any transformation runs.
function brokenV7Document(): Record<string, unknown> {
  return {
    schemaVersion: 7,
    codebook: { node: {}, edge: {}, ego: {} },
    stages: 'not-an-array',
  };
}

// A v8 protocol that marks its person's name `encrypted`, stored with the
// `experiments` it was imported with.
function v8DocumentWithEncryptedName(
  experiments: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const { experiments: _seeded, ...v8 } = migrateProtocol(
    {
      schemaVersion: 7,
      codebook: {
        node: {
          person: {
            name: 'Person',
            color: 'node-color-seq-1',
            variables: {
              name: { name: 'Name', type: 'text', encrypted: true },
            },
          },
        },
        edge: {},
        ego: {},
      },
      stages: [],
    },
    8,
    { name: 'Alpha Study' },
  );
  return { ...v8, ...(experiments !== undefined ? { experiments } : {}) };
}

// A stored row's `protocol` is typed `CurrentProtocol` while its
// `schemaVersion` is deliberately widened to `number` — a row below the current
// version holds a document of that lower version, which is precisely the state
// this sweep exists to resolve. Seeding one means saying so.
function asStoredDocument(document: Record<string, unknown>): CurrentProtocol {
  return document as unknown as CurrentProtocol;
}

function storedRow(
  hash: string,
  name: string,
  document: Record<string, unknown>,
  importedAt = '2026-01-01T00:00:00.000Z',
): StoredProtocol {
  const codebook = document.codebook as CurrentProtocol['codebook'];
  return {
    id: hash,
    hash,
    name,
    schemaVersion: document.schemaVersion as number,
    importedAt,
    codebook,
    protocol: asStoredDocument(document),
  };
}

function storedSession(id: string, protocolHash: string): StoredSession {
  return {
    id,
    protocolHash,
    protocolName: 'Alpha Study',
    caseId: `case-${id}`,
    startedAt: '2026-01-02T00:00:00.000Z',
    lastUpdatedAt: '2026-01-02T00:00:00.000Z',
    finishedAt: null,
    exportedAt: null,
    currentStep: 2,
    network,
    localePreference: null,
    locale: null,
  };
}

// A schema 8 protocol whose Family Pedigree (stage 1) has an introduction
// screen. The v8 → v9 migration makes the introduction a stage of its own,
// inserted before the pedigree, so the pedigree and every later stage move one
// place on.
function v8PedigreeDocument(): Record<string, unknown> {
  return {
    schemaVersion: 8,
    name: 'Pedigree Study',
    codebook: {
      node: {
        person: {
          name: 'Person',
          color: 'node-color-seq-1',
          icon: 'add-a-person',
          shape: { default: 'circle' },
          variables: {
            name: { name: 'name', type: 'text', component: 'Text' },
            is_ego: { name: 'is_ego', type: 'boolean', component: 'Toggle' },
            biologicalSex: {
              name: 'biologicalSex',
              type: 'categorical',
              options: [
                { value: 'female', label: 'Female' },
                { value: 'male', label: 'Male' },
                {
                  value: 'intersex',
                  label: 'Intersex or a variation in sex characteristics',
                },
                { value: 'unknown', label: 'Don’t know' },
                { value: 'preferNotToSay', label: 'Prefer not to say' },
              ],
            },
          },
        },
      },
      edge: {
        family: {
          name: 'Family',
          color: 'edge-color-seq-1',
          variables: {
            kind: {
              name: 'kind',
              type: 'categorical',
              options: [
                { value: 'biological', label: 'Biological' },
                { value: 'social', label: 'Social' },
                { value: 'donor', label: 'Donor' },
                { value: 'surrogate', label: 'Surrogate' },
                { value: 'adoptive', label: 'Adoptive' },
                { value: 'partner', label: 'Partner' },
              ],
            },
            isActive: { name: 'isActive', type: 'boolean' },
            isGestationalCarrier: {
              name: 'isGestationalCarrier',
              type: 'boolean',
            },
          },
        },
      },
      ego: { variables: {} },
    },
    stages: [
      {
        id: 'welcome',
        type: 'Information',
        label: 'Welcome',
        title: 'Welcome',
        items: [{ id: 'welcome-text', type: 'text', content: 'Welcome' }],
      },
      {
        id: 'family',
        type: 'FamilyPedigree',
        label: 'Family',
        introScreen: {
          items: [{ id: 'intro', type: 'text', content: 'Your family.' }],
        },
        nodeConfig: {
          type: 'person',
          nodeLabelVariable: 'name',
          egoVariable: 'is_ego',
          biologicalSexVariable: 'biologicalSex',
        },
        edgeConfig: {
          type: 'family',
          relationshipTypeVariable: 'kind',
          isActiveVariable: 'isActive',
          isGestationalCarrierVariable: 'isGestationalCarrier',
        },
        framing: { mode: 'participantChoice' },
        censusPrompt: 'Who is in your family?',
      },
      {
        id: 'closing',
        type: 'Information',
        label: 'Closing',
        title: 'Closing',
        items: [{ id: 'closing-text', type: 'text', content: 'Thank you' }],
      },
    ],
  };
}

// A session at the pedigree, as the schema 8 interview recorded it once the
// pedigree was finalized: its stage record keyed by the pedigree's index. It
// has a relative on it, so it had passed the pedigree's introduction.
function v8PedigreeSession(id: string, protocolHash: string): StoredSession {
  return {
    ...storedSession(id, protocolHash),
    currentStep: 1,
    progress: 33,
    network: {
      ...network,
      nodes: [
        {
          [entityPrimaryKeyProperty]: 'ego-1',
          type: 'person',
          [entityAttributesProperty]: { is_ego: true },
          stageId: 'family',
          promptIDs: [],
        },
        {
          [entityPrimaryKeyProperty]: 'mother-1',
          type: 'person',
          [entityAttributesProperty]: { is_ego: false, name: 'Ana' },
          stageId: 'family',
          promptIDs: [],
        },
      ],
    },
    stageMetadata: {
      1: {
        isNetworkCommitted: true,
        edgeIdVersion: 1,
        nodes: [
          { id: 'ego-1', label: '', isEgo: true },
          { id: 'mother-1', label: 'Ana', isEgo: false },
        ],
        edges: [],
        selectedFraming: 'gamete',
      },
    } as unknown as StoredSession['stageMetadata'],
  };
}

// The pedigree study with a second screen before the pedigree, so a session
// can be part-way through (stage 1) while the v8 → v9 migration inserts the
// introduction stage after its position (before the pedigree, now stage 2).
function v8PedigreeDocumentWithPreamble(): Record<string, unknown> {
  const document = v8PedigreeDocument();
  const [welcome, ...rest] = document.stages as unknown[];
  return {
    ...document,
    stages: [
      welcome,
      {
        id: 'about',
        type: 'Information',
        label: 'About',
        title: 'About',
        items: [{ id: 'about-text', type: 'text', content: 'About' }],
      },
      ...rest,
    ],
  };
}

async function seedProtocol(row: StoredProtocol): Promise<void> {
  await db.protocols.put(await encryptProtocol(row));
}

async function seedSession(id: string, protocolHash: string): Promise<void> {
  await db.sessions.put(await encryptSession(storedSession(id, protocolHash)));
}

async function seedAsset(protocolHash: string, assetId: string): Promise<void> {
  await db.assets.put(
    await encryptAsset({
      id: `${protocolHash}::${assetId}`,
      protocolHash,
      assetId,
      name: 'Key',
      type: 'apikey',
      data: `secret-${assetId}`,
    }),
  );
}

// The hash the sweep is expected to land on. Used to SET UP the collision case
// (a row already sitting on the target hash); the migration assertions elsewhere
// check the stored row against its own content instead, so they do not lean on
// re-running the migration here.
function migratedHash(document: Record<string, unknown>, name: string): string {
  return hashProtocol(
    migrateProtocol(document, COMPATIBLE_PROTOCOL_SCHEMA_VERSION, { name }),
  );
}

async function clearAll(): Promise<void> {
  await db.sessions.clear();
  await db.protocols.clear();
  await db.assets.clear();
  await db.protocolMigrations.clear();
}

describe.each([
  ['plaintext (no vault configured)', false],
  ['encrypted (vault unlocked)', true],
])('migrateStoredProtocols — %s', (_label, encrypted) => {
  beforeEach(async () => {
    await clearAll();
    setSessionDek(encrypted ? await makeDek() : null);
  });
  afterEach(async () => {
    await clearAll();
    setSessionDek(null);
  });

  it('migrates a below-version protocol, repoints its sessions and assets, and drops the old row', async () => {
    await seedProtocol(storedRow('old-hash', 'Alpha Study', v7Document()));
    await seedSession('s1', 'old-hash');
    await seedSession('s2', 'old-hash');
    await seedAsset('old-hash', 'key-1');

    const result = await migrateStoredProtocols();

    expect(result.failed).toEqual([]);
    expect(result.migrated).toHaveLength(1);
    expect(result.migrated[0]?.name).toBe('Alpha Study');
    expect(result.migrated[0]?.fromVersion).toBe(7);
    expect(result.migrated[0]?.toVersion).toBe(
      COMPATIBLE_PROTOCOL_SCHEMA_VERSION,
    );

    // Exactly one row, under a new key, and that key is the hash of what the
    // row actually holds.
    const rows = await db.protocols.toArray();
    expect(rows).toHaveLength(1);
    const row = rows[0];
    if (!row) throw new Error('expected a migrated protocol row');
    expect(row.hash).not.toBe('old-hash');
    expect(row.id).toBe(row.hash);
    expect(await db.protocols.get('old-hash')).toBeUndefined();

    // The stored row is encrypted exactly when the source row was.
    expect(row._enc === undefined).toBe(!encrypted);

    const stored = await decryptProtocol(row);
    expect(hashProtocol(stored.protocol)).toBe(row.hash);
    expect(stored.schemaVersion).toBe(COMPATIBLE_PROTOCOL_SCHEMA_VERSION);
    expect(stored.protocol.schemaVersion).toBe(
      COMPATIBLE_PROTOCOL_SCHEMA_VERSION,
    );
    // The `name` dependency the migration needs comes from the row.
    expect(stored.protocol.name).toBe('Alpha Study');
    // The migration actually ran over the codebook.
    expect(stored.protocol.codebook.node?.person).not.toHaveProperty(
      'displayVariable',
    );
    // The import timestamp belongs to the protocol, not to this rewrite.
    expect(stored.importedAt).toBe('2026-01-01T00:00:00.000Z');

    const validation = await validateProtocol(stored.protocol);
    expect(validation.success).toBe(true);

    // Every session moved with it, and nothing else about them changed.
    const sessions = await db.sessions.toArray();
    expect(sessions.map((s) => s.protocolHash)).toEqual([row.hash, row.hash]);
    // The document has no stages, so each session was past the end, where the
    // engine's own finish screen was; it resumes on the finish stage the
    // migration appends there.
    expect(sessions.map((s) => s.currentStep)).toEqual([0, 0]);

    // Assets are keyed by protocol hash, so they move too — re-encrypted under
    // their new id, since the id is the ciphertext's authenticated data.
    expect(await db.assets.get('old-hash::key-1')).toBeUndefined();
    const assetRow = await db.assets.get(`${row.hash}::key-1`);
    if (!assetRow) throw new Error('expected the asset to be re-keyed');
    expect(assetRow.protocolHash).toBe(row.hash);
    expect((await decryptAsset(assetRow)).data).toBe('secret-key-1');
  });

  it('carries each session across the migration with its protocol', async () => {
    await seedProtocol(
      storedRow('old-hash', 'Pedigree Study', v8PedigreeDocument()),
    );
    await db.sessions.put(
      await encryptSession(v8PedigreeSession('s1', 'old-hash')),
    );

    const result = await migrateStoredProtocols();

    expect(result.failed).toEqual([]);
    const row = await db.sessions.get('s1');
    if (!row) throw new Error('expected the session to survive');
    expect(row.protocolHash).toBe(result.migrated[0]?.hash);
    // Readable again: the schema 8 pedigree record no longer fails the
    // current stage metadata schema.
    const session = await decryptSession(row);
    // The pedigree moved from stage 1 to 2, and its record with it.
    expect(session.currentStep).toBe(2);
    expect(session.stageMetadata).toEqual({ 2: { framing: 'gamete' } });
    expect(session.network.nodes).toHaveLength(2);
    // Progress re-derived for the moved position (stage 2 of 4 + finish).
    expect(session.progress).not.toBe(33);
    expect(session.lastUpdatedAt).toBe('2026-01-02T00:00:00.000Z');
  });

  // Progress is a share of the protocol's stages, so a migration that changes
  // how many there are changes every unfinished session's progress, even when
  // nothing the session holds has to move.
  it('re-derives the progress of every unfinished session against the migrated stages', async () => {
    await seedProtocol(
      storedRow('old-hash', 'Pedigree Study', v8PedigreeDocumentWithPreamble()),
    );
    // Stage 1 of 4 stages plus the finish stage.
    const before = getInterviewProgress(
      v8PedigreeDocumentWithPreamble().stages as { type: string }[],
      1,
    ).progress;
    // Nothing in this session moves: it is before the inserted stage and
    // holds no stage records.
    await db.sessions.put(
      await encryptSession({
        ...storedSession('untouched', 'old-hash'),
        currentStep: 1,
        progress: before,
      }),
    );
    // This one's pedigree record moves with the pedigree, but its position
    // does not.
    const pedigree = v8PedigreeSession('records-moved', 'old-hash');
    await db.sessions.put(
      await encryptSession({
        ...pedigree,
        currentStep: 1,
        progress: before,
        stageMetadata: {
          2: pedigree.stageMetadata?.[1],
        } as StoredSession['stageMetadata'],
      }),
    );
    // A finished session's progress stands.
    await db.sessions.put(
      await encryptSession({
        ...storedSession('finished', 'old-hash'),
        currentStep: 1,
        progress: 100,
        finishedAt: '2026-01-03T00:00:00.000Z',
      }),
    );

    const result = await migrateStoredProtocols();

    expect(result.failed).toEqual([]);
    const row = await db.protocols.get(result.migrated[0]?.hash ?? '');
    if (!row) throw new Error('expected the migrated protocol');
    const { protocol } = await decryptProtocol(row);
    // Four stages, the inserted introduction, and the appended finish stage.
    expect(protocol.stages).toHaveLength(6);
    const after = getInterviewProgress(protocol.stages, 1).progress;
    expect(after).not.toBe(before);

    const untouched = await decryptSession(
      (await db.sessions.get('untouched'))!,
    );
    expect(untouched.currentStep).toBe(1);
    expect(untouched.progress).toBe(after);
    const moved = await decryptSession(
      (await db.sessions.get('records-moved'))!,
    );
    expect(moved.currentStep).toBe(1);
    expect(Object.keys(moved.stageMetadata ?? {})).toEqual(['3']);
    expect(moved.progress).toBe(after);
    expect((await db.sessions.get('finished'))?.progress).toBe(100);
  });

  it('leaves the protocol and all its sessions as stored when one session cannot be migrated, and tries again at the next launch', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await seedProtocol(
      storedRow('old-hash', 'Pedigree Study', v8PedigreeDocument()),
    );
    await db.sessions.put(
      await encryptSession(v8PedigreeSession('s-ok', 'old-hash')),
    );
    const damaged = {
      ...v8PedigreeSession('s-damaged', 'old-hash'),
      stageMetadata: {
        1: { isNetworkCommitted: true },
        7: { notAStageRecord: true },
      },
    } as unknown as StoredSession;
    await db.sessions.put(await encryptSession(damaged));
    const before = {
      protocols: await db.protocols.toArray(),
      sessions: await db.sessions.toArray(),
      migrations: await db.protocolMigrations.toArray(),
    };

    const result = await migrateStoredProtocols();

    expect(result.migrated).toEqual([]);
    expect(result.failed).toEqual([
      {
        name: 'Pedigree Study',
        hash: 'old-hash',
        kind: 'sessions',
        reason: expect.stringContaining('left unchanged') as unknown,
        sessions: [
          {
            id: 's-damaged',
            reason: expect.stringContaining(
              'Migrated session is invalid',
            ) as unknown,
          },
        ],
      },
    ]);
    // Nothing was written: not the protocol, not the session that could be
    // migrated, not the re-keying record.
    expect({
      protocols: await db.protocols.toArray(),
      sessions: await db.sessions.toArray(),
      migrations: await db.protocolMigrations.toArray(),
    }).toEqual(before);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Pedigree Study'),
      expect.anything(),
      [expect.objectContaining({ id: 's-damaged' })],
    );

    // The next launch tries again, and fails the same way while the session
    // is unchanged...
    expect((await migrateStoredProtocols()).failed).toHaveLength(1);
    expect(await db.sessions.toArray()).toEqual(before.sessions);
    // ...and migrates everything together once every session can be.
    await db.sessions.delete('s-damaged');
    const retried = await migrateStoredProtocols();
    expect(retried.failed).toEqual([]);
    expect(retried.migrated).toHaveLength(1);
    const ok = await db.sessions.get('s-ok');
    expect(ok?.protocolHash).toBe(retried.migrated[0]?.hash);
    expect(ok?.currentStep).toBe(2);
    errorSpy.mockRestore();
  });

  it('leaves a protocol already at the compatible version completely alone', async () => {
    const current = migrateProtocol(
      v7Document(),
      COMPATIBLE_PROTOCOL_SCHEMA_VERSION,
      { name: 'Alpha Study' },
    );
    const hash = hashProtocol(current);
    await seedProtocol({
      id: hash,
      hash,
      name: 'Alpha Study',
      schemaVersion: current.schemaVersion,
      importedAt: '2026-01-01T00:00:00.000Z',
      codebook: current.codebook,
      protocol: current,
    });
    await seedSession('s1', hash);
    const before = await db.protocols.get(hash);

    await expect(migrateStoredProtocols()).resolves.toEqual({
      migrated: [],
      failed: [],
    });

    expect(await db.protocols.get(hash)).toEqual(before);
    expect((await db.sessions.get('s1'))?.protocolHash).toBe(hash);
  });

  it('rewrites in place when migrating does not change the protocol hash', async () => {
    // Every migration to schema 9 adds the localization declaration, which the
    // hash covers, so no real document keeps its hash. Storing the row under
    // the hash its migration produces is the state a later migration that
    // leaves the hash alone reaches: the row keeps its key and nothing moves.
    const emptyV7 = {
      schemaVersion: 7,
      codebook: { node: {}, edge: {}, ego: {} },
      stages: [],
    };
    const hash = migratedHash(emptyV7, 'Empty Study');

    await seedProtocol(storedRow(hash, 'Empty Study', emptyV7));
    await seedSession('s1', hash);

    const result = await migrateStoredProtocols();

    expect(result.failed).toEqual([]);
    expect(result.migrated[0]?.previousHash).toBe(hash);
    expect(result.migrated[0]?.hash).toBe(hash);
    expect(await db.protocols.count()).toBe(1);
    const row = await db.protocols.get(hash);
    if (!row) throw new Error('expected the row to survive in place');
    expect((await decryptProtocol(row)).schemaVersion).toBe(
      COMPATIBLE_PROTOCOL_SCHEMA_VERSION,
    );
    expect((await db.sessions.get('s1'))?.protocolHash).toBe(hash);
  });

  it('refuses a collision with an existing row and leaves everything untouched', async () => {
    // Equal structural hashes do NOT make two rows interchangeable — the hash
    // covers structure only, and the rows can carry different media
    // or API keys. Merging would resume this row's interviews against the
    // other row's resources, so the sweep must refuse.
    const collisionHash = migratedHash(v7Document(), 'Alpha Study');
    const existing = migrateProtocol(
      v7Document(),
      COMPATIBLE_PROTOCOL_SCHEMA_VERSION,
      { name: 'Existing Copy' },
    );
    await seedProtocol({
      id: collisionHash,
      hash: collisionHash,
      name: 'Existing Copy',
      schemaVersion: existing.schemaVersion,
      importedAt: '2026-02-02T00:00:00.000Z',
      codebook: existing.codebook,
      protocol: existing,
    });
    await seedAsset(collisionHash, 'key-1');
    await seedSession('existing-session', collisionHash);

    await seedProtocol(storedRow('old-hash', 'Alpha Study', v7Document()));
    await seedSession('s1', 'old-hash');
    await seedAsset('old-hash', 'key-1');

    const result = await migrateStoredProtocols();

    expect(result.migrated).toEqual([]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.name).toBe('Alpha Study');
    expect(result.failed[0]?.reason).toMatch(/not interchangeable/);

    // Both rows survive exactly as they were.
    expect(await db.protocols.count()).toBe(2);
    const oldRow = await db.protocols.get('old-hash');
    expect(oldRow?.schemaVersion).toBe(7);
    const existingRow = await db.protocols.get(collisionHash);
    expect(existingRow?.name).toBe('Existing Copy');

    // Neither protocol's sessions moved.
    const sessions = await db.sessions.toArray();
    expect(
      sessions.find((s) => s.id === 'existing-session')?.protocolHash,
    ).toBe(collisionHash);
    expect(sessions.find((s) => s.id === 's1')?.protocolHash).toBe('old-hash');

    // Both rows keep their own assets.
    expect(await db.assets.count()).toBe(2);
    const assetRow = await db.assets.get(`${collisionHash}::key-1`);
    if (!assetRow) throw new Error('expected the existing asset to survive');
    expect((await decryptAsset(assetRow)).data).toBe('secret-key-1');
  });

  it('writes a durable re-keying record when a protocol changes hash', async () => {
    await seedProtocol(storedRow('old-hash', 'Alpha Study', v7Document()));

    const result = await migrateStoredProtocols();

    const newHash = result.migrated[0]?.hash;
    expect(newHash).toBeTruthy();
    const record = await db.protocolMigrations.get('old-hash');
    expect(record?.hash).toBe(newHash);
  });

  it('repoints a session written back under a hash superseded before sessions were migrated', async () => {
    // Records written by Interviewer 8.3 and earlier keep no source row:
    // those migrations repointed every session without changing it, so
    // healing a late write across them does the same — including along a
    // chain of them.
    await db.protocolMigrations.bulkPut([
      { previousHash: 'dead', hash: 'mid', migratedAt: '2026-01-01' },
      { previousHash: 'mid', hash: 'live', migratedAt: '2026-02-01' },
    ]);
    const current = migrateProtocol(
      v7Document(),
      COMPATIBLE_PROTOCOL_SCHEMA_VERSION,
      { name: 'Alpha Study' },
    );
    await seedProtocol({
      ...storedRow('live', 'Alpha Study', v7Document()),
      schemaVersion: current.schemaVersion,
      codebook: current.codebook,
      protocol: current,
    });
    await seedSession('stale-session', 'dead');
    await seedSession('healthy-session', 'live');

    const result = await migrateStoredProtocols();

    expect(result.failed).toEqual([]);
    const sessions = await db.sessions.toArray();
    expect(sessions.find((s) => s.id === 'stale-session')?.protocolHash).toBe(
      'live',
    );
    expect(sessions.find((s) => s.id === 'healthy-session')?.protocolHash).toBe(
      'live',
    );
  });

  it('leaves a session under a superseded hash when the protocol it leads to was deleted', async () => {
    await db.protocolMigrations.put({
      previousHash: 'dead',
      hash: 'deleted',
      migratedAt: '2026-01-01',
    });
    await seedSession('orphan', 'dead');

    await expect(migrateStoredProtocols()).resolves.toEqual({
      migrated: [],
      failed: [],
    });
    expect((await db.sessions.get('orphan'))?.protocolHash).toBe('dead');
  });

  // A tab still running the pre-update bundle can write a session after the
  // migration committed, restoring the superseded hash together with the
  // schema 8 payload it holds in memory. Healing must carry that payload
  // across the same migration, not only repoint it.
  it('migrates a session a legacy writer wrote back under a superseded hash', async () => {
    await seedProtocol(
      storedRow('old-hash', 'Pedigree Study', v8PedigreeDocument()),
    );
    const first = await migrateStoredProtocols();
    const hash = first.migrated[0]?.hash;
    if (!hash) throw new Error('expected the protocol to migrate');

    // The late write: the pre-update tab's whole session, old hash and all.
    await db.sessions.put(
      await encryptSession(v8PedigreeSession('late', 'old-hash')),
    );

    const second = await migrateStoredProtocols();

    expect(second.failed).toEqual([]);
    const row = await db.sessions.get('late');
    if (!row) throw new Error('expected the session to survive');
    expect(row.protocolHash).toBe(hash);
    const session = await decryptSession(row);
    expect(session.currentStep).toBe(2);
    expect(session.stageMetadata).toEqual({ 2: { framing: 'gamete' } });
    const protocolRow = await db.protocols.get(hash);
    if (!protocolRow) throw new Error('expected the migrated protocol');
    expect(session.progress).toBe(
      getInterviewProgress(
        (await decryptProtocol(protocolRow)).protocol.stages,
        2,
      ).progress,
    );
  });

  // The same late write from a tab running this build: `updateSession` is
  // told which protocol its whole-state write was computed against, stores
  // it under that hash rather than the migrated one, and the next launch
  // carries it across the migration.
  it('migrates a whole-state write a stale tab of this build made after the migration', async () => {
    await seedProtocol(
      storedRow('old-hash', 'Pedigree Study', v8PedigreeDocument()),
    );
    const stale = v8PedigreeSession('s1', 'old-hash');
    await db.sessions.put(await encryptSession(stale));
    const first = await migrateStoredProtocols();
    const hash = first.migrated[0]?.hash;
    if (!hash) throw new Error('expected the protocol to migrate');

    await updateSession(
      's1',
      {
        network: stale.network,
        stageMetadata: stale.stageMetadata,
        currentStep: 1,
      },
      { protocolHash: 'old-hash' },
    );
    expect((await db.sessions.get('s1'))?.protocolHash).toBe('old-hash');

    const second = await migrateStoredProtocols();

    expect(second.failed).toEqual([]);
    const row = await db.sessions.get('s1');
    if (!row) throw new Error('expected the session to survive');
    expect(row.protocolHash).toBe(hash);
    const session = await decryptSession(row);
    expect(session.currentStep).toBe(2);
    expect(session.stageMetadata).toEqual({ 2: { framing: 'gamete' } });
  });

  it('leaves late-written sessions under their superseded hash, and reports the protocol, when one of them cannot be migrated', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await seedProtocol(
      storedRow('old-hash', 'Pedigree Study', v8PedigreeDocument()),
    );
    const first = await migrateStoredProtocols();
    const hash = first.migrated[0]?.hash;
    if (!hash) throw new Error('expected the protocol to migrate');

    await db.sessions.put(
      await encryptSession(v8PedigreeSession('late-ok', 'old-hash')),
    );
    await db.sessions.put(
      await encryptSession({
        ...v8PedigreeSession('late-damaged', 'old-hash'),
        stageMetadata: {
          1: { isNetworkCommitted: true },
          7: { notAStageRecord: true },
        },
      } as unknown as StoredSession),
    );
    const before = {
      protocols: await db.protocols.toArray(),
      sessions: await db.sessions.toArray(),
    };

    const second = await migrateStoredProtocols();

    expect(second.failed).toEqual([
      {
        name: 'Pedigree Study',
        hash,
        kind: 'sessions',
        reason: expect.stringContaining('left unchanged') as unknown,
        sessions: [
          {
            id: 'late-damaged',
            reason: expect.stringContaining(
              'Migrated session is invalid',
            ) as unknown,
          },
        ],
      },
    ]);
    expect({
      protocols: await db.protocols.toArray(),
      sessions: await db.sessions.toArray(),
    }).toEqual(before);

    // Every launch tries again, and heals them together once all can be.
    await db.sessions.delete('late-damaged');
    const third = await migrateStoredProtocols();
    expect(third.failed).toEqual([]);
    expect((await db.sessions.get('late-ok'))?.protocolHash).toBe(hash);
    errorSpy.mockRestore();
  });

  it('deletes the re-keying records, and the rows they keep, with the protocol they lead to', async () => {
    await seedProtocol(
      storedRow('old-hash', 'Pedigree Study', v8PedigreeDocument()),
    );
    await seedProtocol(storedRow('other-hash', 'Alpha Study', v7Document()));
    const result = await migrateStoredProtocols();
    const pedigree = result.migrated.find((m) => m.name === 'Pedigree Study');
    if (!pedigree) throw new Error('expected the protocol to migrate');
    expect(
      (await db.protocolMigrations.get('old-hash'))?.source?.row.hash,
    ).toBe('old-hash');

    await deleteProtocol(pedigree.hash);

    expect(await db.protocolMigrations.get('old-hash')).toBeUndefined();
    expect(await db.protocolMigrations.get('other-hash')).toBeDefined();
  });

  it('deletes the sessions still stored under a hash the protocol was migrated from', async () => {
    await seedProtocol(
      storedRow('old-hash', 'Pedigree Study', v8PedigreeDocument()),
    );
    await seedProtocol(storedRow('other-hash', 'Alpha Study', v7Document()));
    const result = await migrateStoredProtocols();
    const pedigree = result.migrated.find((m) => m.name === 'Pedigree Study');
    if (!pedigree) throw new Error('expected the protocol to migrate');
    // An interview tab opened before the migration writes its whole state
    // back under the hash it loaded.
    await seedSession('stale-tab', 'old-hash');
    await seedSession('current', pedigree.hash);
    // Another protocol's interviews, under its own superseded hash, stay.
    await seedSession('other-stale', 'other-hash');

    await deleteProtocol(pedigree.hash);

    expect(await db.sessions.get('stale-tab')).toBeUndefined();
    expect(await db.sessions.get('current')).toBeUndefined();
    expect(await db.sessions.get('other-stale')).toBeDefined();
  });

  it('leaves a protocol it cannot migrate untouched and carries on with the rest', async () => {
    await seedProtocol(
      storedRow('broken-hash', 'Broken Study', brokenV7Document()),
    );
    await seedSession('broken-session', 'broken-hash');
    await seedProtocol(storedRow('old-hash', 'Alpha Study', v7Document()));
    await seedSession('s1', 'old-hash');

    const result = await migrateStoredProtocols();

    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.name).toBe('Broken Study');
    expect(result.failed[0]?.hash).toBe('broken-hash');
    expect(result.failed[0]?.reason).toBeTruthy();

    // The failed row and its session are exactly as they were.
    const broken = await db.protocols.get('broken-hash');
    expect(broken?.schemaVersion).toBe(7);
    expect((await db.sessions.get('broken-session'))?.protocolHash).toBe(
      'broken-hash',
    );

    // The healthy row still migrated.
    expect(result.migrated).toHaveLength(1);
    expect(result.migrated[0]?.name).toBe('Alpha Study');
    expect(await db.protocols.get('old-hash')).toBeUndefined();
    expect((await db.sessions.get('s1'))?.protocolHash).toBe(
      result.migrated[0]?.hash,
    );
  });

  it('rolls back the protocol and its sessions together when a write fails mid-transaction', async () => {
    await seedProtocol(storedRow('old-hash', 'Alpha Study', v7Document()));
    await seedSession('s1', 'old-hash');
    await seedAsset('old-hash', 'key-1');

    // Fail the last write in the transaction — deleting the superseded row —
    // after the new row, its assets, and the session repoint have all been
    // written. Nothing may survive that.
    const deleteSpy = vi
      .spyOn(db.protocols, 'delete')
      .mockImplementation(() => {
        throw new Error('simulated write failure');
      });

    try {
      const result = await migrateStoredProtocols();
      expect(result.migrated).toEqual([]);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0]?.name).toBe('Alpha Study');
    } finally {
      deleteSpy.mockRestore();
    }

    // The old row is still the only one, still at its old version.
    const rows = await db.protocols.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.hash).toBe('old-hash');
    expect(rows[0]?.schemaVersion).toBe(7);
    // The session did not move onto a hash that no longer exists.
    expect((await db.sessions.get('s1'))?.protocolHash).toBe('old-hash');
    // No half-written asset was left behind under the abandoned hash.
    expect(await db.assets.count()).toBe(1);
    expect(await db.assets.get('old-hash::key-1')).toBeDefined();
  });

  it('is a no-op on an empty database', async () => {
    await expect(migrateStoredProtocols()).resolves.toEqual({
      migrated: [],
      failed: [],
    });
  });
});

describe('migrateStoredProtocols — encrypted attributes of a schema 8 protocol', () => {
  const NAME_ENCRYPTED = ['node', 'person', 'variables', 'name', 'encrypted'];

  beforeEach(async () => {
    await clearAll();
    setSessionDek(null);
  });
  afterEach(clearAll);

  async function migrateEncryptedNameProtocol(
    experiments: Record<string, unknown> | undefined,
  ): Promise<StoredProtocol> {
    const document = v8DocumentWithEncryptedName(experiments);
    const hash = hashProtocol(asStoredDocument(document));
    await seedProtocol(storedRow(hash, 'Alpha Study', document));
    await seedSession('s1', hash);

    const result = await migrateStoredProtocols();

    expect(result.failed).toEqual([]);
    expect(result.migrated).toHaveLength(1);
    const rows = await db.protocols.toArray();
    expect(rows).toHaveLength(1);
    const row = rows[0];
    if (!row) throw new Error('expected a migrated protocol row');
    const stored = await decryptProtocol(row);
    expect(stored.protocol.schemaVersion).toBe(
      COMPATIBLE_PROTOCOL_SCHEMA_VERSION,
    );
    expect((await db.sessions.get('s1'))?.protocolHash).toBe(stored.hash);
    return stored;
  }

  function expectUnmarked(stored: StoredProtocol) {
    expect(stored.protocol.codebook).not.toHaveProperty(NAME_ENCRYPTED);
    expect(stored.protocol.codebook).toHaveProperty(
      ['node', 'person', 'variables', 'name', 'type'],
      'text',
    );
  }

  it('keeps an attribute encrypted when the protocol had encryption on, and keeps its experiments without that one', async () => {
    const stored = await migrateEncryptedNameProtocol({
      encryptedVariables: true,
    });

    expect(stored.protocol.codebook).toHaveProperty(NAME_ENCRYPTED, true);
    expect(stored.protocol.experiments).toStrictEqual({});
  });

  it.each([
    ['empty experiments', {}],
    ['encryption off', { encryptedVariables: false }],
  ])(
    'unmarks an encrypted attribute when the protocol had %s, and keeps its experiments',
    async (_label, experiments) => {
      const stored = await migrateEncryptedNameProtocol(experiments);

      expectUnmarked(stored);
      expect(stored.protocol.experiments).toStrictEqual({});
    },
  );

  it('unmarks an encrypted attribute when the protocol had no experiments, and adds none', async () => {
    const stored = await migrateEncryptedNameProtocol(undefined);

    expectUnmarked(stored);
    expect(stored.protocol).not.toHaveProperty('experiments');
  });
});
