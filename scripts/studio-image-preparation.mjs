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

/** Build or copy the six controlled images only from an admitted source snapshot.
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
    probe = probeImageTag,
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
        imageTag(name, candidate.commit),
      ]),
    );
    const retained = new Map();
    for (const name of Object.keys(IMAGE_REPOSITORIES)) {
      if (reuse.has(name)) continue;
      const digest = await probe({
        name,
        reference: targets[name],
        crane,
        timeoutMs,
      });
      if (digest !== null && !DIGEST.test(digest))
        throw new Error(
          'Studio image preparation received invalid retained tag evidence.',
        );
      if (digest !== null) retained.set(name, digest);
    }

    for (const name of ['studio', 'registry', 'minio']) {
      if (reuse.has(name) || retained.has(name)) continue;
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
      if (retained.has(name)) continue;
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
      const digest =
        retained.get(name) ??
        execution(run, crane, ['digest', targets[name]], context).trim();
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
