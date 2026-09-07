import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { sha256 } from '../apps/studio/deployment/installer/release.mjs';
import {
  deriveImageEvidence,
  deriveMinioSourceEvidence,
  validateCycloneDx,
} from './studio-image-evidence.mjs';

const OCI = {
  config: 'application/vnd.oci.image.config.v1+json',
  index: 'application/vnd.oci.image.index.v1+json',
  manifest: 'application/vnd.oci.image.manifest.v1+json',
};
const DOCKER = {
  config: 'application/vnd.docker.container.image.v1+json',
  index: 'application/vnd.docker.distribution.manifest.list.v2+json',
  manifest: 'application/vnd.docker.distribution.manifest.v2+json',
};
const studio = 'ghcr.io/complexdatacollective/studio';
const digest = (bytes) => `sha256:${sha256(bytes)}`;

function descriptor(mediaType, bytes, platform) {
  return {
    mediaType,
    digest: digest(bytes),
    size: bytes.length,
    ...(platform ? { platform } : {}),
  };
}

function evidenceFixture(family = OCI) {
  const blobs = new Map();
  const descriptors = ['amd64', 'arm64'].map((architecture) => {
    const config = Buffer.from(JSON.stringify({ architecture, os: 'linux' }));
    const configDescriptor = descriptor(family.config, config);
    blobs.set(configDescriptor.digest, config);
    const child = Buffer.from(
      JSON.stringify({
        mediaType: family.manifest,
        schemaVersion: 2,
        config: configDescriptor,
      }),
    );
    const childDescriptor = descriptor(family.manifest, child, {
      architecture,
      os: 'linux',
    });
    blobs.set(childDescriptor.digest, child);
    return childDescriptor;
  });
  const manifestBytes = Buffer.from(
    JSON.stringify({
      mediaType: family.index,
      schemaVersion: 2,
      manifests: descriptors,
    }),
  );
  return { blobs, manifestBytes };
}

function derive(fixture = evidenceFixture()) {
  return deriveImageEvidence({ name: 'studio', reference: studio, ...fixture });
}

function sameLengthMutation(bytes) {
  const copy = Buffer.from(bytes);
  copy[copy.length - 1] ^= 1;
  return copy;
}

test('derives immutable controlled evidence for OCI and Docker manifest families', () => {
  for (const family of [OCI, DOCKER]) {
    const fixture = evidenceFixture(family);
    const result = derive(fixture);
    assert.equal(
      result.reference,
      `${studio}@${digest(fixture.manifestBytes)}`,
    );
    assert.deepEqual(Object.keys(result.configurations).toSorted(), [
      'linux/amd64',
      'linux/arm64',
    ]);
  }
});

test('rejects controlled-name and repository metadata mismatches', () => {
  const fixture = evidenceFixture();
  assert.throws(
    () =>
      deriveImageEvidence({
        name: 'studio',
        reference: 'ghcr.io/example/studio',
        ...fixture,
      }),
    /outside the controlled repositories/,
  );
  assert.throws(
    () =>
      deriveImageEvidence({ name: 'unknown', reference: studio, ...fixture }),
    /controlled/,
  );
});

test('rejects same-length OCI child and configuration hash mismatches', () => {
  const fixture = evidenceFixture();
  const [childDigest] = [...fixture.blobs.keys()].filter((key) => {
    return (
      JSON.parse(fixture.blobs.get(key).toString()).mediaType === OCI.manifest
    );
  });
  fixture.blobs.set(
    childDigest,
    sameLengthMutation(fixture.blobs.get(childDigest)),
  );
  assert.throws(() => derive(fixture), /child manifest digest mismatch/);

  const configFixture = evidenceFixture();
  const [configDigest] = [...configFixture.blobs.keys()].filter((key) => {
    return JSON.parse(configFixture.blobs.get(key).toString()).architecture;
  });
  configFixture.blobs.set(
    configDigest,
    sameLengthMutation(configFixture.blobs.get(configDigest)),
  );
  assert.throws(() => derive(configFixture), /config digest mismatch/);
});

test('rejects missing, duplicate, extraneous, variant, and unsupported platforms', () => {
  const missing = evidenceFixture();
  const index = JSON.parse(missing.manifestBytes);
  index.manifests.pop();
  missing.manifestBytes = Buffer.from(JSON.stringify(index));
  assert.throws(() => derive(missing), /every required platform/);

  const duplicate = evidenceFixture();
  const duplicateIndex = JSON.parse(duplicate.manifestBytes);
  duplicateIndex.manifests.push(duplicateIndex.manifests[0]);
  duplicate.manifestBytes = Buffer.from(JSON.stringify(duplicateIndex));
  assert.throws(() => derive(duplicate), /platform descriptor/);

  const variant = evidenceFixture();
  const variantIndex = JSON.parse(variant.manifestBytes);
  variantIndex.manifests[0].platform.variant = 'v8';
  variant.manifestBytes = Buffer.from(JSON.stringify(variantIndex));
  assert.throws(() => derive(variant), /platform descriptor/);

  const unsupported = evidenceFixture();
  const unsupportedIndex = JSON.parse(unsupported.manifestBytes);
  unsupportedIndex.manifests[1].platform.architecture = 's390x';
  unsupported.manifestBytes = Buffer.from(JSON.stringify(unsupportedIndex));
  assert.throws(() => derive(unsupported), /platform descriptor/);

  const extra = evidenceFixture();
  extra.blobs.set(digest(Buffer.from('extra')), Buffer.from('extra'));
  assert.throws(() => derive(extra), /Extraneous OCI evidence blob/);
});

test('rejects wrong schema, media type, configuration, and oversized JSON blobs', () => {
  const wrongSchema = evidenceFixture();
  const index = JSON.parse(wrongSchema.manifestBytes);
  index.schemaVersion = 1;
  wrongSchema.manifestBytes = Buffer.from(JSON.stringify(index));
  assert.throws(() => derive(wrongSchema), /index media type/);

  const wrongMedia = evidenceFixture();
  const mediaIndex = JSON.parse(wrongMedia.manifestBytes);
  mediaIndex.manifests[0].mediaType = DOCKER.manifest;
  wrongMedia.manifestBytes = Buffer.from(JSON.stringify(mediaIndex));
  assert.throws(() => derive(wrongMedia), /platform descriptor/);

  const oversized = evidenceFixture();
  oversized.manifestBytes = Buffer.alloc(1024 * 1024 + 1, 32);
  assert.throws(() => derive(oversized), /Invalid OCI image index/);

  const wrongConfig = evidenceFixture();
  const configIndex = JSON.parse(wrongConfig.manifestBytes);
  const config = Buffer.from(
    JSON.stringify({ architecture: 'arm64', os: 'linux' }),
  );
  const child = Buffer.from(
    JSON.stringify({
      mediaType: OCI.manifest,
      schemaVersion: 2,
      config: descriptor(OCI.config, config),
    }),
  );
  const childDescriptor = descriptor(OCI.manifest, child, {
    architecture: 'amd64',
    os: 'linux',
  });
  const oldChild = configIndex.manifests[0];
  const oldConfig = JSON.parse(
    wrongConfig.blobs.get(oldChild.digest).toString(),
  ).config.digest;
  configIndex.manifests[0] = childDescriptor;
  wrongConfig.blobs.delete(oldChild.digest);
  wrongConfig.blobs.delete(oldConfig);
  wrongConfig.blobs.set(digest(config), config);
  wrongConfig.blobs.set(digest(child), child);
  wrongConfig.manifestBytes = Buffer.from(JSON.stringify(configIndex));
  assert.throws(() => derive(wrongConfig), /does not match its platform/);
});

test('checks CycloneDX container identity, image hash, and controlled subject', () => {
  const image = derive().reference;
  const bytes = Buffer.from(
    JSON.stringify({
      bomFormat: 'CycloneDX',
      specVersion: '1.6',
      metadata: {
        component: {
          'bom-ref': image,
          'hashes': [
            {
              alg: 'SHA-256',
              content: image.slice(image.lastIndexOf(':') + 1),
            },
          ],
          'type': 'container',
        },
      },
    }),
  );
  assert.deepEqual(validateCycloneDx({ image, bytes }), {
    format: 'cyclonedx-json',
    sha256: sha256(bytes),
    subject: image,
  });
  assert.throws(
    () =>
      validateCycloneDx({
        image: image.replace(studio, 'ghcr.io/example/studio'),
        bytes,
      }),
    /controlled image reference/,
  );
  assert.throws(
    () => validateCycloneDx({ image, bytes: Buffer.from('{}') }),
    /does not bind/,
  );
});

test('derives MinIO source evidence only from its pinned archive and matching revisions', () => {
  const dockerfile = readFileSync(
    'apps/studio/deployment/minio.Dockerfile',
    'utf8',
  );
  assert.deepEqual(deriveMinioSourceEvidence(dockerfile), {
    commit: '9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a',
    repository: 'https://github.com/minio/minio',
    sha256: '45521908307306e925c98d629e1c17d78c8b72b6ee242b1bfb1409f7d8ee5841',
  });
  assert.throws(
    () =>
      deriveMinioSourceEvidence(
        dockerfile.replace('cmd.CommitID=9e49', 'cmd.CommitID=00000'),
      ),
    /not consistently pinned/,
  );
});
