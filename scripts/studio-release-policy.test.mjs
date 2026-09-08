import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { stringify } from 'yaml';

import {
  readStudioCandidate,
  STUDIO_RELEASE_PACKAGES,
  STUDIO_SOURCE_BASELINE,
  studioSourceBaseline,
} from './studio-release-policy.mjs';
import { fixture } from './test-support/studio-release-policy.mjs';

const SHARED = '@codaco/shared-consts';
const CLIENT = '@codaco/studio-client';
const SERVER = '@codaco/studio-server';
const REGISTRY = '@codaco/template-registry';
const RPC = '@codaco/studio-rpc';
const SYNC = '@codaco/studio-sync';

test('a versioned, source-bound candidate with authenticated available dependencies is eligible', async (t) => {
  const f = fixture(t);
  const result = await f.eligible();
  assert.equal(result.status, 'ready');
  assert.equal(result.source, f.git('rev-parse', 'HEAD'));
  assert.deepEqual(result.blockers, []);
  assert.equal(Object.keys(result.versions).length, 5);
  assert.equal(result.dependencies.length, 1);
  assert.equal(result.components.studio.packages.includes(SYNC), true);
  assert.match(result.artifact, /^[a-f0-9]{64}$/);
});

for (const order of ['studio-first', 'dependency-first'])
  test(`the last required lane unblocks publication: ${order}`, async (t) => {
    const f = fixture(t);
    f.write(
      `${f.dirs[CLIENT]}/src/main.ts`,
      'export const value = "new client";\n',
    );
    f.write(
      `${f.dirs[SHARED]}/src/main.ts`,
      'export const value = "new shared dependency";\n',
    );
    f.change(CLIENT);
    f.change(SHARED, 'minor', 'normal');
    f.commit();
    assert.equal((await f.eligible()).status, 'deferred');
    if (order === 'studio-first') f.releaseStudio();
    else f.releaseDependency();
    const first = await f.eligible();
    assert.equal(first.status, 'deferred');
    assert.equal(
      first.blockers.some(({ code }) => code === 'pending_changeset'),
      true,
    );
    if (order === 'studio-first') f.releaseDependency();
    else f.releaseStudio();
    assert.equal((await f.eligible()).status, 'ready');
  });

test('a pruned or edited checkout cannot conceal committed changesets in any consumed lane', async (t) => {
  const f = fixture(t);
  f.change('@codaco/unrelated-normal-package', 'patch', 'normal');
  f.commit();
  rmSync(join(f.cwd, '.changeset/normal.md'));
  const result = await f.eligible();
  assert.equal(result.status, 'deferred');
  assert.deepEqual(result.blockers, [
    { code: 'pending_changeset', path: '.changeset/normal.md' },
  ]);
});

test('unrelated gated lanes do not block a Studio artifact', async (t) => {
  const f = fixture(t);
  f.change('networkcanvas.com', 'patch', 'website');
  f.commit();
  assert.equal((await f.eligible()).status, 'ready');
});

for (const path of ['src/main.ts', 'src/consent.md'])
  test(`unreleased Studio ${path} cannot ride a dependency trigger`, async (t) => {
    const f = fixture(t);
    f.write(`${f.dirs[CLIENT]}/${path}`, 'unreleased client source\n');
    f.commit();
    const result = await f.eligible();
    assert.equal(result.status, 'deferred');
    assert.equal(
      result.blockers.some(({ code }) => code === 'unreleased_studio_source'),
      true,
    );
  });

test('rewriting a source baseline cannot approve a same-version source change', async (t) => {
  const f = fixture(t);
  f.write(`${f.dirs[CLIENT]}/src/main.ts`, 'new source without a version\n');
  f.commit();
  f.write(
    STUDIO_SOURCE_BASELINE,
    studioSourceBaseline(readStudioCandidate(f.cwd)),
  );
  f.commit();
  assert.equal(
    (await f.eligible()).blockers.some(
      ({ code }) => code === 'unreleased_studio_source',
    ),
    true,
  );
});

test('another Studio package release cannot bless an unversioned server change', async (t) => {
  const f = fixture(t);
  f.write(`${f.dirs[SERVER]}/src/main.ts`, 'unversioned server source\n');
  f.change(CLIENT);
  f.commit();
  assert.throws(
    () => f.releaseStudio(),
    /Studio source changed without a package release/,
  );
  assert.equal((await f.eligible()).status, 'deferred');
});

test('the version step refuses uncommitted source before creating consent', (t) => {
  const f = fixture(t);
  f.change(CLIENT);
  f.commit();
  const before = f.read(STUDIO_SOURCE_BASELINE);
  f.write(`${f.dirs[CLIENT]}/src/main.ts`, 'uncommitted client source\n');
  assert.throws(() => f.releaseStudio(), /clean committed source tree/);
  assert.deepEqual(f.read(STUDIO_SOURCE_BASELINE), before);
});

test('the production version command records consent before consuming Studio changesets', async (t) => {
  const f = fixture(t);
  f.write(
    `${f.dirs[CLIENT]}/src/main.ts`,
    'explicitly released client source\n',
  );
  f.change(CLIENT);
  const anchor = f.commit();
  const formatter = mkdtempSync(join(tmpdir(), 'studio-release-formatter-'));
  t.after(() => rmSync(formatter, { recursive: true, force: true }));
  // Only formatting is stubbed. The actual version command reads Git source,
  // creates consent, bumps the package and consumes the actual changeset.
  writeFileSync(
    join(formatter, 'pnpm'),
    '#!/bin/sh\n[ "$1" = exec ] && [ "$2" = oxfmt ]\n',
    { mode: 0o755 },
  );
  execFileSync(
    process.execPath,
    [
      fileURLToPath(new URL('./version-gated-products.mjs', import.meta.url)),
      ...STUDIO_RELEASE_PACKAGES.flatMap((name) => ['--package', name]),
    ],
    {
      cwd: f.cwd,
      encoding: 'utf8',
      timeout: 15_000,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PATH: `${formatter}:${process.env.PATH}` },
    },
  );
  assert.equal(f.read(STUDIO_SOURCE_BASELINE).sourceCommit, anchor);
  assert.equal(f.read(`${f.dirs[CLIENT]}/package.json`).version, '0.1.1');
  f.commit();
  assert.equal((await f.eligible()).status, 'ready');
});

test('pending npm publication still blocks after changeset removal and the same commit succeeds on retry', async (t) => {
  const f = fixture(t);
  f.change(SHARED, 'minor', 'normal');
  f.commit();
  f.releaseDependency();
  const proof = f.published.get('1.1.0');
  f.published.delete('1.1.0');
  const blocked = await f.eligible();
  assert.equal(blocked.status, 'deferred');
  assert.deepEqual(blocked.blockers, [
    {
      code: 'dependency_unpublished_or_different',
      package: SHARED,
      version: '1.1.0',
    },
  ]);
  f.published.set('1.1.0', proof);
  const success = await f.eligible();
  assert.equal(success.source, blocked.source);
  assert.equal(success.status, 'ready');
});

test('npm source evidence must match the release tag', async (t) => {
  const f = fixture(t);
  f.published.set('1.0.0', {
    ...f.published.get('1.0.0'),
    source: f.git('rev-parse', 'HEAD'),
  });
  assert.equal((await f.eligible()).status, 'deferred');
});

test('changed dependency source under an existing version is refused', async (t) => {
  const f = fixture(t);
  f.write(`${f.dirs[SHARED]}/src/main.ts`, 'not published\n');
  f.commit();
  assert.equal((await f.eligible()).status, 'deferred');
});

test('a missing or non-ancestor dependency tag is refused', async (t) => {
  const f = fixture(t);
  f.git('tag', '-d', `${SHARED}@1.0.0`);
  assert.equal((await f.eligible()).status, 'deferred');
  f.git('checkout', '--orphan', 'unrelated');
  f.commit();
  f.git('tag', `${SHARED}@1.0.0`);
  f.git('checkout', 'main');
  f.published.set('1.0.0', {
    ...f.published.get('1.0.0'),
    source: f.git('rev-parse', 'unrelated'),
  });
  assert.equal((await f.eligible()).status, 'deferred');
});

test('registry-only source and dependency updates retain both Studio component identities', async (t) => {
  const f = fixture(t);
  const before = await f.eligible();
  f.write(`${f.dirs[REGISTRY]}/src/main.ts`, 'new registry source\n');
  f.lock.snapshots['registry-parser@1.0.1'] = {};
  f.lock.packages['registry-parser@1.0.1'] = {
    resolution: { integrity: 'sha512-new-registry-fixture' },
  };
  f.lock.importers[f.dirs[REGISTRY]].dependencies['registry-parser'].version =
    '1.0.1';
  f.write('pnpm-lock.yaml', stringify(f.lock));
  f.change(REGISTRY);
  f.commit();
  f.releaseStudio();
  const after = await f.eligible();
  assert.equal(after.status, 'ready');
  for (const component of ['client', 'server', 'studio'])
    assert.equal(
      after.components[component].source,
      before.components[component].source,
    );
  assert.notEqual(
    after.components.registry.source,
    before.components.registry.source,
  );
  assert.notEqual(after.artifact, before.artifact);
});

test('client-only releases change the composite image and managed CDN while retaining the managed backend', async (t) => {
  const f = fixture(t);
  const before = await f.eligible();
  f.write(`${f.dirs[CLIENT]}/src/main.ts`, 'new client source\n');
  f.change(CLIENT);
  f.commit();
  f.releaseStudio();
  const after = await f.eligible();
  for (const component of ['client', 'studio'])
    assert.notEqual(
      after.components[component].source,
      before.components[component].source,
    );
  for (const component of ['server', 'registry'])
    assert.equal(
      after.components[component].source,
      before.components[component].source,
    );
});

test('shared RPC and sync changes invalidate every actual consumer', async (t) => {
  const f = fixture(t);
  const before = await f.eligible();
  f.write(`${f.dirs[SYNC]}/src/main.ts`, 'new sync source\n');
  f.change(SYNC);
  f.commit();
  f.releaseStudio();
  const sync = await f.eligible();
  assert.equal(sync.components.client.source, before.components.client.source);
  for (const component of ['server', 'registry', 'studio'])
    assert.notEqual(
      sync.components[component].source,
      before.components[component].source,
    );
  f.write(`${f.dirs[RPC]}/src/main.ts`, 'new RPC source\n');
  f.change(RPC);
  f.commit();
  f.releaseStudio();
  const rpc = await f.eligible();
  for (const component of ['client', 'server', 'studio'])
    assert.notEqual(
      rpc.components[component].source,
      sync.components[component].source,
    );
  assert.equal(rpc.components.registry.source, sync.components.registry.source);
});

for (const [path, value] of [
  ['apps/studio/Dockerfile', `FROM node:24-slim@sha256:${'b'.repeat(64)}\n`],
  [
    'apps/studio/docker-entrypoint.sh',
    '#!/bin/sh\nexec node --disable-proto=throw dist/index.js\n',
  ],
  [
    'apps/studio/Dockerfile.dockerignore',
    '.git\n**/node_modules\n**/local-only\n',
  ],
  [
    'apps/studio/deployment/installer/configuration-files.json',
    '["docker-compose.yml","deployment/backup.sh"]\n',
  ],
])
  test(`Studio image runtime input ${path} changes select the backend and composite image`, async (t) => {
    const f = fixture(t);
    const before = await f.eligible();
    f.write(path, value);
    f.commit();
    const after = await f.eligible();
    assert.equal(after.status, 'ready');
    assert.deepEqual(after.versions, before.versions);
    for (const component of ['server', 'studio'])
      assert.notEqual(
        after.components[component].source,
        before.components[component].source,
      );
    for (const component of ['client', 'registry'])
      assert.equal(
        after.components[component].source,
        before.components[component].source,
      );
    assert.notEqual(after.artifact, before.artifact);
  });

for (const path of [
  'apps/template-registry/Dockerfile',
  'apps/template-registry/Dockerfile.dockerignore',
])
  test(`registry image runtime input ${path} changes select only the registry image`, async (t) => {
    const f = fixture(t);
    const before = await f.eligible();
    f.write(path, `FROM node:24-slim@sha256:${'c'.repeat(64)}\n`);
    f.commit();
    const after = await f.eligible();
    assert.equal(after.status, 'ready');
    assert.deepEqual(after.versions, before.versions);
    assert.notEqual(
      after.components.registry.source,
      before.components.registry.source,
    );
    for (const component of ['client', 'server', 'studio'])
      assert.equal(
        after.components[component].source,
        before.components[component].source,
      );
    assert.notEqual(after.artifact, before.artifact);
  });

test('a shared deployment verifier change invalidates both backend images without a synthetic package version', async (t) => {
  const f = fixture(t);
  const before = await f.eligible();
  f.write(
    'scripts/verify-deployed-lock.mjs',
    'export const newVerifier = true;\n',
  );
  f.commit();
  const after = await f.eligible();
  assert.equal(after.status, 'ready');
  assert.deepEqual(after.versions, before.versions);
  assert.equal(after.components.client.source, before.components.client.source);
  for (const component of ['server', 'studio', 'registry'])
    assert.notEqual(
      after.components[component].source,
      before.components[component].source,
    );
});

test('shared Docker context filtering selects both backend images without changing client assets', async (t) => {
  const f = fixture(t);
  const before = await f.eligible();
  f.write('.dockerignore', '.git\n**/node_modules\n**/local-only\n');
  f.commit();
  const after = await f.eligible();
  assert.equal(after.status, 'ready');
  assert.deepEqual(after.versions, before.versions);
  for (const component of ['server', 'studio', 'registry'])
    assert.notEqual(
      after.components[component].source,
      before.components[component].source,
    );
  assert.equal(after.components.client.source, before.components.client.source);
  assert.notEqual(after.artifact, before.artifact);
});

for (const path of [
  'apps/studio/docker-compose.yml',
  'scripts/studio-install.mjs',
  'apps/studio/deployment/restore.sh',
  'apps/template-registry/deployment/compose.yml',
])
  test(`distribution-only ${path} changes require a new artifact without fabricated package versions`, async (t) => {
    const f = fixture(t);
    const before = await f.eligible();
    f.write(path, 'new distribution input\n');
    f.commit();
    const after = await f.eligible();
    assert.equal(after.status, 'ready');
    assert.deepEqual(after.versions, before.versions);
    assert.deepEqual(after.components, before.components);
    assert.notEqual(after.artifact, before.artifact);
  });

test('the committed lock graph must contain every selected dependency', async (t) => {
  const f = fixture(t);
  delete f.lock.snapshots['registry-parser@1.0.0'];
  f.write('pnpm-lock.yaml', stringify(f.lock));
  f.commit();
  await assert.rejects(f.eligible(), /Missing locked Studio dependency/);
});

test('unconsumed lockfile entries do not create a distribution release', async (t) => {
  const f = fixture(t);
  const before = await f.eligible();
  f.lock.packages['unrelated-website-library@2.0.0'] = {
    resolution: { integrity: 'sha512-unrelated' },
  };
  f.lock.snapshots['unrelated-website-library@2.0.0'] = {};
  f.write('pnpm-lock.yaml', stringify(f.lock));
  f.commit();
  const after = await f.eligible();
  assert.equal(after.artifact, before.artifact);
  assert.deepEqual(after.components, before.components);
});
