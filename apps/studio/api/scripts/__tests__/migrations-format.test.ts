import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

import { MIGRATIONS_DIR } from '../render-migrations.ts';

// A migration's files are hashed byte for byte into its manifest, and a
// released migration's hashes are recorded in every database that applied it.
// The formatter must never touch them: lint-staged formats every staged JSON
// file, the agent hooks format every written file, and a later oxfmt release
// could reformat a released migration and turn every deployed database's
// history into an "edited" refusal (#1901 B-2). `.oxfmtrc.json` ignores the
// directory; this proves it, with the same flags lint-staged passes.

const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const OXFMT = join(REPO_ROOT, 'node_modules/.bin/oxfmt');

function oxfmtCheck(...args: string[]) {
  const result = spawnSync(OXFMT, ['--check', ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

const committedFiles = readdirSync(MIGRATIONS_DIR, {
  recursive: true,
  withFileTypes: true,
})
  .filter((entry) => entry.isFile())
  .map((entry) => relative(REPO_ROOT, join(entry.parentPath, entry.name)));

const scratch = mkdtempSync(join(tmpdir(), 'studio-migrations-format-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe('the formatter', () => {
  it('leaves every committed migration file alone', () => {
    expect(committedFiles.filter((path) => path.endsWith('.json'))).not.toEqual(
      [],
    );
    const result = oxfmtCheck(
      '--no-error-on-unmatched-pattern',
      ...committedFiles,
    );
    expect(result.output).toMatch(/No files found/);
    expect(result.status).toBe(0);
  });

  it('would reformat a snapshot anywhere else', () => {
    // The control: without the ignore, a snapshot as the generator writes it
    // is not oxfmt's format, so the case above is not passing by accident.
    const snapshot = committedFiles.find((path) =>
      path.endsWith('snapshot.json'),
    );
    expect(snapshot).toBeDefined();
    const copy = join(scratch, 'snapshot.json');
    copyFileSync(join(REPO_ROOT, snapshot ?? ''), copy);
    const result = oxfmtCheck('-c', join(REPO_ROOT, '.oxfmtrc.json'), copy);
    expect(result.status).toBe(1);
  });
});
