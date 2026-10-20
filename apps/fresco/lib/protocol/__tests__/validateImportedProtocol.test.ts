import { describe, expect, it } from 'vitest';

import { validateImportedProtocol } from '../validateImportedProtocol';

const protocolWithRawColor = {
  name: 'Invalid color protocol',
  schemaVersion: 9,
  codebook: {
    node: {
      person: {
        name: 'Person',
        color: '#cc0000',
        shape: { default: 'circle' },
      },
    },
    edge: {},
    ego: {},
  },
  stages: [],
  assetManifest: {},
};

describe('validateImportedProtocol', () => {
  it('rejects raw colors in a current-version protocol', async () => {
    const result = await validateImportedProtocol(protocolWithRawColor);

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error('Expected raw protocol colors to fail validation');
    }
    expect(result.error).toBe('validation-failed');
  });

  it('refuses a schema 8 protocol rather than upgrading it', async () => {
    const result = await validateImportedProtocol({
      ...protocolWithRawColor,
      schemaVersion: 8,
    });

    expect(result).toEqual({
      success: false,
      error: 'unsupported-version',
      version: 8,
    });
  });
});
