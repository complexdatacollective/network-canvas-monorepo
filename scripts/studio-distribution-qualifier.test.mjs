import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import test from 'node:test';

import {
  readRelease,
  sha256,
} from '../apps/studio/deployment/installer/release.mjs';
import { prepareStudioDistributionQualification } from './studio-distribution-qualifier.mjs';
import { installerFixture } from './test-support/studio-installer.mjs';
import {
  releasedDistribution,
  studioSbom,
} from './test-support/studio-release.mjs';

function signedRelease(generation, previous = []) {
  const release = releasedDistribution(generation, previous);
  const sboms = new Map(
    Object.entries(release.value.images).map(([name, image]) => {
      const body = studioSbom(image);
      release.value.evidence.sboms[name].sha256 = sha256(body);
      return [name, body];
    }),
  );
  const releaseBytes = Buffer.from(JSON.stringify(release.value));
  return {
    value: release.value,
    ...readRelease(releaseBytes),
    releaseBytes,
    sboms,
  };
}

function fixture(t) {
  const prior = signedRelease(1);
  const candidate = signedRelease(2, [prior]);
  const candidateInstaller = installerFixture(t, false, candidate);
  writeFileSync(
    `${candidateInstaller.directory}/release.json`,
    candidate.releaseBytes,
  );
  const priorInstaller = installerFixture(t, false, prior);
  writeFileSync(`${priorInstaller.directory}/release.json`, prior.releaseBytes);
  const candidateArchive = candidateInstaller.build().bytes;
  const priorArchive = priorInstaller.build().bytes;
  const artifacts = new Map([
    ['release.json', candidate.releaseBytes],
    [
      'release.sigstore.json',
      candidateInstaller.contents.get('release.sigstore.json'),
    ],
    ['installer.tar', candidateArchive],
    ['installer.sigstore.json', Buffer.from('{"candidate":"installer"}')],
    ...[...candidate.sboms].map(([name, body]) => [`${name}.cdx.json`, body]),
  ]);
  const assets = new Map([
    [`studio/${prior.current.source}/installer.tar`, priorArchive],
    [
      `studio/${prior.current.source}/installer.sigstore.json`,
      Buffer.from('{"prior":"installer"}'),
    ],
  ]);
  const calls = [];
  const input = {
    manifest: { release: candidate.release, current: candidate.current },
    artifacts,
    qualificationSources: [
      {
        release: prior.release,
        current: prior.current,
        releaseBytes: prior.releaseBytes,
        sboms: prior.sboms,
      },
    ],
    executables: {
      cosign: '/pinned/cosign',
      crane: '/pinned/crane',
      syft: '/pinned/syft',
    },
    store: {
      readAsset: async (tag, name) => assets.get(`${tag}/${name}`) ?? null,
    },
  };
  return {
    input,
    artifacts,
    assets,
    candidate,
    prior,
    calls,
    run: (overrides = {}) =>
      prepareStudioDistributionQualification(input, {
        run: (program, args, options) => calls.push({ program, args, options }),
        ...overrides,
      }),
  };
}

test('stages exact authenticated candidate and historical installers only after Cosign verification', async (t) => {
  const f = fixture(t);
  const prepared = await f.run();
  try {
    assert.equal(prepared.candidate.current.digest, f.candidate.current.digest);
    assert.equal(prepared.sources[0].current.digest, f.prior.current.digest);
    assert.deepEqual(
      prepared.sources.map(({ current }) => current.source),
      [f.prior.current.source],
    );
    assert.equal(f.calls.length, 2);
    assert.ok(
      f.calls.every(
        ({ program, options }) =>
          program === '/pinned/cosign' &&
          options.timeout === 300_000 &&
          options.killSignal === 'SIGKILL',
      ),
    );
    assert.equal(
      readFileSync(`${prepared.candidate.bundleDirectory}/release.json`).equals(
        f.candidate.releaseBytes,
      ),
      true,
    );
  } finally {
    const root = prepared.root;
    prepared.cleanup();
    assert.equal(existsSync(root), false);
  }
});

for (const defect of [
  'missing-candidate-member',
  'candidate-manifest',
  'candidate-source',
  'candidate-sbom',
  'missing-historical-installer',
  'historical-release',
  'installer-signature',
])
  test(`refuses ${defect} before qualification scenarios`, async (t) => {
    const f = fixture(t);
    if (defect === 'missing-candidate-member')
      f.artifacts.delete('registry.cdx.json');
    if (defect === 'candidate-manifest')
      f.input.manifest.current.digest = 'f'.repeat(64);
    if (defect === 'candidate-source')
      f.input.manifest.current.source = 'f'.repeat(40);
    if (defect === 'candidate-sbom')
      f.artifacts.set('studio.cdx.json', Buffer.from('{}'));
    if (defect === 'missing-historical-installer')
      f.assets.delete(`studio/${f.prior.current.source}/installer.tar`);
    if (defect === 'historical-release')
      f.input.qualificationSources[0].releaseBytes = Buffer.from('{}');
    const failure = new Error('synthetic Cosign refusal');
    await assert.rejects(
      () =>
        f.run(
          defect === 'installer-signature'
            ? {
                run: () => {
                  throw failure;
                },
              }
            : {},
        ),
      defect === 'installer-signature'
        ? /installer signature failed/
        : undefined,
    );
  });

test('a historical installer with valid structure but different bytes is refused', async (t) => {
  const f = fixture(t);
  const unrelated = signedRelease(3, [f.prior]);
  const installer = installerFixture(t, false, unrelated);
  writeFileSync(`${installer.directory}/release.json`, unrelated.releaseBytes);
  f.assets.set(
    `studio/${f.prior.current.source}/installer.tar`,
    installer.build().bytes,
  );
  await assert.rejects(f.run(), /independently selected release manifest/);
});

test('a failed historical installer signature refuses after candidate authentication', async (t) => {
  const f = fixture(t);
  let verifications = 0;
  await assert.rejects(
    () =>
      f.run({
        run: () => {
          verifications += 1;
          if (verifications === 2) throw new Error('historical refusal');
        },
      }),
    /installer signature failed/,
  );
  assert.equal(verifications, 2);
});
