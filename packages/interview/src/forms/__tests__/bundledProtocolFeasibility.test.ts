import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { generateInterviews } from '@codaco/protocol-utilities';
import { CurrentProtocolSchema } from '@codaco/protocol-validation';

type BundledProtocol = Record<string, unknown>;

type ProtocolManifest = {
  protocols: {
    id: string;
    kind: 'template' | 'sample' | 'development' | 'e2e' | 'documentation';
  }[];
};

const require = createRequire(import.meta.url);

// A JSON fixture is an untyped boundary; the schema parse below is what
// gives it a shape.
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
  ])('generates a session for the %s protocol', (_name, protocol) => {
    // Parsed exactly as a host would parse it at the generation boundary —
    // parsing is what resolves every stage's synthetic descriptors (D14) —
    // and pinned to a fixed start instant so the walk is seed-stable (D13:
    // the session date is the seeded startTime's date, never the clock's).
    const parsed = CurrentProtocolSchema.parse(protocol);
    expect(() =>
      generateInterviews(parsed, {
        count: 1,
        seed: 1,
        simulateDropOut: false,
        startWindow: '2026-08-20T12:00:00.000Z',
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
