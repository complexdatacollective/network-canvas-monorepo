import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { migrateProtocol } from '../migration/migrate-protocol.ts';
import { filterRuleSchema } from '../schemas/8/filters/filter.ts';
import { CURRENT_SCHEMA_VERSION } from '../schemas/index.ts';
import { extractProtocol } from '../utils/extractProtocol.ts';

/**
 * Every filter rule in every protocol this repository has, held to the ruling
 * on issue #1548: a protocol already in the field must LOAD.
 *
 * `filterRuleSchema` decides what a rule's comparison value may be, and it is
 * the last gate before a researcher is locked out of the editor that could
 * repair a rule — a protocol it refuses cannot be opened at all, so the rule
 * cannot be fixed. Tightening it is therefore the one change here that can
 * take a working study away from someone, and nothing else in this package
 * would notice: the corpus tests beside this one validate whole protocols, and
 * would report such a refusal as "this protocol no longer validates" without
 * saying which rule or why.
 *
 * The corpus is every committed `.netcanvas`: the documentation downloads
 * (schema 1 through 7 — real protocols researchers have opened), the e2e
 * fixtures, and the two bundled study protocols. Each is migrated the way an
 * import migrates it and every rule it then holds is offered to the schema on
 * its own, so a failure names the protocol, the position of the rule inside
 * it, and the rule itself.
 *
 * packages/protocols and the apps are read by relative path rather than
 * through a dependency added for a static-file read, as in
 * `bundled-protocols-role-conflicts.test.ts`.
 */
const repoRoot = path.resolve(import.meta.dirname, '../../../..');

/**
 * Where protocols live, named rather than swept from the repository root: a
 * root-wide walk descends into every build output and every checked-out
 * worktree, which is slow and gives a different corpus on different machines.
 */
const CORPUS_ROOTS = ['apps', 'packages'];

const discoverProtocols = (): string[] =>
  CORPUS_ROOTS.flatMap((root) =>
    readdirSync(path.join(repoRoot, root), { recursive: true })
      .filter((entry): entry is string => typeof entry === 'string')
      .filter(
        (entry) =>
          entry.endsWith('.netcanvas') && !entry.includes('node_modules'),
      )
      .map((entry) => path.join(root, entry)),
  ).toSorted();

const protocolFiles = discoverProtocols();

/** Every rule inside any `rules` array, wherever the schema puts one. */
const collectRules = (
  node: unknown,
  where: string,
  out: { where: string; rule: unknown }[],
): void => {
  if (Array.isArray(node)) {
    node.forEach((item, index) =>
      collectRules(item, `${where}[${index}]`, out),
    );
    return;
  }
  if (typeof node !== 'object' || node === null) return;
  const record = node as Record<string, unknown>;
  if (Array.isArray(record.rules)) {
    record.rules.forEach((rule, index) => {
      out.push({ where: `${where}.rules[${index}]`, rule });
    });
  }
  for (const [key, value] of Object.entries(record)) {
    collectRules(value, `${where}.${key}`, out);
  }
};

describe('filter rules in committed protocols', () => {
  it('discovered the corpus', () => {
    // Also the guard on the cases below: an empty walk registers no rules at
    // all, which would otherwise read as a passing run.
    expect(protocolFiles.length).toBeGreaterThan(10);
  });

  it.for(protocolFiles)(
    '%s holds only rules the schema accepts',
    { timeout: 30_000 },
    async (file, ctx) => {
      const buffer = readFileSync(path.join(repoRoot, file));

      let protocol;
      try {
        ({ protocol } = await extractProtocol(buffer));
      } catch (error) {
        // A fixture that is deliberately not a protocol — the interviewer's
        // import-failure case. Reported as a skip rather than passed over, so
        // an archive that stops being readable by accident is visible.
        ctx.skip(`could not be extracted: ${String(error).slice(0, 120)}`);
        return;
      }

      const rawVersion: unknown = protocol.schemaVersion ?? 0;
      const version =
        typeof rawVersion === 'number' ? rawVersion : Number(rawVersion);
      if (
        !Number.isInteger(version) ||
        version < 1 ||
        version > CURRENT_SCHEMA_VERSION
      ) {
        // A classic-app fixture carrying a semver `schemaVersion`, which this
        // package's migrations do not describe.
        ctx.skip(`unsupported schema version: ${String(rawVersion)}`);
        return;
      }

      const migrated =
        version === CURRENT_SCHEMA_VERSION
          ? protocol
          : migrateProtocol(protocol, CURRENT_SCHEMA_VERSION, {
              name: path.basename(file, '.netcanvas'),
            });

      const rules: { where: string; rule: unknown }[] = [];
      collectRules(migrated, '$', rules);

      const refused = rules.flatMap(({ where, rule }) => {
        const result = filterRuleSchema.safeParse(rule);
        return result.success
          ? []
          : [`${where}: ${JSON.stringify(rule)} — ${result.error.message}`];
      });

      expect(refused).toEqual([]);
    },
  );

  /**
   * The sweep above proves nothing if these protocols hold no rules, and the
   * one thing it cannot see is itself finding nothing to check.
   */
  it('found rules to check', async () => {
    const rules: { where: string; rule: unknown }[] = [];
    for (const file of protocolFiles) {
      let protocol;
      try {
        ({ protocol } = await extractProtocol(
          readFileSync(path.join(repoRoot, file)),
        ));
      } catch {
        continue;
      }
      collectRules(protocol, '$', rules);
    }
    expect(rules.length).toBeGreaterThan(50);
  }, 30_000);
});
