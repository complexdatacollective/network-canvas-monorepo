import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAssetUrlOwner } from '../assetUrlOwner';

let urlCounter = 0;

beforeEach(() => {
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

const minted = () => vi.mocked(URL.createObjectURL).mock.calls.length;
const revoked = () =>
  vi.mocked(URL.revokeObjectURL).mock.calls.map(([url]) => url);

/** Holds a read open so a second request, a release, or both can land first. */
function defer<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const NOW = '2026-01-01T00:00:00.000Z';
const LATER = '2026-02-02T00:00:00.000Z';

describe('one URL per key', () => {
  it('serves a cached URL without reading again', async () => {
    const owner = createAssetUrlOwner();
    const read = vi.fn(async () => new Blob(['x']));

    const first = await owner.resolve({ key: 'p::a', scope: NOW, read });
    const second = await owner.resolve({ key: 'p::a', scope: NOW, read });

    expect(second).toBe(first);
    expect(read).toHaveBeenCalledTimes(1);
    expect(minted()).toBe(1);
  });

  // One asset can be requested from several components in the same commit (two
  // roster panels, an image reused across content items). Without a
  // single-flight index both requests miss the cache and both mint, and the
  // second write orphans the first URL: nothing holds it, so nothing can ever
  // revoke it and its bytes stay resident for the life of the tab.
  it('mints one URL when two callers request the same asset concurrently', async () => {
    const owner = createAssetUrlOwner();
    const pending = defer<Blob>();
    const read = vi.fn(() => pending.promise);

    const first = owner.resolve({ key: 'p::a', scope: NOW, read });
    const second = owner.resolve({ key: 'p::a', scope: NOW, read });
    pending.resolve(new Blob(['x']));

    expect(await first).toBe(await second);
    expect(read).toHaveBeenCalledTimes(1);
    expect(minted()).toBe(1);
  });

  it('retries a failed read instead of replaying its rejection', async () => {
    const owner = createAssetUrlOwner();
    const read = vi
      .fn<() => Promise<Blob>>()
      .mockRejectedValueOnce(new Error('not found'))
      .mockResolvedValueOnce(new Blob(['x']));

    await expect(
      owner.resolve({ key: 'p::a', scope: NOW, read }),
    ).rejects.toThrow('not found');
    await expect(
      owner.resolve({ key: 'p::a', scope: NOW, read }),
    ).resolves.toBe('blob:1');
  });

  it('passes a string through un-owned and never revokes it', async () => {
    const owner = createAssetUrlOwner();
    const read = async () => 'secret-api-key';

    const value = await owner.resolve({ key: 'p::key', scope: NOW, read });

    expect(value).toBe('secret-api-key');
    expect(minted()).toBe(0);

    owner.release();
    expect(revoked()).toEqual([]);
  });
});

describe('generations', () => {
  it('revokes the URL a newer generation supersedes', async () => {
    const owner = createAssetUrlOwner();
    const read = async () => new Blob(['x']);

    const first = await owner.resolve({ key: 'p::a', scope: NOW, read });
    const second = await owner.resolve({ key: 'p::a', scope: LATER, read });

    expect(second).not.toBe(first);
    expect(revoked()).toEqual([first]);
  });

  it('serves the live URL to a caller bound to a superseded generation', async () => {
    const owner = createAssetUrlOwner();
    const read = async () => new Blob(['x']);

    await owner.resolve({ key: 'p::a', scope: NOW, read });
    const newer = await owner.resolve({ key: 'p::a', scope: LATER, read });

    // The older caller must not be handed back the URL the newer one revoked.
    expect(await owner.resolve({ key: 'p::a', scope: NOW, read })).toBe(newer);
    expect(minted()).toBe(2);
  });

  // A read that started before a re-import can land after it. The URL the
  // newer generation published is the live one — possibly already on screen —
  // so the late read must not revoke it, and must not install an entry under
  // an older generation that nothing would ever supersede.
  it('does not displace a newer generation when a stale read lands late', async () => {
    const owner = createAssetUrlOwner();
    const stalePending = defer<Blob>();

    const stale = owner.resolve({
      key: 'p::a',
      scope: NOW,
      read: () => stalePending.promise,
    });
    const fresh = await owner.resolve({
      key: 'p::a',
      scope: LATER,
      read: async () => new Blob(['x']),
    });

    stalePending.resolve(new Blob(['x']));

    expect(await stale).toBe(fresh);
    expect(revoked()).not.toContain(fresh);
    // The live entry is intact, not overwritten under the older generation:
    // the next request hits it instead of reading and minting again.
    expect(
      await owner.resolve({
        key: 'p::a',
        scope: LATER,
        read: async () => new Blob(['x']),
      }),
    ).toBe(fresh);
    expect(minted()).toBe(1);
  });
});

describe('release by prefix', () => {
  it('releases the matching keys and only those', async () => {
    const owner = createAssetUrlOwner();
    const read = async () => new Blob(['x']);

    const mine = await owner.resolve({ key: 'h1::a', scope: NOW, read });
    // A key the released prefix is a text prefix of: the sweep has to match on
    // the delimiter the caller passed, not on the bare hash.
    const neighbour = await owner.resolve({ key: 'h1x::a', scope: NOW, read });

    owner.release('h1::');

    expect(revoked()).toEqual([mine]);
    expect(revoked()).not.toContain(neighbour);
    // The entry is gone, not merely revoked: a later request reads and mints.
    expect(await owner.resolve({ key: 'h1::a', scope: LATER, read })).not.toBe(
      mine,
    );
  });

  it('cancels a read still in flight under the released prefix', async () => {
    const owner = createAssetUrlOwner();
    const pending = defer<Blob>();

    const request = owner.resolve({
      key: 'h1::a',
      scope: NOW,
      read: () => pending.promise,
      unavailable: () => new Error('protocol deleted'),
    });
    owner.release('h1::');
    pending.resolve(new Blob(['x']));

    await expect(request).rejects.toThrow('protocol deleted');
    expect(minted()).toBe(0);
  });

  it('leaves the owner open and other prefixes resolvable', async () => {
    const owner = createAssetUrlOwner();
    const read = async () => new Blob(['x']);
    await owner.resolve({ key: 'h1::a', scope: NOW, read });

    owner.release('h1::');

    expect(owner.closed).toBe(false);
    await expect(
      owner.resolve({ key: 'h2::a', scope: NOW, read }),
    ).resolves.toMatch(/^blob:/);
  });
});

describe('terminal release', () => {
  it('revokes everything it minted', async () => {
    const owner = createAssetUrlOwner();
    const read = async () => new Blob(['x']);

    const one = await owner.resolve({ key: 'p::a', scope: NOW, read });
    const two = await owner.resolve({ key: 'p::b', scope: NOW, read });

    owner.release();

    expect(revoked()).toHaveLength(minted());
    expect(revoked()).toEqual(expect.arrayContaining([one, two]));
  });

  it('closes the owner: later requests are refused, not served', async () => {
    const owner = createAssetUrlOwner();
    const read = vi.fn(async () => new Blob(['x']));
    const url = await owner.resolve({ key: 'p::a', scope: NOW, read });

    owner.release();

    expect(owner.closed).toBe(true);
    expect(revoked()).toContain(url);
    await expect(
      owner.resolve({
        key: 'p::a',
        scope: NOW,
        read,
        unavailable: () => new Error('host torn down'),
      }),
    ).rejects.toThrow('host torn down');
    // Refused before reading: a closed owner never touches storage again.
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('does not mint for a read that lands after it', async () => {
    const owner = createAssetUrlOwner();
    const pending = defer<Blob>();

    const request = owner.resolve({
      key: 'p::a',
      scope: NOW,
      read: () => pending.promise,
      unavailable: () => new Error('host torn down'),
    });
    owner.release();
    pending.resolve(new Blob(['x']));

    await expect(request).rejects.toThrow('host torn down');
    expect(minted()).toBe(0);
  });

  it('revokes every URL it minted when two callers raced for one asset', async () => {
    const owner = createAssetUrlOwner();
    const pending = defer<Blob>();
    const read = () => pending.promise;

    const first = owner.resolve({ key: 'p::a', scope: NOW, read });
    const second = owner.resolve({ key: 'p::a', scope: NOW, read });
    pending.resolve(new Blob(['x']));
    await Promise.all([first, second]);

    owner.release();

    // Every minted URL is accounted for — and a mint did happen, so this
    // cannot pass by minting nothing.
    expect(minted()).toBe(1);
    expect(revoked()).toHaveLength(minted());
  });
});
