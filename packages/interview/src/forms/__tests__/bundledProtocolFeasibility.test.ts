import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { generateNetwork } from '@codaco/protocol-utilities';

type GenerateParams = Parameters<typeof generateNetwork>[0];

type BundledProtocol = {
  codebook: GenerateParams['codebook'];
  stages: GenerateParams['stages'];
};

type ProtocolManifest = {
  protocols: {
    id: string;
    kind: 'template' | 'sample' | 'development' | 'e2e' | 'documentation';
  }[];
};

const require = createRequire(import.meta.url);

// A JSON fixture is an untyped boundary; the package's own generateNetwork
// tests already cross it the same way.
const loadProtocol = (specifier: string) =>
  require(specifier) as BundledProtocol;

const developmentProtocol = loadProtocol('@codaco/protocols/development');
const sampleProtocol = loadProtocol('@codaco/protocols/sample');

const manifest = require('@codaco/protocols/manifest.json') as ProtocolManifest;

const templateIds = manifest.protocols
  .filter((entry) => entry.kind === 'template')
  .map((entry) => entry.id);

const templateCases = templateIds.map((id): [string, BundledProtocol] => [
  id,
  loadProtocol(`@codaco/protocols/templates/${id}`),
]);

describe('bundled protocols are feasible for synthetic generation', () => {
  it.each([
    ['development', developmentProtocol],
    ['sample', sampleProtocol],
    ...templateCases,
  ])('generates a network for the %s protocol', (_name, protocol) => {
    expect(() =>
      generateNetwork({
        seed: 1,
        codebook: protocol.codebook,
        stages: protocol.stages,
      }),
    ).not.toThrow();
  });

  // The cases above are driven by the manifest, so a template that ships
  // without a manifest entry would be silently uncovered.
  it('covers every template the protocols package ships', () => {
    const protocolsRoot = dirname(
      require.resolve('@codaco/protocols/manifest.json'),
    );

    const shippedTemplateIds = readdirSync(join(protocolsRoot, 'templates'), {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    expect(templateIds.toSorted()).toStrictEqual(shippedTemplateIds.toSorted());
  });
});
