import {
  IMAGE_REPOSITORIES,
  readRelease,
  sha256,
} from '../../apps/studio/deployment/installer/release.mjs';
import { buildMultiPlatformCycloneDx } from '../studio-image-evidence.mjs';

export function studioSbom(image) {
  const reports = new Map(
    Object.entries(image.configurations).map(([platform, configuration]) => [
      platform,
      Buffer.from(
        JSON.stringify({
          bomFormat: 'CycloneDX',
          specVersion: '1.6',
          metadata: {
            component: {
              'type': 'container',
              'bom-ref': 'opaque-syft-id',
              'name': `${image.reference}#${platform}`,
              'version': configuration,
            },
          },
        }),
      ),
    ]),
  );
  return buildMultiPlatformCycloneDx({
    image: image.reference,
    configurations: image.configurations,
    reports,
  });
}

export function releasedDistribution(generation = 1, previous = []) {
  const source = generation.toString(16).padStart(40, '0');
  const value = {
    format: 1,
    source,
    artifact: sha256(`artifact-${source}`),
    generation,
    ancestors: previous.map(({ current }) => current.source),
    versions: Object.fromEntries(
      [
        'studio-client',
        'studio-server',
        'studio-rpc',
        'studio-sync',
        'template-registry',
      ].map((name) => [`@codaco/${name}`, '0.1.0']),
    ),
    components: Object.fromEntries(
      ['client', 'server', 'studio', 'registry'].map((name) => [
        name,
        sha256(name + source),
      ]),
    ),
    images: Object.fromEntries(
      Object.entries(IMAGE_REPOSITORIES).map(([name, repository]) => [
        name,
        {
          reference: `${repository}@sha256:${sha256(repository + source)}`,
          configurations: Object.fromEntries(
            ['linux/amd64', 'linux/arm64'].map((platform) => [
              platform,
              `sha256:${sha256(`config-${platform}-${repository}-${source}`)}`,
            ]),
          ),
        },
      ]),
    ),
    evidence: {
      sboms: Object.fromEntries(
        Object.entries(IMAGE_REPOSITORIES).map(([name, repository]) => [
          name,
          {
            format: 'cyclonedx-json',
            subject: `${repository}@sha256:${sha256(repository + source)}`,
            sha256: sha256(`sbom-${name}-${source}`),
          },
        ]),
      ),
      minioSource: {
        repository: 'https://github.com/minio/minio',
        commit: '9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a',
        sha256:
          '45521908307306e925c98d629e1c17d78c8b72b6ee242b1bfb1409f7d8ee5841',
      },
    },
    schemas: Object.fromEntries(
      ['studio', 'registry'].map((name) => [
        name,
        {
          fingerprint: sha256(name),
          migrations: [
            { id: '0001_initial', checksum: sha256(`${name}-migration`) },
          ],
        },
      ]),
    ),
    postgresMajor: 18,
    upgrade: {
      strategy: 'offline',
      from: previous.map(({ current }) => current),
    },
  };
  return { value, ...readRelease(Buffer.from(JSON.stringify(value))) };
}
