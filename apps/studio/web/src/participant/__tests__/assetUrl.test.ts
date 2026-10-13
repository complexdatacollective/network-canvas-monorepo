import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ResolvedAsset } from '@codaco/interview/contract';

import { createAssetResolver } from '../assetUrl.ts';

const HASH = 'a'.repeat(64);

const asset = (assetId: string, source: string): ResolvedAsset => ({
  assetId,
  name: assetId,
  type: 'image',
  source,
});

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="1"/></svg>';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the participant asset resolver', () => {
  it('points the interview at storage for audio, video and raster images', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const resolve = createAssetResolver([
      asset('photo', `${HASH}.png`),
      asset('clip', `${HASH}.mov`),
    ]);

    await expect(resolve('photo')).resolves.toBe(`/storage/${HASH}`);
    await expect(resolve('clip')).resolves.toBe(`/storage/${HASH}`);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('hands an SVG over as a data URL built from its bytes, read without cookies', async () => {
    const fetchSpy = vi.fn(async () => new Response(SVG));
    vi.stubGlobal('fetch', fetchSpy);
    const resolve = createAssetResolver([asset('diagram', `${HASH}.SVG`)]);

    const url = await resolve('diagram');

    expect(url).toBe(
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent(SVG)}`,
    );
    expect(fetchSpy).toHaveBeenCalledWith(`/storage/${HASH}`, {
      credentials: 'omit',
    });
    await resolve('diagram');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('tries an SVG again after a failed load', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response(SVG));
    vi.stubGlobal('fetch', fetchSpy);
    const resolve = createAssetResolver([asset('diagram', `${HASH}.svg`)]);

    await expect(resolve('diagram')).rejects.toThrow('503');
    await expect(resolve('diagram')).resolves.toMatch(/^data:image\/svg\+xml/);
  });

  it('refuses an asset the protocol has no stored file for', async () => {
    const resolve = createAssetResolver([]);
    await expect(resolve('missing')).rejects.toThrow('missing');
  });

  it('reports why an asset failed to load, and nothing for one that loaded', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response(SVG));
    vi.stubGlobal('fetch', fetchSpy);
    const failures: string[] = [];
    const resolve = createAssetResolver(
      [asset('diagram', `${HASH}.svg`), asset('photo', `${HASH}.png`)],
      (code) => failures.push(code),
    );

    await expect(resolve('missing')).rejects.toThrow('missing');
    await expect(resolve('diagram')).rejects.toThrow('404');
    await expect(resolve('diagram')).rejects.toThrow('503');
    await expect(resolve('diagram')).rejects.toThrow('Failed to fetch');
    await expect(resolve('diagram')).resolves.toMatch(/^data:image\/svg\+xml/);
    await expect(resolve('photo')).resolves.toBe(`/storage/${HASH}`);

    expect(failures).toEqual([
      'not_found',
      'not_found',
      'http_error',
      'transport',
    ]);
  });
});
