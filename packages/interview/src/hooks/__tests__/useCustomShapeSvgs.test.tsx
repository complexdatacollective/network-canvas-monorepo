import { configureStore } from '@reduxjs/toolkit';
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Codebook } from '@codaco/protocol-validation';

import { testTypeId } from '../../__tests__/testIds';
import { AnalyticsContext } from '../../analytics/AnalyticsContext';
import { InterviewQueryClientProvider } from '../../contexts/InterviewQueryClientProvider';
import { ContractProvider } from '../../contract/context';
import { useCustomShapeSvgs } from '../useCustomShapeSvgs';

const PLACE = testTypeId('place');
const VENUE = testTypeId('venue');

const homeSvg = '<svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg>';
const treeSvg = '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="5"/></svg>';

const codebook: Codebook = {
  node: {
    [PLACE]: {
      name: 'Place',
      color: 'node-color-seq-1',
      shape: { default: 'custom:home' },
      customShapes: {
        home: { name: 'Home', asset: 'home-asset' },
        tree: { name: 'Tree', asset: 'tree-asset' },
      },
    },
    [VENUE]: {
      name: 'Venue',
      color: 'node-color-seq-2',
      shape: { default: 'custom:house' },
      // Shares an asset with `place`.
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

const captureException = vi.fn();
const tracker = { track: vi.fn(), captureException };

beforeEach(() => {
  fetchMock.mockClear();
  captureException.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const makeWrapper = (
  onRequestAsset: (id: string) => Promise<string>,
  providedCodebook: Codebook,
) => {
  const store = configureStore({
    reducer: { protocol: () => ({ codebook: providedCodebook }) },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <AnalyticsContext.Provider value={tracker}>
        <Provider store={store}>
          <ContractProvider onFinish={vi.fn()} onRequestAsset={onRequestAsset}>
            <InterviewQueryClientProvider protocolKey="test-protocol">
              {children}
            </InterviewQueryClientProvider>
          </ContractProvider>
        </Provider>
      </AnalyticsContext.Provider>
    );
  };
};

const resolveToBlobUrl = (id: string) =>
  Promise.resolve(id === 'home-asset' ? 'blob:home' : 'blob:tree');

describe('useCustomShapeSvgs', () => {
  it('starts empty and exposes the svg text of every custom shape asset', async () => {
    const { result } = renderHook(() => useCustomShapeSvgs(), {
      wrapper: makeWrapper(resolveToBlobUrl, codebook),
    });

    expect(result.current).toEqual({});
    await waitFor(() =>
      expect(result.current).toEqual({
        'home-asset': homeSvg,
        'tree-asset': treeSvg,
      }),
    );
  });

  it('loads each asset once, however many nodes and node types use it', async () => {
    const onRequestAsset = vi.fn(resolveToBlobUrl);
    function Consumer({ name }: { name: string }) {
      const svgs = useCustomShapeSvgs();
      return <span>{`${name}:${Object.keys(svgs).length}`}</span>;
    }
    const Wrapper = makeWrapper(onRequestAsset, codebook);
    const tree = (
      <Wrapper>
        <Consumer name="a" />
        <Consumer name="b" />
        <Consumer name="c" />
      </Wrapper>
    );
    const { rerender } = render(tree);

    await screen.findByText('a:2');
    screen.getByText('b:2');
    screen.getByText('c:2');
    rerender(tree);

    expect(onRequestAsset.mock.calls.map(([id]) => id).toSorted()).toEqual([
      'home-asset',
      'tree-asset',
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps the loaded map stable across re-renders', async () => {
    const seen = new Set<Readonly<Record<string, string>>>();
    function Consumer() {
      const svgs = useCustomShapeSvgs();
      if (Object.keys(svgs).length === 2) seen.add(svgs);
      return <span>{Object.keys(svgs).length}</span>;
    }
    const Wrapper = makeWrapper(resolveToBlobUrl, codebook);
    const tree = (
      <Wrapper>
        <Consumer />
      </Wrapper>
    );
    const { rerender } = render(tree);
    await screen.findByText('2');
    rerender(tree);
    rerender(tree);

    expect(seen.size).toBe(1);
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

  it('leaves out an asset that fails to resolve, reports it, and keeps the others', async () => {
    const onRequestAsset = (id: string) =>
      id === 'home-asset'
        ? Promise.reject(new Error('asset not found'))
        : Promise.resolve('blob:tree');
    const { result } = renderHook(() => useCustomShapeSvgs(), {
      wrapper: makeWrapper(onRequestAsset, codebook),
    });

    await waitFor(() => expect(captureException).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(result.current).toEqual({ 'tree-asset': treeSvg }),
    );
    expect(captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'asset not found' }),
      { feature: 'custom-shapes' },
    );
  });

  it('treats an unsuccessful response as a failed load', async () => {
    const onRequestAsset = (id: string) =>
      Promise.resolve(id === 'home-asset' ? 'blob:gone' : 'blob:tree');
    const { result } = renderHook(() => useCustomShapeSvgs(), {
      wrapper: makeWrapper(onRequestAsset, codebook),
    });

    await waitFor(() => expect(captureException).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(result.current).toEqual({ 'tree-asset': treeSvg }),
    );
  });

  it('shows an asset as soon as it loads, without waiting for the others', async () => {
    const onRequestAsset = (id: string) =>
      id === 'home-asset'
        ? new Promise<string>(() => undefined)
        : Promise.resolve('blob:tree');
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
          [testTypeId('person')]: {
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

  it('abandons a load that settles after unmount', async () => {
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
          [PLACE]: {
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
    expect(captureException).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
