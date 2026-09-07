import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  IMAGE_REPOSITORIES,
  readRelease,
} from '../apps/studio/deployment/installer/release.mjs';
import { command } from '../apps/studio/deployment/installer/verify.mjs';
import {
  buildMultiPlatformCycloneDx,
  validateCycloneDx,
} from './studio-image-evidence.mjs';
import {
  acquireImageEvidence,
  probeImageTag,
} from './studio-image-registry.mjs';

const PLATFORMS = 'linux/amd64,linux/arm64';
const SOURCE = /^[a-f0-9]{40}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;

function imageTag(name, source) {
  return `${IMAGE_REPOSITORIES[name]}:sha-${source}`;
}

function stagingTag(name, source, nonce) {
  return `${IMAGE_REPOSITORIES[name]}:preparation-${source}-${nonce}`;
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

function execution(run, executable, args, { cwd, timeoutMs, maxBuffer }) {
  try {
    return run(executable, args, {
      timeout: timeoutMs,
      killSignal: 'SIGKILL',
      cwd,
      ...(maxBuffer ? { maxBuffer } : {}),
    });
  } catch {
    throw new Error('Studio image preparation command failed.');
  }
}

function upstreamImages(candidate) {
  const compose = candidate.read('apps/studio/docker-compose.yml');
  const service = (name) => {
    const image = new RegExp(`^  ${name}:\\n    image: ([^\\n]+)$`, 'm').exec(
      compose,
    )?.[1];
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
      configurations: prior.release.images[name].configurations,
      bytes,
    });
  }
  return { release: prior.release, sboms: value.sboms };
}

/** Build or copy the six controlled images from an admitted source snapshot to
 * fresh noncanonical staging tags. The caller authenticates the resulting
 * evidence before publishing canonical tags or signing image references. */
export async function prepareStudioImages(
  { candidate, gate, authenticatedPriorRelease },
  {
    docker = 'docker',
    crane = 'crane',
    syft = 'syft',
    run = command,
    acquire = acquireImageEvidence,
    stagingNonce = randomBytes(16).toString('hex'),
    timeoutMs = 300_000,
  } = {},
) {
  if (
    !candidate ||
    typeof candidate.cwd !== 'string' ||
    !SOURCE.test(candidate.commit) ||
    gate?.eligibility?.status !== 'ready' ||
    gate.eligibility.source !== candidate.commit ||
    !/^[a-f0-9]{32}$/.test(stagingNonce) ||
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs <= 0
  )
    throw new Error('Studio image preparation requires an admitted source.');
  const temporary = mkdtempSync(join(tmpdir(), 'studio-image-source-'));
  const snapshot = join(temporary, 'source');
  const archive = join(temporary, 'source.tar');
  mkdirSync(snapshot, { mode: 0o700 });
  try {
    const repository = { cwd: candidate.cwd, timeoutMs };
    execution(
      run,
      'git',
      ['archive', '--format=tar', `--output=${archive}`, candidate.commit],
      repository,
    );
    execution(
      run,
      'tar',
      ['--extract', '--file', archive, '--directory', snapshot],
      repository,
    );
    const context = { cwd: snapshot, timeoutMs };
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
        stagingTag(name, candidate.commit, stagingNonce),
      ]),
    );

    for (const name of ['studio', 'registry', 'minio']) {
      if (reuse.has(name)) continue;
      const args = [
        'buildx',
        'build',
        '--platform',
        PLATFORMS,
        '--provenance=false',
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
      if (name === 'registry')
        args.push('--build-arg', `SOURCE_REVISION=${candidate.commit}`);
      args.push('.');
      execution(run, docker, args, context);
    }
    for (const name of ['postgres', 'traefik', 'minioClient']) {
      execution(
        run,
        crane,
        [
          'index',
          'filter',
          sources[name],
          '--platform',
          'linux/amd64',
          '--platform',
          'linux/arm64',
          '--tag',
          targets[name],
        ],
        context,
      );
    }

    const images = {};
    const sboms = new Map();
    for (const name of Object.keys(IMAGE_REPOSITORIES)) {
      if (reuse.has(name)) {
        images[name] = prior.release.images[name];
        sboms.set(name, Buffer.from(prior.sboms.get(name)));
        continue;
      }
      const digest = execution(
        run,
        crane,
        ['digest', targets[name]],
        context,
      ).trim();
      if (!DIGEST.test(digest))
        throw new Error(
          'Studio image preparation received an invalid image digest.',
        );
      const reference = `${IMAGE_REPOSITORIES[name]}@${digest}`;
      images[name] = await acquire({
        name,
        reference,
        crane,
        timeoutMs,
      });
      const reports = new Map();
      for (const platform of ['linux/amd64', 'linux/arm64']) {
        const configuration = images[name].configurations[platform];
        reports.set(
          platform,
          Buffer.from(
            execution(
              run,
              syft,
              [
                reference,
                '--platform',
                platform,
                '--source-name',
                `${reference}#${platform}`,
                '--source-version',
                configuration,
                '--output',
                'cyclonedx-json',
              ],
              { ...context, maxBuffer: 8 * 1024 * 1024 },
            ),
          ),
        );
      }
      const bytes = buildMultiPlatformCycloneDx({
        image: reference,
        configurations: images[name].configurations,
        reports,
      });
      validateCycloneDx({
        image: reference,
        configurations: images[name].configurations,
        bytes,
      });
      sboms.set(name, bytes);
    }
    return { images, sboms, reused: [...reuse].toSorted() };
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

/** Publish canonical source tags only after the caller authenticates the exact
 * image preparation checkpoint. All existing tags are checked before the first
 * write, and every newly written tag is read back by digest. */
export async function publishStudioImageTags(
  { candidate, evidence },
  {
    crane = 'crane',
    run = command,
    probe = probeImageTag,
    timeoutMs = 300_000,
  } = {},
) {
  if (
    !candidate ||
    typeof candidate.cwd !== 'string' ||
    !SOURCE.test(candidate.commit) ||
    !evidence?.images ||
    Object.keys(evidence.images).toSorted().join('\n') !==
      Object.keys(IMAGE_REPOSITORIES).toSorted().join('\n') ||
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs <= 0
  )
    throw new Error('Studio canonical image publication is not configured.');
  const expected = new Map();
  const targets = new Map();
  const existing = new Map();
  for (const name of Object.keys(IMAGE_REPOSITORIES)) {
    const reference = evidence.images[name]?.reference;
    const prefix = `${IMAGE_REPOSITORIES[name]}@`;
    const digest =
      typeof reference === 'string' && reference.startsWith(prefix)
        ? reference.slice(prefix.length)
        : '';
    if (!DIGEST.test(digest))
      throw new Error('Authenticated image evidence is invalid.');
    const target = imageTag(name, candidate.commit);
    const retained = await probe({
      name,
      reference: target,
      crane,
      timeoutMs,
    });
    if (retained !== null && retained !== digest)
      throw new Error(
        'A canonical Studio image tag has different authenticated evidence.',
      );
    expected.set(name, digest);
    targets.set(name, target);
    existing.set(name, retained);
  }
  for (const name of Object.keys(IMAGE_REPOSITORIES)) {
    if (existing.get(name) === null) {
      const retained = await probe({
        name,
        reference: targets.get(name),
        crane,
        timeoutMs,
      });
      if (retained !== null) {
        if (retained !== expected.get(name))
          throw new Error(
            'A canonical Studio image tag changed before publication.',
          );
        continue;
      }
      execution(
        run,
        crane,
        ['copy', evidence.images[name].reference, targets.get(name)],
        { cwd: candidate.cwd, timeoutMs },
      );
      const published = await probe({
        name,
        reference: targets.get(name),
        crane,
        timeoutMs,
      });
      if (published !== expected.get(name))
        throw new Error('Canonical Studio image tag failed exact readback.');
    }
  }
}
