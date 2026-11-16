import { render, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Codebook } from '@codaco/protocol-validation';

import { ContractProvider } from '../../contract/context';
import {
  CustomShapeSvgsProvider,
  useCustomShapeSvgs,
} from '../CustomShapeSvgsContext';

const homeSvg = '<svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg>';
const treeSvg = '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="5"/></svg>';

const codebook: Codebook = {
  node: {
    place: {
      name: 'Place',
      color: 'node-color-seq-1',
      shape: { default: 'custom:home' },
      customShapes: {
        home: { name: 'Home', asset: 'home-asset' },
        tree: { name: 'Tree', asset: 'tree-asset' },
      },
    },
    venue: {
      name: 'Venue',
      color: 'node-color-seq-2',
      shape: { default: 'custom:house' },
      // Shares an asset with `place`, so it must be loaded only once.
      customShapes: { house: { name: 'House', asset: 'home-asset' } },
    },
  },
};

const svgByUrl: Record<string, string> = {
  'blob:home': homeSvg,
  'blob:tree': treeSvg,
};

const fetchMock = vi.fn((url: string) =>
  Promise.resolve(
    url in svgByUrl
      ? new Response(svgByUrl[url], { status: 200 })
      : new Response('missing', { status: 404 }),
  ),
);

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const makeWrapper = (
  onRequestAsset: (id: string) => Promise<string>,
  providedCodebook: Codebook,
) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ContractProvider onFinish={vi.fn()} onRequestAsset={onRequestAsset}>
        <CustomShapeSvgsProvider codebook={providedCodebook}>
          {children}
        </CustomShapeSvgsProvider>
      </ContractProvider>
    );
  };

const resolveToBlobUrl = (id: string) =>
  Promise.resolve(id === 'home-asset' ? 'blob:home' : 'blob:tree');

describe('CustomShapeSvgsProvider', () => {
  it('loads each distinct shape asset once and exposes its svg text', async () => {
    const onRequestAsset = vi.fn(resolveToBlobUrl);
    const { result } = renderHook(() => useCustomShapeSvgs(), {
      wrapper: makeWrapper(onRequestAsset, codebook),
    });

    expect(result.current).toEqual({});

    await waitFor(() =>
      expect(result.current).toEqual({
        'home-asset': homeSvg,
        'tree-asset': treeSvg,
      }),
    );
    expect(onRequestAsset).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reads data URLs without fetching them', async () => {
    const onRequestAsset = (id: string) =>
      Promise.resolve(
        id === 'home-asset'
          ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(homeSvg)}`
          : `data:image/svg+xml;base64,${btoa(treeSvg)}`,
      );
    const { result } = renderHook(() => useCustomShapeSvgs(), {
      wrapper: makeWrapper(onRequestAsset, codebook),
    });

    await waitFor(() =>
      expect(result.current).toEqual({
        'home-asset': homeSvg,
        'tree-asset': treeSvg,
      }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shares one map between consumers and does not refetch on re-render', async () => {
    const onRequestAsset = vi.fn(resolveToBlobUrl);
    const seen: Readonly<Record<string, string>>[] = [];
    function Consumer({ name }: { name: string }) {
      const svgs = useCustomShapeSvgs();
      seen.push(svgs);
      return <span>{`${name}:${Object.keys(svgs).length}`}</span>;
    }
    const Wrapper = makeWrapper(onRequestAsset, codebook);
    const tree = (
      <Wrapper>
        <Consumer name="a" />
        <Consumer name="b" />
      </Wrapper>
    );
    const { rerender } = render(tree);

    await screen.findByText('a:2');
    screen.getByText('b:2');
    rerender(tree);

    const loaded = seen.filter((svgs) => Object.keys(svgs).length === 2);
    expect(new Set(loaded).size).toBe(1);
    expect(onRequestAsset).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('leaves out a shape that fails to load and keeps the others', async () => {
    const onRequestAsset = vi.fn((id: string) =>
      id === 'home-asset'
        ? Promise.reject(new Error('asset not found'))
        : Promise.resolve('blob:tree'),
    );
    const { result } = renderHook(() => useCustomShapeSvgs(), {
      wrapper: makeWrapper(onRequestAsset, codebook),
    });

    await waitFor(() =>
      expect(result.current).toEqual({ 'tree-asset': treeSvg }),
    );
  });

  it('treats an unsuccessful response as a failed load', async () => {
    const onRequestAsset = vi.fn((id: string) =>
      Promise.resolve(id === 'home-asset' ? 'blob:gone' : 'blob:tree'),
    );
    const { result } = renderHook(() => useCustomShapeSvgs(), {
      wrapper: makeWrapper(onRequestAsset, codebook),
    });

    await waitFor(() =>
      expect(result.current).toEqual({ 'tree-asset': treeSvg }),
    );
  });

  it('does no work for a protocol without custom shapes', () => {
    const onRequestAsset = vi.fn(resolveToBlobUrl);
    const { result } = renderHook(() => useCustomShapeSvgs(), {
      wrapper: makeWrapper(onRequestAsset, {
        node: {
          person: {
            name: 'Person',
            color: 'node-color-seq-1',
            shape: { default: 'circle' },
          },
        },
      }),
    });

    expect(result.current).toEqual({});
    expect(onRequestAsset).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ignores a load that settles after unmount', async () => {
    let resolveUrl: (url: string) => void = () => undefined;
    const onRequestAsset = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveUrl = resolve;
        }),
    );
    const consoleError = vi.spyOn(console, 'error');
    const { unmount } = renderHook(() => useCustomShapeSvgs(), {
      wrapper: makeWrapper(onRequestAsset, {
        node: {
          place: {
            name: 'Place',
            color: 'node-color-seq-1',
            shape: { default: 'custom:home' },
            customShapes: { home: { name: 'Home', asset: 'home-asset' } },
          },
        },
      }),
    });

    await waitFor(() => expect(onRequestAsset).toHaveBeenCalledTimes(1));
    unmount();
    resolveUrl('blob:home');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
