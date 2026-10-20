import { describe, expect, it } from 'vitest';

import { validateImportedLegacyProtocol } from '../validateImportedProtocol';

const codebook = {
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: {},
    },
  },
  edge: {},
  ego: {},
};

const stages = [
  {
    id: 'stage-info',
    type: 'Information',
    label: 'Information',
    title: 'Information',
    items: [{ id: 'item', type: 'text', content: 'Hello' }],
  },
];

const protocolAt = (schemaVersion: number) => ({
  schemaVersion,
  name: 'Fixture',
  lastModified: '2026-09-05T00:00:00.000Z',
  assetManifest: {},
  codebook,
  stages,
});

describe('validateImportedLegacyProtocol', () => {
  it('keeps a schema 8 protocol at schema 8, unchanged', async () => {
    const result = await validateImportedLegacyProtocol(protocolAt(8));

    if (!result.success) throw new Error(`Expected success: ${result.error}`);
    expect(result.protocol.schemaVersion).toBe(8);
    expect(result.protocol.stages.map((stage) => stage.id)).toEqual([
      'stage-info',
    ]);
  });

  it('refuses a schema 7 protocol rather than upgrading it', async () => {
    const result = await validateImportedLegacyProtocol(protocolAt(7));

    expect(result).toEqual({
      success: false,
      error: 'unsupported-version',
      version: 7,
    });
  });

  it('refuses a protocol newer than schema 8', async () => {
    const result = await validateImportedLegacyProtocol(protocolAt(9));

    expect(result).toEqual({
      success: false,
      error: 'unsupported-version',
      version: 9,
    });
  });

  it('refuses a schema 8 protocol that schema 8 itself would reject', async () => {
    const protocol = {
      ...protocolAt(8),
      stages: [{ ...stages[0], type: 'NotAnInterface' }],
    };
    const result = await validateImportedLegacyProtocol(protocol);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe('validation-failed');
  });
});
