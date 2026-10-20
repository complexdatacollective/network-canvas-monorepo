import { describe, expect, it } from 'vitest';

import {
  type CurrentProtocol,
  hashProtocol,
} from '@codaco/protocol-validation';

import { currentProtocolToPayload } from '../protocolPayload';

const identity = {
  id: 'protocol-version-1',
  importedAt: '2026-10-06T09:00:00.000Z',
};

function makeBaseProtocol(
  overrides: Partial<CurrentProtocol> = {},
): CurrentProtocol {
  return {
    name: 'Test',
    description: '',
    schemaVersion: 9,
    localization: { defaultLocale: 'en', locales: ['en'] },
    stages: [],
    codebook: { node: {}, edge: {}, ego: {} },
    assetManifest: {},
    ...overrides,
  };
}

describe('currentProtocolToPayload', () => {
  it('carries the identity the caller supplies', () => {
    const payload = currentProtocolToPayload(makeBaseProtocol(), identity);
    expect(payload.id).toBe(identity.id);
    expect(payload.importedAt).toBe(identity.importedAt);
  });

  it('hashes the protocol’s languages along with its structure', () => {
    const english = currentProtocolToPayload(makeBaseProtocol(), identity);
    const englishAndFrench = currentProtocolToPayload(
      makeBaseProtocol({
        localization: { defaultLocale: 'en', locales: ['en', 'fr'] },
      }),
      identity,
    );
    const frenchByDefault = currentProtocolToPayload(
      makeBaseProtocol({
        localization: { defaultLocale: 'fr', locales: ['en', 'fr'] },
      }),
      identity,
    );
    expect(englishAndFrench.hash).not.toBe(english.hash);
    expect(frenchByDefault.hash).not.toBe(englishAndFrench.hash);
  });

  it('produces identical output for the same protocol and identity', () => {
    const protocol = makeBaseProtocol({
      assetManifest: {
        'asset-1': {
          id: 'asset-1',
          name: 'logo',
          type: 'image',
          source: 'logo.png',
        },
      },
    });
    expect(JSON.stringify(currentProtocolToPayload(protocol, identity))).toBe(
      JSON.stringify(currentProtocolToPayload(protocol, identity)),
    );
  });

  it('hashes the protocol structure', () => {
    const protocol = makeBaseProtocol();
    expect(currentProtocolToPayload(protocol, identity).hash).toBe(
      hashProtocol(protocol),
    );
  });

  it('keeps the display name and the source filename of file assets', () => {
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
      identity,
    );
    expect(payload.assets).toEqual([
      { assetId: 'asset-1', name: 'logo', type: 'image', source: 'logo.png' },
    ]);
  });

  it('carries the value of apikey assets', () => {
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
      identity,
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
    const payload = currentProtocolToPayload(makeBaseProtocol(), identity);
    expect('assetManifest' in payload).toBe(false);
  });

  it('does not mutate the input protocol', () => {
    const protocol = makeBaseProtocol({
      assetManifest: {
        a: { id: 'a', name: 'x', type: 'image', source: 'x.png' },
      },
    });
    const before = JSON.stringify(protocol);
    currentProtocolToPayload(protocol, identity);
    expect(JSON.stringify(protocol)).toBe(before);
  });
});
