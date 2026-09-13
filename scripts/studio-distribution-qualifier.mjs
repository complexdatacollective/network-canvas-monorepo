import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import {
  IMAGE_REPOSITORIES,
  readRelease,
  sha256,
  signatureArguments,
} from '../apps/studio/deployment/installer/release.mjs';
import { command } from '../apps/studio/deployment/installer/verify.mjs';
import { validateCycloneDx } from './studio-image-evidence.mjs';
import { readInstallerArchive } from './studio-installer-archive.mjs';

const SOURCE = /^[a-f0-9]{40}$/;
const HASH = /^[a-f0-9]{64}$/;
const MAX_SIGNATURE = 8 * 1024 * 1024;
const IMAGE_NAMES = Object.keys(IMAGE_REPOSITORIES);
const compareNames = (left, right) =>
  left < right ? -1 : left > right ? 1 : 0;
const CANDIDATE_ARTIFACTS = [
  'release.json',
  'release.sigstore.json',
  'installer.tar',
  'installer.sigstore.json',
  ...IMAGE_NAMES.map((name) => `${name}.cdx.json`),
].toSorted(compareNames);

function exactKeys(value, keys, error) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).toSorted().join('\n') !== keys.toSorted().join('\n')
  )
    throw new Error(error);
}

function bytes(value, name, maximum = 32 * 1024 * 1024) {
  if (!Buffer.isBuffer(value) || value.length === 0 || value.length > maximum)
    throw new Error(`Distribution qualification ${name} is invalid.`);
  return Buffer.from(value);
}

function artifactMap(value) {
  if (
    !(value instanceof Map) ||
    [...value.keys()].toSorted(compareNames).join('\n') !==
      CANDIDATE_ARTIFACTS.join('\n')
  )
    throw new Error(
      'Distribution qualification artifact inventory is invalid.',
    );
  const artifacts = new Map(
    CANDIDATE_ARTIFACTS.map((name) => [
      name,
      bytes(
        value.get(name),
        name,
        name === 'installer.tar' ? 40 * 1024 * 1024 : undefined,
      ),
    ]),
  );
  if (
    [...artifacts.values()].reduce((total, body) => total + body.length, 0) >
    384 * 1024 * 1024
  )
    throw new Error(
      'Distribution qualification artifact inventory is too large.',
    );
  return artifacts;
}

function verifySboms(release, sboms) {
  if (!(sboms instanceof Map) || sboms.size !== IMAGE_NAMES.length)
    throw new Error('Distribution qualification SBOM inventory is invalid.');
  for (const name of IMAGE_NAMES) {
    const body = bytes(sboms.get(name), `${name} SBOM`, 48 * 1024 * 1024);
    if (sha256(body) !== release.release.evidence.sboms[name].sha256)
      throw new Error('Distribution qualification SBOM digest is invalid.');
    validateCycloneDx({
      image: release.release.images[name].reference,
      configurations: release.release.images[name].configurations,
      bytes: body,
    });
  }
}

function stage(directory, name, body) {
  const path = join(directory, name);
  writeFileSync(path, body, { flag: 'wx', mode: 0o600 });
  return path;
}

function verifyInstaller(bytesValue, signatureValue, expectedDigest, options) {
  const parsed = readInstallerArchive(bytesValue, expectedDigest);
  const directory = mkdtempSync(join(options.root, 'installer-signature-'));
  chmodSync(directory, 0o700);
  const archive = stage(directory, 'installer.tar', bytesValue);
  const signature = stage(
    directory,
    'installer.sigstore.json',
    bytes(signatureValue, 'installer signature', MAX_SIGNATURE),
  );
  try {
    options.run(
      options.cosign,
      signatureArguments('blob', archive, signature),
      { timeout: 300_000, killSignal: 'SIGKILL' },
    );
  } catch {
    throw new Error('Distribution qualification installer signature failed.');
  }
  return parsed;
}

function stageBundle(root, label, parsed) {
  const directory = join(root, label);
  mkdirSync(directory, { mode: 0o700 });
  for (const [name, body] of parsed.entries) {
    const path = join(directory, name);
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    writeFileSync(path, body, { flag: 'wx', mode: 0o600 });
  }
  return directory;
}

function validateHistorical(prior) {
  exactKeys(
    prior,
    ['release', 'current', 'releaseBytes', 'sboms'],
    'Distribution qualification history is invalid.',
  );
  const releaseBytes = bytes(
    prior.releaseBytes,
    'historical release',
    4 * 1024 * 1024,
  );
  const parsed = readRelease(releaseBytes);
  if (
    !isDeepStrictEqual(
      { release: prior.release, current: prior.current },
      { release: parsed.release, current: parsed.current },
    )
  )
    throw new Error(
      'Distribution qualification history changed after authentication.',
    );
  verifySboms(parsed, prior.sboms);
  return { ...parsed, releaseBytes };
}

/**
 * Revalidate and privately stage every byte needed by the concrete Docker
 * qualifier. Authentication happened earlier, but this boundary refuses any
 * mutable or incomplete caller input before it executes an installer.
 */
export async function prepareStudioDistributionQualification(
  input,
  { run = command, root: suppliedRoot } = {},
) {
  exactKeys(
    input,
    ['manifest', 'artifacts', 'qualificationSources', 'executables', 'store'],
    'Distribution qualification input is invalid.',
  );
  exactKeys(
    input.executables,
    ['cosign', 'crane', 'syft'],
    'Distribution qualification executable inventory is invalid.',
  );
  if (
    !Object.values(input.executables).every(
      (path) => typeof path === 'string' && path.startsWith('/'),
    ) ||
    typeof input.store?.readAsset !== 'function' ||
    !Array.isArray(input.qualificationSources) ||
    input.qualificationSources.length > 2
  )
    throw new Error('Distribution qualification input is invalid.');
  const root =
    suppliedRoot ?? mkdtempSync(join(tmpdir(), 'studio-distribution-'));
  chmodSync(root, 0o700);
  try {
    const artifacts = artifactMap(input.artifacts);
    const releaseBytes = artifacts.get('release.json');
    const candidate = readRelease(releaseBytes);
    if (
      !SOURCE.test(candidate.current.source) ||
      !HASH.test(candidate.current.digest) ||
      !isDeepStrictEqual(input.manifest, candidate)
    )
      throw new Error(
        'Distribution qualification candidate identity is invalid.',
      );
    verifySboms(
      candidate,
      new Map(
        IMAGE_NAMES.map((name) => [name, artifacts.get(`${name}.cdx.json`)]),
      ),
    );
    const candidateArchive = verifyInstaller(
      artifacts.get('installer.tar'),
      artifacts.get('installer.sigstore.json'),
      candidate.current.digest,
      { root, cosign: input.executables.cosign, run },
    );
    if (
      !isDeepStrictEqual(candidateArchive.manifest, candidate) ||
      !candidateArchive.entries.get('release.json').equals(releaseBytes) ||
      !candidateArchive.entries
        .get('release.sigstore.json')
        .equals(artifacts.get('release.sigstore.json'))
    )
      throw new Error(
        'Distribution qualification candidate bundle is invalid.',
      );
    const sources = [];
    const seen = new Set();
    for (const untrusted of input.qualificationSources) {
      const prior = validateHistorical(untrusted);
      if (
        seen.has(prior.current.source) ||
        prior.current.source === candidate.current.source ||
        prior.current.generation >= candidate.current.generation ||
        !candidate.release.ancestors.includes(prior.current.source) ||
        !candidate.release.upgrade.from.some(
          (identity) =>
            identity.source === prior.current.source &&
            identity.digest === prior.current.digest &&
            identity.generation === prior.current.generation,
        ) ||
        (sources.length > 0 &&
          sources.at(-1).current.generation >= prior.current.generation)
      )
        throw new Error('Distribution qualification history is invalid.');
      seen.add(prior.current.source);
      const tag = `studio/${prior.current.source}`;
      const archiveBytes = bytes(
        await input.store.readAsset(tag, 'installer.tar'),
        'historical installer',
        40 * 1024 * 1024,
      );
      const signatureBytes = bytes(
        await input.store.readAsset(tag, 'installer.sigstore.json'),
        'historical installer signature',
        MAX_SIGNATURE,
      );
      const archive = verifyInstaller(
        archiveBytes,
        signatureBytes,
        prior.current.digest,
        { root, cosign: input.executables.cosign, run },
      );
      if (
        !isDeepStrictEqual(archive.manifest, {
          release: prior.release,
          current: prior.current,
        }) ||
        !archive.entries.get('release.json').equals(prior.releaseBytes)
      )
        throw new Error(
          'Historical installer differs from authenticated history.',
        );
      sources.push({
        ...prior,
        bundleDirectory: stageBundle(
          root,
          `prior-${prior.current.source}`,
          archive,
        ),
      });
    }
    return {
      root,
      candidate: {
        ...candidate,
        bundleDirectory: stageBundle(root, 'candidate', candidateArchive),
      },
      sources,
      cleanup: () => {
        if (!suppliedRoot) rmSync(root, { recursive: true, force: true });
      },
    };
  } catch (error) {
    if (!suppliedRoot) rmSync(root, { recursive: true, force: true });
    throw error;
  }
}

/** Run the concrete local installation/recovery drill and return only the
 * receipt derived from its completed observations. */
export async function qualifyStudioDistribution(input) {
  const prepared = await prepareStudioDistributionQualification(input);
  try {
    const { runLocalStudioDistributionQualification } =
      await import('../apps/studio/server/qualification/distribution.ts');
    await runLocalStudioDistributionQualification({
      candidate: prepared.candidate,
      sources: prepared.sources,
      cosign: input.executables.cosign,
    });
    return {
      verdict: 'passed',
      source: prepared.candidate.current.source,
      manifestSha256: prepared.candidate.current.digest,
      freshInstall: true,
      populatedRecovery: true,
      upgrades: prepared.sources.map(({ current }) => ({
        source: current.source,
        manifestSha256: current.digest,
      })),
    };
  } finally {
    prepared.cleanup();
  }
}
