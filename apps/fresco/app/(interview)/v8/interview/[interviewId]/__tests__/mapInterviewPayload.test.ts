import { describe, expect, it } from 'vitest';

import type { GetInterviewByIdQuery } from '~/queries/interviews';

import { mapLegacyInterviewPayload } from '../mapInterviewPayload';

type Source = NonNullable<GetInterviewByIdQuery>;

/** A schema 8 interview row shaped as `getInterviewById` returns it. */
function makeSource(): Source {
  return {
    id: 'interview-1',
    startTime: new Date('2026-01-01T00:00:00.000Z'),
    finishTime: null,
    exportTime: null,
    lastUpdated: new Date('2026-01-02T00:00:00.000Z'),
    network: {
      nodes: [],
      edges: [],
      ego: { _uid: 'ego-1', attributes: {} },
    },
    participantId: 'participant-1',
    protocolId: 'protocol-1',
    currentStep: 2,
    stageMetadata: null,
    isSynthetic: false,
    syncRevision: 4,
    finishStageId: null,
    finishOutcome: null,
    protocol: {
      id: 'protocol-1',
      hash: 'abc123',
      name: 'Schema 8 Protocol',
      schemaVersion: 8,
      description: null,
      importedAt: new Date('2026-01-01T00:00:00.000Z'),
      stages: [],
      codebook: { node: {}, edge: {} },
      localization: null,
      interfaceText: null,
      experiments: {},
      // The original upload, which the asset route serves without
      // authentication: the participant's payload must not say where it is.
      originalFileKey: 'ORIGINAL_FILE_KEY_SECRET',
      originalFileUrl:
        'https://files.example/ORIGINAL_FILE_URL_SECRET.netcanvas',
      assets: [],
    },
  };
}

describe('mapLegacyInterviewPayload', () => {
  it('hands the schema 8 interview its protocol without the original file', () => {
    const result = mapLegacyInterviewPayload(makeSource());
    if (!result.success) throw new Error('Expected a readable interview');

    expect(result.payload.protocol).toMatchObject({
      id: 'protocol-1',
      name: 'Schema 8 Protocol',
      schemaVersion: 8,
      hash: 'abc123',
    });
    const serialised = JSON.stringify(result.payload);
    for (const marker of [
      'originalFileKey',
      'originalFileUrl',
      'ORIGINAL_FILE_KEY_SECRET',
      'ORIGINAL_FILE_URL_SECRET',
    ])
      expect(serialised).not.toContain(marker);
  });

  it('starts from the stored step and sync revision', () => {
    const result = mapLegacyInterviewPayload(makeSource());
    if (!result.success) throw new Error('Expected a readable interview');

    expect(result.initialStep).toBe(2);
    expect(result.initialSyncRevision).toBe(4);
  });

  it('keeps the URL of a resource whose ID is __proto__', () => {
    const source = makeSource();
    source.protocol.assets = [
      {
        key: 'asset-key-1',
        assetId: '__proto__',
        name: 'Photo',
        type: 'image',
        url: 'https://files.example/photo.jpg',
        size: 10,
        value: null,
      },
    ];

    const result = mapLegacyInterviewPayload(source);
    if (!result.success) throw new Error('Expected a readable interview');

    expect(Object.keys(result.assetUrls)).toEqual(['__proto__']);
    expect(result.assetUrls['__proto__']).toBe(
      'https://files.example/photo.jpg',
    );
  });
});
