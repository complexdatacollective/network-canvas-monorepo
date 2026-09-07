import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import { messageText } from '~/test/messageText';

const { captureMock, scopeMock } = vi.hoisted(() => ({
  captureMock: vi.fn(),
  scopeMock: vi.fn<() => string | null>(),
}));
vi.mock('~/analytics', () => ({ posthog: { capture: captureMock } }));
vi.mock('~/utils/activeProtocolScope', () => ({
  getActiveProtocolScope: () => scopeMock(),
}));

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
    scopeMock.mockReset();
    scopeMock.mockReturnValue('lib-protocol-1');
    popup = makePopupStub();
    openSpy = vi.spyOn(window, 'open').mockReturnValue(popup);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    openSpy.mockRestore();
  });

  it('opens /preview/, then delivers the payload on receiving preview:ready', async () => {
    const protocol = makeProtocol();
    const promise = launchPreview({
      protocol,
      startStage: 2,
      useSyntheticData: true,
      respectSkipLogic: false,
    });

    expect(openSpy).toHaveBeenCalledWith(
      '/preview/',
      '_blank',
      'popup,width=1280,height=800',
    );

    postReadyFromSource(popup);
    await promise;

    expect(popup.postMessage).toHaveBeenCalledWith(
      {
        type: 'preview:payload',
        protocol,
        protocolId: 'lib-protocol-1',
        startStage: 2,
        useSyntheticData: true,
        respectSkipLogic: false,
        memoryAssets: [],
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
      respectSkipLogic: false,
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
        respectSkipLogic: false,
      }),
    ).resolves.toEqual({
      kind: 'popup-blocked',
    });
  });

  it('resolves with popup-closed when the tab closes before the handshake', async () => {
    const promise = launchPreview({
      protocol: makeProtocol(),
      startStage: 0,
      useSyntheticData: true,
      respectSkipLogic: false,
    });

    (popup as unknown as { closed: boolean }).closed = true;
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(promise).resolves.toEqual({ kind: 'popup-closed' });
  });

  it('rejects without opening a popup when there is no active protocol scope', async () => {
    scopeMock.mockReturnValue(null);
    await expect(
      launchPreview({
        protocol: makeProtocol(),
        startStage: 0,
        useSyntheticData: true,
        respectSkipLogic: false,
      }),
    ).rejects.toThrow(/no active protocol/i);
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('ignores ready messages from a different source', async () => {
    const promise = launchPreview({
      protocol: makeProtocol(),
      startStage: 0,
      useSyntheticData: true,
      respectSkipLogic: false,
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
      respectSkipLogic: false,
    });

    postReadyFromSource(popup, 'https://attacker.example');
    postReadyFromSource(popup); // legitimate one
    await promise;

    expect(popup.postMessage).toHaveBeenCalledTimes(1);
  });

  it('accepts preview:ready after the full service-worker handoff budget', async () => {
    const promise = launchPreview({
      protocol: makeProtocol(),
      startStage: 0,
      useSyntheticData: true,
      respectSkipLogic: false,
    });
    const outcome = promise.then(
      (value) => ({ kind: 'resolved' as const, value }),
      (error: unknown) => ({ error, kind: 'rejected' as const }),
    );

    // preview-main can use 3 seconds to find the registration, 3 seconds to
    // discover an update, 20 seconds to install it, and another 20 seconds to
    // activate it before PreviewHost mounts and announces readiness.
    await vi.advanceTimersByTimeAsync(46_000);
    postReadyFromSource(popup);

    expect(await outcome).toEqual({
      kind: 'resolved',
      value: { kind: 'delivered' },
    });
  });

  it('rejects when no preview:ready arrives within 55 seconds', async () => {
    const promise = launchPreview({
      protocol: makeProtocol(),
      startStage: 0,
      useSyntheticData: true,
      respectSkipLogic: false,
    });
    const outcome = promise.catch((error: unknown) =>
      error instanceof Error ? messageText(error.message) : error,
    );
    const expectation = expect(outcome).resolves.toBe(
      'Preview window did not load in time. Close it and try again.',
    );
    await vi.advanceTimersByTimeAsync(55_000);
    await expectation;
  });

  it('redelivers the payload on a subsequent preview:ready (handles preview-tab reload)', async () => {
    const promise = launchPreview({
      protocol: makeProtocol(),
      startStage: 0,
      useSyntheticData: true,
      respectSkipLogic: false,
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
