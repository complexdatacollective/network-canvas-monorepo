// fake-indexeddb must be imported before Dexie opens a database.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { COMPATIBLE_PROTOCOL_SCHEMA_VERSION } from '@codaco/interview/protocol-schema-version';
import {
  deleteLegacyInterviewerDatabase,
  fingerprintDatabase,
  FROZEN_ROWS,
  importFrozenDek,
  LEGACY_DB_NAME,
  seedLegacyInterviewerDatabase,
} from '~/testUtils/legacyInterviewerDatabase';

import {
  deleteProtocol,
  getProtocolAssets,
  getProtocolByHash,
} from '../../db/api';
import { db } from '../../db/db';
import { closeLegacyLibrary } from '../../db/legacyLibrary';
import {
  encryptLegacyAssetRow,
  encryptLegacyProtocolRow,
} from '../../db/legacyVaultMaintenance';
import { setSessionDek } from '../../db/sessionKey';
import {
  findUpgradedCopy,
  upgradeLegacyProtocol,
} from '../upgradeLegacyProtocol';

const LEGACY_HASH = 'legacy-plain-8';
const UPGRADED_AT = new Date('2026-10-01T12:00:00.000Z');

const schema8Document = {
  schemaVersion: 8,
  description: 'Collected in Interviewer 8',
  stages: [],
  codebook: { node: {}, edge: {}, ego: {} },
  assetManifest: {
    key: { id: 'key', type: 'apikey', name: 'Map key', value: 'k' },
  },
};

const legacyProtocol = {
  id: LEGACY_HASH,
  hash: LEGACY_HASH,
  name: 'Older Study',
  schemaVersion: 8,
  importedAt: '2026-03-01T00:00:00.000Z',
  description: 'Collected in Interviewer 8',
  codebook: schema8Document.codebook,
  protocol: schema8Document,
};

const legacySession = {
  id: 'legacy-session',
  protocolHash: LEGACY_HASH,
  protocolName: 'Older Study',
  caseId: 'legacy-case',
  startedAt: '2026-03-02T00:00:00.000Z',
  lastUpdatedAt: '2026-03-02T00:30:00.000Z',
  finishedAt: null,
  exportedAt: null,
  currentStep: 0,
  network: { ego: { _uid: 'ego', attributes: {} }, nodes: [], edges: [] },
};

const legacyAsset = {
  id: `${LEGACY_HASH}::key`,
  protocolHash: LEGACY_HASH,
  assetId: 'key',
  name: 'Map key',
  type: 'apikey',
  data: 'legacy-secret',
};

const seed = () =>
  seedLegacyInterviewerDatabase({
    protocols: [legacyProtocol],
    sessions: [legacySession],
    assets: [legacyAsset],
    settings: [{ id: 'device', idleTimeoutMinutes: 5 }],
  });

const clearOwnDatabase = async () => {
  await Promise.all(
    [db.protocols, db.sessions, db.assets, db.legacyUpgrades].map((table) =>
      table.clear(),
    ),
  );
};

beforeEach(async () => {
  closeLegacyLibrary();
  setSessionDek(null);
  await deleteLegacyInterviewerDatabase();
  await clearOwnDatabase();
});
afterEach(async () => {
  closeLegacyLibrary();
  setSessionDek(null);
  await deleteLegacyInterviewerDatabase();
  await clearOwnDatabase();
});

describe('upgradeLegacyProtocol', () => {
  it('makes a schema 9 copy with its assets and no interviews, and leaves Interviewer 8’s database untouched', async () => {
    await seed();
    const before = await fingerprintDatabase(LEGACY_DB_NAME);

    const result = await upgradeLegacyProtocol(LEGACY_HASH, () => UPGRADED_AT);

    expect(result.status).toBe('upgraded');
    if (result.status !== 'upgraded') return;
    expect(result.hash).not.toBe(LEGACY_HASH);

    const copy = await getProtocolByHash(result.hash);
    expect(copy).toMatchObject({
      hash: result.hash,
      name: 'Older Study',
      schemaVersion: COMPATIBLE_PROTOCOL_SCHEMA_VERSION,
    });
    expect(copy?.protocol.schemaVersion).toBe(
      COMPATIBLE_PROTOCOL_SCHEMA_VERSION,
    );
    expect(
      (await getProtocolAssets(result.hash)).map(({ assetId, data }) => ({
        assetId,
        data,
      })),
    ).toEqual([{ assetId: 'key', data: 'legacy-secret' }]);

    expect(await db.legacyUpgrades.toArray()).toEqual([
      {
        legacyHash: LEGACY_HASH,
        upgradedHash: result.hash,
        legacyImportedAt: legacyProtocol.importedAt,
        upgradedAt: '2026-10-01T12:00:00.000Z',
      },
    ]);
    // Interviews stay with the schema 8 protocol, in Interviewer 8.
    expect(await db.sessions.count()).toBe(0);
    expect(await fingerprintDatabase(LEGACY_DB_NAME)).toBe(before);
  });

  it('opens the existing copy when upgraded again', async () => {
    await seed();
    const first = await upgradeLegacyProtocol(LEGACY_HASH);
    if (first.status !== 'upgraded') throw new Error('expected an upgrade');
    const savedAt = (await getProtocolByHash(first.hash))?.importedAt;

    expect(await upgradeLegacyProtocol(LEGACY_HASH)).toEqual({
      status: 'existing',
      hash: first.hash,
    });
    expect(await db.protocols.count()).toBe(1);
    // Not saved again.
    expect((await getProtocolByHash(first.hash))?.importedAt).toBe(savedAt);
  });

  it('makes the copy afresh once Interviewer 8 has re-imported the original with new assets', async () => {
    await seed();
    const first = await upgradeLegacyProtocol(LEGACY_HASH);
    if (first.status !== 'upgraded') throw new Error('expected an upgrade');

    // Interviewer 8 re-imports a same-hash file in place: the hash leaves out
    // the assets, so only `importedAt` says the row changed.
    const reimported = {
      ...legacyProtocol,
      importedAt: '2026-04-01T00:00:00.000Z',
    };
    await deleteLegacyInterviewerDatabase();
    await seedLegacyInterviewerDatabase({
      protocols: [reimported],
      assets: [{ ...legacyAsset, data: 'replaced-secret' }],
    });
    expect(await findUpgradedCopy(reimported)).toBeNull();

    const second = await upgradeLegacyProtocol(LEGACY_HASH, () => UPGRADED_AT);

    expect(second).toMatchObject({ status: 'upgraded', hash: first.hash });
    expect(await db.protocols.count()).toBe(1);
    expect(
      (await getProtocolAssets(first.hash)).map(({ data }) => data),
    ).toEqual(['replaced-secret']);
    expect(await db.legacyUpgrades.toArray()).toEqual([
      expect.objectContaining({
        legacyHash: LEGACY_HASH,
        legacyImportedAt: reimported.importedAt,
      }),
    ]);
    expect(await findUpgradedCopy(reimported)).toBe(first.hash);
  });

  it('upgrades again once the copy has been deleted, which also clears the record', async () => {
    await seed();
    const first = await upgradeLegacyProtocol(LEGACY_HASH);
    if (first.status !== 'upgraded') throw new Error('expected an upgrade');

    expect(await findUpgradedCopy(legacyProtocol)).toBe(first.hash);
    await deleteProtocol(first.hash);
    expect(await db.legacyUpgrades.count()).toBe(0);
    expect(await findUpgradedCopy(legacyProtocol)).toBeNull();

    expect(await upgradeLegacyProtocol(LEGACY_HASH)).toMatchObject({
      status: 'upgraded',
      hash: first.hash,
    });
  });

  it('upgrades a protocol Interviewer 8 encrypted, with the shared key', async () => {
    // Encrypted exactly as Interviewer 8 encrypts (pinned by main's fixture).
    const key = await importFrozenDek();
    await seedLegacyInterviewerDatabase({
      protocols: [await encryptLegacyProtocolRow(legacyProtocol, key)],
      assets: [await encryptLegacyAssetRow(legacyAsset, key)],
    });
    setSessionDek(key);

    const result = await upgradeLegacyProtocol(LEGACY_HASH);

    expect(result.status).toBe('upgraded');
    if (result.status !== 'upgraded') return;
    // Saved under the held key, as everything is on a secured device.
    expect((await db.protocols.get(result.hash))?._enc).toBeDefined();
  });

  it('refuses to upgrade while it cannot read the original, rather than copying nothing', async () => {
    await seedLegacyInterviewerDatabase({ protocols: [FROZEN_ROWS.protocol] });

    expect(
      await upgradeLegacyProtocol(FROZEN_ROWS.protocol.hash),
    ).toMatchObject({ status: 'failed', reason: 'read-failed' });
    expect(await db.protocols.count()).toBe(0);
    expect(await db.legacyUpgrades.count()).toBe(0);
  });

  it('saves nothing when the migrated protocol does not validate', async () => {
    await seedLegacyInterviewerDatabase({
      protocols: [
        {
          ...legacyProtocol,
          protocol: {
            ...schema8Document,
            stages: [{ id: 's1', type: 'NotAStage', label: 'Broken' }],
          },
        },
      ],
    });

    const result = await upgradeLegacyProtocol(LEGACY_HASH);

    expect(result.status).toBe('failed');
    if (result.status !== 'failed') return;
    expect(['migration-failed', 'validation-failed']).toContain(result.reason);
    expect(await db.protocols.count()).toBe(0);
    expect(await db.legacyUpgrades.count()).toBe(0);
  });

  it('refuses to upgrade a protocol whose resource Interviewer 8 no longer holds', async () => {
    await seedLegacyInterviewerDatabase({ protocols: [legacyProtocol] });

    const result = await upgradeLegacyProtocol(LEGACY_HASH);

    expect(result).toMatchObject({
      status: 'failed',
      reason: 'missing-assets',
    });
    if (result.status !== 'failed') return;
    expect(result.cause).toMatchObject({ assetName: 'Map key' });
    expect(await db.protocols.count()).toBe(0);
    expect(await db.legacyUpgrades.count()).toBe(0);
  });

  it('reports a protocol Interviewer 8 does not have', async () => {
    expect(await upgradeLegacyProtocol('nowhere')).toEqual({
      status: 'not-found',
    });
    await seed();
    expect(await upgradeLegacyProtocol('nowhere')).toEqual({
      status: 'not-found',
    });
  });
});
