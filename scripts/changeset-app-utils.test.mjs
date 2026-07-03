import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  classifyChangeset,
  isMixedChangeset,
  nextBetaVersion,
  parseChangeset,
  readChangesets,
  renderChangelogSection,
} from './changeset-app-utils.mjs';

test('parseChangeset extracts releases and summary', () => {
  const md = `---\n"@codaco/architect-web": minor\n'@codaco/interviewer-v8': patch\n---\n\nDid a thing`;
  assert.deepEqual(parseChangeset(md), {
    releases: [
      { name: '@codaco/architect-web', type: 'minor' },
      { name: '@codaco/interviewer-v8', type: 'patch' },
    ],
    summary: 'Did a thing',
  });
});

test('parseChangeset tolerates a body-only file', () => {
  assert.deepEqual(parseChangeset('just text'), {
    releases: [],
    summary: 'just text',
  });
});

test('readChangesets reads and ids each .md, skipping README/config', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cs-'));
  writeFileSync(
    join(dir, 'happy-cat.md'),
    `---\n"@codaco/architect-web": minor\n---\n\nA`,
  );
  writeFileSync(join(dir, 'README.md'), 'not a changeset');
  const got = readChangesets(dir);
  assert.equal(got.length, 1);
  assert.equal(got[0].id, 'happy-cat');
  assert.deepEqual(got[0].releases, [
    { name: '@codaco/architect-web', type: 'minor' },
  ]);
});

test('classifyChangeset splits app vs library releases', () => {
  const cs = {
    id: 'x',
    summary: '',
    releases: [
      { name: '@codaco/architect-web', type: 'minor' },
      { name: '@codaco/interview', type: 'patch' },
    ],
  };
  const { appReleases, libReleases } = classifyChangeset(cs);
  assert.deepEqual(appReleases, [
    { name: '@codaco/architect-web', type: 'minor' },
  ]);
  assert.deepEqual(libReleases, [{ name: '@codaco/interview', type: 'patch' }]);
});

test('isMixedChangeset: true only when an app and a library share one changeset', () => {
  const app = { releases: [{ name: '@codaco/architect-web', type: 'minor' }] };
  const lib = { releases: [{ name: '@codaco/interview', type: 'minor' }] };
  const both = { releases: [...app.releases, ...lib.releases] };
  const twoApps = {
    releases: [
      { name: '@codaco/architect-web', type: 'minor' },
      { name: '@codaco/interviewer-v8', type: 'minor' },
    ],
  };
  assert.equal(isMixedChangeset(app), false);
  assert.equal(isMixedChangeset(lib), false);
  assert.equal(isMixedChangeset(both), true);
  assert.equal(isMixedChangeset(twoApps), false); // both ignored → not "mixed"
});

test('nextBetaVersion increments only the beta counter', () => {
  assert.equal(nextBetaVersion('8.0.0-beta.0'), '8.0.0-beta.1');
  assert.equal(nextBetaVersion('8.0.0-beta.9'), '8.0.0-beta.10');
  assert.equal(nextBetaVersion('9.1.0-beta.0'), '9.1.0-beta.1');
});

test('nextBetaVersion rejects a non-beta version', () => {
  assert.throws(() => nextBetaVersion('8.0.0'), /not on a -beta\.N line/);
  assert.throws(
    () => nextBetaVersion('8.0.0-alpha.3'),
    /not on a -beta\.N line/,
  );
});

test('renderChangelogSection groups entries by bump type', () => {
  const out = renderChangelogSection('8.0.0-beta.1', [
    { type: 'minor', summary: 'Add X' },
    { type: 'patch', summary: 'Fix Y' },
    { type: 'minor', summary: 'Add Z' },
  ]);
  assert.equal(
    out,
    '## 8.0.0-beta.1\n\n### Minor Changes\n\n- Add X\n- Add Z\n\n### Patch Changes\n\n- Fix Y\n',
  );
});
