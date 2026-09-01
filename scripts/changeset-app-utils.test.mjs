import assert from 'node:assert/strict';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  BUNDLED_RUNTIME_DEPENDENTS,
  classifyChangeset,
  GATED_PRODUCT_PACKAGES,
  isMixedChangeset,
  isMultiProductLaneChangeset,
  missingBundlingApps,
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

test('every separately gated product is in the changesets ignore list', () => {
  // `changeset version` must never consume a gated product's changesets — a
  // gated package missing from `ignore` rides the normal Version Packages PR
  // (dependency bumps included), which is exactly the lane split this module
  // exists to prevent.
  const config = JSON.parse(
    readFileSync(new URL('../.changeset/config.json', import.meta.url), 'utf8'),
  );
  for (const pkg of GATED_PRODUCT_PACKAGES) {
    assert.ok(config.ignore.includes(pkg), `${pkg} must be ignored`);
  }
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
  assert.equal(releaseLaneForProduct('@codaco/studio-client'), 'studio');
  assert.equal(releaseLaneForProduct('@codaco/studio-rpc'), 'studio');
  assert.equal(releaseLaneForProduct('@codaco/studio-server'), 'studio');
  assert.equal(releaseLaneForProduct('@codaco/studio-sync'), 'studio');
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
  const studioLane = {
    releases: [
      { name: '@codaco/studio-server', type: 'minor' },
      { name: '@codaco/studio-sync', type: 'patch' },
    ],
  };
  const studioPlusDocs = {
    releases: [
      { name: '@codaco/studio-server', type: 'minor' },
      { name: '@codaco/documentation', type: 'patch' },
    ],
  };
  assert.equal(isMultiProductLaneChangeset(app), false);
  assert.equal(isMultiProductLaneChangeset(lib), false);
  assert.equal(isMultiProductLaneChangeset(twoLanes), true);
  assert.equal(isMultiProductLaneChangeset(studioLane), false);
  assert.equal(isMultiProductLaneChangeset(studioPlusDocs), true);
});

test('missingBundlingApps flags a bundled runtime released without its apps', () => {
  const partial = {
    releases: [
      { name: '@codaco/interview', type: 'patch' },
      { name: '@codaco/interviewer', type: 'patch' },
      { name: 'fresco', type: 'patch' },
    ],
  };
  assert.deepEqual(missingBundlingApps(partial), [
    { package: '@codaco/interview', missingApps: ['@codaco/architect'] },
  ]);

  const complete = {
    releases: [
      { name: '@codaco/interview', type: 'patch' },
      { name: '@codaco/architect', type: 'patch' },
      { name: 'fresco', type: 'patch' },
      { name: '@codaco/interviewer', type: 'patch' },
    ],
  };
  assert.deepEqual(missingBundlingApps(complete), []);

  const unrelated = {
    releases: [{ name: '@codaco/fresco-ui', type: 'minor' }],
  };
  assert.deepEqual(missingBundlingApps(unrelated), []);
});

const byName = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

test('BUNDLED_RUNTIME_DEPENDENTS matches the apps that really bundle each runtime', () => {
  // The guard's map is static so it works on changeset fixtures; this test
  // pins it to the workspace's actual dependency graph. If it fails, an app
  // adopted or dropped a bundled runtime — update BUNDLED_RUNTIME_DEPENDENTS.
  const root = new URL('..', import.meta.url);
  const workspace = readFileSync(new URL('pnpm-workspace.yaml', root), 'utf8');
  // The app globs are the `- apps/...` lines of the leading `packages:` block;
  // parse them without a YAML dependency. Comments are indented and skipped;
  // the next top-level key ends the block.
  const appGlobs = [];
  let inPackages = false;
  for (const line of workspace.split('\n')) {
    if (line.startsWith('packages:')) {
      inPackages = true;
      continue;
    }
    if (!inPackages) continue;
    if (/^\S/.test(line)) break;
    const glob = line.match(/^\s+-\s+(\S+)/)?.[1];
    if (glob?.startsWith('apps/')) appGlobs.push(glob);
  }
  assert.ok(appGlobs.includes('apps/*'), 'workspace parsing broke');

  const { ignore } = JSON.parse(
    readFileSync(new URL('.changeset/config.json', root), 'utf8'),
  );
  const ignored = new Set(ignore);
  const manifests = appGlobs.flatMap((glob) => {
    assert.match(glob, /\/\*$/, `unsupported workspace glob shape: ${glob}`);
    const parent = fileURLToPath(new URL(glob.slice(0, -1), root));
    return readdirSync(parent, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(parent, entry.name, 'package.json'))
      .filter((manifestPath) => existsSync(manifestPath))
      .map((manifestPath) => JSON.parse(readFileSync(manifestPath, 'utf8')));
  });
  assert.ok(manifests.length > 0);

  for (const [pkg, apps] of Object.entries(BUNDLED_RUNTIME_DEPENDENTS)) {
    const actual = manifests
      .filter((manifest) => !ignored.has(manifest.name))
      .filter(
        (manifest) =>
          pkg in { ...manifest.dependencies, ...manifest.devDependencies },
      )
      .map((manifest) => manifest.name)
      .toSorted(byName);
    assert.deepEqual(
      actual,
      [...apps].toSorted(byName),
      `apps depending on ${pkg} drifted from BUNDLED_RUNTIME_DEPENDENTS`,
    );
  }
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
