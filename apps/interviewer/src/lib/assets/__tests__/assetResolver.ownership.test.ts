import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { StoredAsset } from '../../db/types';

const getProtocolAsset =
  vi.fn<(hash: string, assetId: string) => Promise<StoredAsset | undefined>>();

// The cache under test is module-global, so every test imports the module
// fresh (see `vi.resetModules` below) and reads through this stub rather than
// Dexie — the point of these tests is *when* a read lands, not what it reads.
vi.mock('../../db/api', () => ({
  getProtocolAsset: (hash: string, assetId: string) =>
    getProtocolAsset(hash, assetId),
  getProtocolAssets: vi.fn(),
  getProtocolByHash: vi.fn(),
}));

const HASH = 'h1';
const T1 = '2026-01-01T00:00:00.000Z';
const T2 = '2026-02-02T00:00:00.000Z';

// Holds a read open so a second request, a re-import, or a delete can happen
// while it is still in flight — the window this resolver has to get right.
function defer<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function asset(id: string, protocolHash = HASH): StoredAsset {
  return {
    id: `${protocolHash}::${id}`,
    protocolHash,
    assetId: id,
    name: id,
    type: 'image',
    data: new Blob([id]),
  };
}

let urlCounter = 0;

beforeEach(() => {
  vi.resetModules();
  getProtocolAsset.mockReset();
  urlCounter = 0;
  // Spreading `URL` into a plain object drops its constructor behaviour, and
  // jsdom constructs `new URL(...)` internally — subclass it instead.
  class StubURL extends URL {}
  vi.stubGlobal(
    'URL',
    Object.assign(StubURL, {
      createObjectURL: vi.fn(() => `blob:${++urlCounter}`),
      revokeObjectURL: vi.fn(),
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const createdUrls = () => vi.mocked(URL.createObjectURL).mock.calls.length;
const revoked = () =>
  vi.mocked(URL.revokeObjectURL).mock.calls.map(([url]) => url);

describe('asset URL ownership', () => {
  // An interview can request one asset from several components in the same
  // commit (two name-generator panels on one roster, an image reused across
  // content items). Without a single-flight index both requests miss the cache
  // and both mint, and the second cache write orphans the first URL: nothing
  // holds it, so nothing can ever revoke it and its decrypted bytes stay
  // resident for the life of the tab.
  it('mints one URL when two callers request the same asset concurrently', async () => {
    const { makeAssetResolver } = await import('../assetResolver');
    const read = defer<StoredAsset>();
    getProtocolAsset.mockReturnValue(read.promise);

    const resolve = makeAssetResolver(HASH, T1);
    const first = resolve('img-1');
    const second = resolve('img-1');
    read.resolve(asset('img-1'));

    expect(await first).toBe(await second);
    expect(createdUrls()).toBe(1);
    expect(getProtocolAsset).toHaveBeenCalledTimes(1);
  });

  // A read that started before a re-import can land after it. The URL the
  // re-import published is the live one — possibly already on screen — so the
  // late read must not revoke it, and must not install an entry under an older
  // import that nothing would ever supersede.
  it('does not displace a newer import when a stale read lands late', async () => {
    const { makeAssetResolver } = await import('../assetResolver');
    const staleRead = defer<StoredAsset>();
    getProtocolAsset.mockReturnValueOnce(staleRead.promise);

    const stale = makeAssetResolver(HASH, T1)('img-1');

    getProtocolAsset.mockResolvedValue(asset('img-1'));
    const fresh = await makeAssetResolver(HASH, T2)('img-1');

    staleRead.resolve(asset('img-1'));

    expect(await stale).toBe(fresh);
    expect(revoked()).not.toContain(fresh);
    // The live entry is intact, not overwritten under the older import: the
    // next request still hits it instead of reading and minting again.
    expect(await makeAssetResolver(HASH, T2)('img-1')).toBe(fresh);
    expect(createdUrls()).toBe(1);
  });

  it('still supersedes an older import when the newer read lands second', async () => {
    const { makeAssetResolver } = await import('../assetResolver');
    getProtocolAsset.mockResolvedValue(asset('img-1'));

    const first = await makeAssetResolver(HASH, T1)('img-1');
    const second = await makeAssetResolver(HASH, T2)('img-1');

    expect(second).not.toBe(first);
    expect(revoked()).toContain(first);
  });

  it('serves the live URL to a resolver bound to the superseded import', async () => {
    const { makeAssetResolver } = await import('../assetResolver');
    getProtocolAsset.mockResolvedValue(asset('img-1'));

    const olderResolver = makeAssetResolver(HASH, T1);
    await olderResolver('img-1');
    const newer = await makeAssetResolver(HASH, T2)('img-1');

    // The older resolver must not be handed back the URL the re-import revoked.
    expect(await olderResolver('img-1')).toBe(newer);
    expect(createdUrls()).toBe(2);
  });

  // Deleting a protocol makes its cache keys unreachable: no later request can
  // supersede them, so without an explicit sweep every URL that protocol minted
  // — and the decrypted bytes behind it — stays resident for the tab's life.
  it('releases a deleted protocol, and only that protocol', async () => {
    const { makeAssetResolver, revokeProtocolAssetUrls } =
      await import('../assetResolver');
    getProtocolAsset.mockResolvedValue(asset('img-1'));
    const mine = await makeAssetResolver(HASH, T1)('img-1');
    // A hash the deleted one is a text prefix of: the sweep matches on the
    // key's `hash::` delimiter, not on the bare hash.
    const neighbour = `${HASH}x`;
    getProtocolAsset.mockResolvedValue(asset('img-1', neighbour));
    const theirs = await makeAssetResolver(neighbour, T1)('img-1');

    revokeProtocolAssetUrls(HASH);

    expect(revoked()).toContain(mine);
    expect(revoked()).not.toContain(theirs);
    // The entry is gone, not just revoked: a re-import reads and mints again.
    expect(await makeAssetResolver(HASH, T2)('img-1')).not.toBe(mine);
  });

  it('does not mint for a read still in flight when the protocol is deleted', async () => {
    const { makeAssetResolver, revokeProtocolAssetUrls } =
      await import('../assetResolver');
    const read = defer<StoredAsset>();
    getProtocolAsset.mockReturnValue(read.promise);

    const pending = makeAssetResolver(HASH, T1)('img-1');
    revokeProtocolAssetUrls(HASH);
    read.resolve(asset('img-1'));

    await expect(pending).rejects.toThrow(/no longer available/);
    expect(createdUrls()).toBe(0);
  });

  it('retries a failed read instead of replaying its rejection', async () => {
    const { makeAssetResolver } = await import('../assetResolver');
    getProtocolAsset.mockResolvedValueOnce(undefined);
    getProtocolAsset.mockResolvedValueOnce(asset('img-1'));

    const resolve = makeAssetResolver(HASH, T1);
    await expect(resolve('img-1')).rejects.toThrow(/not found/);
    await expect(resolve('img-1')).resolves.toBe('blob:1');
  });
});
