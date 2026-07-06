// fake-indexeddb must be imported before Dexie opens a database.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';

import { db } from '../db';
import {
  getProtocolAsset,
  getProtocolAssets,
  getProtocolByHash,
  listProtocols,
  saveProtocol,
} from '../protocols';
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
    schemaVersion: 8,
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
