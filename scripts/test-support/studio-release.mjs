import {
  IMAGE_REPOSITORIES,
  readRelease,
  sha256,
} from '../../apps/studio/deployment/installer/release.mjs';

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
          configurations: Object.fromEntries([
            [
              'linux/amd64',
              `sha256:${sha256(`config-${repository}-${source}`)}`,
            ],
          ]),
        },
      ]),
    ),
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
