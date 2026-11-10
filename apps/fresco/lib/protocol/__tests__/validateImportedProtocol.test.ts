import { describe, expect, it } from 'vitest';

import {
  createDefaultFinishSessionStage,
  ProtocolValidationError,
  withInterfaceText,
} from '@codaco/protocol-validation';

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

  it('refuses a protocol written without the interface text it shows, naming each group', async () => {
    const localization = { defaultLocale: 'en', locales: ['en'] };
    const protocol = {
      name: 'Hand-written protocol',
      schemaVersion: 9,
      localization,
      codebook: { node: {}, edge: {}, ego: {} },
      stages: [createDefaultFinishSessionStage({ id: 'finish', localization })],
      assetManifest: {},
    };

    expect(
      (await validateImportedProtocol(withInterfaceText(protocol))).success,
    ).toBe(true);

    const result = await validateImportedProtocol(protocol);
    if (result.success || result.error !== 'validation-failed') {
      throw new Error('Expected the protocol to fail validation');
    }
    const { validationResult } = result;
    const error =
      typeof validationResult === 'object' &&
      validationResult !== null &&
      'error' in validationResult
        ? validationResult.error
        : undefined;
    if (!(error instanceof ProtocolValidationError)) {
      throw new Error('Expected the validator’s issues');
    }
    expect(error.issues.map(({ path }) => path.join('.'))).toContain(
      'interfaceText.navigation',
    );
  });
});
