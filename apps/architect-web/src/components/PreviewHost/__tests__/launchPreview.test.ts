import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';

const { captureMock } = vi.hoisted(() => ({ captureMock: vi.fn() }));
vi.mock('~/analytics', () => ({ posthog: { capture: captureMock } }));

import { launchPreview } from '../launchPreview';

function makePopupStub() {
  return { postMessage: vi.fn(), closed: false } as unknown as Window;
}

function makeProtocol(): CurrentProtocol {
  return {
    name: 'T',
    description: '',
    schemaVersion: 8,
    stages: [{}, {}, {}],
    codebook: { node: {}, edge: {}, ego: {} },
    assetManifest: {
      a: { id: 'a', name: 'x', type: 'image', source: 'x.png' },
    },
  } as unknown as CurrentProtocol;
}

function postReadyFromSource(source: unknown, origin = window.location.origin) {
  window.dispatchEvent(
    new MessageEvent('message', {
      data: { type: 'preview:ready' },
      source: source as MessageEventSource,
      origin,
    }),
  );
}

describe('launchPreview', () => {
  let popup: Window;
  let openSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    captureMock.mockReset();
    popup = makePopupStub();
    openSpy = vi.spyOn(window, 'open').mockReturnValue(popup);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    openSpy.mockRestore();
  });

  it('opens /preview, then delivers the payload on receiving preview:ready', async () => {
    const protocol = makeProtocol();
    const promise = launchPreview({
      protocol,
      startStage: 2,
      useSyntheticData: true,
    });

    expect(openSpy).toHaveBeenCalledWith('/preview', '_blank');

    postReadyFromSource(popup);
    await promise;

    expect(popup.postMessage).toHaveBeenCalledWith(
      {
        type: 'preview:payload',
        protocol,
        startStage: 2,
        useSyntheticData: true,
      },
      window.location.origin,
    );
  });

  it('captures protocol_previewed with the resolved preference', async () => {
    const protocol = makeProtocol();
    const promise = launchPreview({
      protocol,
      startStage: 1,
      useSyntheticData: false,
    });
    postReadyFromSource(popup);
    await promise;

    expect(captureMock).toHaveBeenCalledWith('protocol_previewed', {
      stage_count: 3,
      start_stage_index: 1,
      asset_count: 1,
      use_synthetic_data: false,
    });
  });

  it('resolves with popup-blocked result when window.open returns null', async () => {
    openSpy.mockReturnValueOnce(null);
    await expect(
      launchPreview({
        protocol: makeProtocol(),
        startStage: 0,
        useSyntheticData: true,
      }),
    ).resolves.toEqual({
      kind: 'popup-blocked',
    });
  });

  it('ignores ready messages from a different source', async () => {
    const promise = launchPreview({
      protocol: makeProtocol(),
      startStage: 0,
      useSyntheticData: true,
    });

    // Forged message from a different window
    postReadyFromSource(makePopupStub());

    // Real ready from the popup
    postReadyFromSource(popup);
    await promise;

    expect(popup.postMessage).toHaveBeenCalledTimes(1);
  });

  it('ignores ready messages from a different origin', async () => {
    const protocol = makeProtocol();
    const promise = launchPreview({
      protocol,
      startStage: 0,
      useSyntheticData: true,
    });

    postReadyFromSource(popup, 'https://attacker.example');
    postReadyFromSource(popup); // legitimate one
    await promise;

    expect(popup.postMessage).toHaveBeenCalledTimes(1);
  });

  it('rejects when no preview:ready arrives within 10 seconds', async () => {
    const promise = launchPreview({
      protocol: makeProtocol(),
      startStage: 0,
      useSyntheticData: true,
    });
    const expectation = expect(promise).rejects.toThrow(/didn't load/i);
    await vi.advanceTimersByTimeAsync(10_000);
    await expectation;
  });

  it('redelivers the payload on a subsequent preview:ready (handles preview-tab reload)', async () => {
    const promise = launchPreview({
      protocol: makeProtocol(),
      startStage: 0,
      useSyntheticData: true,
    });

    postReadyFromSource(popup);
    await promise;
    expect(popup.postMessage).toHaveBeenCalledTimes(1);

    // Preview tab refreshed: posts ready again. The editor's listener should still
    // be active and re-send the payload.
    postReadyFromSource(popup);
    expect(popup.postMessage).toHaveBeenCalledTimes(2);
  });
});
