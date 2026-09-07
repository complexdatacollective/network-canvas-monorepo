import assert from 'node:assert/strict';
import test from 'node:test';

import {
  readRelease,
  sha256,
} from '../apps/studio/deployment/installer/release.mjs';
import { publishReviewedStudioDistribution } from './studio-distribution-caller.mjs';
import { readStudioCandidate } from './studio-release-policy.mjs';
import { installerFixture } from './test-support/studio-installer.mjs';
import {
  releasedDistribution,
  studioSbom,
} from './test-support/studio-release.mjs';

function fixture(t) {
  const candidate = readStudioCandidate(process.cwd());
  const release = releasedDistribution();
  release.value.source = candidate.commit;
  const sboms = Object.entries(release.value.images).map(([name, image]) => {
    const bytes = studioSbom(image);
    release.value.evidence.sboms[name].sha256 = sha256(bytes);
    return [`${name}.cdx.json`, bytes];
  });
  Object.assign(
    release,
    readRelease(Buffer.from(JSON.stringify(release.value))),
  );
  const installer = installerFixture(t, false, release);
  const artifacts = new Map([
    ['release.json', installer.contents.get('release.json')],
    ['release.sigstore.json', installer.contents.get('release.sigstore.json')],
    ['installer.tar', installer.build().bytes],
    ['installer.sigstore.json', Buffer.from('{}')],
    ...sboms,
  ]);
  const gate = {
    eligibility: {
      status: 'ready',
      source: candidate.commit,
      artifact: release.value.artifact,
      versions: release.value.versions,
      components: Object.fromEntries(
        Object.entries(release.value.components).map(([name, source]) => [
          name,
          { source },
        ]),
      ),
    },
    ancestry: {
      status: 'ready',
      source: candidate.commit,
      generation: release.current.generation,
      ancestors: [],
    },
    minioSource: release.value.evidence.minioSource,
  };
  const prior = releasedDistribution(2);
  const history = {
    authenticatedPriorRelease: prior,
    upgradeFrom: [prior.current],
    qualificationSources: [prior],
  };
  const receipt = {
    verdict: 'passed',
    source: candidate.commit,
    manifestSha256: release.current.digest,
    freshInstall: true,
    populatedRecovery: true,
    upgrades: [
      { source: prior.current.source, manifestSha256: prior.current.digest },
    ],
  };
  const inputs = {
    cwd: process.cwd(),
    source: candidate.commit,
    executables: {
      cosign: '/pinned/cosign',
      crane: '/pinned/crane',
      syft: '/pinned/syft',
    },
    qualify: async (input) => {
      observed.qualification = input;
      return receipt;
    },
  };
  const observed = {
    fetches: 0,
    admissions: 0,
    reservations: 0,
    drafts: 0,
    published: 0,
  };
  const assets = new Map();
  const options = {
    run: (program, args, execution) => {
      assert.equal(program, 'git');
      assert.deepEqual(args, [
        'fetch',
        '--no-tags',
        'origin',
        '+refs/heads/main:refs/remotes/origin/main',
        'refs/tags/*:refs/tags/*',
      ]);
      assert.equal(execution.cwd, inputs.cwd);
      assert.equal(execution.timeout, 30_000);
      assert.equal(execution.killSignal, 'SIGKILL');
      observed.fetches += 1;
      return '';
    },
    evaluate: async (cwd, source) => {
      assert.equal(cwd, inputs.cwd);
      assert.equal(source, inputs.source);
      assert.ok(
        observed.fetches > observed.admissions,
        'each admission requires a fresh fetch',
      );
      observed.admissions += 1;
      return structuredClone(gate);
    },
    authenticate: async (input, tools) => {
      assert.equal(observed.reservations, 1);
      assert.equal(input.source, candidate.commit);
      assert.equal(input.store, options.store);
      assert.equal(tools.cosign, inputs.executables.cosign);
      observed.authenticated = true;
      return history;
    },
    prepare: (input, tools) => {
      assert.equal(observed.authenticated, true);
      assert.equal(input.candidate.commit, candidate.commit);
      assert.equal(input.authenticatedPriorRelease, prior);
      assert.deepEqual(input.upgradeFrom, [prior.current]);
      assert.equal(tools.cosign, inputs.executables.cosign);
      assert.equal(typeof tools.prepareImages, 'function');
      assert.equal(tools.crane, inputs.executables.crane);
      return async () => artifacts;
    },
    verify: async (bytes, tools) => {
      assert.equal(bytes, artifacts);
      assert.equal(tools.cosign, inputs.executables.cosign);
      observed.verified = true;
    },
    store: {
      reserve: async (source) => {
        assert.equal(source, candidate.commit);
        observed.reservations += 1;
      },
      ensureDraft: async () => {
        observed.drafts += 1;
      },
      readAsset: async (_tag, name) => assets.get(name) ?? null,
      uploadAsset: async (_tag, name, bytes) => {
        assert.equal(assets.has(name), false);
        assets.set(name, Buffer.from(bytes));
      },
      publish: async () => {
        observed.published += 1;
      },
    },
  };
  return {
    inputs,
    options,
    observed,
    assets,
    history,
    receipt,
    run: () => publishReviewedStudioDistribution(inputs, options),
  };
}

test('composes authenticated history, exact tool paths and all four fresh publication gates', async (t) => {
  const f = fixture(t);
  const result = await f.run();
  assert.equal(result.source, f.inputs.source);
  assert.equal(f.observed.admissions, 4);
  assert.equal(f.observed.fetches, 5);
  assert.equal(f.observed.verified, true);
  assert.equal(f.observed.published, 1);
  assert.equal(f.assets.size, 10);
  assert.equal(
    f.observed.qualification.qualificationSources,
    f.history.qualificationSources,
  );
  assert.deepEqual(f.observed.qualification.executables, f.inputs.executables);
});

for (const defect of [
  'missing',
  'wrong-source',
  'wrong-manifest',
  'no-fresh-install',
  'no-recovery',
  'omitted-upgrade',
])
  test(`refuses ${defect} qualification before exposing release assets`, async (t) => {
    const f = fixture(t);
    if (defect === 'missing') f.inputs.qualify = async () => undefined;
    if (defect === 'wrong-source') f.receipt.source = 'f'.repeat(40);
    if (defect === 'wrong-manifest') f.receipt.manifestSha256 = 'f'.repeat(64);
    if (defect === 'no-fresh-install') f.receipt.freshInstall = false;
    if (defect === 'no-recovery') f.receipt.populatedRecovery = false;
    if (defect === 'omitted-upgrade') f.receipt.upgrades = [];
    await assert.rejects(f.run, /qualification is incomplete/);
    assert.equal(f.observed.drafts, 0);
    assert.equal(f.assets.size, 0);
    assert.equal(f.observed.published, 0);
  });

for (const boundary of ['fetch', 'admission', 'history', 'verify', 'qualify'])
  test(`a failed ${boundary} boundary cannot publish`, async (t) => {
    const f = fixture(t);
    const failure = new Error(`synthetic ${boundary} failure`);
    const fail = () => {
      throw failure;
    };
    if (boundary === 'fetch') f.options.run = fail;
    if (boundary === 'admission') f.options.evaluate = fail;
    if (boundary === 'history') f.options.authenticate = fail;
    if (boundary === 'verify') f.options.verify = fail;
    if (boundary === 'qualify') f.inputs.qualify = fail;
    await assert.rejects(f.run, (error) => error === failure);
    assert.equal(f.observed.drafts, 0);
    assert.equal(f.observed.published, 0);
    if (['fetch', 'admission'].includes(boundary))
      assert.equal(f.observed.reservations, 0);
  });

test('a changed final admission refuses publication after exact draft readback', async (t) => {
  const f = fixture(t);
  const evaluate = f.options.evaluate;
  f.options.evaluate = async (...args) => {
    const gate = await evaluate(...args);
    if (f.observed.admissions === 4) gate.eligibility.status = 'deferred';
    return gate;
  };
  await assert.rejects(f.run, /publication is not admitted/);
  assert.equal(f.assets.size, 10);
  assert.equal(f.observed.published, 0);
});

test('missing qualification or unpinned executable names fail before I/O', async (t) => {
  const f = fixture(t);
  for (const inputs of [
    { ...f.inputs, qualify: undefined },
    { ...f.inputs, executables: { ...f.inputs.executables, cosign: 'cosign' } },
  ])
    await assert.rejects(
      () => publishReviewedStudioDistribution(inputs, f.options),
      /explicit qualified caller/,
    );
  assert.equal(f.observed.fetches, 0);
});
