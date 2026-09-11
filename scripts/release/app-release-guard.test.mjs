import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '.github',
  'scripts',
  'app-release-guard.sh',
);

const PKG_NAME = '@codaco/interviewer';

function git(cwd, ...args) {
  execFileSync('git', args, { cwd, stdio: 'pipe' });
}

// A throwaway repo carrying `tags`, so the guard's tag lookups see them.
// Returns the parsed $GITHUB_OUTPUT the script wrote.
function guard({
  version,
  tags = [],
  strandedTags = [],
  descendantTags = [],
  pkgName = PKG_NAME,
}) {
  const cwd = mkdtempSync(join(tmpdir(), 'arg-'));
  git(cwd, 'init', '-q');
  git(cwd, 'config', 'user.email', 'ci@example.com');
  git(cwd, 'config', 'user.name', 'ci');
  writeFileSync(join(cwd, 'README.md'), 'x\n');
  git(cwd, 'add', '.');
  git(cwd, 'commit', '-qm', 'first');
  for (const tag of tags) git(cwd, 'tag', tag);

  // Tags on a commit this tree never saw — main's shape when a hotfix has
  // shipped but its branch has not been merged back.
  if (strandedTags.length) {
    const head = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd,
      encoding: 'utf8',
    }).trim();
    git(cwd, 'checkout', '-q', '-b', 'hotfix');
    writeFileSync(join(cwd, 'HOTFIX.md'), 'shipped out of band\n');
    git(cwd, 'add', '.');
    git(cwd, 'commit', '-qm', 'hotfix');
    for (const tag of strandedTags) git(cwd, 'tag', tag);
    git(cwd, 'checkout', '-q', head);
  }

  // Tags on a commit that descends from this tree — main's shape for the run
  // of an older commit once a newer commit's run has released.
  if (descendantTags.length) {
    const head = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd,
      encoding: 'utf8',
    }).trim();
    writeFileSync(join(cwd, 'NEWER.md'), 'released by the newer run\n');
    git(cwd, 'add', '.');
    git(cwd, 'commit', '-qm', 'newer');
    for (const tag of descendantTags) git(cwd, 'tag', tag);
    git(cwd, 'checkout', '-q', head);
  }

  const outputPath = join(cwd, 'github-output');
  writeFileSync(outputPath, '');
  execFileSync('bash', [SCRIPT], {
    cwd,
    stdio: 'pipe',
    env: {
      ...process.env,
      PKG_NAME: pkgName,
      VERSION: version,
      GITHUB_OUTPUT: outputPath,
    },
  });
  return Object.fromEntries(
    readFileSync(outputPath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => line.split('=')),
  );
}

test('releases a version newer than every tag', () => {
  const out = guard({
    version: '8.1.3',
    tags: [`${PKG_NAME}@8.1.1`, `${PKG_NAME}@8.1.2`],
  });
  assert.equal(out.skip, 'false');
  assert.equal(out.newest, '8.1.2');
});

test('releases the first version, with no tags at all', () => {
  const out = guard({ version: '1.0.0' });
  assert.equal(out.skip, 'false');
  // Written but empty, which release-notes.mjs reads as "nothing to roll up".
  assert.equal(out.newest, '');
});

test('skips a version that is already tagged', () => {
  const out = guard({ version: '8.1.2', tags: [`${PKG_NAME}@8.1.2`] });
  assert.equal(out.skip, 'true');
});

// The reason this guard exists: hotfix-release.yml can move an app's released
// version out of band, and the app has a single production site to roll back.
test('skips a version older than the newest release', () => {
  const out = guard({ version: '8.1.3', tags: [`${PKG_NAME}@8.1.4`] });
  assert.equal(out.skip, 'true');
});

test('orders versions numerically, not lexically', () => {
  // 8.1.10 beats 8.1.9 despite sorting before it as a string.
  assert.equal(
    guard({ version: '8.1.9', tags: [`${PKG_NAME}@8.1.10`] }).skip,
    'true',
  );
  assert.equal(
    guard({ version: '8.1.10', tags: [`${PKG_NAME}@8.1.9`] }).skip,
    'false',
  );
});

test('ignores prereleases and other packages when picking the newest', () => {
  const out = guard({
    version: '8.1.3',
    tags: [
      `${PKG_NAME}@8.1.2`,
      `${PKG_NAME}@9.0.0-beta.1`,
      '@codaco/architect@12.0.0',
      'interviewer-v8@v8.0.0-alpha.10',
    ],
  });
  assert.equal(out.skip, 'false');
  assert.equal(out.newest, '8.1.2');
});

// The mirror of the hotfix lane's descendant rule. main can be numerically
// ahead of a hotfix while missing the fix itself, and deploying it would take
// that fix off production behind a higher version number.
test('skips when the tree does not contain the newest released commit', () => {
  const out = guard({
    version: '8.2.0',
    tags: [`${PKG_NAME}@8.1.2`],
    strandedTags: [`${PKG_NAME}@8.1.3`],
  });
  assert.equal(out.skip, 'true');
});

test('releases once the hotfix commit is in this tree', () => {
  const out = guard({
    version: '8.2.0',
    tags: [`${PKG_NAME}@8.1.2`, `${PKG_NAME}@8.1.3`],
  });
  assert.equal(out.skip, 'false');
  assert.equal(out.newest, '8.1.3');
});

// Fresco tags are unscoped (`fresco@4.1.2`), and the guard has to split the
// version off them just as it does for `@codaco/interviewer@8.1.2`.
test('handles an unscoped package name', () => {
  const out = guard({
    pkgName: 'fresco',
    version: '4.1.3',
    tags: ['fresco@4.1.1', 'fresco@4.1.2'],
  });
  assert.equal(out.skip, 'false');
  assert.equal(out.newest, '4.1.2');
});

// The 2026-09-02 Fresco race. The run for cd9040bcf (4.1.3 in package.json,
// never released) reached this guard after the run for its descendant
// 751296a13 had released 4.1.4. Its version is older than the newest tag and
// its tree does not contain the tagged commit; either rule refuses it, where
// the previous tag-only check let it mirror 4.1.3 over the 4.1.4 push.
test('skips a superseded main commit whose version a descendant has already passed', () => {
  const out = guard({
    pkgName: 'fresco',
    version: '4.1.3',
    tags: ['fresco@4.1.2'],
    descendantTags: ['fresco@4.1.4'],
  });
  assert.equal(out.skip, 'true');
});

// The same two commits in the order that keeps 4.1.3 releasable: the older
// run reaches the guard first, so 4.1.3 goes out, and the newer run then
// finds its own tree contains the 4.1.3 commit and releases 4.1.4 on top.
test('releases when the older run wins the race, then the newer one follows', () => {
  const older = guard({
    pkgName: 'fresco',
    version: '4.1.3',
    tags: ['fresco@4.1.2'],
  });
  assert.equal(older.skip, 'false');

  const newer = guard({
    pkgName: 'fresco',
    version: '4.1.4',
    tags: ['fresco@4.1.2', 'fresco@4.1.3'],
  });
  assert.equal(newer.skip, 'false');
  assert.equal(newer.newest, '4.1.3');
});
