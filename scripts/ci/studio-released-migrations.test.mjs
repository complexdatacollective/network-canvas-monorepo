import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, test } from 'vitest';

// A Studio migration is frozen once it merges (#1901 S-4, N-3): every database
// that applied it recorded its hashes, so an edited, deleted or renamed
// released migration makes `studio-api migrate` refuse that database as
// "edited" or "reordered". Merged is released here: there are no pre-release
// databases to protect, and main is what the release lane builds. A branch
// may add migrations; it may not change one `origin/main` already carries.

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);
const MIGRATIONS = 'apps/studio/api/migrations';
/** A numbered directory's files. `NOTES.md` is advice, not hashed. */
const RELEASED_FILE = new RegExp(
  `^${MIGRATIONS}/\\d{4}_[a-z0-9_]+/(?!NOTES\\.md$)[^/]+$`,
);

const git = (cwd, ...args) =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

/**
 * Every modification, deletion or rename since `base` of a file in a
 * numbered migration directory. Additions are the normal case and pass.
 */
function releasedMigrationEdits(cwd, base) {
  return git(
    cwd,
    'diff',
    '--name-status',
    '--find-renames',
    '--diff-filter=MDR',
    `${base}...HEAD`,
    '--',
    MIGRATIONS,
  )
    .split('\n')
    .filter((line) => line !== '')
    .filter((line) =>
      line
        .split('\t')
        .slice(1)
        .some((file) => RELEASED_FILE.test(file)),
    );
}

const scratch = mkdtempSync(path.join(tmpdir(), 'studio-released-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

function repository() {
  const cwd = mkdtempSync(path.join(scratch, 'repo-'));
  git(cwd, 'init', '-q', '-b', 'main');
  git(cwd, 'config', 'user.email', 'test@example.com');
  git(cwd, 'config', 'user.name', 'test');
  git(cwd, 'config', 'commit.gpgsign', 'false');
  const write = (file, content) => {
    mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
    writeFileSync(path.join(cwd, file), content);
  };
  const commit = (message) => {
    git(cwd, 'add', '-A');
    git(cwd, 'commit', '-q', '--no-verify', '-m', message);
  };
  write(`${MIGRATIONS}/README.md`, 'guide\n');
  write(`${MIGRATIONS}/0001_initial/delta.sql`, 'CREATE TABLE t (id int);\n');
  write(`${MIGRATIONS}/0001_initial/manifest.json`, '{}\n');
  commit('released');
  git(cwd, 'checkout', '-q', '-b', 'feature');
  return { cwd, write, commit };
}

test('a branch that only adds migrations passes', () => {
  const { cwd, write, commit } = repository();
  write(`${MIGRATIONS}/0002_next/delta.sql`, 'ALTER TABLE t ADD c int;\n');
  write(`${MIGRATIONS}/0001_initial/NOTES.md`, 'plan a concurrent index\n');
  write(`${MIGRATIONS}/README.md`, 'guide, revised\n');
  commit('add');
  assert.deepEqual(releasedMigrationEdits(cwd, 'main'), []);
});

test('an edited released migration is refused', () => {
  const { cwd, write, commit } = repository();
  write(
    `${MIGRATIONS}/0001_initial/delta.sql`,
    'CREATE TABLE t (id bigint);\n',
  );
  commit('edit');
  assert.deepEqual(releasedMigrationEdits(cwd, 'main'), [
    `M\t${MIGRATIONS}/0001_initial/delta.sql`,
  ]);
});

test('a deleted or renamed released migration is refused', () => {
  const { cwd, commit } = repository();
  git(cwd, 'mv', `${MIGRATIONS}/0001_initial`, `${MIGRATIONS}/0001_renamed`);
  commit('rename');
  const edits = releasedMigrationEdits(cwd, 'main');
  assert.equal(edits.length, 2);
  assert.ok(edits.every((line) => line.startsWith('R')));

  const deleted = repository();
  rmSync(path.join(deleted.cwd, MIGRATIONS, '0001_initial'), {
    recursive: true,
  });
  deleted.commit('delete');
  assert.equal(releasedMigrationEdits(deleted.cwd, 'main').length, 2);
});

test('this branch changes no migration origin/main carries', (context) => {
  let base;
  try {
    base = git(REPO_ROOT, 'rev-parse', '--verify', 'origin/main').trim();
  } catch {
    // CI checks out with full history (fetch-depth 0), so origin/main is
    // there; a CI run without it must not pass by skipping the check.
    if (process.env.CI === 'true' || process.env.CI === '1') {
      assert.fail('origin/main is not available; fetch it so this can run');
    }
    context.skip('origin/main is not available locally');
    return;
  }
  assert.deepEqual(releasedMigrationEdits(REPO_ROOT, base), []);
});
