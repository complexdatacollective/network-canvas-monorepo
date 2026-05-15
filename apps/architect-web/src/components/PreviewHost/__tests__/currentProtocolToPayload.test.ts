import { describe, expect, it } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';

import { currentProtocolToPayload } from '../currentProtocolToPayload';

function makeBaseProtocol(
  overrides: Partial<CurrentProtocol> = {},
): CurrentProtocol {
  return {
    name: 'Test',
    description: '',
    schemaVersion: 8,
    stages: [],
    codebook: { node: {}, edge: {}, ego: {} },
    assetManifest: {},
    ...overrides,
  } as CurrentProtocol;
}

describe('currentProtocolToPayload', () => {
  it('assigns a fresh uuid, ISO importedAt, and a stable hash', () => {
    const protocol = makeBaseProtocol();
    const a = currentProtocolToPayload(protocol);
    const b = currentProtocolToPayload(protocol);
    expect(a.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(b.id).not.toBe(a.id);
    expect(() => new Date(a.importedAt).toISOString()).not.toThrow();
    expect(a.hash).toBe(b.hash); // hash is content-derived; uuid/timestamp are not in the hash input
  });

  it('transforms file assetManifest entries into ResolvedAsset[] using source as name', () => {
    const payload = currentProtocolToPayload(
      makeBaseProtocol({
        assetManifest: {
          'asset-1': {
            id: 'asset-1',
            name: 'logo',
            type: 'image',
            source: 'logo.png',
          },
        },
      }),
    );
    expect(payload.assets).toEqual([
      { assetId: 'asset-1', name: 'logo.png', type: 'image' },
    ]);
  });

  it('transforms apikey assetManifest entries with embedded value', () => {
    const payload = currentProtocolToPayload(
      makeBaseProtocol({
        assetManifest: {
          'key-1': {
            id: 'key-1',
            name: 'Mapbox',
            type: 'apikey',
            value: 'secret-token',
          },
        },
      }),
    );
    expect(payload.assets).toEqual([
      {
        assetId: 'key-1',
        name: 'Mapbox',
        type: 'apikey',
        value: 'secret-token',
      },
    ]);
  });

  it('omits assetManifest from the payload', () => {
    const payload = currentProtocolToPayload(makeBaseProtocol());
    expect('assetManifest' in payload).toBe(false);
  });

  it('does not mutate the input protocol', () => {
    const protocol = makeBaseProtocol({
      assetManifest: {
        a: { id: 'a', name: 'x', type: 'image', source: 'x.png' },
      },
    });
    const before = JSON.stringify(protocol);
    currentProtocolToPayload(protocol);
    expect(JSON.stringify(protocol)).toBe(before);
  });
});
