import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { parse } from 'yaml';

const path = '.github/workflows/studio-release.yml';
const source = readFileSync(path, 'utf8');
const workflow = parse(source);
const release = workflow.jobs.release;

test('is a main-only manual workflow under one non-cancelling release lock', () => {
  assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch']);
  assert.deepEqual(workflow.concurrency, {
    'group': 'studio-distribution-release',
    'cancel-in-progress': false,
  });
  assert.deepEqual(workflow.permissions, {});
  assert.equal(
    release.if,
    "github.repository == 'complexdatacollective/network-canvas-monorepo' && github.ref == 'refs/heads/main'",
  );
  assert.deepEqual(release.permissions, {
    'actions': 'read',
    'contents': 'write',
    'id-token': 'write',
    'packages': 'write',
  });
});

test('pins checkout, QEMU, Buildx, BuildKit and the emulator image', () => {
  const serialized = JSON.stringify(release.steps);
  for (const expected of [
    'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
    'pnpm/setup@c9883cc79df532ad1a7b81bf9ab944ceb090d65c',
    'actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e',
    'docker/setup-qemu-action@96fe6ef7f33517b61c61be40b68a1882f3264fb8',
    'tonistiigi/binfmt:qemu-v10.0.4-56@sha256:30cc9a4d03765acac9be2ed0afc23af1ad018aed2c28ea4be8c2eb9afe03fbd1',
    'docker/setup-buildx-action@bb05f3f5519dd87d3ba754cc423b652a5edd6d2c',
    'moby/buildkit:v0.30.0@sha256:0168606be2315b7c807a03b3d8aa79beefdb31c98740cebdffdfeebf31190c9f',
    'v0.36.1',
  ])
    assert.match(serialized, new RegExp(expected.replaceAll('.', '\\.')));
  const checkout = release.steps[0];
  assert.deepEqual(checkout.with, {
    'fetch-depth': 0,
    'persist-credentials': false,
    'ref': '${{ github.sha }}',
  });
  assert.equal(
    release.steps.find(
      ({ name }) =>
        name ===
        'Install locked workspace dependencies without package scripts',
    )?.run,
    'pnpm install --frozen-lockfile --ignore-scripts',
  );
});

test('logs into GHCR before the concrete caller and always removes credentials', () => {
  const login = release.steps.find(
    ({ name }) => name === 'Authenticate the controlled image repositories',
  );
  const publish = release.steps.find(
    ({ name }) => name === 'Qualify and publish the exact distribution',
  );
  const logout = release.steps.find(
    ({ name }) => name === 'Remove registry credentials',
  );
  assert.equal(login.env.GH_TOKEN, '${{ github.token }}');
  assert.equal(
    login.run,
    `printf '%s' "$GH_TOKEN" | docker login ghcr.io --username "$GITHUB_ACTOR" --password-stdin`,
  );
  assert.deepEqual(publish, {
    name: 'Qualify and publish the exact distribution',
    env: {
      GH_TOKEN: '${{ github.token }}',
      STUDIO_OLDEST_SUPPORTED_SOURCE: '${{ inputs.oldest_supported_source }}',
    },
    run: 'node scripts/studio-distribution-release.mjs',
  });
  assert.deepEqual(logout, {
    name: 'Remove registry credentials',
    if: 'always()',
    run: 'docker logout ghcr.io',
  });
  assert.ok(release.steps.indexOf(login) < release.steps.indexOf(publish));
  assert.ok(release.steps.indexOf(publish) < release.steps.indexOf(logout));
});

test('workflow identity matches the immutable Sigstore verifier policy', () => {
  assert.match(source, /^name: Studio distribution release$/m);
  const releasePolicy = readFileSync(
    'apps/studio/deployment/installer/release.mjs',
    'utf8',
  );
  assert.match(
    releasePolicy,
    /\.github\/workflows\/studio-release\.yml@refs\/heads\/main/,
  );
});
