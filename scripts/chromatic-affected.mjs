#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { parse } from 'yaml';

export const CHROMATIC_PROJECTS = {
  fresco_ui: 'packages/fresco-ui',
  interview: 'packages/interview',
  interviewer: 'apps/interviewer',
};

const PROJECT_KEYS = Object.keys(CHROMATIC_PROJECTS);
const DEPENDENCY_SECTIONS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
];
const LOCKFILE_GRAPH_KEYS = new Set([
  'catalogs',
  'importers',
  'packages',
  'snapshots',
]);
const RELEASE_REFS = new Set([
  'changeset-release/documentation',
  'changeset-release/main',
  'changeset-release/studio',
  'changeset-release/website',
]);
const SPECIAL_PATHS = new Set(['pnpm-lock.yaml', 'pnpm-workspace.yaml']);
const GLOBAL_PATHS = new Set([
  '.node-version',
  '.nvmrc',
  'package.json',
  'scripts/chromatic-affected.mjs',
  'turbo.json',
]);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .toSorted((a, b) => a.localeCompare(b))
      .map((key) => [key, sortValue(value[key])]),
  );
}

export function stableStringify(value) {
  return JSON.stringify(sortValue(value));
}

function fingerprint(value) {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function parseYaml(text, label) {
  let document;
  try {
    document = parse(text);
  } catch (error) {
    throw new Error(`Unable to parse ${label}`, { cause: error });
  }
  if (!isPlainObject(document)) {
    throw new Error(`${label} must contain a YAML mapping`);
  }
  return document;
}

export function parseLockfile(text, label = 'pnpm-lock.yaml') {
  const lockfile = parseYaml(text, label);
  if (String(lockfile.lockfileVersion) !== '9.0') {
    throw new Error(
      `${label} uses unsupported lockfileVersion ${String(lockfile.lockfileVersion)}`,
    );
  }
  for (const key of ['importers', 'packages', 'snapshots']) {
    if (!isPlainObject(lockfile[key])) {
      throw new Error(`${label} is missing a valid ${key} mapping`);
    }
  }
  return lockfile;
}

export function normalizeImporterPath(importerPath) {
  const normalized = path.posix
    .normalize(importerPath.replaceAll('\\', '/'))
    .replace(/^\.\//, '')
    .replace(/\/$/, '');
  return normalized === '' ? '.' : normalized;
}

function dependencyReference(value, context) {
  const reference = typeof value === 'string' ? value : value?.version;
  if (typeof reference !== 'string' || reference.length === 0) {
    throw new Error(`Invalid dependency reference at ${context}`);
  }
  return reference;
}

function resolveLinkedImporter(currentImporter, reference, importers) {
  const relative = reference.slice('link:'.length);
  if (relative.length === 0 || path.posix.isAbsolute(relative)) {
    throw new Error(
      `Invalid workspace link ${reference} from ${currentImporter}`,
    );
  }
  const resolved = normalizeImporterPath(
    path.posix.join(currentImporter, relative),
  );
  if (resolved === '..' || resolved.startsWith('../')) {
    throw new Error(
      `Workspace link ${reference} from ${currentImporter} escapes the repository`,
    );
  }
  if (!isPlainObject(importers[resolved])) {
    throw new Error(
      `Workspace link ${reference} from ${currentImporter} resolves to missing importer ${resolved}`,
    );
  }
  return resolved;
}

export function resolveSnapshotKey(name, reference, snapshots) {
  if (reference.startsWith('file:') || reference.startsWith('workspace:')) {
    throw new Error(
      `Unsupported external dependency reference ${name}@${reference}`,
    );
  }
  const candidates = new Set([
    `${name}@${reference}`,
    reference.replace(/^npm:/, ''),
    reference,
  ]);
  const matches = [...candidates].filter((candidate) =>
    Object.hasOwn(snapshots, candidate),
  );
  if (matches.length !== 1) {
    throw new Error(
      `Unable to resolve ${name}@${reference} to exactly one pnpm snapshot`,
    );
  }
  return matches[0];
}

function packageKeyForSnapshot(snapshotKey, packages) {
  if (Object.hasOwn(packages, snapshotKey)) return snapshotKey;
  const peerSuffix = snapshotKey.indexOf('(');
  const packageKey =
    peerSuffix === -1 ? snapshotKey : snapshotKey.slice(0, peerSuffix);
  if (!Object.hasOwn(packages, packageKey)) {
    throw new Error(`Snapshot ${snapshotKey} has no package metadata record`);
  }
  return packageKey;
}

function dependencyEntries(record) {
  const entries = [];
  for (const section of DEPENDENCY_SECTIONS) {
    const dependencies = record[section];
    if (dependencies === undefined) continue;
    if (!isPlainObject(dependencies)) {
      throw new Error(`Invalid ${section} dependency mapping`);
    }
    entries.push(...Object.entries(dependencies));
  }
  return entries;
}

export function workspaceImporterClosure(lockfile, rootImporter) {
  const root = normalizeImporterPath(rootImporter);
  if (!isPlainObject(lockfile.importers[root])) {
    throw new Error(`Missing root workspace importer ${root}`);
  }

  const importers = new Set();
  const queue = [root];
  while (queue.length > 0) {
    const importer = queue.pop();
    if (importers.has(importer)) continue;
    const record = lockfile.importers[importer];
    if (!isPlainObject(record)) {
      throw new Error(`Invalid importer record ${importer}`);
    }
    importers.add(importer);
    for (const [name, value] of dependencyEntries(record)) {
      const reference = dependencyReference(value, `${importer}:${name}`);
      if (reference.startsWith('link:')) {
        queue.push(
          resolveLinkedImporter(importer, reference, lockfile.importers),
        );
      }
    }
  }
  return importers;
}

export function buildProjectProjection(lockfile, rootImporter) {
  const importerPaths = workspaceImporterClosure(lockfile, rootImporter);
  const snapshotKeys = new Set();
  const packageKeys = new Set();
  const snapshotQueue = [];

  for (const importer of importerPaths) {
    for (const [name, value] of dependencyEntries(
      lockfile.importers[importer],
    )) {
      const reference = dependencyReference(value, `${importer}:${name}`);
      if (!reference.startsWith('link:')) {
        snapshotQueue.push(
          resolveSnapshotKey(name, reference, lockfile.snapshots),
        );
      }
    }
  }

  while (snapshotQueue.length > 0) {
    const snapshotKey = snapshotQueue.pop();
    if (snapshotKeys.has(snapshotKey)) continue;
    const snapshot = lockfile.snapshots[snapshotKey];
    if (!isPlainObject(snapshot)) {
      throw new Error(`Invalid snapshot record ${snapshotKey}`);
    }
    snapshotKeys.add(snapshotKey);
    packageKeys.add(packageKeyForSnapshot(snapshotKey, lockfile.packages));

    for (const section of ['dependencies', 'optionalDependencies']) {
      const dependencies = snapshot[section];
      if (dependencies === undefined) continue;
      if (!isPlainObject(dependencies)) {
        throw new Error(`Invalid ${section} mapping in ${snapshotKey}`);
      }
      for (const [name, reference] of Object.entries(dependencies)) {
        if (typeof reference !== 'string') {
          throw new Error(
            `Invalid transitive dependency ${name} in ${snapshotKey}`,
          );
        }
        snapshotQueue.push(
          resolveSnapshotKey(name, reference, lockfile.snapshots),
        );
      }
    }
  }

  const projection = {
    importers: Object.fromEntries(
      [...importerPaths]
        .toSorted((a, b) => a.localeCompare(b))
        .map((importer) => [importer, lockfile.importers[importer]]),
    ),
    packages: Object.fromEntries(
      [...packageKeys]
        .toSorted((a, b) => a.localeCompare(b))
        .map((packageKey) => [packageKey, lockfile.packages[packageKey]]),
    ),
    snapshots: Object.fromEntries(
      [...snapshotKeys]
        .toSorted((a, b) => a.localeCompare(b))
        .map((snapshotKey) => [snapshotKey, lockfile.snapshots[snapshotKey]]),
    ),
  };

  return {
    fingerprint: fingerprint(projection),
    importerPaths,
    packageKeys,
    projection,
    snapshotKeys,
  };
}

export function lockfileGlobalMetadata(lockfile) {
  return Object.fromEntries(
    Object.entries(lockfile).filter(([key]) => !LOCKFILE_GRAPH_KEYS.has(key)),
  );
}

function workspaceGlobalMetadata(workspace) {
  return Object.fromEntries(
    Object.entries(workspace).filter(
      ([key]) => key !== 'catalog' && key !== 'catalogs',
    ),
  );
}

function workspaceCatalogs(workspace) {
  return { catalog: workspace.catalog, catalogs: workspace.catalogs };
}

function emptyResult() {
  return {
    fresco_ui: false,
    interview: false,
    interviewer: false,
    reasons: {
      fresco_ui: [],
      interview: [],
      interviewer: [],
    },
  };
}

function mark(result, key, reason) {
  result[key] = true;
  if (!result.reasons[key].includes(reason)) result.reasons[key].push(reason);
}

function markAll(result, reason) {
  for (const key of PROJECT_KEYS) mark(result, key, reason);
}

function finalizeResult(result) {
  for (const key of PROJECT_KEYS) {
    result.reasons[key] = result.reasons[key].toSorted();
  }
  return result;
}

function failClosedResult(reason) {
  const result = emptyResult();
  markAll(result, `fail-closed: ${reason}`);
  return finalizeResult(result);
}

function isInertPath(changedPath) {
  return (
    changedPath.startsWith('.agents/') ||
    changedPath.startsWith('.changeset/') ||
    changedPath.startsWith('.claude/') ||
    changedPath.startsWith('docs/') ||
    changedPath === 'AGENTS.md' ||
    changedPath === 'CLAUDE.md' ||
    (!changedPath.includes('/') && changedPath.endsWith('.md'))
  );
}

function isGlobalPath(changedPath) {
  return (
    GLOBAL_PATHS.has(changedPath) ||
    changedPath.startsWith('.github/actions/turbo-ci-setup/') ||
    changedPath === '.github/workflows/chromatic.yml'
  );
}

function pathOwner(changedPath, importerPaths) {
  return [...importerPaths]
    .filter((importer) => importer !== '.')
    .toSorted((a, b) => b.length - a.length)
    .find(
      (importer) =>
        changedPath === importer || changedPath.startsWith(`${importer}/`),
    );
}

function readVersion(readFileAt, revision, manifestPath) {
  let manifest;
  try {
    manifest = JSON.parse(readFileAt(revision, manifestPath));
  } catch (error) {
    throw new Error(`Unable to read ${manifestPath} at ${revision}`, {
      cause: error,
    });
  }
  if (typeof manifest.version !== 'string') {
    throw new Error(`${manifestPath} at ${revision} has no version`);
  }
  return manifest.version;
}

function versionChanged(readFileAt, mainRevision, headRevision, manifestPath) {
  return (
    readVersion(readFileAt, mainRevision, manifestPath) !==
    readVersion(readFileAt, headRevision, manifestPath)
  );
}

function projectClosures(lockfile) {
  return Object.fromEntries(
    Object.entries(CHROMATIC_PROJECTS).map(([key, rootImporter]) => [
      key,
      workspaceImporterClosure(lockfile, rootImporter),
    ]),
  );
}

export function applyReleaseSeeds({
  result,
  releaseRef,
  mainLock,
  headLock,
  readFileAt,
  mainRevision = 'main',
  headRevision = 'head',
}) {
  if (!releaseRef) return;
  if (!RELEASE_REFS.has(releaseRef)) {
    markAll(result, `release: unknown release ref ${releaseRef}`);
    return;
  }
  if (
    releaseRef === 'changeset-release/documentation' ||
    releaseRef === 'changeset-release/studio' ||
    releaseRef === 'changeset-release/website'
  ) {
    return;
  }

  const mainClosures = projectClosures(mainLock);
  const headClosures = projectClosures(headLock);
  const projectContains = (key, importer) =>
    mainClosures[key].has(importer) || headClosures[key].has(importer);

  const normalReleaseImporters = new Set(
    [
      ...Object.keys(mainLock.importers),
      ...Object.keys(headLock.importers),
    ].filter(
      (importer) =>
        /^packages\/[^/]+$/.test(importer) ||
        importer === 'apps/architect' ||
        importer === 'apps/interviewer',
    ),
  );
  const changedImporters = [...normalReleaseImporters].filter((importer) =>
    versionChanged(
      readFileAt,
      mainRevision,
      headRevision,
      `${importer}/package.json`,
    ),
  );
  if (changedImporters.length === 0) {
    markAll(
      result,
      'release: normal lane has no readable package version change',
    );
    return;
  }
  for (const importer of changedImporters) {
    for (const key of PROJECT_KEYS) {
      if (projectContains(key, importer)) {
        mark(result, key, `release: ${importer} version changed`);
      }
    }
    if (!importer.startsWith('apps/')) continue;
    const mainAppClosure = workspaceImporterClosure(mainLock, importer);
    const headAppClosure = workspaceImporterClosure(headLock, importer);
    for (const [key, rootImporter] of Object.entries(CHROMATIC_PROJECTS)) {
      if (
        mainAppClosure.has(rootImporter) ||
        headAppClosure.has(rootImporter)
      ) {
        mark(result, key, `release: ${importer} ships ${rootImporter}`);
      }
    }
  }
}

export function classifyParsedChanges({
  baseLock,
  headLock,
  mainLock = headLock,
  baseWorkspace,
  headWorkspace,
  changedPaths,
  releaseRef = '',
  readFileAt = () => {
    throw new Error('No manifest reader was provided');
  },
  mainRevision = 'main',
  headRevision = 'head',
}) {
  const result = emptyResult();
  const lockChanged = changedPaths.includes('pnpm-lock.yaml');
  const workspaceChanged = changedPaths.includes('pnpm-workspace.yaml');
  const projections = {};

  if (
    lockChanged &&
    stableStringify(lockfileGlobalMetadata(baseLock)) !==
      stableStringify(lockfileGlobalMetadata(headLock))
  ) {
    markAll(result, 'lockfile: global metadata changed');
  }

  if (workspaceChanged) {
    if (
      stableStringify(workspaceGlobalMetadata(baseWorkspace)) !==
      stableStringify(workspaceGlobalMetadata(headWorkspace))
    ) {
      markAll(result, 'workspace: global configuration changed');
    } else if (
      stableStringify(workspaceCatalogs(baseWorkspace)) !==
        stableStringify(workspaceCatalogs(headWorkspace)) &&
      !lockChanged
    ) {
      markAll(
        result,
        'workspace: catalog changed without a corresponding lockfile change',
      );
    }
  }

  for (const [key, rootImporter] of Object.entries(CHROMATIC_PROJECTS)) {
    try {
      const base = buildProjectProjection(baseLock, rootImporter);
      const head = buildProjectProjection(headLock, rootImporter);
      projections[key] = {
        base,
        head,
        importerPaths: new Set([...base.importerPaths, ...head.importerPaths]),
      };
      if (lockChanged && base.fingerprint !== head.fingerprint) {
        mark(result, key, 'lockfile: reachable resolution graph changed');
      }
    } catch (error) {
      mark(result, key, `fail-closed: ${error.message}`);
    }
  }

  const allImporters = new Set([
    ...Object.keys(baseLock.importers),
    ...Object.keys(headLock.importers),
  ]);
  for (const changedPath of changedPaths) {
    if (SPECIAL_PATHS.has(changedPath) || isInertPath(changedPath)) continue;
    if (isGlobalPath(changedPath)) {
      markAll(result, `global: ${changedPath}`);
      continue;
    }
    const owner = pathOwner(changedPath, allImporters);
    if (owner) {
      for (const key of PROJECT_KEYS) {
        if (projections[key]?.importerPaths.has(owner)) {
          mark(result, key, `source: ${owner}`);
        }
      }
      continue;
    }
    markAll(result, `global: unrecognised path ${changedPath}`);
  }

  try {
    applyReleaseSeeds({
      result,
      releaseRef,
      mainLock,
      headLock,
      readFileAt,
      mainRevision,
      headRevision,
    });
  } catch (error) {
    markAll(result, `fail-closed: ${error.message}`);
  }

  return finalizeResult(result);
}

function git(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function readAtRevision(revision, filePath, cwd) {
  return git(['show', `${revision}:${filePath}`], cwd);
}

export function changedPathsBetween(base, head, cwd = process.cwd()) {
  return git(
    [
      'diff',
      '--name-only',
      '--no-renames',
      '--diff-filter=ACDMRTUXB',
      '-z',
      base,
      head,
    ],
    cwd,
  )
    .split('\0')
    .filter(Boolean);
}

export function classifyFromGit({
  base,
  head,
  releaseRef = '',
  main,
  cwd = process.cwd(),
}) {
  try {
    const changedPaths = changedPathsBetween(base, head, cwd);
    const baseLock = parseLockfile(
      readAtRevision(base, 'pnpm-lock.yaml', cwd),
      `${base}:pnpm-lock.yaml`,
    );
    const headLock = parseLockfile(
      readAtRevision(head, 'pnpm-lock.yaml', cwd),
      `${head}:pnpm-lock.yaml`,
    );
    const mainLock = releaseRef
      ? parseLockfile(
          readAtRevision(main, 'pnpm-lock.yaml', cwd),
          `${main}:pnpm-lock.yaml`,
        )
      : headLock;
    const baseWorkspace = parseYaml(
      readAtRevision(base, 'pnpm-workspace.yaml', cwd),
      `${base}:pnpm-workspace.yaml`,
    );
    const headWorkspace = parseYaml(
      readAtRevision(head, 'pnpm-workspace.yaml', cwd),
      `${head}:pnpm-workspace.yaml`,
    );
    return classifyParsedChanges({
      baseLock,
      headLock,
      mainLock,
      baseWorkspace,
      headWorkspace,
      changedPaths,
      releaseRef,
      readFileAt: (revision, filePath) =>
        readAtRevision(revision, filePath, cwd),
      mainRevision: main,
      headRevision: head,
    });
  } catch (error) {
    return failClosedResult(error.message);
  }
}

function option(args, name, { allowEmpty = false } = {}) {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) {
    const value = inline.slice(name.length + 1);
    if (value || allowEmpty) return value;
  }
  const index = args.indexOf(name);
  if (index !== -1) {
    const value = args[index + 1];
    if (value !== undefined && (value || allowEmpty)) return value;
  }
  throw new Error(`${name} is required`);
}

function runCli() {
  try {
    const args = process.argv.slice(2);
    const result = classifyFromGit({
      base: option(args, '--base'),
      head: option(args, '--head'),
      releaseRef: option(args, '--release-ref', { allowEmpty: true }),
      main: option(args, '--main'),
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runCli();
}
