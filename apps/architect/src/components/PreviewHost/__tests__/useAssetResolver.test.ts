import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAssetResolver } from '../useAssetResolver';

const getAssetByIdMock = vi.fn();

const SCOPE = 'p1';

// getAssetById already reads IndexedDB with an in-memory fallback; mocking it
// (rather than the raw Dexie table) verifies the resolver goes through the same
// path the editor uses, so Safari-private in-memory assets resolve in preview.
vi.mock('~/utils/assetUtils', () => ({
  getAssetById: (assetId: string, protocolId?: string) =>
    getAssetByIdMock(assetId, protocolId),
}));

let createUrlSpy: ReturnType<typeof vi.spyOn>;
let revokeUrlSpy: ReturnType<typeof vi.spyOn>;
let urlCounter = 0;

// Holds a read open so a second request, an unmount, or both can happen while
// it is still in flight — the window this hook has to get right.
function defer<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => {
  getAssetByIdMock.mockReset();
  urlCounter = 0;
  globalThis.URL.createObjectURL = vi.fn(() => `blob:test/${++urlCounter}`);
  globalThis.URL.revokeObjectURL = vi.fn();
  createUrlSpy = vi.spyOn(globalThis.URL, 'createObjectURL');
  revokeUrlSpy = vi.spyOn(globalThis.URL, 'revokeObjectURL');
});

afterEach(() => {
  createUrlSpy.mockRestore();
  revokeUrlSpy.mockRestore();
});

describe('useAssetResolver', () => {
  it('returns an object URL for a blob resolved via getAssetById', async () => {
    const blob = new Blob(['x'], { type: 'image/png' });
    getAssetByIdMock.mockResolvedValueOnce({
      id: 'a1',
      name: 'a1',
      data: blob,
    });

    const { result } = renderHook(() => useAssetResolver(SCOPE));
    const url = await result.current('a1');

    expect(url).toBe('blob:test/1');
    expect(createUrlSpy).toHaveBeenCalledWith(blob);
    expect(getAssetByIdMock).toHaveBeenCalledWith('a1', SCOPE);
  });

  it('resolves in-memory assets that getAssetById returns via its fallback', async () => {
    // getAssetById transparently returns the in-memory row when IndexedDB is
    // unavailable, so the resolver never sees a distinct code path.
    const blob = new Blob(['mem']);
    getAssetByIdMock.mockResolvedValueOnce({
      id: 'mem1',
      name: 'mem1',
      data: blob,
    });

    const { result } = renderHook(() => useAssetResolver(SCOPE));
    const url = await result.current('mem1');

    expect(url).toBe('blob:test/1');
    expect(createUrlSpy).toHaveBeenCalledWith(blob);
  });

  it('caches subsequent requests for the same asset', async () => {
    const blob = new Blob(['x']);
    getAssetByIdMock.mockResolvedValue({ id: 'a1', name: 'a1', data: blob });

    const { result } = renderHook(() => useAssetResolver(SCOPE));
    const first = await result.current('a1');
    const second = await result.current('a1');

    expect(second).toBe(first);
    expect(createUrlSpy).toHaveBeenCalledTimes(1);
    expect(getAssetByIdMock).toHaveBeenCalledTimes(1);
  });

  it('revokes all issued URLs on unmount', async () => {
    getAssetByIdMock.mockImplementation((assetId: string) =>
      Promise.resolve({
        id: assetId,
        name: assetId,
        data: new Blob([assetId]),
      }),
    );

    const { result, unmount } = renderHook(() => useAssetResolver(SCOPE));
    const u1 = await result.current('a1');
    const u2 = await result.current('a2');
    expect(u1).not.toBe(u2);

    unmount();

    expect(revokeUrlSpy).toHaveBeenCalledWith(u1);
    expect(revokeUrlSpy).toHaveBeenCalledWith(u2);
  });

  it('rejects when getAssetById returns no entry', async () => {
    getAssetByIdMock.mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useAssetResolver(SCOPE));
    await expect(result.current('missing')).rejects.toThrow(/missing/);
  });

  it('rejects when there is no active protocol scope', async () => {
    const { result } = renderHook(() => useAssetResolver(null));
    await expect(result.current('a1')).rejects.toThrow(/a1/);
    expect(getAssetByIdMock).not.toHaveBeenCalled();
  });

  it('rejects when getAssetById returns a string-typed data field', async () => {
    getAssetByIdMock.mockResolvedValueOnce({
      id: 'a1',
      name: 'a1',
      data: 'not-a-blob',
    });
    const { result } = renderHook(() => useAssetResolver(SCOPE));
    await expect(result.current('a1')).rejects.toThrow();
  });

  // A stage can request the same asset from several components in one commit
  // (two name-generator panels on one roster, an image used by more than one
  // content item). Without a single-flight index both requests miss the cache,
  // both mint, and the second cache write orphans the first URL — nothing holds
  // it, so unmount cannot revoke it either.
  it('mints one URL when two callers request the same asset concurrently', async () => {
    const deferred = defer<{ id: string; name: string; data: Blob }>();
    getAssetByIdMock.mockReturnValue(deferred.promise);

    const { result } = renderHook(() => useAssetResolver(SCOPE));
    const first = result.current('a1');
    const second = result.current('a1');
    deferred.resolve({ id: 'a1', name: 'a1', data: new Blob(['x']) });

    expect(await first).toBe(await second);
    expect(createUrlSpy).toHaveBeenCalledTimes(1);
    expect(getAssetByIdMock).toHaveBeenCalledTimes(1);
  });

  it('revokes every URL it minted when two callers raced for it', async () => {
    const deferred = defer<{ id: string; name: string; data: Blob }>();
    getAssetByIdMock.mockReturnValue(deferred.promise);

    const { result, unmount } = renderHook(() => useAssetResolver(SCOPE));
    const first = result.current('a1');
    const second = result.current('a1');
    deferred.resolve({ id: 'a1', name: 'a1', data: new Blob(['x']) });
    await Promise.all([first, second]);

    unmount();

    // Every minted URL is accounted for: as many revokes as mints — and a mint
    // did happen, so this cannot pass by minting nothing.
    expect(createUrlSpy).toHaveBeenCalledTimes(1);
    expect(revokeUrlSpy).toHaveBeenCalledTimes(createUrlSpy.mock.calls.length);
  });

  // Pins the teardown guard. In the shipped preview this is close to
  // unobservable — PreviewHost is the root of its own popup document, so its
  // routine unmount *is* that document unloading, and the browser revokes every
  // object URL in an unloading document's realm. It bites on the one path that
  // unmounts the host inside a live document: AppErrorBoundary swapping in its
  // fallback after a render throw.
  it('does not mint a URL for a read that lands after teardown', async () => {
    const deferred = defer<{ id: string; name: string; data: Blob }>();
    getAssetByIdMock.mockReturnValue(deferred.promise);

    const { result, unmount } = renderHook(() => useAssetResolver(SCOPE));
    const pending = result.current('a1');
    unmount();
    deferred.resolve({ id: 'a1', name: 'a1', data: new Blob(['x']) });

    await expect(pending).rejects.toThrow(/Preview closed/);
    expect(createUrlSpy).not.toHaveBeenCalled();
  });

  it('does not serve a revoked URL to a request made after teardown', async () => {
    getAssetByIdMock.mockResolvedValue({
      id: 'a1',
      name: 'a1',
      data: new Blob(['x']),
    });

    const { result, unmount } = renderHook(() => useAssetResolver(SCOPE));
    const url = await result.current('a1');
    unmount();
    expect(revokeUrlSpy).toHaveBeenCalledWith(url);

    await expect(result.current('a1')).rejects.toThrow(/Preview closed/);
  });

  it('retries a failed read instead of replaying its rejection', async () => {
    getAssetByIdMock.mockResolvedValueOnce(undefined);
    getAssetByIdMock.mockResolvedValueOnce({
      id: 'a1',
      name: 'a1',
      data: new Blob(['x']),
    });

    const { result } = renderHook(() => useAssetResolver(SCOPE));
    await expect(result.current('a1')).rejects.toThrow();
    await expect(result.current('a1')).resolves.toBe('blob:test/1');
  });
});
