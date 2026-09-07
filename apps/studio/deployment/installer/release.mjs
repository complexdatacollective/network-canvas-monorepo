import { createHash } from 'node:crypto';

// The operator obtains this policy independently with the installation guide.
// A downloaded manifest cannot select its own signer or transparency service.
export const RELEASE_IDENTITY =
  'https://github.com/complexdatacollective/network-canvas-monorepo/.github/workflows/studio-release.yml@refs/heads/main';
export const RELEASE_ISSUER = 'https://token.actions.githubusercontent.com';
export const IMAGE_REPOSITORIES = {
  studio: 'ghcr.io/complexdatacollective/studio',
  registry: 'ghcr.io/complexdatacollective/template-registry',
  postgres: 'ghcr.io/complexdatacollective/studio-postgres',
  traefik: 'ghcr.io/complexdatacollective/studio-traefik',
  minio: 'ghcr.io/complexdatacollective/studio-minio',
  minioClient: 'ghcr.io/complexdatacollective/studio-minio-client',
};
const PACKAGES = [
  'studio-client',
  'studio-server',
  'studio-rpc',
  'studio-sync',
  'template-registry',
].map((name) => `@codaco/${name}`);
const HASH = /^[a-f0-9]{64}$/;
const SOURCE = /^[a-f0-9]{40}$/;

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function object(value, keys) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).toSorted().join('\n') !== keys.toSorted().join('\n')
  )
    throw new Error('Unexpected release metadata.');
}

function identity(value) {
  object(value, ['source', 'digest', 'generation']);
  if (
    !SOURCE.test(value.source) ||
    !HASH.test(value.digest) ||
    !Number.isSafeInteger(value.generation) ||
    value.generation < 1
  )
    throw new Error('Invalid release identity.');
}

function unique(values, valid, limit) {
  if (
    !Array.isArray(values) ||
    values.length > limit ||
    !values.every(valid) ||
    new Set(values).size !== values.length
  )
    throw new Error('Invalid release inventory.');
}

function schema(value) {
  object(value, ['fingerprint', 'migrations']);
  if (
    !HASH.test(value.fingerprint) ||
    !Array.isArray(value.migrations) ||
    !value.migrations.length ||
    value.migrations.length > 9999
  )
    throw new Error('Invalid release schema.');
  value.migrations.forEach((migration, index) => {
    object(migration, ['id', 'checksum']);
    if (
      !new RegExp(`^${String(index + 1).padStart(4, '0')}_[a-z0-9_]+$`).test(
        migration.id,
      ) ||
      !HASH.test(migration.checksum)
    )
      throw new Error('Invalid release migration.');
  });
}

/** Parse exact signed bytes; callers verify the signature before trusting data. */
export function readRelease(bytes) {
  if (bytes.length > 4 * 1024 * 1024)
    throw new Error('Release metadata is too large.');
  const release = JSON.parse(bytes.toString('utf8'));
  object(release, [
    'format',
    'source',
    'artifact',
    'generation',
    'ancestors',
    'versions',
    'components',
    'images',
    'evidence',
    'schemas',
    'postgresMajor',
    'upgrade',
  ]);
  const current = {
    source: release.source,
    digest: sha256(bytes),
    generation: release.generation,
  };
  identity(current);
  if (
    release.format !== 1 ||
    !HASH.test(release.artifact) ||
    release.postgresMajor !== 18
  )
    throw new Error('Unsupported distribution format or PostgreSQL major.');
  unique(
    release.ancestors,
    (value) =>
      typeof value === 'string' &&
      SOURCE.test(value) &&
      value !== release.source,
    100_000,
  );
  object(release.versions, PACKAGES);
  if (
    !Object.values(release.versions).every(
      (version) =>
        typeof version === 'string' &&
        /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version),
    )
  )
    throw new Error('Release requires every stable component version.');
  object(release.components, ['client', 'server', 'studio', 'registry']);
  if (
    !Object.values(release.components).every(
      (value) => typeof value === 'string' && HASH.test(value),
    )
  )
    throw new Error('Missing component source identity.');
  object(release.images, Object.keys(IMAGE_REPOSITORIES));
  for (const [name, repository] of Object.entries(IMAGE_REPOSITORIES)) {
    const image = release.images[name];
    object(image, ['reference', 'configurations']);
    if (
      typeof image.reference !== 'string' ||
      !image.reference.startsWith(`${repository}@sha256:`) ||
      !HASH.test(image.reference.slice(repository.length + 8))
    )
      throw new Error(
        'Release image is outside the controlled immutable repositories.',
      );
    const configurations = image.configurations;
    if (
      !configurations ||
      typeof configurations !== 'object' ||
      Array.isArray(configurations) ||
      Object.keys(configurations).toSorted().join('\n') !==
        ['linux/amd64', 'linux/arm64'].join('\n') ||
      Object.values(configurations).some(
        (digest) =>
          typeof digest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(digest),
      )
    )
      throw new Error('Missing retained image configuration identity.');
  }
  object(release.evidence, ['sboms', 'minioSource']);
  object(release.evidence.sboms, Object.keys(IMAGE_REPOSITORIES));
  for (const name of Object.keys(IMAGE_REPOSITORIES)) {
    const sbom = release.evidence.sboms[name];
    object(sbom, ['format', 'subject', 'sha256']);
    if (
      sbom.format !== 'cyclonedx-json' ||
      sbom.subject !== release.images[name].reference ||
      typeof sbom.sha256 !== 'string' ||
      !HASH.test(sbom.sha256)
    )
      throw new Error('Every image requires its own exact CycloneDX SBOM.');
  }
  const material = release.evidence.minioSource;
  object(material, ['repository', 'commit', 'sha256']);
  if (
    material.repository !== 'https://github.com/minio/minio' ||
    typeof material.commit !== 'string' ||
    !SOURCE.test(material.commit) ||
    typeof material.sha256 !== 'string' ||
    !HASH.test(material.sha256)
  )
    throw new Error(
      'MinIO requires the immutable corresponding source archive.',
    );
  object(release.schemas, ['studio', 'registry']);
  schema(release.schemas.studio);
  schema(release.schemas.registry);
  object(release.upgrade, ['strategy', 'from']);
  if (
    release.upgrade.strategy !== 'offline' ||
    !Array.isArray(release.upgrade.from) ||
    release.upgrade.from.length > 20
  )
    throw new Error('An admission-blocking upgrade contract is required.');
  for (const prior of release.upgrade.from) {
    identity(prior);
    if (
      !release.ancestors.includes(prior.source) ||
      prior.generation >= release.generation
    )
      throw new Error('An upgrade source must precede this release.');
  }
  unique(
    release.upgrade.from.map(({ digest }) => digest),
    (value) => HASH.test(value),
    20,
  );
  return { release, current };
}

/** Highest accepted is durable even if a later operation or rollback fails. */
export function readState(bytes) {
  if (bytes.length > 16_384) throw new Error('Invalid release state.');
  const state = JSON.parse(bytes.toString('utf8'));
  if (
    !state ||
    typeof state !== 'object' ||
    Array.isArray(state) ||
    !['active,format,highest', 'active,format,highest,runtime'].includes(
      Object.keys(state ?? {})
        .toSorted()
        .join(','),
    )
  )
    throw new Error('Unexpected release metadata.');
  if (state.format !== 1) throw new Error('Unsupported release state.');
  identity(state.highest);
  if (state.active !== null) {
    identity(state.active);
    if (
      state.active.generation > state.highest.generation ||
      (state.active.generation === state.highest.generation &&
        (state.active.digest !== state.highest.digest ||
          state.active.source !== state.highest.source))
    )
      throw new Error('Inconsistent release state.');
  }
  const runtime = state.runtime ?? state.active;
  if ((state.active === null && runtime !== null) || (runtime && !state.active))
    throw new Error('Inconsistent runtime release state.');
  if (runtime !== null) identity(runtime);
  return { ...state, runtime };
}

/** No filesystem/service effects: all refusals precede acceptance and drain. */
export function acceptRelease(
  { release, current },
  state,
  { expectedDigest, recovery = false } = {},
) {
  // Requiring an independent digest on every invocation also protects an empty
  // host: no local high-water mark exists to detect replay on first install.
  if (
    typeof expectedDigest !== 'string' ||
    !HASH.test(expectedDigest) ||
    expectedDigest !== current.digest
  )
    throw new Error(
      'The release differs from the independently obtained manifest digest.',
    );
  if (state) {
    const highest = state.highest;
    if (highest.source === current.source) {
      if (
        highest.digest !== current.digest ||
        highest.generation !== current.generation
      )
        throw new Error(
          'A previously accepted source has different release bytes.',
        );
    } else if (
      !recovery &&
      (current.generation <= highest.generation ||
        !release.ancestors.includes(highest.source))
    ) {
      throw new Error('Release replay or unrelated ancestry refused.');
    }
    if (
      state.active &&
      state.active.digest !== current.digest &&
      !recovery &&
      !release.upgrade.from.some(
        (prior) =>
          prior.digest === state.active.digest &&
          prior.source === state.active.source &&
          prior.generation === state.active.generation,
      )
    )
      throw new Error(
        'Unsupported skipped upgrade hop; install a qualified intermediate release.',
      );
  }
  // Recovery may select older data/images, but cannot erase newer acceptance.
  const highest =
    !state || current.generation > state.highest.generation
      ? current
      : state.highest;
  return {
    format: 1,
    highest,
    active: state?.active ?? null,
    runtime: state?.runtime ?? null,
  };
}

export function activateRelease(
  state,
  current,
  { recovery = false, runtime = current } = {},
) {
  identity(current);
  identity(runtime);
  if (
    current.generation > state.highest.generation ||
    (current.generation === state.highest.generation &&
      (current.digest !== state.highest.digest ||
        current.source !== state.highest.source)) ||
    (!recovery && current.digest !== state.highest.digest)
  )
    throw new Error('Cannot activate an unaccepted release.');
  if (
    runtime.digest !== current.digest &&
    (!state.runtime ||
      runtime.digest !== state.runtime.digest ||
      runtime.source !== state.runtime.source ||
      runtime.generation !== state.runtime.generation)
  )
    throw new Error('Cannot retain an unverified runtime release.');
  return { ...state, active: current, runtime };
}

/** Both manifest and image verification pin the same fixed workflow/issuer. */
export function signatureArguments(kind, target, bundle) {
  if (!['blob', 'image'].includes(kind))
    throw new Error('Invalid signature kind.');
  return [
    kind === 'blob' ? 'verify-blob' : 'verify',
    target,
    ...(kind === 'blob' ? ['--bundle', bundle] : []),
    '--certificate-identity',
    RELEASE_IDENTITY,
    '--certificate-oidc-issuer',
    RELEASE_ISSUER,
  ];
}
