import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  classifyChangeset,
  isMixedChangeset,
  isMultiProductChangeset,
  nextBetaVersion,
  nextStableVersion,
  parseChangeset,
  readChangesets,
  renderChangelogSection,
} from './changeset-app-utils.mjs';

test('parseChangeset extracts releases and summary', () => {
  const md = `---\n"@codaco/architect": minor\n'@codaco/interviewer': patch\n---\n\nDid a thing`;
  assert.deepEqual(parseChangeset(md), {
    releases: [
      { name: '@codaco/architect', type: 'minor' },
      { name: '@codaco/interviewer', type: 'patch' },
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
    `---\n"@codaco/architect": minor\n---\n\nA`,
  );
  writeFileSync(join(dir, 'README.md'), 'not a changeset');
  const got = readChangesets(dir);
  assert.equal(got.length, 1);
  assert.equal(got[0].id, 'happy-cat');
  assert.deepEqual(got[0].releases, [
    { name: '@codaco/architect', type: 'minor' },
  ]);
});

test('classifyChangeset splits app vs library releases', () => {
  const cs = {
    id: 'x',
    summary: '',
    releases: [
      { name: '@codaco/architect', type: 'minor' },
      { name: 'networkcanvas.com', type: 'patch' },
      { name: '@codaco/interview', type: 'patch' },
    ],
  };
  const { productReleases, libReleases } = classifyChangeset(cs);
  assert.deepEqual(productReleases, [
    { name: '@codaco/architect', type: 'minor' },
    { name: 'networkcanvas.com', type: 'patch' },
  ]);
  assert.deepEqual(libReleases, [{ name: '@codaco/interview', type: 'patch' }]);
});

test('isMixedChangeset: true only when an app and a library share one changeset', () => {
  const app = { releases: [{ name: '@codaco/architect', type: 'minor' }] };
  const lib = { releases: [{ name: '@codaco/interview', type: 'minor' }] };
  const both = { releases: [...app.releases, ...lib.releases] };
  const twoApps = {
    releases: [
      { name: '@codaco/architect', type: 'minor' },
      { name: '@codaco/interviewer', type: 'minor' },
    ],
  };
  assert.equal(isMixedChangeset(app), false);
  assert.equal(isMixedChangeset(lib), false);
  assert.equal(isMixedChangeset(both), true);
  assert.equal(isMixedChangeset(twoApps), false); // both ignored → not "mixed"
});

test('isMultiProductChangeset: true only when gated products share one changeset', () => {
  const app = { releases: [{ name: '@codaco/architect', type: 'minor' }] };
  const lib = { releases: [{ name: '@codaco/interview', type: 'minor' }] };
  const twoApps = {
    releases: [...app.releases, { name: 'networkcanvas.com', type: 'patch' }],
  };
  assert.equal(isMultiProductChangeset(app), false);
  assert.equal(isMultiProductChangeset(lib), false);
  assert.equal(isMultiProductChangeset(twoApps), true);
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

test('nextStableVersion applies the highest requested semver bump', () => {
  assert.equal(
    nextStableVersion('1.2.3', [{ type: 'patch' }, { type: 'minor' }]),
    '1.3.0',
  );
  assert.equal(nextStableVersion('1.2.3', [{ type: 'major' }]), '2.0.0');
  assert.equal(nextStableVersion('1.2.3', [{ type: 'patch' }]), '1.2.4');
});

test('nextStableVersion rejects invalid versions and empty releases', () => {
  assert.throws(
    () => nextStableVersion('1.2.3-beta.1', [{ type: 'patch' }]),
    /not a stable semver version/,
  );
  assert.throws(() => nextStableVersion('1.2.3', []), /at least one changeset/);
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

test('renderChangelogSection keeps blank continuation lines free of trailing whitespace', () => {
  const out = renderChangelogSection('8.0.0-beta.1', [
    { type: 'patch', summary: 'Fix a batch of bugs:\n\n- One\n- Two' },
  ]);
  assert.equal(
    out,
    '## 8.0.0-beta.1\n\n### Patch Changes\n\n- Fix a batch of bugs:\n\n  - One\n  - Two\n',
  );
  // Guard the specific failure mode: no line may end in whitespace (an indented
  // blank continuation line would fail `oxfmt --check`).
  for (const line of out.split('\n')) {
    assert.equal(line, line.trimEnd(), `trailing whitespace on line: ${line}`);
  }
});
