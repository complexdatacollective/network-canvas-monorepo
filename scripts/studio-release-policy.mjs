import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import {
  GATED_PRODUCT_RELEASE_LANES,
  nextStableVersion,
  parseChangeset,
} from './changeset-app-utils.mjs';
import { collectWorkspacePackages } from './release-e2e-policy.mjs';
import {
  distributionInputs,
  imageRuntimeInputs,
  lockedBuildInputs,
} from './studio-build-inputs.mjs';
import { npmPublication } from './studio-npm-publication.mjs';

export const STUDIO_RELEASE_PACKAGES = GATED_PRODUCT_RELEASE_LANES.studio;
export const STUDIO_SOURCE_BASELINE = '.github/studio-source-baseline.json';

function git(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 ** 2,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30_000,
  });
}

function resolveCommit(cwd, ref) {
  const commit = git(cwd, [
    'rev-parse',
    '--verify',
    '--end-of-options',
    `${ref}^{commit}`,
  ]).trim();
  if (!/^[a-f0-9]{40}$/.test(commit))
    throw new Error('A complete source commit is required.');
  return commit;
}

function readObject(cwd, commit, path) {
  return git(cwd, ['show', `${commit}:${path}`]);
}

function readMetadata(cwd, files) {
  const selected = files.filter(
    ({ path }) =>
      path === 'package.json' ||
      path.endsWith('/package.json') ||
      [
        'pnpm-workspace.yaml',
        'pnpm-lock.yaml',
        STUDIO_SOURCE_BASELINE,
      ].includes(path) ||
      path.startsWith('.changeset/') ||
      path.startsWith('patches/'),
  );
  const bytes = execFileSync('git', ['cat-file', '--batch'], {
    cwd,
    input: selected.map(({ oid }) => oid).join('\n') + '\n',
    maxBuffer: 32 * 1024 ** 2,
    timeout: 30_000,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const contents = new Map();
  let offset = 0;
  for (const file of selected) {
    const newline = bytes.indexOf(10, offset);
    const [oid, type, size] = bytes
      .subarray(offset, newline)
      .toString('utf8')
      .split(' ');
    const length = Number(size);
    if (
      oid !== file.oid ||
      type !== 'blob' ||
      !Number.isSafeInteger(length) ||
      length < 0 ||
      newline + length + 1 >= bytes.length
    )
      throw new Error('Cannot read complete committed release metadata.');
    offset = newline + 1;
    contents.set(
      file.path,
      bytes.subarray(offset, offset + length).toString('utf8'),
    );
    offset += length + 1;
  }
  return contents;
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .toSorted(([a], [b]) => compareText(a, b))
        .map(([key, item]) => [key, stable(item)]),
    );
  return value;
}

function digest(value) {
  return createHash('sha256')
    .update(JSON.stringify(stable(value)) ?? 'null')
    .digest('hex');
}

// Tests, release notes and generated changelogs do not enter the runtime.
// Everything else in a consumed workspace participates, including build
// configuration, public assets, migrations, styles and executable file modes.
function runtimePath(path) {
  const parts = path.split('/');
  const filename = parts.at(-1);
  // Markdown imported from source or served as a public asset is runtime.
  // Image recipes/context filters and deployment files have their own input
  // identities and do not require artificial package versions. Executable
  // image inputs still invalidate the relevant backend component below.
  return (
    ![
      'README.md',
      'CHANGELOG.md',
      'Dockerfile',
      'Dockerfile.dockerignore',
    ].includes(path) &&
    !path.startsWith('deployment/') &&
    !parts.some((part) =>
      ['__tests__', 'e2e', 'qualification', '.storybook'].includes(part),
    ) &&
    !/\.(?:test|spec|stories)\./.test(filename) &&
    !filename.startsWith('vitest.') &&
    !filename.startsWith('playwright.')
  );
}

function packageSource(candidate, name) {
  const pkg = candidate.packages.get(name);
  if (!pkg) throw new Error(`Missing release workspace: ${name}`);
  const { version: _version, ...manifest } = pkg.manifest;
  return digest({
    manifest,
    files: candidate.files
      .filter(
        (file) =>
          file.path.startsWith(`${pkg.dir}/`) &&
          runtimePath(file.path.slice(pkg.dir.length + 1)) &&
          file.path !== `${pkg.dir}/package.json`,
      )
      .map((file) => [
        file.path.slice(pkg.dir.length + 1),
        file.mode,
        file.oid,
      ]),
  });
}

/** Read committed objects, even when a release action has pruned its checkout. */
export function readStudioCandidate(cwd, ref = 'HEAD') {
  const commit = resolveCommit(cwd, ref);
  const files = git(cwd, ['ls-tree', '-r', '-z', commit])
    .split('\0')
    .filter(Boolean)
    .map((record) => {
      const match = /^(\d+) blob ([a-f0-9]{40})\t([\s\S]+)$/.exec(record);
      if (!match)
        throw new Error('Release candidates cannot contain submodules.');
      return { mode: match[1], oid: match[2], path: match[3] };
    });
  const snapshot = mkdtempSync(join(tmpdir(), 'studio-release-graph-'));
  const contents = readMetadata(cwd, files);
  const read = (path) => contents.get(path) ?? readObject(cwd, commit, path);
  const manifests = new Map();
  let packages;
  try {
    // Reuse the repository's graph parser on a minimal committed snapshot;
    // never import package code or consult an uncommitted package manifest.
    for (const file of files.filter(
      ({ path }) =>
        path === 'pnpm-workspace.yaml' || path.endsWith('/package.json'),
    )) {
      const target = join(snapshot, file.path);
      mkdirSync(dirname(target), { recursive: true });
      const manifest = read(file.path);
      writeFileSync(target, manifest);
      if (file.path.endsWith('/package.json'))
        manifests.set(dirname(file.path), JSON.parse(manifest));
    }
    packages = collectWorkspacePackages(snapshot);
  } finally {
    rmSync(snapshot, { recursive: true, force: true });
  }
  for (const pkg of packages.values()) pkg.manifest = manifests.get(pkg.dir);
  const changesets = files
    .filter(
      ({ path }) =>
        /^\.changeset\/[^/]+\.md$/.test(path) &&
        path !== '.changeset/README.md',
    )
    .map(({ path }) => ({
      path,
      ...parseChangeset(read(path)),
    }));
  const baseline = files.some(({ path }) => path === STUDIO_SOURCE_BASELINE)
    ? JSON.parse(read(STUDIO_SOURCE_BASELINE))
    : null;
  return { cwd, commit, files, packages, changesets, baseline, read };
}

function dependencyClosure(candidate, subjects) {
  const selected = new Set();
  const pending = [...subjects];
  while (pending.length) {
    const name = pending.pop();
    if (selected.has(name)) continue;
    const pkg = candidate.packages.get(name);
    if (!pkg) throw new Error(`Missing release workspace: ${name}`);
    selected.add(name);
    pending.push(
      ...pkg.workspaceDeps.filter((dependency) =>
        candidate.packages.has(dependency),
      ),
    );
  }
  return [...selected].toSorted(compareText);
}

function laneFor(name) {
  if (STUDIO_RELEASE_PACKAGES.includes(name)) return 'studio';
  return (
    Object.entries(GATED_PRODUCT_RELEASE_LANES).find(([, packages]) =>
      packages.includes(name),
    )?.[0] ?? 'normal'
  );
}

/** The Studio release PR records source consent separately from semver. */
export function studioSourceBaseline(candidate, versions = {}) {
  return {
    format: 1,
    sourceCommit: candidate.commit,
    packages: Object.fromEntries(
      STUDIO_RELEASE_PACKAGES.map((name) => [
        name,
        {
          version:
            versions[name] ?? candidate.packages.get(name)?.manifest.version,
          source: packageSource(candidate, name),
        },
      ]),
    ),
  };
}

/** Called only by the Studio version step, before it removes changesets. */
export function recordStudioSourceBaseline(cwd, plans) {
  if (!plans.some(({ pkg }) => STUDIO_RELEASE_PACKAGES.includes(pkg))) return;
  if (git(cwd, ['status', '--porcelain', '--untracked-files=normal']).trim())
    throw new Error(
      'The Studio version step requires a clean committed source tree.',
    );
  const candidate = readStudioCandidate(cwd);
  const versions = Object.fromEntries(plans.map(({ pkg, to }) => [pkg, to]));
  const baseline = studioSourceBaseline(candidate, versions);
  for (const name of STUDIO_RELEASE_PACKAGES) {
    if (
      !Object.hasOwn(versions, name) &&
      digest(baseline.packages[name]) !==
        digest(candidate.baseline?.packages?.[name])
    )
      throw new Error(
        `Studio source changed without a package release: ${name}`,
      );
  }
  mkdirSync(join(cwd, '.github'), { recursive: true });
  writeFileSync(
    join(cwd, STUDIO_SOURCE_BASELINE),
    `${JSON.stringify(baseline, null, 2)}\n`,
  );
}

function sourceConsent(candidate) {
  const baseline = candidate.baseline;
  if (
    baseline?.format !== 1 ||
    !/^[a-f0-9]{40}$/.test(baseline.sourceCommit ?? '')
  )
    return false;
  try {
    git(candidate.cwd, [
      'merge-base',
      '--is-ancestor',
      baseline.sourceCommit,
      candidate.commit,
    ]);
    const anchor = readStudioCandidate(candidate.cwd, baseline.sourceCommit);
    const versions = {};
    let consumed = 0;
    for (const name of STUDIO_RELEASE_PACKAGES) {
      const entries = anchor.changesets.flatMap(({ releases }) =>
        releases.filter((release) => release.name === name),
      );
      consumed += entries.length;
      const current = anchor.packages.get(name)?.manifest.version;
      versions[name] = entries.length
        ? nextStableVersion(current, entries)
        : current;
      if (
        !entries.length &&
        digest(anchor.baseline?.packages?.[name]) !==
          digest({ version: current, source: packageSource(anchor, name) })
      )
        return false;
    }
    // A baseline is evidence of an actual Studio version step, not an
    // editable allowlist for shipping new source under an existing version.
    return (
      consumed > 0 &&
      digest(baseline) === digest(studioSourceBaseline(anchor, versions)) &&
      digest(baseline.packages) ===
        digest(studioSourceBaseline(candidate).packages)
    );
  } catch {
    return false;
  }
}

function component(candidate, subjects, image) {
  const packages = dependencyClosure(candidate, subjects);
  return {
    packages,
    source: digest({
      packages: packages.map((name) => [
        name,
        candidate.packages.get(name).manifest.version,
        packageSource(candidate, name),
      ]),
      locked: lockedBuildInputs(candidate, packages),
      image: image ? imageRuntimeInputs(candidate, image) : [],
    }),
  };
}

/** Evaluated again under the promotion lock; a prior build verdict is insufficient. */
export async function studioReleaseEligibility(
  candidate,
  publication = npmPublication,
) {
  const blockers = [];
  for (const name of STUDIO_RELEASE_PACKAGES)
    if (!candidate.packages.has(name))
      blockers.push({ code: 'workspace_missing', package: name });
  if (blockers.length)
    return { status: 'deferred', source: candidate.commit, blockers };
  const consumed = dependencyClosure(candidate, STUDIO_RELEASE_PACKAGES);
  const lanes = new Set(consumed.map(laneFor));
  lanes.add('studio');
  for (const changeset of candidate.changesets) {
    const changeLanes = changeset.releases.length
      ? changeset.releases.map(({ name }) => laneFor(name))
      : ['normal'];
    if (changeLanes.some((lane) => lanes.has(lane)))
      blockers.push({ code: 'pending_changeset', path: changeset.path });
  }
  if (!sourceConsent(candidate))
    blockers.push({ code: 'unreleased_studio_source' });
  // Do not contact npm while local release consent is incomplete.
  if (blockers.length)
    return { status: 'deferred', source: candidate.commit, blockers };
  const dependencies = [];
  for (const name of consumed) {
    const pkg = candidate.packages.get(name);
    if (pkg.manifest.private === true || STUDIO_RELEASE_PACKAGES.includes(name))
      continue;
    const version = pkg.manifest.version;
    try {
      const tag = resolveCommit(candidate.cwd, `refs/tags/${name}@${version}`);
      git(candidate.cwd, [
        'merge-base',
        '--is-ancestor',
        tag,
        candidate.commit,
      ]);
      const released = readStudioCandidate(candidate.cwd, tag);
      if (packageSource(released, name) !== packageSource(candidate, name))
        throw new Error(
          'Dependency source differs from the published version tag.',
        );
      const evidence = await publication(name, version);
      if (evidence.source !== tag)
        throw new Error('Registry publication does not match its version tag.');
      dependencies.push({ name, version, tag, ...evidence });
    } catch {
      blockers.push({
        code: 'dependency_unpublished_or_different',
        package: name,
        version,
      });
    }
  }
  const components = {
    client: component(candidate, ['@codaco/studio-client']),
    server: component(candidate, ['@codaco/studio-server'], 'studio'),
    registry: component(candidate, ['@codaco/template-registry'], 'registry'),
    // Self-hosting deliberately updates one composite image, even for a
    // client-only change. Managed CDN/backend selection uses the two above.
    studio: component(
      candidate,
      ['@codaco/studio-client', '@codaco/studio-server'],
      'studio',
    ),
  };
  return {
    status: blockers.length ? 'deferred' : 'ready',
    source: candidate.commit,
    blockers,
    versions: Object.fromEntries(
      STUDIO_RELEASE_PACKAGES.map((name) => [
        name,
        candidate.packages.get(name).manifest.version,
      ]),
    ),
    dependencies,
    components,
    artifact: digest({
      components,
      inputs: distributionInputs(candidate),
      releaseTools: lockedBuildInputs(candidate, [], { includeRoot: true }),
    }),
  };
}
