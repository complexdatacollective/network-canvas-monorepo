import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
// src/templates/__tests__ -> repo root
const repoRoot = resolve(here, '../../../../..');

const TEMPLATE_IDS = [
  'transnational-networks',
  'mental-health-networks',
  'social-connection-isolation',
  'behavioural-influence-networks',
  'care-support-networks',
  'sexual-injection-risk-networks',
];

// The bundled `src/templates/<id>.json` copies are generated from the canonical
// `templates/<id>/protocol.json` sources by `scripts/sync-templates.mjs`. This
// test fails CI if a copy drifts, so fixes to a canonical protocol can't ship
// without regenerating its bundled copy.
describe('bundled templates stay in sync with their canonical sources', () => {
  for (const id of TEMPLATE_IDS) {
    it(`${id}.json matches templates/${id}/protocol.json`, () => {
      const canonical = readFileSync(
        resolve(repoRoot, 'templates', id, 'protocol.json'),
        'utf8',
      );
      const bundled = readFileSync(resolve(here, '..', `${id}.json`), 'utf8');
      expect(bundled).toBe(canonical);
    });
  }
});
