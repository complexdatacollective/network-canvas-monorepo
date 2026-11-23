import type { CurrentProtocol } from '@codaco/protocol-validation';

import testState from './testState.json' with { type: 'json' };

export const getMockState = (mergeProps?: Record<string, unknown>) => ({
  ...testState,
  ...mergeProps,
});

/**
 * A schema 9 protocol for a test: one language, nothing in its codebook, no
 * resources and no stages, with `changes` over it.
 */
export const testProtocol = (
  changes: Partial<CurrentProtocol> = {},
): CurrentProtocol => ({
  name: 'Study',
  schemaVersion: 9,
  localization: { defaultLocale: 'en', locales: ['en'] },
  assetManifest: {},
  codebook: { node: {}, edge: {}, ego: {} },
  stages: [],
  ...changes,
});
