// fake-indexeddb must be imported before Dexie opens a database.
import 'fake-indexeddb/auto';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';

import { db } from '../db';
import {
  getProtocolAsset,
  getProtocolAssets,
  getProtocolByHash,
  listProtocols,
  reencryptAsset,
  reencryptProtocol,
  saveProtocol,
} from '../protocols';
import type { StoredAssetRow, StoredProtocolRow } from '../recordCrypto';
import { setSessionDek } from '../sessionKey';

async function makeDek(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
}

function makeProtocol(hash: string): CurrentProtocol {
  return {
    name: `Protocol ${hash}`,
    description: 'desc',
    schemaVersion: 9,
    localization: { defaultLocale: 'en', locales: ['en'] },
    stages: [],
    codebook: { node: {}, edge: {}, ego: {} },
    assetManifest: {
      'img-1': { id: 'img-1', type: 'image', name: 'Photo', source: 'p.png' },
    },
  } as CurrentProtocol;
}

describe('protocols repo — encryption at boundary', () => {
  beforeEach(async () => {
    await db.protocols.clear();
    await db.assets.clear();
    await db.sessions.clear();
    setSessionDek(await makeDek());
  });
  afterEach(async () => {
    await db.protocols.clear();
    await db.assets.clear();
    await db.sessions.clear();
    setSessionDek(null);
  });

  it('stores no plaintext protocol/codebook or asset data when unlocked', async () => {
    await saveProtocol(makeProtocol('h1'), 'h1', [
      { id: 'img-1', name: 'Photo', data: new Blob([new Uint8Array([9, 9])]) },
    ]);

    const rawProtocol = await db.protocols.get('h1');
    expect(rawProtocol?.protocol).toBeUndefined();
    expect(rawProtocol?.codebook).toBeUndefined();
    expect(rawProtocol?._enc?.protocol).toBeDefined();
    expect(rawProtocol?.name).toBe('Protocol h1'); // index field plaintext

    const rawAsset = await db.assets.get('h1::img-1');
    expect(rawAsset?.data).toBeUndefined();
    expect(rawAsset?._enc?.data).toBeDefined();
    expect(rawAsset?.assetId).toBe('img-1'); // index field plaintext
  });

  it('returns the full protocol and assets on read', async () => {
    await saveProtocol(makeProtocol('h1'), 'h1', [
      { id: 'img-1', name: 'Photo', data: new Blob([new Uint8Array([1, 2])]) },
    ]);

    const back = await getProtocolByHash('h1');
    expect(back?.protocol.name).toBe('Protocol h1');
    expect(back?.codebook).toEqual({ node: {}, edge: {}, ego: {} });

    const asset = await getProtocolAsset('h1', 'img-1');
    expect(asset?.data).toBeInstanceOf(Blob);

    const assets = await getProtocolAssets('h1');
    expect(assets).toHaveLength(1);

    const list = await listProtocols();
    expect(list).toHaveLength(1);
    expect(list[0]?.protocol.name).toBe('Protocol h1');
    expect(list[0]?.sessionCount).toBe(0);
  });
});

describe('protocols repo — re-encryption during an import', () => {
  beforeEach(async () => {
    await db.protocols.clear();
    await db.assets.clear();
    setSessionDek(null);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await db.protocols.clear();
    await db.assets.clear();
    setSessionDek(null);
  });

  async function readBytes(hash: string): Promise<number[]> {
    const asset = await getProtocolAsset(hash, 'img-1');
    if (!(asset?.data instanceof Blob)) throw new Error('No asset bytes');
    return [...new Uint8Array(await asset.data.arrayBuffer())];
  }

  it('keeps a protocol imported again while its row is being re-encrypted', async () => {
    // Imported before the device was secured, so the sweep has it to wrap.
    await saveProtocol(makeProtocol('h1'), 'h1', []);
    setSessionDek(await makeDek());

    // Another tab imports a newer file with the same hash after the sweep has
    // read the row and before it writes the re-wrapped copy back.
    const realGet = (id: string) => db.protocols.get(id);
    (
      vi.spyOn(db.protocols, 'get') as unknown as MockInstance<
        (id: string) => Promise<StoredProtocolRow | undefined>
      >
    ).mockImplementationOnce(async (id) => {
      const read = await realGet(id);
      await saveProtocol(
        { ...makeProtocol('h1'), description: 'Imported again' },
        'h1',
        [],
      );
      return read;
    });

    await reencryptProtocol('h1');

    expect((await db.protocols.get('h1'))?._enc).toBeDefined();
    expect((await getProtocolByHash('h1'))?.protocol.description).toBe(
      'Imported again',
    );
  });

  it('keeps an asset imported again while its row is being re-encrypted', async () => {
    await saveProtocol(makeProtocol('h1'), 'h1', [
      { id: 'img-1', name: 'Photo', data: new Blob([new Uint8Array([1, 2])]) },
    ]);
    setSessionDek(await makeDek());

    const realGet = (id: string) => db.assets.get(id);
    (
      vi.spyOn(db.assets, 'get') as unknown as MockInstance<
        (id: string) => Promise<StoredAssetRow | undefined>
      >
    ).mockImplementationOnce(async (id) => {
      const read = await realGet(id);
      await saveProtocol(makeProtocol('h1'), 'h1', [
        {
          id: 'img-1',
          name: 'Photo',
          data: new Blob([new Uint8Array([3, 4])]),
        },
      ]);
      return read;
    });

    await reencryptAsset('h1::img-1');

    expect((await db.assets.get('h1::img-1'))?._enc).toBeDefined();
    expect(await readBytes('h1')).toEqual([3, 4]);
  });
});
