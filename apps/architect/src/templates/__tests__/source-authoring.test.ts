import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';

import { saveProtocolSource } from '../source-authoring';

const protocol = {
  schemaVersion: 9,
  name: 'Source protocol',
  localization: { defaultLocale: 'en', locales: ['en'] },
  codebook: { node: {}, edge: {}, ego: {} },
  assetManifest: {},
  stages: [],
} satisfies CurrentProtocol;

const save = () =>
  saveProtocolSource({
    sourceRef: { kind: 'template', id: 'example' },
    protocol,
    protocolId: 'protocol-1',
  });

const respondWith = (body: unknown, status = 200) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('saveProtocolSource', () => {
  it('returns the dev server’s account of a save that worked', async () => {
    const body = {
      ok: true,
      writtenProtocolPath: 'templates/example/protocol.json',
      writtenAssets: ['a.png'],
      removedAssets: [],
    };
    respondWith(body);

    await expect(save()).resolves.toEqual(body);
  });

  it('returns the dev server’s refusal with its issues', async () => {
    const body = {
      ok: false,
      error: 'Protocol validation failed.',
      issues: ['x'],
    };
    respondWith(body, 400);

    await expect(save()).resolves.toEqual(body);
  });

  it('refuses a success the server did not send with a successful status', async () => {
    respondWith(
      {
        ok: true,
        writtenProtocolPath: 'p.json',
        writtenAssets: [],
        removedAssets: [],
      },
      500,
    );

    await expect(save()).resolves.toEqual({
      ok: false,
      error: 'Source save failed.',
    });
  });

  it.each([
    ['a body that is not an object', 'saved'],
    ['no verdict', {}],
    ['a success that lists no written paths', { ok: true }],
    ['a refusal without a reason', { ok: false }],
    [
      'a refusal whose issues are not text',
      { ok: false, error: 'No', issues: [1] },
    ],
  ])('reports a failed save for %s', async (_label, body) => {
    respondWith(body);

    await expect(save()).resolves.toEqual({
      ok: false,
      error: 'Source save failed.',
    });
  });
});
