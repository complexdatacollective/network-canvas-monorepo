import {
  IMAGE_REPOSITORIES,
  sha256,
} from '../apps/studio/deployment/installer/release.mjs';

const OCI_INDEX = 'application/vnd.oci.image.index.v1+json';
const OCI_MANIFEST = 'application/vnd.oci.image.manifest.v1+json';
const OCI_CONFIG = 'application/vnd.oci.image.config.v1+json';
const DOCKER_INDEX =
  'application/vnd.docker.distribution.manifest.list.v2+json';
const DOCKER_MANIFEST = 'application/vnd.docker.distribution.manifest.v2+json';
const DOCKER_CONFIG = 'application/vnd.docker.container.image.v1+json';
const FAMILIES = new Map([
  [OCI_INDEX, { config: OCI_CONFIG, manifest: OCI_MANIFEST }],
  [DOCKER_INDEX, { config: DOCKER_CONFIG, manifest: DOCKER_MANIFEST }],
]);
const PLATFORMS = new Set(['linux/amd64', 'linux/arm64']);
const MAX_JSON_BYTES = 1024 * 1024;
const MAX_PLATFORM_SBOM_BYTES = 8 * 1024 * 1024;
const MAX_SBOM_BYTES = 40 * 1024 * 1024;
const MINIO_REPOSITORY = 'https://github.com/minio/minio';
const PLATFORM_PROPERTY = 'org.networkcanvas.studio.platform';
const CONFIGURATION_PROPERTY = 'org.networkcanvas.studio.configuration-digest';
const REPORT_HASH_PROPERTY = 'org.networkcanvas.studio.syft-report-sha256';
const REPORT_PROPERTY = 'org.networkcanvas.studio.syft-report-base64';

function ociDigest(bytes) {
  return `sha256:${sha256(bytes)}`;
}

function requireDigest(value, message) {
  if (typeof value !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(value)) {
    throw new Error(message);
  }
  return value;
}

function parseJson(bytes, message, maximum = MAX_JSON_BYTES) {
  if (!Buffer.isBuffer(bytes) || bytes.length > maximum) {
    throw new Error(message);
  }
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Error(message);
  }
}

function imageIdentity(image) {
  const at = image?.lastIndexOf('@');
  const repository =
    typeof at === 'number' && at > 0 ? image.slice(0, at) : undefined;
  const digest =
    typeof at === 'number' && at > 0 ? image.slice(at + 1) : undefined;
  if (
    !Object.values(IMAGE_REPOSITORIES).includes(repository) ||
    !requireDigest(
      digest,
      'SBOM subject is not an immutable controlled image reference.',
    )
  ) {
    throw new Error(
      'SBOM subject is not an immutable controlled image reference.',
    );
  }
  return { digest, repository };
}

function validateSyftReport({ bytes, image, platform, configuration }) {
  const report = parseJson(
    bytes,
    'Invalid platform CycloneDX report.',
    MAX_PLATFORM_SBOM_BYTES,
  );
  const component = report.metadata?.component;
  if (
    report.bomFormat !== 'CycloneDX' ||
    !/^1\.[5-9]$/.test(String(report.specVersion)) ||
    component?.type !== 'container' ||
    component.name !== `${image}#${platform}` ||
    component.version !== configuration
  ) {
    throw new Error(
      'Platform CycloneDX report does not bind its image configuration.',
    );
  }
  return report;
}

export function buildMultiPlatformCycloneDx({
  image,
  configurations,
  reports,
}) {
  const { digest, repository } = imageIdentity(image);
  if (
    !configurations ||
    !(reports instanceof Map) ||
    Object.keys(configurations).toSorted().join('\n') !==
      [...PLATFORMS].toSorted().join('\n') ||
    reports.size !== PLATFORMS.size
  ) {
    throw new Error('Incomplete platform CycloneDX evidence.');
  }
  const components = [...PLATFORMS].toSorted().map((platform) => {
    const configuration = requireDigest(
      configurations[platform],
      'Invalid platform image configuration.',
    );
    const report = reports.get(platform);
    const platformReport = validateSyftReport({
      bytes: report,
      image,
      platform,
      configuration,
    });
    return {
      'type': 'container',
      'bom-ref': `${image}#${platform}`,
      'name': `${repository}#${platform}`,
      'version': configuration,
      'components': Array.isArray(platformReport.components)
        ? platformReport.components
        : [],
      'properties': [
        { name: PLATFORM_PROPERTY, value: platform },
        { name: CONFIGURATION_PROPERTY, value: configuration },
        { name: REPORT_HASH_PROPERTY, value: sha256(report) },
        { name: REPORT_PROPERTY, value: report.toString('base64') },
      ],
    };
  });
  return Buffer.from(
    JSON.stringify({
      bomFormat: 'CycloneDX',
      specVersion: '1.6',
      version: 1,
      metadata: {
        component: {
          'type': 'container',
          'bom-ref': image,
          'name': repository,
          'version': digest,
          'hashes': [{ alg: 'SHA-256', content: digest.slice(7) }],
        },
      },
      components,
      dependencies: [
        {
          ref: image,
          dependsOn: components.map((component) => component['bom-ref']),
        },
      ],
    }),
  );
}

function requireBlob(blobs, descriptor, message) {
  requireDigest(descriptor?.digest, message);
  if (
    !Number.isSafeInteger(descriptor.size) ||
    descriptor.size < 0 ||
    descriptor.size > MAX_JSON_BYTES
  ) {
    throw new Error(message);
  }
  const bytes = blobs.get(descriptor.digest);
  if (
    !Buffer.isBuffer(bytes) ||
    bytes.length !== descriptor.size ||
    ociDigest(bytes) !== descriptor.digest
  ) {
    throw new Error(message);
  }
  return bytes;
}

export function deriveImageEvidence({ name, reference, manifestBytes, blobs }) {
  const repository = IMAGE_REPOSITORIES[name];
  if (!repository || reference !== repository) {
    throw new Error('Image reference is outside the controlled repositories.');
  }
  if (!(blobs instanceof Map)) {
    throw new Error('OCI evidence blobs must be a Map.');
  }

  const index = parseJson(manifestBytes, 'Invalid OCI image index.');
  const family = FAMILIES.get(index.mediaType);
  if (!family || index.schemaVersion !== 2 || !Array.isArray(index.manifests)) {
    throw new Error('Unexpected OCI index media type.');
  }

  const expectedBlobs = new Set();
  const configurations = {};
  for (const descriptor of index.manifests) {
    const platform = `${descriptor?.platform?.os}/${descriptor?.platform?.architecture}`;
    if (
      !PLATFORMS.has(platform) ||
      descriptor.platform.variant !== undefined ||
      configurations[platform] ||
      descriptor.mediaType !== family.manifest ||
      expectedBlobs.has(descriptor.digest)
    ) {
      throw new Error('Invalid OCI platform descriptor.');
    }
    const childBytes = requireBlob(
      blobs,
      descriptor,
      'OCI child manifest digest mismatch.',
    );
    expectedBlobs.add(descriptor.digest);
    const child = parseJson(childBytes, 'Invalid OCI child manifest.');
    if (
      child.schemaVersion !== 2 ||
      child.mediaType !== family.manifest ||
      child.config?.mediaType !== family.config
    ) {
      throw new Error('Unexpected OCI child manifest media type.');
    }
    const configBytes = requireBlob(
      blobs,
      child.config,
      'OCI config digest mismatch.',
    );
    expectedBlobs.add(child.config.digest);
    const config = parseJson(configBytes, 'Invalid OCI image configuration.');
    if (
      config.os !== descriptor.platform.os ||
      config.architecture !== descriptor.platform.architecture ||
      config.variant !== undefined
    ) {
      throw new Error('OCI configuration does not match its platform.');
    }
    configurations[platform] = child.config.digest;
  }

  if (
    Object.keys(configurations).length !== PLATFORMS.size ||
    [...PLATFORMS].some((platform) => !configurations[platform])
  ) {
    throw new Error('OCI index does not contain every required platform.');
  }
  if (
    blobs.size !== expectedBlobs.size ||
    [...blobs.keys()].some((key) => !expectedBlobs.has(key))
  ) {
    throw new Error('Extraneous OCI evidence blob.');
  }

  return {
    reference: `${reference}@${ociDigest(manifestBytes)}`,
    configurations,
  };
}

export function validateCycloneDx({ image, configurations, bytes }) {
  const { digest, repository } = imageIdentity(image);
  if (
    !configurations ||
    Object.keys(configurations).toSorted().join('\n') !==
      [...PLATFORMS].toSorted().join('\n')
  )
    throw new Error('Incomplete platform CycloneDX evidence.');
  const sbom = parseJson(bytes, 'Invalid CycloneDX SBOM.', MAX_SBOM_BYTES);
  const component = sbom.metadata?.component;
  const hasImageHash = component?.hashes?.some(
    (hash) =>
      hash.alg === 'SHA-256' && hash.content === digest.slice('sha256:'.length),
  );
  if (
    sbom.bomFormat !== 'CycloneDX' ||
    !/^1\.[5-9]$/.test(String(sbom.specVersion)) ||
    component?.type !== 'container' ||
    component['bom-ref'] !== image ||
    component.name !== repository ||
    component.version !== digest ||
    !hasImageHash ||
    !Array.isArray(sbom.components) ||
    sbom.components.length !== PLATFORMS.size
  ) {
    throw new Error(
      'CycloneDX SBOM does not bind the immutable image reference.',
    );
  }
  const seen = new Set();
  for (const platformComponent of sbom.components) {
    const rawProperties = Array.isArray(platformComponent?.properties)
      ? platformComponent.properties
      : [];
    const properties = new Map(
      rawProperties.map((property) => [property?.name, property?.value]),
    );
    const platform = properties.get(PLATFORM_PROPERTY);
    const configuration = properties.get(CONFIGURATION_PROPERTY);
    const encoded = properties.get(REPORT_PROPERTY);
    if (
      !PLATFORMS.has(platform) ||
      seen.has(platform) ||
      rawProperties.length !== 4 ||
      properties.size !== 4 ||
      ![
        PLATFORM_PROPERTY,
        CONFIGURATION_PROPERTY,
        REPORT_HASH_PROPERTY,
        REPORT_PROPERTY,
      ].every((name) => properties.has(name)) ||
      platformComponent.type !== 'container' ||
      platformComponent['bom-ref'] !== `${image}#${platform}` ||
      platformComponent.name !== `${repository}#${platform}` ||
      platformComponent.version !== configuration ||
      configuration !== configurations[platform] ||
      typeof encoded !== 'string'
    ) {
      throw new Error('Invalid platform CycloneDX evidence.');
    }
    const report = Buffer.from(encoded, 'base64');
    if (
      report.toString('base64') !== encoded ||
      sha256(report) !== properties.get(REPORT_HASH_PROPERTY)
    ) {
      throw new Error('Invalid platform CycloneDX evidence.');
    }
    requireDigest(configuration, 'Invalid platform CycloneDX evidence.');
    const platformReport = validateSyftReport({
      bytes: report,
      image,
      platform,
      configuration,
    });
    if (
      JSON.stringify(platformComponent.components) !==
      JSON.stringify(
        Array.isArray(platformReport.components)
          ? platformReport.components
          : [],
      )
    )
      throw new Error('Invalid platform CycloneDX evidence.');
    seen.add(platform);
  }
  if (seen.size !== PLATFORMS.size)
    throw new Error('Incomplete platform CycloneDX evidence.');
  return { sha256: sha256(bytes), format: 'cyclonedx-json', subject: image };
}

export function deriveMinioSourceEvidence(dockerfile) {
  const add =
    /^ADD --checksum=sha256:([a-f0-9]{64}) https:\/\/codeload\.github\.com\/minio\/minio\/tar\.gz\/([a-f0-9]{40}) \/source\.tar\.gz$/m.exec(
      dockerfile,
    );
  if (!add) {
    throw new Error('Missing immutable MinIO source archive.');
  }
  const [, archiveSha256, commit] = add;
  const revision = new RegExp(
    `org\\.opencontainers\\.image\\.revision="${commit}"`,
  ).test(dockerfile);
  const buildCommit = new RegExp(`cmd\\.CommitID=${commit}`).test(dockerfile);
  if (!revision || !buildCommit) {
    throw new Error('MinIO source commit is not consistently pinned.');
  }
  return { repository: MINIO_REPOSITORY, commit, sha256: archiveSha256 };
}
