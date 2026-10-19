// fake-indexeddb must be imported before Dexie opens a database.
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  deleteLegacyInterviewerDatabase,
  fingerprintDatabase,
  FROZEN_PROTOCOL_PLAINTEXT,
  FROZEN_ROWS,
  importFrozenDek,
  LEGACY_DB_NAME,
  seedLegacyInterviewerDatabase,
} from '~/testUtils/legacyInterviewerDatabase';

import {
  closeLegacyLibrary,
  createLegacyLibraryReader,
  listLegacyProtocols,
  legacyReadOnlyMiddleware,
} from '../legacyLibrary';
import { setSessionDek } from '../sessionKey';

const plaintextSchema8 = {
  id: 'plain-8',
  hash: 'plain-8',
  name: 'Plain Study',
  schemaVersion: 8,
  importedAt: '2026-03-01T00:00:00.000Z',
  description: 'Collected before the device was secured',
  codebook: { node: {}, edge: {}, ego: {} },
  protocol: {
    schemaVersion: 8,
    codebook: { node: {}, edge: {}, ego: {} },
    stages: [],
  },
};

// A row a pre-release build of this app wrote into Interviewer 8's database.
const preReleaseSchema9 = {
  ...plaintextSchema8,
  id: 'pre-release-9',
  hash: 'pre-release-9',
  name: 'Pre-release',
  schemaVersion: 9,
  importedAt: '2026-04-01T00:00:00.000Z',
};

const plaintextSession = (
  id: string,
  protocolHash: string,
  lastUpdatedAt: string,
) => ({
  id,
  protocolHash,
  protocolName: 'Plain Study',
  caseId: `case-${id}`,
  startedAt: '2026-03-02T00:00:00.000Z',
  lastUpdatedAt,
  finishedAt: null,
  exportedAt: null,
  currentStep: 2,
  progress: 40,
  network: { ego: { _uid: 'ego', attributes: {} }, nodes: [], edges: [] },
});

const seedEverything = () =>
  seedLegacyInterviewerDatabase({
    protocols: [FROZEN_ROWS.protocol, plaintextSchema8, preReleaseSchema9],
    sessions: [
      FROZEN_ROWS.session,
      plaintextSession('s-old', 'plain-8', '2026-03-03T00:00:00.000Z'),
      plaintextSession('s-new', 'plain-8', '2026-03-09T00:00:00.000Z'),
      plaintextSession('s-pre', 'pre-release-9', '2026-04-02T00:00:00.000Z'),
    ],
    assets: [
      FROZEN_ROWS.apiKeyAsset,
      FROZEN_ROWS.imageAsset,
      {
        id: 'plain-8::key',
        protocolHash: 'plain-8',
        assetId: 'key',
        name: 'Key',
        type: 'apikey',
        data: 'plain-secret',
      },
    ],
    settings: [{ id: 'device', idleTimeoutMinutes: 5 }],
  });

let reader: ReturnType<typeof createLegacyLibraryReader>;

beforeEach(() => {
  reader = createLegacyLibraryReader();
});

afterEach(async () => {
  reader.close();
  closeLegacyLibrary();
  setSessionDek(null);
  await deleteLegacyInterviewerDatabase();
});

describe('reading Interviewer 8’s database', () => {
  it('gives nothing, and creates nothing, on a device that never ran Interviewer 8', async () => {
    expect(await reader.listLegacyProtocols()).toEqual([]);
    expect(await reader.listLegacySessions()).toEqual([]);
    expect(await reader.countLegacySessions()).toBe(0);
    expect(await reader.getLegacyProtocol('frozen-hash')).toBeUndefined();
    expect(await reader.getLegacyAssets('frozen-hash')).toEqual([]);
    expect(
      await reader.readLegacyProtocolSnapshot('frozen-hash'),
    ).toBeUndefined();

    const names = (await indexedDB.databases()).map(({ name }) => name);
    expect(names).not.toContain(LEGACY_DB_NAME);
  });

  it('lists schema 8 protocols with their interview counts, newest first, and ignores schema 9 rows', async () => {
    await seedEverything();

    expect(await reader.listLegacyProtocols()).toEqual([
      {
        id: 'plain-8',
        hash: 'plain-8',
        name: 'Plain Study',
        schemaVersion: 8,
        importedAt: '2026-03-01T00:00:00.000Z',
        description: 'Collected before the device was secured',
        lastModified: undefined,
        sessionCount: 2,
      },
      {
        id: 'frozen-hash',
        hash: 'frozen-hash',
        name: 'Frozen Study',
        schemaVersion: 8,
        importedAt: '2026-01-01T00:00:00.000Z',
        description: undefined,
        lastModified: undefined,
        sessionCount: 1,
      },
    ]);
  });

  it('lists the interviews of schema 8 protocols by their plaintext fields only', async () => {
    await seedEverything();

    const sessions = await reader.listLegacySessions();
    expect(sessions.map(({ id }) => id)).toEqual([
      's-new',
      's-old',
      'frozen-session',
    ]);
    for (const session of sessions) {
      expect(session).not.toHaveProperty('network');
      expect(session).not.toHaveProperty('_enc');
      expect(session).not.toHaveProperty('stageMetadata');
    }
    expect(sessions[0]).toEqual({
      id: 's-new',
      protocolHash: 'plain-8',
      protocolName: 'Plain Study',
      caseId: 'case-s-new',
      startedAt: '2026-03-02T00:00:00.000Z',
      lastUpdatedAt: '2026-03-09T00:00:00.000Z',
      finishedAt: null,
      exportedAt: null,
      currentStep: 2,
      progress: 40,
      isSynthetic: undefined,
    });
    expect(await reader.countLegacySessions()).toBe(3);
  });

  it('decrypts a protocol and its assets that the released app encrypted, with the shared key', async () => {
    await seedEverything();
    setSessionDek(await importFrozenDek());

    const protocol = await reader.getLegacyProtocol('frozen-hash');
    expect(protocol).toEqual({
      id: 'frozen-hash',
      hash: 'frozen-hash',
      name: 'Frozen Study',
      schemaVersion: 8,
      importedAt: '2026-01-01T00:00:00.000Z',
      protocol: FROZEN_PROTOCOL_PLAINTEXT,
      codebook: FROZEN_PROTOCOL_PLAINTEXT.codebook,
    });

    const assets = await reader.getLegacyAssets('frozen-hash');
    const byId = new Map(assets.map((asset) => [asset.assetId, asset]));
    expect(byId.get('frozen-key')?.data).toBe('frozen-secret');
    const image = byId.get('frozen-image')?.data;
    if (!(image instanceof Blob)) throw new Error('expected a Blob');
    expect(image.type).toBe('image/png');
    expect(Array.from(new Uint8Array(await image.arrayBuffer()))).toEqual([
      137, 80, 78, 71, 13, 10,
    ]);

    const snapshot = await reader.readLegacyProtocolSnapshot('frozen-hash');
    expect(snapshot?.protocol).toEqual(protocol);
    expect(snapshot?.assets.map(({ assetId }) => assetId).toSorted()).toEqual([
      'frozen-image',
      'frozen-key',
    ]);
  });

  it('reads a plaintext protocol written before the device was secured', async () => {
    await seedEverything();

    const protocol = await reader.getLegacyProtocol('plain-8');
    expect(protocol?.protocol).toEqual(plaintextSchema8.protocol);
    expect(await reader.getLegacyAssets('plain-8')).toEqual([
      {
        id: 'plain-8::key',
        protocolHash: 'plain-8',
        assetId: 'key',
        name: 'Key',
        type: 'apikey',
        data: 'plain-secret',
      },
    ]);
  });

  it('does not read a schema 9 row as Interviewer 8’s', async () => {
    await seedEverything();
    expect(await reader.getLegacyProtocol('pre-release-9')).toBeUndefined();
  });

  it('refuses to read an encrypted protocol while locked, rather than giving nothing', async () => {
    await seedEverything();
    await expect(reader.getLegacyProtocol('frozen-hash')).rejects.toThrow(
      /locked/,
    );
    await expect(reader.getLegacyAssets('frozen-hash')).rejects.toThrow(
      /locked/,
    );
  });

  it('never creates, upgrades or writes anything in Interviewer 8’s database', async () => {
    await seedEverything();
    const before = await fingerprintDatabase(LEGACY_DB_NAME);
    expect(before).toContain('"version":30');
    setSessionDek(await importFrozenDek());

    await reader.listLegacyProtocols();
    await reader.listLegacySessions();
    await reader.countLegacySessions();
    await reader.getLegacyProtocol('frozen-hash');
    await reader.getLegacyAssets('frozen-hash');
    await reader.readLegacyProtocolSnapshot('frozen-hash');
    await listLegacyProtocols();

    expect(await fingerprintDatabase(LEGACY_DB_NAME)).toBe(before);
  });

  it('gives empty listings, without throwing, when the database cannot be read', async () => {
    // A database by that name with none of Interviewer 8's stores.
    const foreign = new Dexie(LEGACY_DB_NAME);
    foreign.version(1).stores({ unrelated: 'id' });
    await foreign.open();
    foreign.close();

    expect(await reader.listLegacyProtocols()).toEqual([]);
    expect(await reader.listLegacySessions()).toEqual([]);
    expect(await reader.countLegacySessions()).toBe(0);
  });

  it('lets go of a database deleted since it was opened', async () => {
    await seedEverything();
    expect(await reader.listLegacyProtocols()).toHaveLength(2);

    await deleteLegacyInterviewerDatabase();

    expect(await reader.listLegacyProtocols()).toEqual([]);
    const names = (await indexedDB.databases()).map(({ name }) => name);
    expect(names).not.toContain(LEGACY_DB_NAME);
  });
});

describe('the read-only middleware', () => {
  it('refuses every write and every read-write transaction', async () => {
    await seedEverything();
    const before = await fingerprintDatabase(LEGACY_DB_NAME);

    const connection = new Dexie(LEGACY_DB_NAME, { addons: [] });
    connection.use(legacyReadOnlyMiddleware);
    await connection.open();
    try {
      await expect(
        connection.table('protocols').put({ ...plaintextSchema8, name: 'x' }),
      ).rejects.toThrow(/read-only/);
      await expect(
        connection.table('sessions').delete('s-old'),
      ).rejects.toThrow(/read-only/);
      await expect(
        connection.transaction('rw', 'settings', () =>
          connection.table('settings').clear(),
        ),
      ).rejects.toThrow(/read-only/);
    } finally {
      connection.close();
    }

    expect(await fingerprintDatabase(LEGACY_DB_NAME)).toBe(before);
  });
});
