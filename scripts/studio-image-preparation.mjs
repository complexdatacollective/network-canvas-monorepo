import {
  IMAGE_REPOSITORIES,
  readRelease,
} from '../apps/studio/deployment/installer/release.mjs';
import { command } from '../apps/studio/deployment/installer/verify.mjs';
import {
  acquireImageEvidence,
} from './studio-image-registry.mjs';
import { validateCycloneDx } from './studio-image-evidence.mjs';

const PLATFORMS = 'linux/amd64,linux/arm64';
const SOURCE = /^[a-f0-9]{40}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;

function imageTag(name, source) {
  return `${IMAGE_REPOSITORIES[name]}:build-${source}`;
}

function sourceImage(value) {
  if (
    typeof value !== 'string' ||
    !/^(?:[a-z0-9.-]+(?::[0-9]{1,5})?\/)?[a-z0-9][a-z0-9._/-]*(?::[A-Za-z0-9._-]+)?@sha256:[a-f0-9]{64}$/.test(
      value,
    )
  )
    throw new Error('Studio image build inputs are not immutably pinned.');
  return value;
}

function execution(run, executable, args, { cwd, timeoutMs }) {
  try {
    return run(executable, args, {
      timeout: timeoutMs,
      killSignal: 'SIGKILL',
      cwd,
    });
  } catch {
    throw new Error('Studio image preparation command failed.');
  }
}

function upstreamImages(candidate) {
  const compose = candidate.read('apps/studio/docker-compose.yml');
  const service = (name) => {
    const image = new RegExp(
      `^  ${name}:\\n    image: ([^\\n]+)$`,
      'm',
    ).exec(compose)?.[1];
    return sourceImage(image);
  };
  return {
    postgres: service('postgres'),
    traefik: service('traefik'),
    minioClient: service('minio-init'),
  };
}

function priorRelease(value) {
  if (value === undefined) return null;
  if (
    !value ||
    !Buffer.isBuffer(value.releaseBytes) ||
    !(value.sboms instanceof Map)
  )
    throw new Error('Authenticated prior release evidence is invalid.');
  const prior = readRelease(value.releaseBytes);
  for (const name of Object.keys(IMAGE_REPOSITORIES)) {
    const bytes = value.sboms.get(name);
    if (!Buffer.isBuffer(bytes)) {
      throw new Error('Authenticated prior release evidence is invalid.');
    }
    validateCycloneDx({
      image: prior.release.images[name].reference,
      bytes,
    });
  }
  return { release: prior.release, sboms: value.sboms };
}

/** Build or copy the six controlled images only from a clean, admitted source.
 * The caller owns image-tag reservation and supplies any prior release only
 * after its signatures and retained artifact bytes have been authenticated. */
export async function prepareStudioImages(
  { candidate, gate, authenticatedPriorRelease },
  {
    docker = 'docker',
    crane = 'crane',
    syft = 'syft',
    run = command,
    acquire = acquireImageEvidence,
    timeoutMs = 300_000,
  } = {},
) {
  if (
    !candidate ||
    typeof candidate.cwd !== 'string' ||
    !SOURCE.test(candidate.commit) ||
    gate?.eligibility?.status !== 'ready' ||
    gate.eligibility.source !== candidate.commit ||
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs <= 0
  )
    throw new Error('Studio image preparation requires an admitted source.');
  const context = { cwd: candidate.cwd, timeoutMs };
  const head = execution(run, 'git', ['rev-parse', 'HEAD'], context).trim();
  const dirty = execution(
    run,
    'git',
    ['status', '--porcelain', '--untracked-files=normal'],
    context,
  );
  if (head !== candidate.commit || dirty)
    throw new Error('Studio image preparation requires a clean reviewed checkout.');

  const prior = priorRelease(authenticatedPriorRelease);
  const sources = upstreamImages(candidate);
  const reuse = new Set(
    ['studio', 'registry'].filter(
      (name) =>
        prior &&
        prior.release.components[name] ===
          gate.eligibility.components[name]?.source,
    ),
  );
  const targets = Object.fromEntries(
    Object.keys(IMAGE_REPOSITORIES).map((name) => [
      name,
      imageTag(name, candidate.commit),
    ]),
  );

  for (const name of ['studio', 'registry', 'minio']) {
    if (reuse.has(name)) continue;
    const args = [
      'buildx',
      'build',
      '--platform',
      PLATFORMS,
      '--push',
      '--tag',
      targets[name],
      '--file',
      name === 'studio'
        ? 'apps/studio/Dockerfile'
        : name === 'registry'
          ? 'apps/template-registry/Dockerfile'
          : 'apps/studio/deployment/minio.Dockerfile',
    ];
    if (name === 'registry') args.push('--build-arg', `SOURCE_REVISION=${candidate.commit}`);
    args.push('.');
    execution(run, docker, args, context);
  }
  for (const name of ['postgres', 'traefik', 'minioClient']) {
    execution(run, crane, ['copy', sources[name], targets[name]], context);
  }

  const images = {};
  const sboms = new Map();
  for (const name of Object.keys(IMAGE_REPOSITORIES)) {
    if (reuse.has(name)) {
      images[name] = prior.release.images[name];
      sboms.set(name, Buffer.from(prior.sboms.get(name)));
      continue;
    }
    const digest = execution(run, crane, ['digest', targets[name]], context).trim();
    if (!DIGEST.test(digest))
      throw new Error('Studio image preparation received an invalid image digest.');
    const reference = `${IMAGE_REPOSITORIES[name]}@${digest}`;
    images[name] = await acquire({
      name,
      reference,
      crane,
      timeoutMs,
    });
    const bytes = Buffer.from(
      execution(run, syft, [reference, '--output', 'cyclonedx-json'], context),
    );
    validateCycloneDx({ image: reference, bytes });
    sboms.set(name, bytes);
  }
  return { images, sboms, reused: [...reuse].toSorted() };
}
