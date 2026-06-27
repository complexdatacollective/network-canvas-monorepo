import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  bundledTemplateAssetUrls,
  warmBundledTemplateAssets,
} from '../warmBundledAssets';

const setServiceWorker = (value: unknown) => {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value,
  });
};

const originalFetch = globalThis.fetch;

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
  Reflect.deleteProperty(navigator, 'serviceWorker');
});

describe('warmBundledTemplateAssets', () => {
  it('includes the Sample and template asset URLs and excludes nothing extra', () => {
    expect(bundledTemplateAssetUrls.length).toBeGreaterThan(0);
    expect(bundledTemplateAssetUrls.every((u) => typeof u === 'string')).toBe(
      true,
    );
  });

  describe('with a controlling service worker', () => {
    beforeEach(() => {
      setServiceWorker({ ready: Promise.resolve({}), controller: {} });
    });

    it('fetches every bundled asset URL once the worker is ready', async () => {
      const fetchMock = vi.fn().mockResolvedValue(new Response('x'));
      globalThis.fetch = fetchMock;

      await warmBundledTemplateAssets();

      expect(fetchMock).toHaveBeenCalledTimes(bundledTemplateAssetUrls.length);
      for (const url of bundledTemplateAssetUrls) {
        expect(fetchMock).toHaveBeenCalledWith(url);
      }
    });

    it('ignores individual fetch failures (best-effort warming)', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline'));
      await expect(warmBundledTemplateAssets()).resolves.toBeUndefined();
    });
  });

  it('waits for the worker to control the page before fetching', async () => {
    let controllerChange: (() => void) | undefined;
    setServiceWorker({
      ready: Promise.resolve({}),
      controller: null,
      addEventListener: (type: string, handler: () => void) => {
        if (type === 'controllerchange') controllerChange = handler;
      },
      removeEventListener: () => {},
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response('x'));
    globalThis.fetch = fetchMock;

    const warming = warmBundledTemplateAssets();
    await Promise.resolve();
    // No fetches until the worker takes control.
    expect(fetchMock).not.toHaveBeenCalled();

    controllerChange?.();
    await warming;
    expect(fetchMock).toHaveBeenCalledTimes(bundledTemplateAssetUrls.length);
  });

  it('gives up without fetching if the worker never takes control', async () => {
    vi.useFakeTimers();
    setServiceWorker({
      ready: Promise.resolve({}),
      controller: null,
      addEventListener: () => {}, // controllerchange never fires
      removeEventListener: () => {},
    });
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    const warming = warmBundledTemplateAssets();
    await vi.advanceTimersByTimeAsync(8000);
    await warming;

    expect(fetchMock).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('does nothing when service workers are unsupported', async () => {
    Reflect.deleteProperty(navigator, 'serviceWorker');
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    await warmBundledTemplateAssets();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
