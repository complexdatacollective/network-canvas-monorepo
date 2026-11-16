import { statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import { BUNDLED_TEMPLATES } from '~/templates';

import { sampleProtocol } from '../sample-protocol';
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
    const sourcesOf = (protocol: CurrentProtocol) =>
      Object.values(protocol.assetManifest ?? {}).flatMap((entry) =>
        'source' in entry && entry.source ? [entry.source] : [],
      );
    const expectedPaths = [
      ...sourcesOf(sampleProtocol).map((source) => `/sample/assets/${source}`),
      ...BUNDLED_TEMPLATES.flatMap(({ id, protocol }) =>
        sourcesOf(protocol).map(
          (source) => `/templates/${id}/assets/${source}`,
        ),
      ),
    ];
    expect(expectedPaths.length).toBeGreaterThan(0);
    expect(bundledTemplateAssetUrls).toHaveLength(expectedPaths.length);

    // Vite inlines a small asset as a data URL, which carries no path to
    // match; every other URL names exactly one expected file.
    const fileUrls = bundledTemplateAssetUrls.filter(
      (url) => !url.startsWith('data:'),
    );
    expect(fileUrls.length).toBeGreaterThan(0);
    const matched = fileUrls.map((url) =>
      expectedPaths.filter((path) => url.endsWith(path)),
    );
    expect(matched.every((paths) => paths.length === 1)).toBe(true);
    expect(new Set(matched.flat()).size).toBe(fileUrls.length);

    // Only a file under Vite's default 4 KiB inline limit can come back as a
    // data URL, so there can be no more of those than there are such files.
    const protocolsRoot = join(
      dirname(fileURLToPath(import.meta.url)),
      '../../../../../packages/protocols',
    );
    const inlinable = expectedPaths.filter(
      (path) => statSync(join(protocolsRoot, path)).size < 4096,
    );
    const dataUrls = bundledTemplateAssetUrls.filter((url) =>
      url.startsWith('data:'),
    );
    expect(dataUrls.length).toBeLessThanOrEqual(inlinable.length);
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
