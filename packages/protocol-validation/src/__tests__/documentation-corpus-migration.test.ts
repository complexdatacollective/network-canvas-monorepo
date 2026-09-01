import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { migrateProtocol } from '../migration/migrate-protocol.ts';
import { CURRENT_SCHEMA_VERSION } from '../schemas/index.ts';
import { extractProtocol } from '../utils/extractProtocol.ts';
import validateProtocol from '../validation/validate-protocol.ts';

/**
 * Every `.netcanvas` the documentation site offers for download, migrated to
 * the current schema and validated.
 *
 * These are real protocols researchers have downloaded and opened, spanning
 * schema versions 1 through 7 — the only committed corpus of genuinely legacy
 * documents this repository has. (`validate-test-protocols.test.ts` covers a
 * much larger private corpus, but it needs a GITHUB_TOKEN and is skipped
 * everywhere that token is absent, which includes every local run.) A
 * migration rule that is wrong about what older Architect versions actually
 * wrote shows up here as a protocol that can no longer be opened at all.
 *
 * packages/protocols is a pure-data package with no test runner, so — as in
 * `bundled-protocols-role-conflicts.test.ts` — the archives are read by
 * relative path rather than through a dependency added for a static-file read.
 */
const corpusRoot = path.resolve(
  import.meta.dirname,
  '../../../protocols/documentation/protocols',
);

const corpusFiles = readdirSync(corpusRoot)
  .filter((entry) => entry.endsWith('.netcanvas'))
  .toSorted();

describe('documentation protocol corpus', () => {
  it('discovered the downloadable protocols', () => {
    expect(corpusFiles.length).toBeGreaterThan(0);
  });

  it.each(corpusFiles)(
    '%s migrates to the current schema and validates',
    async (file) => {
      const buffer = readFileSync(path.join(corpusRoot, file));
      const { protocol } = await extractProtocol(buffer);

      // The v7→v8 step requires a `name`; Architect and Interviewer both pass
      // the file's own name, so this mirrors what a researcher's import does.
      const migrated = migrateProtocol(protocol, CURRENT_SCHEMA_VERSION, {
        name: file.replace(/\.netcanvas$/, ''),
      });
      expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);

      // `migrateProtocol` already checks the structural schema and throws.
      // This second pass adds the cross-reference and logic checks a host
      // applies before it will run the protocol.
      const result = await validateProtocol(migrated);
      expect(
        result.success,
        JSON.stringify(result.error?.issues, null, 2),
      ).toBe(true);
    },
    30_000,
  );
});
