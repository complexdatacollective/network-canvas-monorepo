import assert from 'node:assert/strict';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  IMAGE_REPOSITORIES,
  readRelease,
  sha256,
} from '../apps/studio/deployment/installer/release.mjs';
import { command } from '../apps/studio/deployment/installer/verify.mjs';
import { verifyStudioPublication } from './studio-publication-verification.mjs';
import { readStudioCandidate } from './studio-release-policy.mjs';
import { createStudioReleasePreparation } from './studio-release-preparation.mjs';
import {
  releasedDistribution,
  studioSbom,
} from './test-support/studio-release.mjs';

const candidate = readStudioCandidate(new URL('..', import.meta.url).pathname);
const IMAGE_NAMES = Object.keys(IMAGE_REPOSITORIES);
const compare = (left, right) => (left < right ? -1 : left > right ? 1 : 0);

function fixture() {
  const value = releasedDistribution().value;
  value.source = candidate.commit;
  value.artifact = sha256(`artifact-${candidate.commit}`);
  value.generation = 1;
  value.ancestors = [];
  value.upgrade.from = [];
  const sboms = new Map();
  for (const name of IMAGE_NAMES) {
    const bytes = studioSbom(value.images[name]);
    value.evidence.sboms[name].sha256 = sha256(bytes);
    sboms.set(name, bytes);
  }
  const gate = {
    eligibility: {
      status: 'ready',
      source: candidate.commit,
      artifact: value.artifact,
      versions: value.versions,
      components: Object.fromEntries(
        Object.entries(value.components).map(([name, source]) => [
          name,
          { source },
        ]),
      ),
    },
    ancestry: {
      status: 'ready',
      source: candidate.commit,
      generation: 1,
      ancestors: [],
    },
    minioSource: value.evidence.minioSource,
  };
  const checkpoints = new Map();
  const writes = [];
  let writeHook;
  const store = {
    ensured: [],
    async ensurePreparation(identity) {
      this.ensured.push(identity);
      return {
        async read(name) {
          return checkpoints.has(name)
            ? Buffer.from(checkpoints.get(name))
            : null;
        },
        async write(name, bytes) {
          writes.push(name);
          if (writeHook) await writeHook(name, bytes, checkpoints);
          if (checkpoints.has(name)) {
            assert.deepEqual(checkpoints.get(name), bytes);
          } else {
            checkpoints.set(name, Buffer.from(bytes));
          }
        },
      };
    },
  };
  const calls = [];
  let bundle = 0;
  const run = (program, args, options) => {
    calls.push({ program, args, options });
    assert.equal(program, 'cosign-fixture');
    if (args[0] === 'sign-blob' || args[0] === 'sign') {
      bundle += 1;
      const bundlePath = args[args.indexOf('--bundle') + 1];
      assert.equal(statSync(options.cwd).mode & 0o777, 0o700);
      if (args[0] === 'sign-blob')
        assert.equal(statSync(args.at(-1)).mode & 0o777, 0o600);
      const subject =
        args[0] === 'sign-blob'
          ? sha256(readFileSync(args.at(-1)))
          : args.at(-1);
      writeFileSync(
        bundlePath,
        JSON.stringify({ kind: args[0], subject, bundle }),
        { mode: 0o600 },
      );
    }
    if (args[0] === 'verify-blob') {
      assert.equal(statSync(args[1]).mode & 0o777, 0o600);
      assert.equal(
        statSync(args[args.indexOf('--bundle') + 1]).mode & 0o777,
        0o600,
      );
    }
    if (args[0].startsWith('verify')) {
      const bundlePath = args[args.indexOf('--bundle') + 1];
      let retained;
      try {
        retained = JSON.parse(readFileSync(bundlePath));
      } catch {
        throw new Error('corrupt retained signature fixture');
      }
      const subject =
        args[0] === 'verify-blob' ? sha256(readFileSync(args[1])) : args[1];
      if (
        retained.kind !== (args[0] === 'verify-blob' ? 'sign-blob' : 'sign') ||
        retained.subject !== subject
      )
        throw new Error('substituted retained signature fixture');
    }
    return 'fixed signer fixture';
  };
  let imagePreparations = 0;
  let preparedWith;
  const prepareImages = async (_input, options) => {
    imagePreparations += 1;
    preparedWith = options;
    return { images: value.images, sboms };
  };
  let manifests = 0;
  const buildManifest = async () => {
    manifests += 1;
    const bytes = Buffer.from(JSON.stringify(value));
    return { bytes, ...readRelease(bytes) };
  };
  const publications = [];
  const publishImages = async ({ evidence }, options) => {
    assert.equal(calls.at(-1)?.args[0], 'verify-blob');
    publications.push({ evidence, options });
  };
  function preparation(overrides = {}) {
    return createStudioReleasePreparation(
      { candidate, store },
      {
        cosign: 'cosign-fixture',
        run,
        prepareImages,
        publishImages,
        buildManifest,
        timeoutMs: 2_000,
        ...overrides,
      },
    );
  }
  return {
    calls,
    checkpoints,
    gate,
    preparation,
    publications,
    sboms,
    store,
    value,
    writes,
    get bundles() {
      return bundle;
    },
    get imagePreparations() {
      return imagePreparations;
    },
    get manifests() {
      return manifests;
    },
    get preparedWith() {
      return preparedWith;
    },
    set writeHook(hook) {
      writeHook = hook;
    },
  };
}

test('prepares exact publisher artifacts and authenticates six images with private bounded signer files', async () => {
  const f = fixture();
  const artifacts = await f.preparation()(f.gate);
  assert.deepEqual(
    [...artifacts.keys()].toSorted(compare),
    [
      'release.json',
      'release.sigstore.json',
      'installer.tar',
      'installer.sigstore.json',
      ...IMAGE_NAMES.map((name) => `${name}.cdx.json`),
    ].toSorted(compare),
  );
  assert.equal(f.imagePreparations, 1);
  assert.equal(f.manifests, 1);
  assert.equal(f.bundles, 9);
  assert.equal(f.calls.filter(({ args }) => args[0] === 'sign').length, 6);
  assert.equal(f.calls.filter(({ args }) => args[0] === 'verify').length, 6);
  for (const { args, options } of f.calls) {
    assert.equal(options.timeout, 2_000);
    assert.equal(options.killSignal, 'SIGKILL');
    if (args[0].startsWith('verify')) {
      assert.ok(args.includes('--certificate-identity'));
      assert.ok(args.includes('--certificate-oidc-issuer'));
    }
  }
  assert.deepEqual(f.store.ensured, [
    { source: candidate.commit, artifactSha256: f.value.artifact },
  ]);
  assert.equal(f.publications.length, 1);
  const finalVerification = [];
  verifyStudioPublication(artifacts, {
    cosign: 'cosign-fixture',
    run: (program, args) => finalVerification.push({ program, args }),
  });
  assert.equal(finalVerification.length, 8);
});

test('forwards the pinned image tools to preparation and canonical publication', async () => {
  const f = fixture();
  await f.preparation({
    crane: 'crane-fixture',
    docker: 'docker-fixture',
    syft: 'syft-fixture',
  })(f.gate);
  assert.equal(f.preparedWith.crane, 'crane-fixture');
  assert.equal(f.preparedWith.docker, 'docker-fixture');
  assert.equal(f.preparedWith.syft, 'syft-fixture');
  assert.equal(f.publications[0].options.crane, 'crane-fixture');
  assert.equal(f.publications[0].options.run, f.preparedWith.run);
});

test('an interrupted retry reuses exact retained image, SBOM, manifest, and release-signature bytes', async () => {
  const f = fixture();
  let interrupted = true;
  f.writeHook = async (name) => {
    if (name === 'installer.tar' && interrupted) {
      interrupted = false;
      throw new Error('runner interrupted');
    }
  };
  await assert.rejects(f.preparation()(f.gate), /runner interrupted/);
  const releaseSignature = Buffer.from(
    f.checkpoints.get('release.sigstore.json'),
  );
  const resumed = await f.preparation()(f.gate);
  assert.deepEqual(resumed.get('release.sigstore.json'), releaseSignature);
  assert.equal(f.imagePreparations, 1);
  assert.equal(f.manifests, 1);
  assert.equal(f.bundles, 9);
  assert.equal(f.publications.length, 2);
  assert.equal(
    f.writes.filter((name) => name === 'image-preparation.checkpoint.json')
      .length,
    1,
  );
  assert.equal(
    f.writes.filter((name) => name === 'release.sigstore.json').length,
    1,
  );
});

test('refuses wrong admission and altered or corrupt retained evidence without signing', async () => {
  const f = fixture();
  await assert.rejects(
    f.preparation()({
      ...f.gate,
      eligibility: { ...f.gate.eligibility, source: '0'.repeat(40) },
    }),
    /admitted source/,
  );
  assert.equal(f.store.ensured.length, 0);

  await f.preparation()(f.gate);
  const signed = f.calls.length;
  const alteredGate = {
    ...f.gate,
    eligibility: { ...f.gate.eligibility, artifact: 'a'.repeat(64) },
  };
  await assert.rejects(f.preparation()(alteredGate), /evidence is invalid/);
  assert.equal(f.calls.length, signed);

  f.checkpoints.set(
    'image-preparation.checkpoint.json',
    Buffer.from('{"format":1}'),
  );
  await assert.rejects(f.preparation()(f.gate), /checkpoint is invalid/);
  assert.equal(f.calls.length, signed);
});

test('never signs retained unsigned image evidence', async () => {
  const f = fixture();
  f.checkpoints.set(
    'image-preparation.json',
    Buffer.from('{"source":"untrusted"}'),
  );
  await assert.rejects(
    f.preparation()(f.gate),
    /Unsigned retained image preparation evidence cannot be trusted/,
  );
  assert.equal(f.imagePreparations, 0);
  assert.equal(f.calls.filter(({ args }) => args[0] === 'sign').length, 0);
});

test('a structurally valid substituted checkpoint cannot be authenticated or signed', async () => {
  const f = fixture();
  await f.preparation()(f.gate);
  const signed = f.calls.filter(({ args }) =>
    args[0].startsWith('sign'),
  ).length;
  const checkpoint = JSON.parse(
    f.checkpoints.get('image-preparation.checkpoint.json'),
  );
  const evidence = checkpoint.evidence;
  evidence.images.studio.reference = `${IMAGE_REPOSITORIES.studio}@sha256:${'9'.repeat(64)}`;
  evidence.images.studio.configurations = {
    'linux/amd64': `sha256:${'8'.repeat(64)}`,
    'linux/arm64': `sha256:${'7'.repeat(64)}`,
  };
  evidence.sboms.studio = studioSbom(evidence.images.studio).toString('base64');
  f.checkpoints.set(
    'image-preparation.checkpoint.json',
    Buffer.from(`${JSON.stringify(checkpoint)}\n`),
  );
  await assert.rejects(f.preparation()(f.gate), /signing command failed/);
  assert.equal(
    f.calls.filter(({ args }) => args[0].startsWith('sign')).length,
    signed,
  );
});

test('an interruption after atomic checkpoint retention resumes from its authenticated bytes', async () => {
  const f = fixture();
  let attempts = 0;
  const publishImages = async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('interrupted before canonical tags');
  };
  const prepare = f.preparation({ publishImages });
  await assert.rejects(prepare(f.gate), /interrupted before canonical tags/);
  const retained = Buffer.from(
    f.checkpoints.get('image-preparation.checkpoint.json'),
  );
  assert.equal(f.imagePreparations, 1);
  assert.equal(f.calls.filter(({ args }) => args[0] === 'sign').length, 0);
  await prepare(f.gate);
  assert.deepEqual(
    f.checkpoints.get('image-preparation.checkpoint.json'),
    retained,
  );
  assert.equal(f.imagePreparations, 1);
  assert.equal(attempts, 2);
});

test('refuses a corrupt retained signature without replacing it', async () => {
  const f = fixture();
  await f.preparation()(f.gate);
  f.checkpoints.set('release.sigstore.json', Buffer.from('corrupt'));
  const signs = f.calls.filter(({ args }) => args[0].startsWith('sign')).length;
  await assert.rejects(f.preparation()(f.gate), /signing command failed/);
  assert.equal(
    f.calls.filter(({ args }) => args[0].startsWith('sign')).length,
    signs,
  );
  assert.deepEqual(
    f.checkpoints.get('release.sigstore.json'),
    Buffer.from('corrupt'),
  );
});

test('a partial checkpoint write is refused on retry instead of regenerating evidence', async () => {
  const f = fixture();
  let partial = true;
  f.writeHook = async (name, bytes, checkpoints) => {
    if (name === 'image-preparation.checkpoint.json' && partial) {
      partial = false;
      checkpoints.set(name, bytes.subarray(0, 12));
      throw new Error('partial checkpoint write');
    }
  };
  await assert.rejects(f.preparation()(f.gate), /partial checkpoint write/);
  await assert.rejects(f.preparation()(f.gate), /checkpoint is invalid/);
  assert.equal(f.imagePreparations, 1);
  assert.equal(f.calls.filter(({ args }) => args[0] === 'sign').length, 0);
  assert.equal(f.checkpoints.has('release.json'), false);
});

test('a checkpoint signer timeout leaves no partial checkpoint or release artifacts', async (t) => {
  const f = fixture();
  const directory = mkdtempSync(join(tmpdir(), 'studio-signing-timeout-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const stalled = join(directory, 'cosign');
  writeFileSync(stalled, '#!/usr/bin/env node\nsetInterval(() => {}, 1000);\n');
  chmodSync(stalled, 0o755);
  const prepare = f.preparation({
    cosign: stalled,
    run: command,
    timeoutMs: 100,
  });
  const started = Date.now();
  await assert.rejects(prepare(f.gate), /signing command failed/);
  assert.ok(Date.now() - started < 2_000);
  assert.deepEqual([...f.checkpoints.keys()], []);
});
