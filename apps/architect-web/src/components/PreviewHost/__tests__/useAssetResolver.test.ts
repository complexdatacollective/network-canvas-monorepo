import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAssetResolver } from '../useAssetResolver';

const getMock = vi.fn();

vi.mock('~/utils/assetDB', () => ({
  assetDb: {
    assets: {
      get: (args: { id: string }) => getMock(args),
    },
  },
}));

let createUrlSpy: ReturnType<typeof vi.spyOn>;
let revokeUrlSpy: ReturnType<typeof vi.spyOn>;
let urlCounter = 0;

beforeEach(() => {
  getMock.mockReset();
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
  it('returns an object URL for a blob fetched from assetDb', async () => {
    const blob = new Blob(['x'], { type: 'image/png' });
    getMock.mockResolvedValueOnce({ id: 'a1', data: blob });

    const { result } = renderHook(() => useAssetResolver());
    const url = await result.current('a1');

    expect(url).toBe('blob:test/1');
    expect(createUrlSpy).toHaveBeenCalledWith(blob);
  });

  it('caches subsequent requests for the same asset', async () => {
    const blob = new Blob(['x']);
    getMock.mockResolvedValue({ id: 'a1', data: blob });

    const { result } = renderHook(() => useAssetResolver());
    const first = await result.current('a1');
    const second = await result.current('a1');

    expect(second).toBe(first);
    expect(createUrlSpy).toHaveBeenCalledTimes(1);
    expect(getMock).toHaveBeenCalledTimes(1);
  });

  it('revokes all issued URLs on unmount', async () => {
    getMock.mockImplementation(({ id }) =>
      Promise.resolve({ id, data: new Blob([id]) }),
    );

    const { result, unmount } = renderHook(() => useAssetResolver());
    const u1 = await result.current('a1');
    const u2 = await result.current('a2');
    expect(u1).not.toBe(u2);

    unmount();

    expect(revokeUrlSpy).toHaveBeenCalledWith(u1);
    expect(revokeUrlSpy).toHaveBeenCalledWith(u2);
  });

  it('rejects when assetDb returns no entry', async () => {
    getMock.mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useAssetResolver());
    await expect(result.current('missing')).rejects.toThrow(/missing/);
  });

  it('rejects when assetDb returns a string-typed data field', async () => {
    getMock.mockResolvedValueOnce({ id: 'a1', data: 'not-a-blob' });
    const { result } = renderHook(() => useAssetResolver());
    await expect(result.current('a1')).rejects.toThrow();
  });
});
