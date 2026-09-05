import { describe, expect, it } from 'vitest';

import { migrateProtocol, validateProtocol } from '../index.ts';
import { extractProtocol } from '../utils/extractProtocol.ts';
import { downloadAndDecryptProtocols } from './utils.ts';

// Skip these tests if GITHUB_TOKEN is not available
const hasGitHubToken = !!process.env.GITHUB_TOKEN;

/**
 * The corpus, fetched while this file is being loaded rather than from a
 * `beforeAll`, because a test per protocol needs its cases before any hook has
 * run — and a test per protocol is the point.
 *
 * One loop over all ~90 of them shared a single budget and reported a failure
 * as the corpus stopping somewhere: `migrateProtocol` throws when what it
 * produced does not survive the v8 schema, which ends the loop, leaves every
 * protocol after it unvalidated, and names in the report only the rule that
 * was broken — never the protocol that broke it. Splitting the loop gives each
 * protocol a budget it cannot exhaust on another protocol's behalf, and puts
 * its filename in the title of whatever fails.
 *
 * The download is cached against the release asset's size, so this costs one
 * request when the corpus has not changed.
 */
const protocolFiles = hasGitHubToken
  ? [...(await downloadAndDecryptProtocols()).entries()].map(
      ([filename, buffer]) => ({ filename, buffer }),
    )
  : [];

describe.skipIf(!hasGitHubToken)('Test protocols', () => {
  it('should have loaded protocols', () => {
    // Also the guard on the cases below: an empty corpus registers no tests at
    // all, which would otherwise read as a passing run.
    expect(protocolFiles.length).toBeGreaterThan(0);
  });

  it.for(protocolFiles)(
    'validates $filename',
    // Each protocol is extracted, migrated and validated inside its own test,
    // so the time that takes is charged to the protocol that takes it. Well
    // above the ~1s a protocol needs on a loaded runner, and well below the
    // 60s the whole corpus used to share.
    { timeout: 30_000 },
    async ({ filename, buffer }, ctx) => {
      const { protocol } = await extractProtocol(buffer);

      // schemaVersion is typed as a number but legacy protocols carry it as a
      // numeric string ("1"); coerce those so they aren't wrongly skipped, while
      // still rejecting semver strings like "1.0.0" via the integer/range check.
      const rawVersion: unknown = protocol.schemaVersion ?? 0;
      const protocolVersion =
        typeof rawVersion === 'number' ? rawVersion : Number(rawVersion);

      // Skip protocols with non-numeric schema versions (e.g. semver strings
      // like "1.0.0"). Reported as a skip rather than passed over in a log
      // line, so a protocol this package validates nothing of is not counted
      // as one it validated.
      if (
        !Number.isInteger(protocolVersion) ||
        protocolVersion < 1 ||
        protocolVersion > 8
      ) {
        ctx.skip(
          `unsupported schema version: ${String(protocol.schemaVersion)}`,
        );
      }

      const protocolName = filename.replace(/\.netcanvas$/, '');

      if (protocolVersion === 8) {
        // Validate v8 protocols directly
        const protocolWithName = !('name' in protocol)
          ? { ...protocol, name: protocolName }
          : protocol;

        const startTime = Date.now();
        const result = await validateProtocol(protocolWithName);
        const duration = Date.now() - startTime;

        if (!result.success) {
          console.error(
            `Validation failed for ${filename} (${duration}ms):`,
            result.error,
          );
        }

        expect(result.success).toBe(true);
        return;
      }

      // For versions 1-7, migrate to v8 then validate. `migrateProtocol`
      // reports a migration that does not survive the v8 schema by throwing,
      // so it is logged here as well: that throw is this corpus's likeliest
      // failure and it carries nothing about which protocol produced it.
      let migratedProtocol: ReturnType<typeof migrateProtocol>;
      try {
        migratedProtocol = migrateProtocol(protocol, undefined, {
          name: protocolName,
        });
      } catch (error) {
        console.error(
          `Migration failed for ${filename} (v${protocolVersion} → v8):`,
          error,
        );
        throw error;
      }

      const migrationResult = await validateProtocol(migratedProtocol);

      if (!migrationResult.success) {
        console.error(
          `Migration validation failed for ${filename} (v${protocolVersion} → v8):`,
          migrationResult.error,
        );
      }

      expect(migrationResult.success).toBe(true);
    },
  );
});
