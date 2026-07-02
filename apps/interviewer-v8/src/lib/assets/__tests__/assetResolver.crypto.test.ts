// fake-indexeddb must be imported before Dexie opens a database.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';

import { db } from '../../db/db';
import { saveProtocol } from '../../db/protocols';
import { setSessionDek } from '../../db/sessionKey';

async function makeDek(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
}

function makeProtocol(
  assetManifest: CurrentProtocol['assetManifest'],
): CurrentProtocol {
  return {
    name: 'P',
    schemaVersion: 8,
    stages: [],
    codebook: { node: {}, edge: {}, ego: {} },
    assetManifest,
  } as CurrentProtocol;
}

describe('assetResolver decrypts encrypted-at-rest assets', () => {
  beforeEach(async () => {
    await db.protocols.clear();
    await db.assets.clear();
    setSessionDek(await makeDek());
    // Spreading `URL` into a plain object (`{ ...URL, createObjectURL: ... }`)
    // drops its constructor behaviour, and jsdom/fake-indexeddb construct
    // `new URL(...)` internally — so subclass the real URL instead of
    // spreading it, to keep it constructible while stubbing the two methods.
    class StubURL extends URL {}
    vi.stubGlobal(
      'URL',
      Object.assign(StubURL, {
        createObjectURL: vi.fn(() => 'blob:mock-url'),
        revokeObjectURL: vi.fn(),
      }),
    );
  });
  afterEach(async () => {
    await db.protocols.clear();
    await db.assets.clear();
    setSessionDek(null);
    vi.unstubAllGlobals();
  });

  it('mints a blob URL from decrypted asset bytes', async () => {
    // Import so URL.createObjectURL is the stub set in beforeEach.
    const { makeAssetResolver } = await import('../assetResolver');
    const protocol = makeProtocol({
      'img-1': { id: 'img-1', type: 'image', name: 'Photo', source: 'p.png' },
    });
    await saveProtocol(protocol, 'h1', [
      { id: 'img-1', name: 'Photo', data: new Blob([new Uint8Array([7, 7])]) },
    ]);

    const resolver = makeAssetResolver('h1', new Date().toISOString());
    const url = await resolver('img-1');
    expect(url).toBe('blob:mock-url');
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    const [passedBlob] = (
      URL.createObjectURL as unknown as { mock: { calls: [Blob][] } }
    ).mock.calls[0]!;
    expect(passedBlob).toBeInstanceOf(Blob);
  });

  it('returns an apikey string directly (no blob URL)', async () => {
    const { makeAssetResolver } = await import('../assetResolver');
    const protocol = makeProtocol({
      'key-1': { id: 'key-1', type: 'apikey', name: 'Key' },
    });
    await saveProtocol(protocol, 'h1', [
      { id: 'key-1', name: 'Key', data: 'secret' },
    ]);

    const resolver = makeAssetResolver('h1', new Date().toISOString());
    const value = await resolver('key-1');
    expect(value).toBe('secret');
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});
