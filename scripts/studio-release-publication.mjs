import { isDeepStrictEqual } from 'node:util';

import {
  IMAGE_REPOSITORIES,
  readRelease,
  sha256,
} from '../apps/studio/deployment/installer/release.mjs';
import { validateCycloneDx } from './studio-image-evidence.mjs';
import { readInstallerArchive } from './studio-installer-archive.mjs';

const imageNames = Object.keys(IMAGE_REPOSITORIES);
const compareNames = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function same(actual, expected, message) {
  if (!isDeepStrictEqual(actual, expected)) throw new Error(message);
}

/** A publication adapter supplies fresh policy and ancestry checks while the
 * workflow holds the distribution lock. No build, signing or release mutation
 * can precede that first gate; the same gates run again before public release. */
async function admission(adapter, source) {
  const { eligibility, ancestry, minioSource } =
    await adapter.admission(source);
  if (
    eligibility.status !== 'ready' ||
    ancestry.status !== 'ready' ||
    eligibility.source !== source ||
    ancestry.source !== source
  )
    throw new Error('Distribution publication is not admitted.');
  return { eligibility, ancestry, minioSource };
}

/** Bind artifacts to freshly evaluated release policy, never just a cached build
 * success. The archive parser checks exact manifest bytes and every installer
 * file; trusted Cosign verification is separately mandatory before publication. */
function validateArtifacts(artifacts, gate) {
  if (!(artifacts instanceof Map))
    throw new Error('Missing distribution artifacts.');
  const names = [
    'release.json',
    'release.sigstore.json',
    'installer.tar',
    'installer.sigstore.json',
    ...imageNames.map((name) => `${name}.cdx.json`),
  ].toSorted(compareNames);
  same(
    [...artifacts.keys()].toSorted(compareNames),
    names,
    'Unexpected distribution asset inventory.',
  );
  let total = 0;
  for (const bytes of artifacts.values()) {
    if (
      !Buffer.isBuffer(bytes) ||
      !bytes.length ||
      bytes.length > 64 * 1024 * 1024
    )
      throw new Error('Invalid distribution asset.');
    total += bytes.length;
  }
  if (total > 384 * 1024 * 1024)
    throw new Error('Distribution assets are too large.');
  const manifest = readRelease(artifacts.get('release.json'));
  const { release, current } = manifest;
  const { eligibility, ancestry } = gate;
  same(
    release.evidence.minioSource,
    gate.minioSource,
    'MinIO source differs from its committed build inputs.',
  );
  if (
    current.source !== eligibility.source ||
    release.artifact !== eligibility.artifact ||
    current.generation !== ancestry.generation
  )
    throw new Error('Distribution artifacts differ from the admitted source.');
  same(
    release.ancestors.toSorted(),
    ancestry.ancestors.toSorted(),
    'Distribution ancestry changed.',
  );
  for (const [name, version] of Object.entries(release.versions)) {
    if (version !== eligibility.versions[name])
      throw new Error('Distribution package versions changed.');
  }
  for (const [name, hash] of Object.entries(release.components)) {
    if (hash !== eligibility.components[name]?.source)
      throw new Error('Distribution component source changed.');
  }
  for (const name of imageNames) {
    const bytes = artifacts.get(`${name}.cdx.json`);
    if (sha256(bytes) !== release.evidence.sboms[name].sha256)
      throw new Error('Distribution SBOM differs from its signed identity.');
    validateCycloneDx({
      image: release.images[name].reference,
      configurations: release.images[name].configurations,
      bytes,
    });
  }
  const archive = readInstallerArchive(
    artifacts.get('installer.tar'),
    current.digest,
  );
  for (const name of ['release.json', 'release.sigstore.json']) {
    if (!archive.entries.get(name)?.equals(artifacts.get(name)))
      throw new Error('Installer contains different release evidence.');
  }
  return manifest;
}

/**
 * Publish one exact source under the workflow's non-cancelling lock. Adapter
 * methods are concrete I/O boundaries: reserve creates a non-replaceable source
 * tag; prepare reconciles existing signed build outputs; read/upload expose
 * immutable draft assets; verify authenticates the fixed workflow identity for
 * both blobs and all six images. No method may use delete-and-reupload.
 *
 * An interrupted current release resumes by comparing exact bytes, including
 * non-deterministic signature bundles. A newer reserved source prevents an
 * older run from creating or completing a release, even if images are reused.
 */
export async function publishStudioDistribution({ source }, adapter) {
  if (typeof source !== 'string' || !/^[a-f0-9]{40}$/.test(source))
    throw new Error('A full release source is required.');
  const first = await admission(adapter, source);
  await adapter.reserve(source);
  const artifacts = await adapter.prepare(first);
  validateArtifacts(artifacts, first);
  await adapter.verify(artifacts);
  const finalGate = await admission(adapter, source);
  const manifest = validateArtifacts(artifacts, finalGate);
  // Qualification may consume or annotate its inputs. Keep the authenticated
  // publication bytes and identity private to this state machine.
  await adapter.qualify(
    structuredClone(manifest),
    new Map([...artifacts].map(([name, bytes]) => [name, Buffer.from(bytes)])),
  );
  // Qualification can be long-running. Re-check publication and ancestry after
  // it, including a dependency publication that was withdrawn in the meantime.
  validateArtifacts(artifacts, await admission(adapter, source));
  const tag = `studio/${source}`;
  await adapter.ensureDraft({
    tag,
    source,
    manifestSha256: manifest.current.digest,
  });
  for (const [name, bytes] of artifacts) {
    const existing = await adapter.readAsset(tag, name);
    if (existing !== null) {
      if (!Buffer.isBuffer(existing) || !existing.equals(bytes))
        throw new Error('An immutable release asset has different bytes.');
    } else {
      await adapter.uploadAsset(tag, name, bytes);
    }
  }
  // Successful upload status is insufficient: read back every byte before the
  // draft becomes public. A partial or corrupt upload remains unpublished.
  for (const [name, bytes] of artifacts) {
    const retained = await adapter.readAsset(tag, name);
    if (!Buffer.isBuffer(retained) || !retained.equals(bytes))
      throw new Error('A retained release asset failed readback verification.');
  }
  validateArtifacts(artifacts, await admission(adapter, source));
  await adapter.publish({
    tag,
    source,
    manifestSha256: manifest.current.digest,
  });
  return { source, tag, manifestSha256: manifest.current.digest };
}
