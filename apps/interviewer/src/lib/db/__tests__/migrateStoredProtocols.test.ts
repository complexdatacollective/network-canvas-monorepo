// fake-indexeddb must be imported before Dexie opens a database.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
import {
  decryptAsset,
  decryptProtocol,
  encryptAsset,
  encryptProtocol,
  encryptSession,
} from '../recordCrypto';
import { setSessionDek } from '../sessionKey';
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
    expect(sessions.map((s) => s.currentStep)).toEqual([2, 2]);

    // Assets are keyed by protocol hash, so they move too — re-encrypted under
    // their new id, since the id is the ciphertext's authenticated data.
    expect(await db.assets.get('old-hash::key-1')).toBeUndefined();
    const assetRow = await db.assets.get(`${row.hash}::key-1`);
    if (!assetRow) throw new Error('expected the asset to be re-keyed');
    expect(assetRow.protocolHash).toBe(row.hash);
    expect((await decryptAsset(assetRow)).data).toBe('secret-key-1');
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

  it('rewrites in place when migrating does not change the protocol structure', async () => {
    // The hash covers codebook + stages only. An empty protocol migrates to an
    // identical structure, so the row keeps its key and nothing has to move.
    const emptyV7 = {
      schemaVersion: 7,
      codebook: { node: {}, edge: {}, ego: {} },
      stages: [],
    };
    const hash = hashProtocol(asStoredDocument(emptyV7));
    expect(migratedHash(emptyV7, 'Empty Study')).toBe(hash);

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
    // covers codebook and stages only, and the rows can carry different media
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

  it('heals a session a legacy writer pointed back at a superseded hash', async () => {
    // A tab still running the pre-update bundle wrote the session AFTER the
    // migration deleted its protocol row: its updateSession predates the
    // commit-time hash guard, so the stale hash landed. The next launch
    // follows the durable record — including a chain of them — and repairs.
    await db.protocolMigrations.bulkPut([
      { previousHash: 'dead', hash: 'mid', migratedAt: '2026-01-01' },
      { previousHash: 'mid', hash: 'live', migratedAt: '2026-02-01' },
    ]);
    await seedSession('stale-session', 'dead');
    await seedSession('healthy-session', 'live');

    await migrateStoredProtocols();

    const sessions = await db.sessions.toArray();
    expect(sessions.find((s) => s.id === 'stale-session')?.protocolHash).toBe(
      'live',
    );
    expect(sessions.find((s) => s.id === 'healthy-session')?.protocolHash).toBe(
      'live',
    );
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
