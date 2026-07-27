import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

import { generateNetwork } from '@codaco/protocol-utilities';

type GenerateParams = Parameters<typeof generateNetwork>[0];

type BundledProtocol = {
  codebook: GenerateParams['codebook'];
  stages: GenerateParams['stages'];
};

const require = createRequire(import.meta.url);

// A JSON fixture is an untyped boundary; the package's own generateNetwork
// tests already cross it the same way.
const developmentProtocol =
  require('@codaco/protocols/development') as BundledProtocol;
const sampleProtocol = require('@codaco/protocols/sample') as BundledProtocol;

describe('bundled protocols are feasible for synthetic generation', () => {
  it.each([
    ['development', developmentProtocol],
    ['sample', sampleProtocol],
  ])('generates a network for the %s protocol', (_name, protocol) => {
    expect(() =>
      generateNetwork({
        seed: 1,
        codebook: protocol.codebook,
        stages: protocol.stages,
      }),
    ).not.toThrow();
  });
});
