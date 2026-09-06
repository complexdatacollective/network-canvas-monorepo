import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import {
  verifyDeployedLock,
  verifyInstalledDeployment,
} from './verify-deployed-lock.mjs';

const importer = 'apps/studio/server';
function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'studio-deployed-lock-'));
  t.after(() => rmSync(directory, { force: true, recursive: true }));
  const source = {
    lockfileVersion: '9.0',
    importers: {
      [importer]: {
        dependencies: {
          core: { specifier: '^1.0.0', version: '1.0.0(peer-old)' },
          bundled: {
            specifier: 'workspace:^',
            version: 'link:../../../packages/bundled',
          },
        },
      },
    },
    packages: {
      'core@1.0.0': { resolution: { integrity: 'sha512-core' } },
      'leaf@1.0.0': { resolution: { integrity: 'sha512-leaf' } },
      // This released version belongs to an unrelated workspace; a global
      // package-version allowlist would miss retargeting the selected edge.
      'leaf@2.0.0': { resolution: { integrity: 'sha512-other-lane' } },
      'platform@1.0.0': { resolution: { integrity: 'sha512-platform' } },
    },
    snapshots: {
      'core@1.0.0(peer-old)': {
        dependencies: { leaf: '1.0.0' },
        optionalDependencies: { platform: '1.0.0' },
      },
      'leaf@1.0.0': {},
      'leaf@2.0.0': {},
      'platform@1.0.0': {},
    },
  };
  const target = structuredClone(source);
  delete target.packages['leaf@2.0.0'];
  delete target.snapshots['leaf@2.0.0'];
  function packageFiles(name, version) {
    const path = join(
      directory,
      'node_modules/.pnpm',
      `${name}@${version}`,
      'node_modules',
      name,
    );
    mkdirSync(path, { recursive: true });
    writeFileSync(
      join(path, 'package.json'),
      JSON.stringify({ name, version }),
    );
    return path;
  }
  function link(path, name, targetPath) {
    const destination = join(path, 'node_modules', name);
    mkdirSync(dirname(destination), { recursive: true });
    rmSync(destination, { force: true });
    symlinkSync(targetPath, destination, 'dir');
  }
  const core = packageFiles('core', '1.0.0');
  const leaf = packageFiles('leaf', '1.0.0');
  link(directory, 'core', core);
  link(core, 'leaf', leaf);
  return {
    directory,
    source,
    target,
    core,
    leaf,
    packageFiles,
    link,
    graph: () => verifyDeployedLock(source, target, importer),
  };
}

test('verifies the selected recursive graph and real manifests while permitting an omitted optional platform package', (t) => {
  const f = fixture(t);
  const inventory = verifyInstalledDeployment(f.directory, f.graph());
  assert.deepEqual(
    inventory.map(({ name, version }) => [name, version]),
    [
      ['core', '1.0.0'],
      ['leaf', '1.0.0'],
    ],
  );
  assert.ok(
    inventory.every(({ manifestSha256 }) =>
      /^[a-f0-9]{64}$/.test(manifestSha256),
    ),
  );
});

test('allows rewritten peer labels only when every recursively selected dependency edge is equivalent', (t) => {
  const f = fixture(t);
  f.source.snapshots['leaf@1.0.0'] = {
    dependencies: { core: '1.0.0(peer-parent)' },
  };
  f.source.snapshots['core@1.0.0(peer-parent)'] = structuredClone(
    f.source.snapshots['core@1.0.0(peer-old)'],
  );
  f.target.snapshots['leaf@1.0.0'] = {
    optional: true,
    dependencies: { core: '1.0.0(peer-new)' },
  };
  f.target.snapshots['core@1.0.0(peer-new)'] = structuredClone(
    f.target.snapshots['core@1.0.0(peer-old)'],
  );
  const graph = f.graph();
  assert.equal(Object.keys(graph.snapshots).length, 4);
});

for (const [name, mutate, message] of [
  [
    'root dependency',
    (f) => {
      f.target.importers[importer].dependencies.core.version = '1.0.0(other)';
    },
    /production importer/,
  ],
  [
    'transitive version already present elsewhere in the source lock',
    (f) => {
      f.target.snapshots['core@1.0.0(peer-old)'].dependencies.leaf = '2.0.0';
      f.target.snapshots['leaf@2.0.0'] = {};
      f.target.packages['leaf@2.0.0'] = f.source.packages['leaf@2.0.0'];
    },
    /selected package resolution/,
  ],
  [
    'integrity',
    (f) => {
      f.target.packages['leaf@1.0.0'].resolution.integrity = 'sha512-tampered';
    },
    /selected package resolution/,
  ],
  [
    'required edge removal',
    (f) => {
      f.target.snapshots['core@1.0.0(peer-old)'].dependencies = {};
    },
    /dependency edges/,
  ],
  [
    'required edge made optional',
    (f) => {
      f.target.snapshots['core@1.0.0(peer-old)'].dependencies = {};
      f.target.snapshots['core@1.0.0(peer-old)'].optionalDependencies.leaf =
        '1.0.0';
    },
    /dependency edges/,
  ],
  [
    'extra snapshot',
    (f) => {
      f.target.snapshots['leaf@2.0.0'] = {};
      f.target.packages['leaf@2.0.0'] = f.source.packages['leaf@2.0.0'];
    },
    /outside its selected/,
  ],
  [
    'changed patch',
    (f) => {
      f.target.patchedDependencies = { 'leaf@1.0.0': { hash: 'different' } };
    },
    /selected package resolution/,
  ],
])
  test(`refuses ${name}`, (t) => {
    const f = fixture(t);
    mutate(f);
    assert.throws(f.graph, message);
  });

test('refuses installed bytes with a different package version even when the supplied lock claims the expected version', (t) => {
  const f = fixture(t);
  writeFileSync(
    join(f.leaf, 'package.json'),
    JSON.stringify({ name: 'leaf', version: '2.0.0' }),
  );
  assert.throws(
    () => verifyInstalledDeployment(f.directory, f.graph()),
    /differs from its selected version/,
  );
});

test('refuses a required transitive package absent from both links and the physical store', (t) => {
  const f = fixture(t);
  rmSync(join(f.core, 'node_modules/leaf'));
  rmSync(f.leaf, { recursive: true });
  assert.throws(
    () => verifyInstalledDeployment(f.directory, f.graph()),
    /required deployed dependency is missing/,
  );
});

test('refuses a missing required package, a link outside the deployment and an unreferenced package', (t) => {
  const f = fixture(t);
  rmSync(join(f.core, 'node_modules/leaf'));
  assert.throws(
    () => verifyInstalledDeployment(f.directory, f.graph()),
    /required deployed dependency is missing/,
  );
  f.link(f.core, 'leaf', dirname(f.directory));
  assert.throws(
    () => verifyInstalledDeployment(f.directory, f.graph()),
    /escapes the deployment/,
  );
  f.link(f.core, 'leaf', f.leaf);
  f.packageFiles('leaf', '2.0.0');
  assert.throws(
    () => verifyInstalledDeployment(f.directory, f.graph()),
    /outside the verified dependency graph/,
  );
});

test('refuses an empty or unsupported lock instead of returning an empty passing inventory', (t) => {
  const f = fixture(t);
  assert.throws(() => verifyDeployedLock({}, {}, importer), /complete pnpm/);
  f.source.importers[importer] = {};
  f.target.importers[importer] = {};
  f.target.snapshots = {};
  f.target.packages = {};
  assert.throws(f.graph, /outside its selected/);
});

for (const location of [
  'node_modules/rogue',
  'node_modules/@scope/rogue',
  'node_modules/.pnpm/node_modules/rogue',
  'node_modules/.pnpm/node_modules/@scope/rogue',
])
  test(`refuses an unreferenced physical package at ${location}`, (t) => {
    const f = fixture(t);
    const path = join(f.directory, location);
    mkdirSync(path, { recursive: true });
    writeFileSync(
      join(path, 'package.json'),
      JSON.stringify({ name: 'rogue', version: '1.0.0' }),
    );
    assert.throws(
      () => verifyInstalledDeployment(f.directory, f.graph()),
      /outside the verified dependency graph/,
    );
  });

for (const location of [
  'node_modules/rogue',
  'node_modules/.pnpm/node_modules/@scope/rogue',
])
  test(`refuses an unreferenced package link at ${location}`, (t) => {
    const f = fixture(t);
    const target = join(f.directory, 'unreferenced-package');
    mkdirSync(target);
    writeFileSync(
      join(target, 'package.json'),
      JSON.stringify({ name: 'rogue', version: '1.0.0' }),
    );
    const path = join(f.directory, location);
    mkdirSync(dirname(path), { recursive: true });
    symlinkSync(target, path);
    assert.throws(
      () => verifyInstalledDeployment(f.directory, f.graph()),
      /outside the verified dependency graph/,
    );
  });

test('accepts ordinary package hoists, binary shims, known bundled workspace links and pnpm links to omitted optional stores', (t) => {
  const f = fixture(t);
  writeFileSync(
    join(f.directory, 'package.json'),
    JSON.stringify({ name: '@codaco/test-server' }),
  );
  const hoisted = join(f.directory, 'node_modules/.pnpm');
  f.link(hoisted, 'leaf', f.leaf);
  f.link(f.directory, 'bundled', join(f.directory, '../bundled-source'));
  f.link(hoisted, '@codaco/test-server', f.directory);
  f.link(
    hoisted,
    'platform',
    join(hoisted, 'platform@1.0.0/node_modules/platform'),
  );
  mkdirSync(join(f.directory, 'node_modules/.bin'));
  writeFileSync(join(f.directory, 'node_modules/.bin/leaf'), '#!/bin/sh\n');
  assert.equal(verifyInstalledDeployment(f.directory, f.graph()).length, 2);
});

for (const name of ['bundled', '@codaco/test-server'])
  test(`refuses a known ${name} link redirected to an unreviewed physical package`, (t) => {
    const f = fixture(t);
    writeFileSync(
      join(f.directory, 'package.json'),
      JSON.stringify({ name: '@codaco/test-server' }),
    );
    const target = join(f.directory, 'unreviewed-source');
    mkdirSync(target);
    writeFileSync(
      join(target, 'package.json'),
      JSON.stringify({ name, version: '9.9.9' }),
    );
    f.link(
      name === 'bundled'
        ? f.directory
        : join(f.directory, 'node_modules/.pnpm'),
      name,
      target,
    );
    assert.throws(
      () => verifyInstalledDeployment(f.directory, f.graph()),
      /outside the verified dependency graph/,
    );
  });
