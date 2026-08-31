import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  changedPublicPackageVersions,
  checkNpmVersionCollisions,
  npmVersionUrl,
} from './check-npm-version-collisions.mjs';

function git(repoRoot, ...args) {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim();
}

function writeManifest(repoRoot, directory, manifest) {
  const packageDirectory = path.join(repoRoot, 'packages', directory);
  mkdirSync(packageDirectory, { recursive: true });
  writeFileSync(
    path.join(packageDirectory, 'package.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}

function repository(t, basePackages, changedPackages) {
  const repoRoot = mkdtempSync(
    path.join(tmpdir(), 'npm-version-collision-test-'),
  );
  t.after(() => rmSync(repoRoot, { recursive: true, force: true }));

  git(repoRoot, 'init', '--initial-branch=main');
  git(repoRoot, 'config', 'user.name', 'CI Test');
  git(repoRoot, 'config', 'user.email', 'ci@example.com');
  git(repoRoot, 'config', 'commit.gpgsign', 'false');

  for (const [directory, manifest] of Object.entries(basePackages)) {
    writeManifest(repoRoot, directory, manifest);
  }
  git(repoRoot, 'add', '.');
  git(repoRoot, 'commit', '-m', 'base');
  const baseRef = git(repoRoot, 'rev-parse', 'HEAD');

  for (const [directory, manifest] of Object.entries(changedPackages)) {
    writeManifest(repoRoot, directory, manifest);
  }
  git(repoRoot, 'add', '.');
  git(repoRoot, 'commit', '-m', 'change');

  return { baseRef, repoRoot };
}

const exportersV1 = {
  name: '@codaco/network-exporters',
  version: '1.0.0',
};

const exportersV2 = {
  name: '@codaco/network-exporters',
  version: '2.0.0',
};

test('encodes a scoped package as one npm registry path segment', () => {
  assert.equal(
    npmVersionUrl(
      'https://registry.npmjs.org',
      '@codaco/network-exporters',
      '2.0.0',
    ),
    'https://registry.npmjs.org/@codaco%2Fnetwork-exporters/2.0.0',
  );
});

test('rejects a changed public version that npm already serves', async (t) => {
  const { baseRef, repoRoot } = repository(
    t,
    { 'network-exporters': exportersV1 },
    { 'network-exporters': exportersV2 },
  );
  const requested = [];

  await assert.rejects(
    checkNpmVersionCollisions({
      repoRoot,
      baseRef,
      fetchImpl: async (url) => {
        requested.push(url);
        return { status: 200 };
      },
    }),
    /npm version collision: @codaco\/network-exporters@2\.0\.0 already exists/,
  );

  assert.deepEqual(requested, [
    'https://registry.npmjs.org/@codaco%2Fnetwork-exporters/2.0.0',
  ]);
});

test('accepts a changed public version when npm returns 404', async (t) => {
  const { baseRef, repoRoot } = repository(
    t,
    { 'network-exporters': exportersV1 },
    { 'network-exporters': exportersV2 },
  );

  const checked = await checkNpmVersionCollisions({
    repoRoot,
    baseRef,
    fetchImpl: async () => ({ status: 404 }),
  });

  assert.deepEqual(checked, [
    {
      manifestPath: 'packages/network-exporters/package.json',
      name: '@codaco/network-exporters',
      previousVersion: '1.0.0',
      version: '2.0.0',
    },
  ]);
});

test('skips unchanged public versions and changed private packages', async (t) => {
  const unchangedBase = {
    name: '@codaco/unchanged',
    version: '1.0.0',
    description: 'before',
  };
  const privateBase = {
    name: '@codaco/private-tool',
    private: true,
    version: '1.0.0',
  };
  const { baseRef, repoRoot } = repository(
    t,
    { unchanged: unchangedBase, private: privateBase },
    {
      unchanged: { ...unchangedBase, description: 'after' },
      private: { ...privateBase, version: '2.0.0' },
    },
  );
  let requests = 0;

  const checked = await checkNpmVersionCollisions({
    repoRoot,
    baseRef,
    fetchImpl: async () => {
      requests += 1;
      return { status: 200 };
    },
  });

  assert.deepEqual(checked, []);
  assert.equal(requests, 0);
  assert.deepEqual(changedPublicPackageVersions({ repoRoot, baseRef }), []);
});

test('checks a renamed public package even when its version is unchanged', async (t) => {
  const { baseRef, repoRoot } = repository(
    t,
    { renamed: { name: '@codaco/old-name', version: '1.0.0' } },
    { renamed: { name: '@codaco/new-name', version: '1.0.0' } },
  );

  const checked = await checkNpmVersionCollisions({
    repoRoot,
    baseRef,
    fetchImpl: async () => ({ status: 404 }),
  });

  assert.deepEqual(checked, [
    {
      manifestPath: 'packages/renamed/package.json',
      name: '@codaco/new-name',
      previousVersion: '1.0.0',
      version: '1.0.0',
    },
  ]);
});

test('checks a newly public package even when its version is unchanged', async (t) => {
  const { baseRef, repoRoot } = repository(
    t,
    {
      publicized: {
        name: '@codaco/publicized',
        private: true,
        version: '1.0.0',
      },
    },
    { publicized: { name: '@codaco/publicized', version: '1.0.0' } },
  );

  const checked = await checkNpmVersionCollisions({
    repoRoot,
    baseRef,
    fetchImpl: async () => ({ status: 404 }),
  });

  assert.deepEqual(checked, [
    {
      manifestPath: 'packages/publicized/package.json',
      name: '@codaco/publicized',
      previousVersion: '1.0.0',
      version: '1.0.0',
    },
  ]);
});

test('fails closed when npm returns a server error', async (t) => {
  const { baseRef, repoRoot } = repository(
    t,
    { 'network-exporters': exportersV1 },
    { 'network-exporters': exportersV2 },
  );

  await assert.rejects(
    checkNpmVersionCollisions({
      repoRoot,
      baseRef,
      fetchImpl: async () => ({ status: 503 }),
    }),
    /registry returned HTTP 503/,
  );
});

test('fails closed when npm cannot be reached', async (t) => {
  const { baseRef, repoRoot } = repository(
    t,
    { 'network-exporters': exportersV1 },
    { 'network-exporters': exportersV2 },
  );

  await assert.rejects(
    checkNpmVersionCollisions({
      repoRoot,
      baseRef,
      fetchImpl: async () => {
        throw new Error('connection reset');
      },
    }),
    /Could not verify @codaco\/network-exporters@2\.0\.0 against npm: connection reset/,
  );
});
