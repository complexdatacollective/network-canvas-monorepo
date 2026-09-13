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

import { test } from 'vitest';

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
  UNRELEASED_PACKAGES,
  unreleasedReleases,
  workspaceManifests,
} from './changeset-app-utils.mjs';

test('normal Changesets versions private Architect and Interviewer packages', () => {
  const config = JSON.parse(
    readFileSync(
      new URL('../../.changeset/config.json', import.meta.url),
      'utf8',
    ),
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
    readFileSync(
      new URL('../../.changeset/config.json', import.meta.url),
      'utf8',
    ),
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
  const root = new URL('../..', import.meta.url);
  const { ignore } = JSON.parse(
    readFileSync(new URL('.changeset/config.json', root), 'utf8'),
  );
  const ignored = new Set(ignore);
  const manifests = workspaceManifests()
    .filter(({ glob }) => glob.startsWith('apps/'))
    .map(({ manifest }) => manifest);
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

test('unreleasedReleases names only the packages the changeset lists', () => {
  const cs = parseChangeset(
    `---\n"@codaco/architect": minor\n"@codaco/protocol-builder": minor\n---\n\nboth`,
  );
  assert.deepEqual(unreleasedReleases(cs), [
    { name: '@codaco/protocol-builder', type: 'minor' },
  ]);
  assert.deepEqual(
    unreleasedReleases(
      parseChangeset(`---\n"@codaco/architect": minor\n---\n\napp`),
    ),
    [],
  );
});

test('UNRELEASED_PACKAGES holds every workspace with no release path at all', () => {
  // The set is derived from the manifests, so this pins it from the other
  // side: each entry is shown to have none of the three release paths, and
  // packages whose lane we know are named in both directions. Being private is
  // not the qualifying property — Architect, Interviewer, Fresco,
  // `@codaco/art` and `@codaco/interface-images` are all private and versioned
  // in the normal lane, and the Studio packages are private and released by
  // the Studio lane.
  const root = new URL('../..', import.meta.url);
  const { ignore } = JSON.parse(
    readFileSync(new URL('.changeset/config.json', root), 'utf8'),
  );
  const directories = new Map(
    workspaceManifests().map(({ directory, manifest }) => [
      manifest.name,
      directory,
    ]),
  );

  for (const name of UNRELEASED_PACKAGES) {
    const directory = directories.get(name);
    assert.ok(directory, `${name} is not a workspace in this repository`);

    const manifest = JSON.parse(
      readFileSync(join(directory, 'package.json'), 'utf8'),
    );
    assert.equal(manifest.private, true, `${name} is published to npm`);
    assert.equal(
      manifest.publishConfig,
      undefined,
      `${name} has a publish lane`,
    );
    assert.ok(
      !existsSync(join(directory, 'CHANGELOG.md')),
      `${name} has a CHANGELOG.md, so something already releases it`,
    );
    assert.ok(
      !GATED_PRODUCT_PACKAGES.includes(name),
      `${name} is a separately gated product`,
    );
    assert.ok(
      !ignore.includes(name),
      `${name} is in the changesets ignore list, which is a gated lane rather than no lane`,
    );
    assert.ok(
      !readdirSync(directory).some((entry) => entry.startsWith('wrangler.')),
      `${name} is a Cloudflare Worker, which deploys from its own config`,
    );
  }

  // Every workspace with none of those paths is protected, not just the ones
  // someone remembered: both protocol-builder halves, the protocol fixtures,
  // and the tooling packages that apps and packages consume as source.
  for (const name of [
    '@codaco/protocol-builder',
    '@codaco/protocol-builder-core',
    '@codaco/protocols',
    '@codaco/storybook-config',
    '@codaco/tsconfig',
    '@codaco/vitest-config',
  ]) {
    assert.ok(
      UNRELEASED_PACKAGES.includes(name),
      `${name} has no release path, so a changeset naming it must be refused`,
    );
  }

  // And nothing with a release path is swept in, which would refuse a
  // changeset the release lanes need.
  for (const name of [
    '@codaco/architect',
    '@codaco/art',
    '@codaco/background-creator',
    '@codaco/documentation',
    '@codaco/fresco-ui',
    '@codaco/interface-images',
    '@codaco/interview',
    '@codaco/interviewer',
    '@codaco/studio-client',
    '@codaco/studio-rpc',
    '@codaco/studio-server',
    '@codaco/studio-sync',
    'fresco',
    'networkcanvas.com',
    // Deployed by hand from its own `wrangler` config, and its changesets on
    // main are the record of those deploys.
    'posthog-proxy-worker',
    'development-protocol-worker',
    'studio-managed-ingress-worker',
  ]) {
    assert.ok(
      !UNRELEASED_PACKAGES.includes(name),
      `${name} has a release path and must not be refused`,
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
