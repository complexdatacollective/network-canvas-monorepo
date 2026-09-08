import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  assertVendoredLockfile,
  collectClosure,
  packagesChangedSince,
  tarballName,
  withDependents,
} from './vendor-workspace-packages.mjs';

function git(cwd, ...args) {
  execFileSync('git', args, { cwd, stdio: 'pipe' });
}

// A throwaway workspace: an app depending on `ui` and `runtime`, where
// `runtime` depends on `ui`, and a private tooling package the app also uses.
// Committed and tagged as a release, so `packagesChangedSince` has a ref.
function workspace() {
  const root = mkdtempSync(join(tmpdir(), 'vendor-'));
  const write = (rel, json) => {
    mkdirSync(join(root, rel), { recursive: true });
    writeFileSync(
      join(root, rel, 'package.json'),
      `${JSON.stringify(json, null, 2)}\n`,
    );
  };
  writeFileSync(
    join(root, 'pnpm-workspace.yaml'),
    "packages:\n  - 'packages/*'\n",
  );
  write('packages/ui', { name: '@x/ui', version: '1.0.0' });
  write('packages/runtime', {
    name: '@x/runtime',
    version: '2.0.0',
    dependencies: { '@x/ui': 'workspace:^' },
  });
  write('packages/exporters', { name: '@x/exporters', version: '3.0.0' });
  write('tooling/config', {
    name: '@x/config',
    version: '0.0.1',
    private: true,
  });
  write('apps/app', {
    name: 'app',
    version: '4.0.0',
    dependencies: {
      '@x/runtime': 'workspace:^',
      '@x/exporters': 'workspace:^',
    },
    devDependencies: { '@x/config': 'workspace:^' },
  });
  git(root, 'init', '-q');
  git(root, 'config', 'user.email', 'ci@example.com');
  git(root, 'config', 'user.name', 'ci');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'release');
  git(root, 'tag', 'app@4.0.0');
  return root;
}

const wsPackages = {
  '@x/ui': { version: '1.0.0', private: false, dir: 'packages/ui' },
  '@x/runtime': { version: '2.0.0', private: false, dir: 'packages/runtime' },
  '@x/exporters': {
    version: '3.0.0',
    private: false,
    dir: 'packages/exporters',
  },
  '@x/config': { version: '0.0.1', private: true, dir: 'tooling/config' },
};

// The module reads the repository from the working directory, so each test
// runs inside its own throwaway workspace.
function inWorkspace(fn) {
  const root = workspace();
  const previous = process.cwd();
  process.chdir(root);
  try {
    return fn(root);
  } finally {
    process.chdir(previous);
  }
}

test('the closure follows published fields only and drops the app’s private deps', () => {
  inWorkspace(() => {
    assert.deepEqual(collectClosure(wsPackages, 'apps/app'), [
      '@x/exporters',
      '@x/runtime',
      '@x/ui',
    ]);
  });
});

test('nothing has changed right after the release', () => {
  inWorkspace(() => {
    const closure = collectClosure(wsPackages, 'apps/app');
    assert.deepEqual(
      packagesChangedSince('app@4.0.0', closure, wsPackages),
      [],
    );
  });
});

test('a committed change under a package directory marks that package', () => {
  inWorkspace((root) => {
    writeFileSync(
      join(root, 'packages/ui/fix.ts'),
      'export const fixed = true;\n',
    );
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'fix');
    const closure = collectClosure(wsPackages, 'apps/app');
    assert.deepEqual(packagesChangedSince('app@4.0.0', closure, wsPackages), [
      '@x/ui',
    ]);
  });
});

test('an uncommitted change does not count — the lane releases commits', () => {
  inWorkspace((root) => {
    writeFileSync(
      join(root, 'packages/ui/fix.ts'),
      'export const fixed = true;\n',
    );
    const closure = collectClosure(wsPackages, 'apps/app');
    assert.deepEqual(
      packagesChangedSince('app@4.0.0', closure, wsPackages),
      [],
    );
  });
});

test('an unknown ref is an error, never "nothing changed"', () => {
  inWorkspace(() => {
    const closure = collectClosure(wsPackages, 'apps/app');
    assert.throws(
      () => packagesChangedSince('app@9.9.9', closure, wsPackages),
      /git diff --quiet app@9\.9\.9/,
    );
  });
});

test('dependents of a changed package are vendored with it', () => {
  inWorkspace(() => {
    const closure = collectClosure(wsPackages, 'apps/app');
    assert.deepEqual(withDependents(['@x/ui'], closure, wsPackages), [
      '@x/runtime',
      '@x/ui',
    ]);
    // A leaf drags nothing else in.
    assert.deepEqual(withDependents(['@x/exporters'], closure, wsPackages), [
      '@x/exporters',
    ]);
  });
});

test('tarball names follow pnpm pack’s scoped form', () => {
  assert.equal(
    tarballName('@codaco/fresco-ui', '6.4.0'),
    'codaco-fresco-ui-6.4.0.tgz',
  );
});

test('the lockfile guard fails on a registry resolution of a vendored package', () => {
  const stage = mkdtempSync(join(tmpdir(), 'stage-'));
  const manifest = {
    vendored: { '@x/ui': 'x-ui-1.0.0.tgz' },
    registry: ['@x/exporters'],
  };
  writeFileSync(
    join(stage, 'pnpm-lock.yaml'),
    "importers:\n  .:\n    dependencies:\n      '@x/ui':\n        specifier: file:vendor/x-ui-1.0.0.tgz\n        version: file:vendor/x-ui-1.0.0.tgz\npackages:\n  '@x/exporters@3.0.0': {}\n",
  );
  assert.match(
    assertVendoredLockfile(stage, manifest),
    /1 vendored, 1 from registry \(@x\/exporters\)/,
  );

  writeFileSync(
    join(stage, 'pnpm-lock.yaml'),
    "packages:\n  '@x/ui@1.0.0': {}\n  '@x/ui@file:vendor/x-ui-1.0.0.tgz': {}\n",
  );
  assert.throws(
    () => assertVendoredLockfile(stage, manifest),
    /also resolved from the registry/,
  );

  writeFileSync(
    join(stage, 'pnpm-lock.yaml'),
    "packages:\n  '@x/exporters@3.0.0': {}\n",
  );
  assert.throws(
    () => assertVendoredLockfile(stage, manifest),
    /no file:vendor\/x-ui-1\.0\.0\.tgz resolution/,
  );
});
