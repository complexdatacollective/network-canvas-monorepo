import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { BUNDLED_TEMPLATES } from '~/templates';

type ManifestEntry = {
  id: string;
  kind: 'template' | 'sample' | 'development' | 'e2e' | 'documentation';
  name: string;
  description: string;
  protocolPath: string;
  assetDir: string;
  architectTemplate: boolean;
};

type Manifest = {
  protocols: ManifestEntry[];
};

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../../..');
const protocolsRoot = resolve(repoRoot, 'packages', 'protocols');
const manifest = JSON.parse(
  readFileSync(resolve(protocolsRoot, 'manifest.json'), 'utf8'),
) as Manifest;

describe('protocol manifest', () => {
  it('points every entry at existing canonical source files', () => {
    for (const entry of manifest.protocols) {
      expect(existsSync(resolve(protocolsRoot, entry.protocolPath))).toBe(true);
      expect(existsSync(resolve(protocolsRoot, entry.assetDir))).toBe(true);
    }
  });

  it('drives Architect bundled templates', () => {
    const expected = manifest.protocols
      .filter((entry) => entry.kind === 'template' && entry.architectTemplate)
      .map((entry) => entry.id);

    expect(BUNDLED_TEMPLATES.map((template) => template.id)).toStrictEqual(
      expected,
    );
    expect(
      BUNDLED_TEMPLATES.map((template) => template.sourceRef),
    ).toStrictEqual(expected.map((id) => ({ kind: 'template', id })));
  });
});
