import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { unconsumedChangesets } from './check-version-packages-freshness.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(scriptDir, 'check-version-packages-freshness.mjs');
const PRUNE = join(scriptDir, 'prune-ignored-changesets.mjs');

const IGNORED = [
  '@codaco/documentation',
  'networkcanvas.com',
  '@codaco/studio-client',
  '@codaco/studio-server',
];

const STUDIO = `---\n'@codaco/studio-client': minor\n'@codaco/studio-server': minor\n---\n\nstudio change`;
const DOCS = `---\n"@codaco/documentation": patch\n---\n\ndocs change`;
// The changeset #1574 landed 48 seconds before #1558 merged on 2026-09-01.
const CLEAN_ICONS = `---\n"@codaco/fresco-ui": patch\n"fresco": patch\n---\n\nreject unsupported icons`;

function fixture(files) {
  const cwd = mkdtempSync(join(tmpdir(), 'vpf-'));
  mkdirSync(join(cwd, '.changeset'));
  writeFileSync(
    join(cwd, '.changeset', 'config.json'),
    JSON.stringify({ ignore: IGNORED }),
  );
  writeFileSync(join(cwd, '.changeset', 'README.md'), 'readme');
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(cwd, '.changeset', name), body);
  }
  return cwd;
}

function run(script, cwd) {
  return spawnSync(process.execPath, [script], { cwd, encoding: 'utf8' });
}

test('passes a merged tree that holds only ignored-lane changesets', () => {
  const cwd = fixture({
    'studio-team-activity-screen.md': STUDIO,
    'studio-netlify-auth-degradation.md': STUDIO,
    'docs.md': DOCS,
  });
  const res = run(SCRIPT, cwd);
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /current/);
});

test('passes a merged tree with no changesets at all', () => {
  const res = run(SCRIPT, fixture({}));
  assert.equal(res.status, 0, res.stderr);
});

// The 2026-09-01 merge: the Version Packages head had consumed everything on
// main when it was generated, then main gained clean-icons-guard.md, and the
// queue merged the two. changesets/action saw a changeset and regenerated the
// PR instead of publishing fresco-ui 6.3.0, interview 9.0.1 and fresco 4.1.3.
test('fails the merged tree of #1558: one normal-lane changeset survived', () => {
  const cwd = fixture({
    'clean-icons-guard.md': CLEAN_ICONS,
    'studio-netlify-auth-degradation.md': STUDIO,
    'studio-team-activity-screen.md': STUDIO,
  });
  const res = run(SCRIPT, cwd);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /stale/);
  assert.match(
    res.stderr,
    /\.changeset\/clean-icons-guard\.md \(@codaco\/fresco-ui, fresco\)/,
  );
  assert.doesNotMatch(
    res.stderr,
    /studio-/,
    'ignored-lane files are not blamed',
  );
  assert.match(res.stderr, /wait for the PR to update/);
});

// changesets/action does not publish while an empty changeset is present
// either ("all changesets are empty"), so an empty one is just as stale.
test('fails on an empty changeset', () => {
  const cwd = fixture({ 'empty.md': `---\n---\n\nnote without releases` });
  const res = run(SCRIPT, cwd);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /\.changeset\/empty\.md \(empty changeset\)/);
});

test('a changeset naming an ignored package alongside a normal one is unconsumed', () => {
  const unconsumed = unconsumedChangesets(
    [
      {
        id: 'mixed',
        releases: [
          { name: '@codaco/documentation', type: 'patch' },
          { name: '@codaco/interview', type: 'patch' },
        ],
      },
      {
        id: 'docs-only',
        releases: [{ name: '@codaco/documentation', type: 'patch' }],
      },
    ],
    new Set(['@codaco/documentation']),
  );
  assert.deepEqual(
    unconsumed.map((cs) => cs.id),
    ['mixed'],
  );
});

// The two scripts must agree on what the normal lane owns: the action reads
// exactly what prune leaves behind, so this check must fail precisely when
// prune leaves anything. Run prune first, then judge the pruned tree.
test('fails exactly when prune-ignored-changesets leaves something behind', () => {
  const stale = fixture({
    'clean-icons-guard.md': CLEAN_ICONS,
    'studio-team-activity-screen.md': STUDIO,
  });
  assert.equal(run(PRUNE, stale).status, 0);
  assert.equal(run(SCRIPT, stale).status, 1);

  const fresh = fixture({
    'studio-team-activity-screen.md': STUDIO,
    'docs.md': DOCS,
  });
  assert.equal(run(PRUNE, fresh).status, 0);
  assert.equal(run(SCRIPT, fresh).status, 0);
});
