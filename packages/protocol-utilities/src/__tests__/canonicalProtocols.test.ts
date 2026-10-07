import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  analyzeProtocolLocalization,
  CurrentProtocolSchema,
} from '@codaco/protocol-validation';

// packages/protocols is a data-only package with no test runner, so its
// sources are read by relative path from here.
const protocolsRoot = path.resolve(import.meta.dirname, '../../../protocols');

// Kept at schema 8 so the v8 to v9 migration is exercised against real input.
const MIGRATION_FIXTURES = new Set([
  path.join('e2e', 'fresco-release-test', 'protocol.json'),
]);

const sources = readdirSync(protocolsRoot, {
  recursive: true,
  encoding: 'utf8',
})
  .filter(
    (file) =>
      path.basename(file) === 'protocol.json' && !MIGRATION_FIXTURES.has(file),
  )
  .sort();

describe('canonical protocol sources', () => {
  it('finds the sources', () => {
    expect(sources.length).toBeGreaterThan(0);
  });

  describe.each(sources)('%s', (source) => {
    const raw: unknown = JSON.parse(
      readFileSync(path.join(protocolsRoot, source), 'utf8'),
    );

    it('is a valid schema-9 protocol with every string translated', async () => {
      const result = await CurrentProtocolSchema.safeParseAsync(raw);
      expect(result.error?.issues ?? []).toEqual([]);
      if (!result.success) return;
      expect(analyzeProtocolLocalization(result.data)).toEqual([]);
    });
  });
});
