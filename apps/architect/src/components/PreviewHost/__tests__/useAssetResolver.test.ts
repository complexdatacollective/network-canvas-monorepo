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
});
