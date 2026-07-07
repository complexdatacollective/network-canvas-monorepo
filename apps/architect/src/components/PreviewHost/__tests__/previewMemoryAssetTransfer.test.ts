import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';

import { assetKey } from '~/utils/assetDB';
import { getAssetById, saveProtocolAssetsToMemory } from '~/utils/assetUtils';
import {
  getMemoryAssetsForScope,
  hydrateMemoryAsset,
} from '~/utils/inMemoryAssetStore';

import { launchPreview } from '../launchPreview';
import type { PreviewPayload } from '../messages';

// This exercises the REAL cross-realm asset transfer (no getAssetById mock), the
// exact gap the audit flagged: in Safari private browsing the editor keeps assets
// in a per-realm in-memory map, and the preview tab opens as a SEPARATE browsing
// context with its own empty map — so without ferrying the bytes over
// postMessage the preview resolver throws "Asset not found in local store".

const { scopeMock } = vi.hoisted(() => ({
  scopeMock: vi.fn<() => string | null>(),
}));
vi.mock('~/analytics', () => ({ posthog: { capture: vi.fn() } }));
vi.mock('~/utils/activeProtocolScope', () => ({
  getActiveProtocolScope: () => scopeMock(),
}));

const SCOPE = 'private-protocol-1';

function makeProtocol(): CurrentProtocol {
  return {
    name: 'T',
    description: '',
    schemaVersion: 8,
    stages: [{}],
    codebook: { node: {}, edge: {}, ego: {} },
    assetManifest: {
      photo: { id: 'photo', name: 'photo', type: 'image', source: 'photo.png' },
    },
  } as unknown as CurrentProtocol;
}

describe('preview in-memory asset transfer (Safari private browsing)', () => {
  let openSpy: ReturnType<typeof vi.spyOn>;
  let popup: { postMessage: ReturnType<typeof vi.fn>; closed: boolean };

  beforeEach(() => {
    scopeMock.mockReturnValue(SCOPE);
    popup = { postMessage: vi.fn(), closed: false };
    openSpy = vi
      .spyOn(window, 'open')
      .mockReturnValue(popup as unknown as Window);
  });

  afterEach(() => {
    openSpy.mockRestore();
    vi.useRealTimers();
  });

  it('the preview realm cannot resolve an in-memory asset it never received', async () => {
    // A fresh preview realm has an empty memory map: nothing was ferried, so the
    // editor-side fallback asset is invisible here. This is the reported failure.
    const missing = await getAssetById('photo', SCOPE);
    expect(missing).toBeUndefined();
  });

  it('launchPreview ferries in-memory fallback assets in the payload', async () => {
    // Editor realm: IndexedDB write failed, so the asset landed in memory only.
    saveProtocolAssetsToMemory(
      [{ id: 'photo', name: 'photo', data: new Blob(['png-bytes']) }],
      SCOPE,
    );
    expect(getMemoryAssetsForScope(SCOPE)).toHaveLength(1);

    vi.useFakeTimers();
    const promise = launchPreview({
      protocol: makeProtocol(),
      startStage: 0,
      useSyntheticData: false,
      skipLogicBypassed: false,
    });

    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'preview:ready' },
        source: popup as unknown as MessageEventSource,
        origin: window.location.origin,
      }),
    );
    await promise;

    const [payload] = popup.postMessage.mock.calls[0] as [PreviewPayload];
    expect(payload.memoryAssets).toHaveLength(1);
    expect(payload.memoryAssets[0]).toMatchObject({
      assetId: 'photo',
      name: 'photo',
    });
    expect(payload.memoryAssets[0]?.data).toBeInstanceOf(Blob);
  });

  it('hydrating the ferried assets makes them resolvable in the preview realm', async () => {
    // Simulate the preview realm receiving the payload and hydrating its map,
    // as PreviewHost does on 'preview:payload'. After that getAssetById — which
    // reads IndexedDB first, then the in-memory fallback — resolves the asset.
    const data = new Blob(['png-bytes']);
    hydrateMemoryAsset({
      id: assetKey(SCOPE, 'photo'),
      assetId: 'photo',
      protocolId: SCOPE,
      name: 'photo',
      data,
    });

    const resolved = await getAssetById('photo', SCOPE);
    expect(resolved).toBeDefined();
    expect(resolved?.data).toBe(data);
  });
});
