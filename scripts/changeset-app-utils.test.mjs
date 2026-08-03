import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  classifyChangeset,
  isMixedChangeset,
  isMultiProductLaneChangeset,
  nextStableVersion,
  parseChangeset,
  readChangesets,
  releaseLaneForProduct,
  renderChangelogSection,
} from './changeset-app-utils.mjs';

test('normal Changesets versions private Architect and Interviewer packages', () => {
  const config = JSON.parse(
    readFileSync(new URL('../.changeset/config.json', import.meta.url), 'utf8'),
  );
  assert.deepEqual(config.privatePackages, { version: true, tag: false });
  assert.ok(!config.ignore.includes('@codaco/architect'));
  assert.ok(!config.ignore.includes('@codaco/interviewer'));
});

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

test('classifyChangeset splits separately gated vs normal releases', () => {
  const cs = {
    id: 'x',
    summary: '',
    releases: [
      { name: '@codaco/architect', type: 'minor' },
      { name: 'networkcanvas.com', type: 'patch' },
      { name: '@codaco/interview', type: 'patch' },
    ],
  };
  const { gatedProductReleases, normalReleases } = classifyChangeset(cs);
  assert.deepEqual(gatedProductReleases, [
    { name: 'networkcanvas.com', type: 'patch' },
  ]);
  assert.deepEqual(normalReleases, [
    { name: '@codaco/architect', type: 'minor' },
    { name: '@codaco/interview', type: 'patch' },
  ]);
});

test('isMixedChangeset: true only across separate and normal release lanes', () => {
  const app = { releases: [{ name: '@codaco/architect', type: 'minor' }] };
  const lib = { releases: [{ name: '@codaco/interview', type: 'minor' }] };
  const normal = { releases: [...app.releases, ...lib.releases] };
  const gated = {
    releases: [{ name: '@codaco/documentation', type: 'patch' }],
  };
  const mixed = {
    releases: [
      { name: '@codaco/architect', type: 'minor' },
      { name: '@codaco/documentation', type: 'minor' },
    ],
  };
  assert.equal(isMixedChangeset(app), false);
  assert.equal(isMixedChangeset(lib), false);
  assert.equal(isMixedChangeset(normal), false);
  assert.equal(isMixedChangeset(gated), false);
  assert.equal(isMixedChangeset(mixed), true);
});

test('releaseLaneForProduct maps only separately gated products', () => {
  assert.equal(releaseLaneForProduct('@codaco/architect'), null);
  assert.equal(releaseLaneForProduct('@codaco/interviewer'), null);
  assert.equal(releaseLaneForProduct('@codaco/documentation'), 'documentation');
  assert.equal(releaseLaneForProduct('@codaco/interview'), null);
});

test('isMultiProductLaneChangeset allows products in one release lane', () => {
  const app = { releases: [{ name: '@codaco/architect', type: 'minor' }] };
  const lib = { releases: [{ name: '@codaco/interview', type: 'minor' }] };
  const twoLanes = {
    releases: [
      { name: '@codaco/documentation', type: 'minor' },
      { name: 'networkcanvas.com', type: 'patch' },
    ],
  };
  assert.equal(isMultiProductLaneChangeset(app), false);
  assert.equal(isMultiProductLaneChangeset(lib), false);
  assert.equal(isMultiProductLaneChangeset(twoLanes), true);
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
