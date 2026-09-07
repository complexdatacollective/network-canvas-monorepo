import {
  chmodSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import {
  IMAGE_REPOSITORIES,
  readRelease,
  sha256,
  signatureArguments,
} from '../apps/studio/deployment/installer/release.mjs';
import { command } from '../apps/studio/deployment/installer/verify.mjs';
import { validateCycloneDx } from './studio-image-evidence.mjs';
import { prepareStudioImages } from './studio-image-preparation.mjs';
import { readInstallerArchive } from './studio-installer-archive.mjs';
import { buildStudioInstaller } from './studio-installer-bundle.mjs';
import { buildStudioReleaseManifest } from './studio-release-manifest.mjs';

const SOURCE = /^[a-f0-9]{40}$/;
const HASH = /^[a-f0-9]{64}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const PLATFORMS = ['linux/amd64', 'linux/arm64'];
const IMAGE_NAMES = Object.keys(IMAGE_REPOSITORIES);
const EVIDENCE_LIMIT = 16 * 1024 * 1024;
const BUNDLE_LIMIT = 8 * 1024 * 1024;

function exactObject(value, keys, message) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).toSorted().join('\n') !== keys.toSorted().join('\n')
  )
    throw new Error(message);
}

function admitted(candidate, gate) {
  if (
    !candidate ||
    typeof candidate.cwd !== 'string' ||
    !SOURCE.test(candidate.commit) ||
    gate?.eligibility?.status !== 'ready' ||
    gate?.ancestry?.status !== 'ready' ||
    gate.eligibility.source !== candidate.commit ||
    gate.ancestry.source !== candidate.commit ||
    !HASH.test(gate.eligibility.artifact)
  )
    throw new Error('Studio release preparation requires an admitted source.');
  return {
    source: candidate.commit,
    artifactSha256: gate.eligibility.artifact,
  };
}

function fixedExecution(run, executable, args, { cwd, timeoutMs }) {
  try {
    return run(executable, args, {
      cwd,
      timeout: timeoutMs,
      killSignal: 'SIGKILL',
    });
  } catch {
    throw new Error('Studio release signing command failed.');
  }
}

function stage(directory, name, bytes) {
  const path = join(directory, name);
  writeFileSync(path, bytes, { flag: 'wx', mode: 0o600 });
  chmodSync(path, 0o600);
  return path;
}

function bundleBytes(path) {
  const metadata = lstatSync(path);
  if (!metadata.isFile() || metadata.isSymbolicLink())
    throw new Error('Studio release signature bundle is invalid.');
  chmodSync(path, 0o600);
  const bytes = readFileSync(path);
  if (!bytes.length || bytes.length > BUNDLE_LIMIT)
    throw new Error('Studio release signature bundle is invalid.');
  return bytes;
}

function retainedBundle(bytes) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > BUNDLE_LIMIT)
    throw new Error('Studio release signature bundle is invalid.');
  return bytes;
}

function withPrivateDirectory(callback) {
  const directory = mkdtempSync(join(tmpdir(), 'studio-release-signing-'));
  chmodSync(directory, 0o700);
  try {
    return callback(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function signBlob(bytes, { cosign, run, timeoutMs }) {
  return withPrivateDirectory((directory) => {
    const target = stage(directory, 'artifact', bytes);
    const bundle = join(directory, 'bundle.sigstore.json');
    fixedExecution(
      run,
      cosign,
      ['sign-blob', '--yes', '--bundle', bundle, target],
      { cwd: directory, timeoutMs },
    );
    return bundleBytes(bundle);
  });
}

function verifyBlob(bytes, bundleBytesValue, options) {
  withPrivateDirectory((directory) => {
    const target = stage(directory, 'artifact', bytes);
    const bundle = stage(
      directory,
      'bundle.sigstore.json',
      retainedBundle(bundleBytesValue),
    );
    fixedExecution(
      options.run,
      options.cosign,
      signatureArguments('blob', target, bundle),
      { cwd: directory, timeoutMs: options.timeoutMs },
    );
  });
}

function verifyImage(reference, signature, options) {
  withPrivateDirectory((directory) => {
    const bundle = stage(
      directory,
      'bundle.sigstore.json',
      retainedBundle(signature),
    );
    fixedExecution(
      options.run,
      options.cosign,
      [...signatureArguments('image', reference), '--bundle', bundle],
      { cwd: directory, timeoutMs: options.timeoutMs },
    );
  });
}

function signImage(reference, options) {
  return withPrivateDirectory((directory) => {
    const bundle = join(directory, 'bundle.sigstore.json');
    fixedExecution(
      options.run,
      options.cosign,
      ['sign', '--yes', '--bundle', bundle, reference],
      { cwd: directory, timeoutMs: options.timeoutMs },
    );
    return bundleBytes(bundle);
  });
}

function imageEvidenceBytes({ source, artifactSha256, images, sboms }) {
  exactObject(images, IMAGE_NAMES, 'Image preparation inventory is invalid.');
  if (
    !(sboms instanceof Map) ||
    sboms.size !== IMAGE_NAMES.length ||
    IMAGE_NAMES.some(
      (name) => !Buffer.isBuffer(sboms.get(name)) || !sboms.get(name).length,
    )
  )
    throw new Error('Image preparation inventory is invalid.');
  return Buffer.from(
    `${JSON.stringify({
      format: 1,
      source,
      artifactSha256,
      images,
      sboms: Object.fromEntries(
        IMAGE_NAMES.map((name) => [name, sboms.get(name).toString('base64')]),
      ),
    })}\n`,
  );
}

function readImageEvidence(bytes, identity) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > EVIDENCE_LIMIT)
    throw new Error('Retained image preparation evidence is invalid.');
  let value;
  try {
    value = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Error('Retained image preparation evidence is invalid.');
  }
  exactObject(
    value,
    ['format', 'source', 'artifactSha256', 'images', 'sboms'],
    'Retained image preparation evidence is invalid.',
  );
  exactObject(
    value.images,
    IMAGE_NAMES,
    'Retained image preparation evidence is invalid.',
  );
  exactObject(
    value.sboms,
    IMAGE_NAMES,
    'Retained image preparation evidence is invalid.',
  );
  if (
    value.format !== 1 ||
    value.source !== identity.source ||
    value.artifactSha256 !== identity.artifactSha256
  )
    throw new Error('Retained image preparation evidence is invalid.');
  const sboms = new Map();
  for (const name of IMAGE_NAMES) {
    const image = value.images[name];
    exactObject(
      image,
      ['reference', 'configurations'],
      'Retained image preparation evidence is invalid.',
    );
    exactObject(
      image.configurations,
      PLATFORMS,
      'Retained image preparation evidence is invalid.',
    );
    if (
      !image.reference.startsWith(`${IMAGE_REPOSITORIES[name]}@`) ||
      !DIGEST.test(
        image.reference.slice(IMAGE_REPOSITORIES[name].length + 1),
      ) ||
      PLATFORMS.some((platform) => !DIGEST.test(image.configurations[platform]))
    )
      throw new Error('Retained image preparation evidence is invalid.');
    const encoded = value.sboms[name];
    if (typeof encoded !== 'string')
      throw new Error('Retained image preparation evidence is invalid.');
    const sbom = Buffer.from(encoded, 'base64');
    if (!sbom.length || sbom.toString('base64') !== encoded)
      throw new Error('Retained image preparation evidence is invalid.');
    validateCycloneDx({ image: image.reference, bytes: sbom });
    sboms.set(name, sbom);
  }
  return { images: value.images, sboms };
}

function validateManifest(bytes, gate, evidence, upgradeFrom) {
  const manifest = readRelease(bytes);
  const { release, current } = manifest;
  if (
    current.source !== gate.eligibility.source ||
    release.artifact !== gate.eligibility.artifact ||
    current.generation !== gate.ancestry.generation ||
    !isDeepStrictEqual(
      release.ancestors.toSorted(),
      gate.ancestry.ancestors.toSorted(),
    ) ||
    !isDeepStrictEqual(release.images, evidence.images) ||
    !isDeepStrictEqual(release.evidence.minioSource, gate.minioSource) ||
    !isDeepStrictEqual(
      release.upgrade.from,
      upgradeFrom.toSorted(
        (a, b) =>
          a.generation - b.generation ||
          (a.source < b.source ? -1 : a.source > b.source ? 1 : 0),
      ),
    )
  )
    throw new Error('Retained release manifest differs from admission.');
  for (const [name, version] of Object.entries(release.versions))
    if (version !== gate.eligibility.versions[name])
      throw new Error('Retained release manifest differs from admission.');
  for (const [name, source] of Object.entries(release.components))
    if (source !== gate.eligibility.components[name]?.source)
      throw new Error('Retained release manifest differs from admission.');
  for (const name of IMAGE_NAMES) {
    if (
      release.evidence.sboms[name].sha256 !== sha256(evidence.sboms.get(name))
    )
      throw new Error('Retained release manifest differs from image evidence.');
  }
  return manifest;
}

function validateInstaller(bytes, release, signature) {
  const archive = readInstallerArchive(bytes, sha256(release));
  if (
    !archive.entries.get('release.json')?.equals(release) ||
    !archive.entries.get('release.sigstore.json')?.equals(signature)
  )
    throw new Error('Retained installer differs from release evidence.');
}

async function retain(checkpoint, name, bytes) {
  if (!Buffer.isBuffer(bytes) || !bytes.length)
    throw new Error('Cannot retain an empty preparation artifact.');
  await checkpoint.write(name, bytes);
  const retained = await checkpoint.read(name);
  if (!Buffer.isBuffer(retained) || !retained.equals(bytes))
    throw new Error('Preparation checkpoint failed exact readback.');
  return retained;
}

async function retainedOrCreate(checkpoint, name, create, validate) {
  let bytes = await checkpoint.read(name);
  if (bytes === null) {
    bytes = await create();
    if (!Buffer.isBuffer(bytes) || !bytes.length) {
      throw new Error('Preparation checkpoint contains invalid bytes.');
    }
    validate(bytes);
    await retain(checkpoint, name, bytes);
  } else if (!Buffer.isBuffer(bytes) || !bytes.length) {
    throw new Error('Preparation checkpoint contains invalid bytes.');
  } else {
    validate(bytes);
  }
  return bytes;
}

/** Compose the publisher's prepare(gate) boundary over private resumable state. */
export function createStudioReleasePreparation(
  { candidate, store, authenticatedPriorRelease, upgradeFrom = [] },
  {
    cosign = 'cosign',
    run = command,
    timeoutMs = 300_000,
    prepareImages = prepareStudioImages,
    buildManifest = buildStudioReleaseManifest,
    buildInstaller = buildStudioInstaller,
  } = {},
) {
  if (
    !store ||
    typeof store.ensurePreparation !== 'function' ||
    !Array.isArray(upgradeFrom) ||
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs <= 0
  )
    throw new Error('Studio release preparation is not configured.');

  return async function prepare(gate) {
    const identity = admitted(candidate, gate);
    const checkpoint = await store.ensurePreparation(identity);
    const signing = { cosign, run, timeoutMs };
    let evidenceBytes = await checkpoint.read('image-preparation.json');
    if (evidenceBytes === null) {
      const prepared = await prepareImages(
        {
          candidate,
          gate,
          authenticatedPriorRelease,
        },
        { timeoutMs },
      );
      evidenceBytes = imageEvidenceBytes({ ...identity, ...prepared });
      readImageEvidence(evidenceBytes, identity);
      await retain(checkpoint, 'image-preparation.json', evidenceBytes);
    }
    const evidence = readImageEvidence(evidenceBytes, identity);

    for (const name of IMAGE_NAMES) {
      const reference = evidence.images[name].reference;
      await retainedOrCreate(
        checkpoint,
        `${name}.image.sigstore.json`,
        async () => signImage(reference, signing),
        (bytes) => verifyImage(reference, bytes, signing),
      );
    }

    const release = await retainedOrCreate(
      checkpoint,
      'release.json',
      async () =>
        (
          await buildManifest({
            candidate,
            gate,
            images: evidence.images,
            sboms: evidence.sboms,
            upgradeFrom,
          })
        ).bytes,
      (bytes) => validateManifest(bytes, gate, evidence, upgradeFrom),
    );
    const releaseSignature = await retainedOrCreate(
      checkpoint,
      'release.sigstore.json',
      async () => signBlob(release, signing),
      (bytes) => verifyBlob(release, bytes, signing),
    );
    const installer = await retainedOrCreate(
      checkpoint,
      'installer.tar',
      async () =>
        buildInstaller({ candidate, release, signature: releaseSignature })
          .bytes,
      (bytes) => validateInstaller(bytes, release, releaseSignature),
    );
    const installerSignature = await retainedOrCreate(
      checkpoint,
      'installer.sigstore.json',
      async () => signBlob(installer, signing),
      (bytes) => verifyBlob(installer, bytes, signing),
    );

    return new Map([
      ['release.json', release],
      ['release.sigstore.json', releaseSignature],
      ['installer.tar', installer],
      ['installer.sigstore.json', installerSignature],
      ...IMAGE_NAMES.map((name) => [
        `${name}.cdx.json`,
        Buffer.from(evidence.sboms.get(name)),
      ]),
    ]);
  };
}
