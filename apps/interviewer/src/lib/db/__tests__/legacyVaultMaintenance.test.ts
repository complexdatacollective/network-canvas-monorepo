// fake-indexeddb must be imported before Dexie opens a database.
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  deleteLegacyInterviewerDatabase,
  fingerprintDatabase,
  LEGACY_DB_NAME,
  seedLegacyInterviewerDatabase,
} from '~/testUtils/legacyInterviewerDatabase';

import { fromBase64 } from '../../vault/crypto';
import {
  closeLegacyLibrary,
  createLegacyLibraryReader,
  listLegacyProtocols,
} from '../legacyLibrary';
import {
  deleteLegacyDatabases,
  encryptLegacyAssetRow,
  encryptLegacyDatabases,
  encryptLegacyProtocolRow,
  encryptLegacySessionRow,
} from '../legacyVaultMaintenance';
import { setSessionDek } from '../sessionKey';
import fixture from './fixtures/interviewer8-record-crypto.json';

// The fixture was made by running Interviewer 8's own codec (main's
// `lib/db/recordCrypto.ts`) on the plaintext rows it holds, under its key.
// Never regenerate it to make a failure pass: it is what a device running
// Interviewer 8 holds, and Interviewer 8 must keep reading what this app's
// maintenance writes.

type Row = Record<string, unknown>;
type Field = { iv: string; ct: string; kind?: string; mime?: string };

const importFixtureDek = () =>
  crypto.subtle.importKey('raw', fromBase64(fixture.dekB64), 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);

// An independent decryptor written from the format, not from either codec:
// AES-GCM, base64 iv and ciphertext, additional data `<table>:<row id or
// hash>`, JSON plaintext for record fields and raw bytes for asset data.
const rawDecrypt = async (
  field: Field,
  key: CryptoKey,
  aad: string,
): Promise<Uint8Array> =>
  new Uint8Array(
    await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: fromBase64(field.iv),
        additionalData: new TextEncoder().encode(aad),
      },
      key,
      fromBase64(field.ct),
    ),
  );
const rawDecryptJson = async (field: Field, key: CryptoKey, aad: string) =>
  JSON.parse(
    new TextDecoder().decode(await rawDecrypt(field, key, aad)),
  ) as unknown;

const encOf = (row: Row) => row._enc as Record<string, Field>;
const fieldOf = (row: Row, name: string): Field => {
  const field = encOf(row)[name];
  if (!field) throw new Error(`no encrypted ${name}`);
  return field;
};
const withoutEnc = ({ _enc, ...rest }: Row) => rest;

/** A row's layout: every key, and each encrypted field's keys and labels. */
const shapeOf = (row: Row) => ({
  keys: Object.keys(row).toSorted(),
  plaintext: withoutEnc(row),
  enc: Object.fromEntries(
    Object.entries(encOf(row)).map(([name, field]) => [
      name,
      {
        keys: Object.keys(field).toSorted(),
        kind: field.kind,
        mime: field.mime,
        ivBytes: fromBase64(field.iv).length,
      },
    ]),
  ),
});

const blobPlaintext = () => ({
  ...fixture.plaintext.blobAsset,
  data: new Blob([new Uint8Array(fixture.plaintext.blobAsset.data.bytes)], {
    type: fixture.plaintext.blobAsset.data.mime,
  }),
});

/** Every encrypted field of `row` decrypts to the matching plaintext field. */
async function expectDecryptsTo(
  table: 'sessions' | 'protocols',
  row: Row,
  plaintext: Row,
  key: CryptoKey,
) {
  const aad =
    table === 'sessions'
      ? `sessions:${String(row.id)}`
      : `protocols:${String(row.hash)}`;
  for (const [name, field] of Object.entries(encOf(row))) {
    expect(await rawDecryptJson(field, key, aad)).toEqual(plaintext[name]);
  }
}

describe("main's Interviewer 8 fixture", () => {
  it('decrypts with an independent decryptor and the documented additional data', async () => {
    const key = await importFixtureDek();
    const { plaintext, encrypted } = fixture;
    await expectDecryptsTo(
      'sessions',
      encrypted.sessionWithMetadata,
      plaintext.sessionWithMetadata,
      key,
    );
    await expectDecryptsTo(
      'sessions',
      encrypted.sessionWithoutMetadata,
      plaintext.sessionWithoutMetadata,
      key,
    );
    await expectDecryptsTo(
      'protocols',
      encrypted.protocol,
      plaintext.protocol,
      key,
    );
    expect(
      new TextDecoder().decode(
        await rawDecrypt(
          encrypted.stringAsset._enc.data,
          key,
          'assets:fixture-hash::key',
        ),
      ),
    ).toBe(plaintext.stringAsset.data);
    expect(
      Array.from(
        await rawDecrypt(
          encrypted.blobAsset._enc.data,
          key,
          'assets:fixture-hash::image',
        ),
      ),
    ).toEqual(plaintext.blobAsset.data.bytes);
  });

  it("decrypts through this app's legacy reader", async () => {
    await seedLegacyInterviewerDatabase({
      protocols: [fixture.encrypted.protocol],
      assets: [fixture.encrypted.stringAsset, fixture.encrypted.blobAsset],
    });
    setSessionDek(await importFixtureDek());
    const reader = createLegacyLibraryReader(LEGACY_DB_NAME);
    try {
      const stored = await reader.getLegacyProtocol('fixture-hash');
      expect(stored?.protocol).toEqual(fixture.plaintext.protocol.protocol);
      expect(stored?.codebook).toEqual(fixture.plaintext.protocol.codebook);
      const assets = await reader.getLegacyAssets('fixture-hash');
      const byId = new Map(assets.map((asset) => [asset.id, asset.data]));
      expect(byId.get('fixture-hash::key')).toBe('fixture-secret');
      const image = byId.get('fixture-hash::image');
      if (!(image instanceof Blob)) throw new Error('expected a Blob');
      expect(Array.from(new Uint8Array(await image.arrayBuffer()))).toEqual(
        fixture.plaintext.blobAsset.data.bytes,
      );
      expect(image.type).toBe('image/png');
    } finally {
      reader.close();
    }
  });
});

describe("this module's output matches main's codec", () => {
  it('writes the same rows as main for the same plaintext, and they decrypt', async () => {
    const key = await importFixtureDek();
    const { plaintext, encrypted } = fixture;
    const cases: {
      table: 'sessions' | 'protocols';
      mine: Row;
      main: Row;
      plain: Row;
    }[] = [
      {
        table: 'sessions',
        mine: await encryptLegacySessionRow(plaintext.sessionWithMetadata, key),
        main: encrypted.sessionWithMetadata,
        plain: plaintext.sessionWithMetadata,
      },
      {
        table: 'sessions',
        mine: await encryptLegacySessionRow(
          plaintext.sessionWithoutMetadata,
          key,
        ),
        main: encrypted.sessionWithoutMetadata,
        plain: plaintext.sessionWithoutMetadata,
      },
      {
        table: 'protocols',
        mine: await encryptLegacyProtocolRow(plaintext.protocol, key),
        main: encrypted.protocol,
        plain: plaintext.protocol,
      },
    ];
    for (const { table, mine, main, plain } of cases) {
      expect(shapeOf(mine)).toEqual(shapeOf(main));
      await expectDecryptsTo(table, mine, plain, key);
    }

    const stringAsset = await encryptLegacyAssetRow(plaintext.stringAsset, key);
    expect(shapeOf(stringAsset)).toEqual(shapeOf(encrypted.stringAsset));
    expect(
      new TextDecoder().decode(
        await rawDecrypt(
          fieldOf(stringAsset, 'data'),
          key,
          'assets:fixture-hash::key',
        ),
      ),
    ).toBe('fixture-secret');

    const blobAsset = await encryptLegacyAssetRow(blobPlaintext(), key);
    expect(shapeOf(blobAsset)).toEqual(shapeOf(encrypted.blobAsset));
    expect(
      Array.from(
        await rawDecrypt(
          fieldOf(blobAsset, 'data'),
          key,
          'assets:fixture-hash::image',
        ),
      ),
    ).toEqual(plaintext.blobAsset.data.bytes);
  });

  it('binds each field to its own row, as main does', async () => {
    const key = await importFixtureDek();
    const mine = await encryptLegacySessionRow(
      fixture.plaintext.sessionWithMetadata,
      key,
    );
    await expect(
      rawDecrypt(fieldOf(mine, 'network'), key, 'sessions:session-b'),
    ).rejects.toThrow();
  });
});

describe('encryptLegacyDatabases', () => {
  beforeEach(async () => {
    closeLegacyLibrary();
    await deleteLegacyInterviewerDatabase();
    setSessionDek(null);
  });
  afterEach(async () => {
    closeLegacyLibrary();
    await deleteLegacyInterviewerDatabase();
    setSessionDek(null);
  });

  it("encrypts Interviewer 8's plaintext rows in place and leaves encrypted ones alone", async () => {
    await seedLegacyInterviewerDatabase({
      protocols: [fixture.plaintext.protocol],
      sessions: [
        fixture.plaintext.sessionWithMetadata,
        fixture.encrypted.sessionWithoutMetadata,
      ],
      assets: [fixture.plaintext.stringAsset],
      settings: [{ id: 'device', idleTimeoutMinutes: 7 }],
    });
    const before = JSON.parse(
      (await fingerprintDatabase(LEGACY_DB_NAME)) ?? '{}',
    ) as {
      version: number;
      stores: Record<string, { keyPath: unknown; indexes: string[] }>;
    };
    const key = await importFixtureDek();
    setSessionDek(key);

    expect(await encryptLegacyDatabases()).toEqual({ total: 3, failed: 0 });

    const legacy = new Dexie(LEGACY_DB_NAME);
    await legacy.open();
    try {
      const protocol = (await legacy
        .table('protocols')
        .get('fixture-hash')) as Row;
      expect(shapeOf(protocol)).toEqual(shapeOf(fixture.encrypted.protocol));
      await expectDecryptsTo(
        'protocols',
        protocol,
        fixture.plaintext.protocol,
        key,
      );

      const session = (await legacy.table('sessions').get('session-a')) as Row;
      expect(shapeOf(session)).toEqual(
        shapeOf(fixture.encrypted.sessionWithMetadata),
      );
      await expectDecryptsTo(
        'sessions',
        session,
        fixture.plaintext.sessionWithMetadata,
        key,
      );

      // Already encrypted by Interviewer 8: byte for byte as it was.
      expect(await legacy.table('sessions').get('session-b')).toEqual(
        fixture.encrypted.sessionWithoutMetadata,
      );

      const asset = (await legacy
        .table('assets')
        .get('fixture-hash::key')) as Row;
      expect(shapeOf(asset)).toEqual(shapeOf(fixture.encrypted.stringAsset));

      // Settings hold no participant data and are never touched.
      expect(await legacy.table('settings').get('device')).toEqual({
        id: 'device',
        idleTimeoutMinutes: 7,
      });
    } finally {
      legacy.close();
    }

    // Same native version, stores and indexes: nothing was upgraded.
    const after = JSON.parse(
      (await fingerprintDatabase(LEGACY_DB_NAME)) ?? '{}',
    ) as typeof before;
    expect(after.version).toBe(30);
    expect(after.version).toBe(before.version);
    for (const [name, store] of Object.entries(before.stores)) {
      expect(after.stores[name]?.keyPath).toEqual(store.keyPath);
      expect(after.stores[name]?.indexes).toEqual(store.indexes);
    }

    // A second run has nothing left to do and changes nothing.
    const settled = await fingerprintDatabase(LEGACY_DB_NAME);
    expect(await encryptLegacyDatabases()).toEqual({ total: 0, failed: 0 });
    expect(await fingerprintDatabase(LEGACY_DB_NAME)).toBe(settled);
  });

  it('counts a row it cannot encrypt as a failure and keeps going', async () => {
    const { network: _network, ...broken } =
      fixture.plaintext.sessionWithMetadata;
    await seedLegacyInterviewerDatabase({
      sessions: [broken, fixture.plaintext.sessionWithoutMetadata],
    });
    setSessionDek(await importFixtureDek());

    expect(await encryptLegacyDatabases()).toEqual({ total: 2, failed: 1 });

    const legacy = new Dexie(LEGACY_DB_NAME);
    await legacy.open();
    try {
      expect(
        ((await legacy.table('sessions').get('session-b')) as Row)._enc,
      ).toBeDefined();
      expect(
        ((await legacy.table('sessions').get('session-a')) as Row)._enc,
      ).toBeUndefined();
    } finally {
      legacy.close();
    }
  });

  it('also encrypts a plaintext row Interviewer 8 commits after the sweep listed its table', async () => {
    await seedLegacyInterviewerDatabase({
      sessions: [fixture.plaintext.sessionWithMetadata],
    });
    const key = await importFixtureDek();
    setSessionDek(key);
    // Interviewer 8 has no commit-time guard: a write it prepared before the
    // lock was set up lands while the sweep encrypts the first row it listed.
    const writer = new Dexie(LEGACY_DB_NAME);
    await writer.open();
    const subtle = crypto.subtle;
    const encrypt = subtle.encrypt.bind(subtle);
    let landed = false;
    const spy = vi
      .spyOn(subtle, 'encrypt')
      .mockImplementation(
        async (...args: Parameters<SubtleCrypto['encrypt']>) => {
          if (!landed) {
            landed = true;
            await writer
              .table('sessions')
              .put(fixture.plaintext.sessionWithoutMetadata);
          }
          return encrypt(...args);
        },
      );
    try {
      expect(await encryptLegacyDatabases()).toEqual({ total: 2, failed: 0 });
    } finally {
      spy.mockRestore();
      writer.close();
    }
    expect(landed).toBe(true);

    const legacy = new Dexie(LEGACY_DB_NAME);
    await legacy.open();
    try {
      const late = (await legacy.table('sessions').get('session-b')) as Row;
      expect(shapeOf(late)).toEqual(
        shapeOf(fixture.encrypted.sessionWithoutMetadata),
      );
      await expectDecryptsTo(
        'sessions',
        late,
        fixture.plaintext.sessionWithoutMetadata,
        key,
      );
    } finally {
      legacy.close();
    }
  });

  it('keeps the bytes of an asset Interviewer 8 re-imports while the sweep encrypts it', async () => {
    await seedLegacyInterviewerDatabase({
      protocols: [fixture.encrypted.protocol],
      assets: [fixture.plaintext.stringAsset],
    });
    setSessionDek(await importFixtureDek());
    // A same-hash re-import keeps the asset's id and name and replaces its
    // bytes, in the transaction that gives the protocol a new `importedAt`.
    const writer = new Dexie(LEGACY_DB_NAME);
    await writer.open();
    const subtle = crypto.subtle;
    const encrypt = subtle.encrypt.bind(subtle);
    let landed = false;
    const spy = vi
      .spyOn(subtle, 'encrypt')
      .mockImplementation(
        async (...args: Parameters<SubtleCrypto['encrypt']>) => {
          if (!landed) {
            landed = true;
            await writer.transaction(
              'rw',
              ['protocols', 'assets'],
              async () => {
                await writer.table('protocols').put({
                  ...fixture.plaintext.protocol,
                  importedAt: '2026-05-02T09:00:00.000Z',
                });
                await writer.table('assets').put({
                  ...fixture.plaintext.stringAsset,
                  data: 'reimported-secret',
                });
              },
            );
          }
          return encrypt(...args);
        },
      );
    try {
      // The row the sweep read is gone, so it is left for the retry.
      expect(await encryptLegacyDatabases()).toEqual({ total: 1, failed: 1 });
    } finally {
      spy.mockRestore();
      writer.close();
    }
    expect(landed).toBe(true);
    expect(await encryptLegacyDatabases()).toEqual({ total: 2, failed: 0 });

    const reader = createLegacyLibraryReader(LEGACY_DB_NAME);
    try {
      const assets = await reader.getLegacyAssets('fixture-hash');
      expect(assets.map(({ data }) => data)).toEqual(['reimported-secret']);
    } finally {
      reader.close();
    }
  });

  it('creates nothing on a device that never had Interviewer 8', async () => {
    setSessionDek(await importFixtureDek());
    expect(await encryptLegacyDatabases()).toEqual({ total: 0, failed: 0 });
    expect(await fingerprintDatabase(LEGACY_DB_NAME)).toBeUndefined();
  });

  it('refuses to run without the session key', async () => {
    await expect(encryptLegacyDatabases()).rejects.toThrow(
      /unlocked session key/,
    );
  });
});

describe('deleteLegacyDatabases', () => {
  afterEach(async () => {
    closeLegacyLibrary();
    await deleteLegacyInterviewerDatabase();
  });

  it("deletes Interviewer 8's database, even while this app is reading it", async () => {
    await seedLegacyInterviewerDatabase({
      protocols: [fixture.encrypted.protocol],
    });
    // This app's own reader holds a connection open.
    expect(await listLegacyProtocols()).toHaveLength(1);

    await deleteLegacyDatabases();

    expect(await fingerprintDatabase(LEGACY_DB_NAME)).toBeUndefined();
    expect(await listLegacyProtocols()).toEqual([]);
  });

  it('creates nothing when there is nothing to delete', async () => {
    await deleteLegacyDatabases();
    expect(await fingerprintDatabase(LEGACY_DB_NAME)).toBeUndefined();
  });
});
