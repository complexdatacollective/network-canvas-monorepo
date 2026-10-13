import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { test } from 'vitest';

import {
  generatedNoteProblems,
  releaseNoteFailures,
} from './check-app-release-notes.mjs';

const SCRIPT = join(
  dirname(fileURLToPath(import.meta.url)),
  'check-app-release-notes.mjs',
);

// The shape changesets wrote for Architect 8.4.0 before it was rewritten.
const GENERATED = `### Minor Changes

- 5751857: A protocol opened in a second tab can now be looked through in full.

### Patch Changes

- 263c5ef: Screen readers now name each person by the label their node shows.
- Updated dependencies [5339bf8]
  - @codaco/fresco-ui@8.0.0`;

const REWRITTEN = `### New features

- **Browse a protocol that's open in another tab.** A second tab can open every page of it in read-only mode.

### Bug fixes

- Long ordinal bin labels are no longer cut off.`;

const changelog = (name, sections) =>
  `# ${name}\n\n${sections.map(([version, body]) => `## ${version}\n\n${body}\n`).join('\n')}`;

function writeApp(root, app, version, sections) {
  mkdirSync(join(root, 'apps', app), { recursive: true });
  writeFileSync(
    join(root, 'apps', app, 'package.json'),
    JSON.stringify({ version }),
  );
  writeFileSync(
    join(root, 'apps', app, 'CHANGELOG.md'),
    changelog(app, sections),
  );
}

// A repository whose committed tree is the base (main before the release
// merges); the working tree is then changed to what the release PR carries.
function fixture(base) {
  const root = mkdtempSync(join(tmpdir(), 'app-notes-'));
  for (const [app, version, sections] of base)
    writeApp(root, app, version, sections);
  const git = (...args) =>
    execFileSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '-q');
  git('add', '.');
  git(
    '-c',
    'user.email=t@example.com',
    '-c',
    'user.name=t',
    'commit',
    '-qm',
    'base',
  );
  return root;
}

const APPS = ['apps/architect', 'apps/fresco'];

test('generated markers are each reported, and rewritten notes pass', () => {
  assert.deepEqual(generatedNoteProblems(GENERATED), [
    'lists changeset entries prefixed with a commit hash',
    'carries the generated "Updated dependencies" list',
    'uses the generated Major/Minor/Patch Changes headings',
  ]);
  assert.deepEqual(generatedNoteProblems(REWRITTEN), []);
});

test('a bumped app fails while its new section is generated, and passes once rewritten', () => {
  const root = fixture([
    ['architect', '8.3.0', [['8.3.0', GENERATED]]],
    ['fresco', '4.2.1', [['4.2.1', GENERATED]]],
  ]);
  writeApp(root, 'architect', '8.4.0', [
    ['8.4.0', GENERATED],
    ['8.3.0', GENERATED],
  ]);

  const failures = releaseNoteFailures({ root, base: 'HEAD', apps: APPS });
  assert.deepEqual(
    failures.map(({ appDir, version }) => [appDir, version]),
    [['apps/architect', '8.4.0']],
    'fresco is not bumped, so its older generated section is not this release’s notes',
  );

  writeApp(root, 'architect', '8.4.0', [
    ['8.4.0', REWRITTEN],
    ['8.3.0', GENERATED],
  ]);
  assert.deepEqual(releaseNoteFailures({ root, base: 'HEAD', apps: APPS }), []);
});

test('a bumped app with no section for its new version fails', () => {
  const root = fixture([
    ['architect', '8.3.0', [['8.3.0', REWRITTEN]]],
    ['fresco', '4.2.1', [['4.2.1', REWRITTEN]]],
  ]);
  writeApp(root, 'fresco', '4.3.0', [['4.2.1', REWRITTEN]]);
  assert.deepEqual(releaseNoteFailures({ root, base: 'HEAD', apps: APPS }), [
    {
      appDir: 'apps/fresco',
      version: '4.3.0',
      problems: ['has no "## 4.3.0" section'],
    },
  ]);
});

test('the CLI exits non-zero naming the generated section, and zero once rewritten', () => {
  const base = [
    ['architect', '8.3.0', [['8.3.0', REWRITTEN]]],
    ['interviewer', '8.3.0', [['8.3.0', REWRITTEN]]],
    ['fresco', '4.2.1', [['4.2.1', REWRITTEN]]],
  ];
  const root = fixture(base);
  writeApp(root, 'interviewer', '8.4.0', [
    ['8.4.0', GENERATED],
    ['8.3.0', REWRITTEN],
  ]);

  const run = () =>
    spawnSync(process.execPath, [SCRIPT, '--base', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    });
  const red = run();
  assert.equal(red.status, 1, red.stderr);
  assert.match(red.stderr, /apps\/interviewer\/CHANGELOG\.md ## 8\.4\.0/);
  assert.match(red.stderr, /simplifying-release-notes/);

  writeApp(root, 'interviewer', '8.4.0', [
    ['8.4.0', REWRITTEN],
    ['8.3.0', REWRITTEN],
  ]);
  const green = run();
  assert.equal(green.status, 0, green.stderr);
});

test('the CLI refuses to run without a base ref', () => {
  const result = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
  assert.equal(result.status, 2);
});
