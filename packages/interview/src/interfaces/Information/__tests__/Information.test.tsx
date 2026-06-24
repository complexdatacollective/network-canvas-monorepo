import { configureStore } from '@reduxjs/toolkit';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { Item } from '@codaco/protocol-validation';
import { ContractProvider } from '~/contract/context';
import type { ResolvedAsset } from '~/contract/types';
import protocol from '~/store/modules/protocol';
import type { StageProps } from '~/types';

import Information from '../Information';

type InformationStage = StageProps<'Information'>['stage'];

// fresco-ui's ScrollArea observes its content via ResizeObserver, which jsdom
// does not implement. A no-op stub is enough for these render assertions.
class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', StubResizeObserver);
});

function makeStore(assets: ResolvedAsset[]) {
  return configureStore({
    reducer: { protocol },
    preloadedState: {
      // Partial protocol slice — only `assets` is read by the Information
      // stage. Mirrors the `as never` preloadedState idiom used by the other
      // interface tests (a full ProtocolPayload is not needed here).
      protocol: { assets } as never,
    },
  });
}

function renderInformation(
  stage: InformationStage,
  assets: ResolvedAsset[],
  onRequestAsset: (id: string) => Promise<string> = () =>
    Promise.resolve('blob://asset'),
) {
  const store = makeStore(assets);

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <Provider store={store}>
        <ContractProvider onFinish={vi.fn()} onRequestAsset={onRequestAsset}>
          {children}
        </ContractProvider>
      </Provider>
    );
  }

  return render(
    <Information
      stage={stage}
      getNavigationHelpers={() => ({
        moveForward: vi.fn(),
        moveBackward: vi.fn(),
      })}
    />,
    { wrapper: Wrapper },
  );
}

const makeStage = (items: Item[]): InformationStage => ({
  id: 'info-1',
  type: 'Information',
  label: 'Info',
  title: 'Information',
  items,
});

describe('Information asset fallbacks', () => {
  it('renders a visible placeholder for an asset id absent from the manifest', () => {
    const stage = makeStage([
      { id: 'i1', type: 'asset', content: 'missing-asset' },
    ]);

    renderInformation(stage, []);

    expect(screen.getByTestId('information-item-fallback')).toBeTruthy();
  });

  it('renders a visible placeholder for a network/geojson/apikey asset', async () => {
    const stage = makeStage([{ id: 'i1', type: 'asset', content: 'net-1' }]);
    const assets: ResolvedAsset[] = [
      { assetId: 'net-1', name: 'Classmates', type: 'network' },
    ];

    renderInformation(stage, assets);

    await waitFor(() =>
      expect(screen.getByTestId('information-item-fallback')).toBeTruthy(),
    );
  });

  it('does NOT render the fallback for a valid image item', async () => {
    const stage = makeStage([{ id: 'i1', type: 'asset', content: 'img-1' }]);
    const assets: ResolvedAsset[] = [
      { assetId: 'img-1', name: 'Photo', type: 'image', source: 'photo.png' },
    ];

    renderInformation(stage, assets);

    await waitFor(() => expect(document.querySelector('img')).toBeTruthy());
    expect(screen.queryByTestId('information-item-fallback')).toBeNull();
  });
});

describe('Information media MIME type derives from source', () => {
  it('audio <source> type derives from source when name lacks an extension', async () => {
    const stage = makeStage([{ id: 'i1', type: 'asset', content: 'aud-1' }]);
    const assets: ResolvedAsset[] = [
      {
        assetId: 'aud-1',
        name: 'Intro Clip',
        type: 'audio',
        source: 'clip.mp3',
      },
    ];

    renderInformation(stage, assets);

    await waitFor(() =>
      expect(document.querySelector('audio source')).toBeTruthy(),
    );
    const source = document.querySelector('audio source');
    expect(source?.getAttribute('type')).toBe('audio/mpeg');
  });

  it('video <source> type derives from source (.mov -> video/mp4)', async () => {
    const stage = makeStage([{ id: 'i1', type: 'asset', content: 'vid-1' }]);
    const assets: ResolvedAsset[] = [
      {
        assetId: 'vid-1',
        name: 'Intro Clip',
        type: 'video',
        source: 'intro.mov',
      },
    ];

    renderInformation(stage, assets);

    await waitFor(() =>
      expect(document.querySelector('video source')).toBeTruthy(),
    );
    const source = document.querySelector('video source');
    expect(source?.getAttribute('type')).toBe('video/mp4');
  });
});
