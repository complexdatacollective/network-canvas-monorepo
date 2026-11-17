import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({
  version: 0,
  listeners: new Set<() => void>(),
  getAssetById: vi.fn(),
}));

vi.mock('~/utils/activeProtocolScope', () => ({
  getActiveProtocolScope: () => 'protocol-1',
}));

vi.mock('~/utils/assetUtils', () => ({
  getAssetById: store.getAssetById,
  getAssetStoreVersion: () => store.version,
  subscribeToAssetStore: (listener: () => void) => {
    store.listeners.add(listener);
    return () => store.listeners.delete(listener);
  },
}));

import { useStoredShapeSvgs } from '../useStoredShapeSvgs';

const storedSvg = (svg: string) => ({
  id: 'ignored',
  name: 'shape.svg',
  data: new Blob([svg], { type: 'image/svg+xml' }),
});

const bumpStoreVersion = () => {
  act(() => {
    store.version += 1;
    for (const listener of store.listeners) listener();
  });
};

const shapes = {
  star: { asset: 'asset-star' },
  heart: { asset: 'asset-heart' },
};

const renderShapeSvgs = () => {
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(
    () => ({
      first: useStoredShapeSvgs(shapes),
      second: useStoredShapeSvgs(shapes),
    }),
    { wrapper },
  );
};

describe('useStoredShapeSvgs', () => {
  beforeEach(() => {
    store.version = 0;
    store.listeners.clear();
    store.getAssetById.mockReset();
  });

  it('reads each asset once per store version however many icons ask', async () => {
    store.getAssetById.mockImplementation(async (asset: string) =>
      storedSvg(`<svg id="${asset}" />`),
    );
    const { result } = renderShapeSvgs();

    await waitFor(() =>
      expect(result.current.first).toEqual({
        'asset-heart': '<svg id="asset-heart" />',
        'asset-star': '<svg id="asset-star" />',
      }),
    );
    expect(result.current.second).toEqual(result.current.first);
    expect(store.getAssetById).toHaveBeenCalledTimes(2);

    bumpStoreVersion();
    await waitFor(() => expect(store.getAssetById).toHaveBeenCalledTimes(4));
    expect(store.getAssetById).toHaveBeenCalledWith('asset-star', 'protocol-1');
  });

  it('keeps the earlier text while a new store version is read', async () => {
    store.getAssetById.mockImplementation(async () => storedSvg('<svg v0 />'));
    const { result } = renderShapeSvgs();
    await waitFor(() =>
      expect(result.current.first['asset-star']).toBe('<svg v0 />'),
    );

    const pendingReads: (() => void)[] = [];
    store.getAssetById.mockImplementation(
      () =>
        new Promise((resolve) => {
          pendingReads.push(() => resolve(storedSvg('<svg v1 />')));
        }),
    );
    bumpStoreVersion();

    await waitFor(() => expect(store.getAssetById).toHaveBeenCalledTimes(4));
    expect(result.current.first).toEqual({
      'asset-heart': '<svg v0 />',
      'asset-star': '<svg v0 />',
    });

    act(() => {
      for (const finish of pendingReads) finish();
    });
    await waitFor(() =>
      expect(result.current.first).toEqual({
        'asset-heart': '<svg v1 />',
        'asset-star': '<svg v1 />',
      }),
    );
  });

  it('leaves out an asset that cannot be read', async () => {
    store.getAssetById.mockImplementation(async (asset: string) => {
      if (asset === 'asset-heart') throw new Error('gone');
      return storedSvg('<svg star />');
    });
    const { result } = renderShapeSvgs();

    await waitFor(() =>
      expect(result.current.first).toEqual({ 'asset-star': '<svg star />' }),
    );
  });
});
