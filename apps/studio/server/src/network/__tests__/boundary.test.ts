// ADR #1246 makes `src/network/` a module boundary in code: it is the only
// directory permitted to touch `nodes`, `edges`, the snapshots and the
// rollups, and the ADR's *Concrete shape* requires that rule be enforced by
// lint or CI rather than left to review. This is that enforcement, in the
// style of the importer-allowlist cases in `src/audit/__tests__/policy.test.ts`.
//
// It is also what makes design S6 — rollups maintained by application code
// rather than by a trigger — safe: a projection maintained outside the
// database can only stay correct if exactly one module writes it.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER_SRC = resolve(HERE, '../..');
const REPO_ROOT = resolve(SERVER_SRC, '../../../..');

/**
 * Every TypeScript file under the server's source tree, tests included: a test
 * outside `src/network/` reaching for these tables would breach the boundary
 * exactly as production code would.
 */
function typescriptFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) return typescriptFiles(path);
    return entry.isFile() && (path.endsWith('.ts') || path.endsWith('.tsx'))
      ? [path]
      : [];
  });
}

function importersOf(target: string): string[] {
  return typescriptFiles(SERVER_SRC)
    .filter((file) => {
      const source = readFileSync(file, 'utf8');
      return [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].some(
        ([, specifier]) =>
          specifier?.startsWith('.') &&
          resolve(dirname(file), specifier) === target,
      );
    })
    .map((file) => relative(REPO_ROOT, file))
    .toSorted();
}

// The two documented bootstrap exceptions. `db/schema.ts` registers the
// module's tables and sidecar in the assembled schema; `db/seed.ts` fills the
// tables with synthetic data before any command layer exists to do it. The
// seed is tolerated rather than required: it may not import the module yet.
const BOOTSTRAP_EXCEPTIONS = [
  'apps/studio/server/src/db/schema.ts',
  'apps/studio/server/src/db/seed.ts',
];

describe('the network module boundary', () => {
  it.each([
    ['schema.ts', resolve(SERVER_SRC, 'network/schema.ts')],
    ['projections.ts', resolve(SERVER_SRC, 'network/projections.ts')],
  ])('lets only src/network and the bootstrap import %s', (_label, target) => {
    const importers = importersOf(target);

    const outsiders = importers.filter(
      (file) => !file.startsWith('apps/studio/server/src/network/'),
    );
    expect(outsiders).toEqual(
      BOOTSTRAP_EXCEPTIONS.filter((file) => importers.includes(file)),
    );
  });

  it('proves the oracle by resolving a specifier that does breach it', () => {
    // The importer scan is only meaningful if it actually resolves relative
    // specifiers to this module. `db/schema.ts` is the control: it imports
    // `../network/schema.ts` and must therefore appear.
    expect(importersOf(resolve(SERVER_SRC, 'network/schema.ts'))).toContain(
      'apps/studio/server/src/db/schema.ts',
    );
    // And a directory that imports nothing from the module yields nothing.
    expect(importersOf(resolve(SERVER_SRC, 'network/nonexistent.ts'))).toEqual(
      [],
    );
  });
});
