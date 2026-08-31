#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { collectWorkspacePackages } from './release-e2e-policy.mjs';

const DEFAULT_REGISTRY_URL = 'https://registry.npmjs.org/';
const FIRST_PUBLICATION_APPROVALS_PATH = '.github/npm-first-publications.json';

function git(repoRoot, args) {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function parseManifest(text, manifestPath) {
  let manifest;
  try {
    manifest = JSON.parse(text);
  } catch (error) {
    throw new Error(`Could not parse ${manifestPath}: ${error.message}`);
  }

  if (typeof manifest !== 'object' || manifest === null) {
    throw new Error(`${manifestPath} must contain a JSON object.`);
  }

  return manifest;
}

function manifestAtRef(repoRoot, ref, manifestPath) {
  const exists = spawnSync(
    'git',
    ['cat-file', '-e', `${ref}:${manifestPath}`],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'ignore', 'pipe'],
    },
  );

  if (exists.status !== 0) return null;

  return parseManifest(
    git(repoRoot, ['show', `${ref}:${manifestPath}`]),
    `${manifestPath} at ${ref}`,
  );
}

function firstPublicationApprovalKey({ manifestPath, name, version }) {
  return `${manifestPath}\0${name}\0${version}`;
}

function parseFirstPublicationApprovals(document, source) {
  if (
    typeof document !== 'object' ||
    document === null ||
    !Array.isArray(document.approvals)
  ) {
    throw new Error(`${source} must contain an approvals array.`);
  }

  const approvals = new Map();
  for (const [index, approval] of document.approvals.entries()) {
    if (
      typeof approval !== 'object' ||
      approval === null ||
      typeof approval.manifestPath !== 'string' ||
      typeof approval.name !== 'string' ||
      typeof approval.version !== 'string' ||
      typeof approval.reason !== 'string' ||
      approval.reason.trim().length === 0
    ) {
      throw new Error(
        `${source} approval ${index + 1} must contain manifestPath, name, version, and a non-empty reason.`,
      );
    }

    const key = firstPublicationApprovalKey(approval);
    if (approvals.has(key)) {
      throw new Error(
        `${source} contains a duplicate approval for ${approval.name}@${approval.version}.`,
      );
    }
    approvals.set(key, approval);
  }

  return approvals;
}

function firstPublicationApprovalsAtRef(repoRoot, ref) {
  const document = manifestAtRef(
    repoRoot,
    ref,
    FIRST_PUBLICATION_APPROVALS_PATH,
  );
  if (document === null) return new Map();
  return parseFirstPublicationApprovals(
    document,
    `${FIRST_PUBLICATION_APPROVALS_PATH} at ${ref}`,
  );
}

function addedFirstPublicationApprovals(repoRoot, baseRef) {
  let currentDocument;
  try {
    currentDocument = parseManifest(
      readFileSync(
        path.join(repoRoot, FIRST_PUBLICATION_APPROVALS_PATH),
        'utf8',
      ),
      FIRST_PUBLICATION_APPROVALS_PATH,
    );
  } catch (error) {
    if (error.code === 'ENOENT') return new Map();
    throw error;
  }

  const current = parseFirstPublicationApprovals(
    currentDocument,
    FIRST_PUBLICATION_APPROVALS_PATH,
  );
  const previous = firstPublicationApprovalsAtRef(repoRoot, baseRef);

  return new Map([...current].filter(([key]) => !previous.has(key)));
}

export function npmVersionUrl(registryUrl, packageName, version) {
  const base = registryUrl.endsWith('/') ? registryUrl : `${registryUrl}/`;
  // npm's scoped-package endpoint keeps the leading @ readable but must encode
  // the scope separator, or the package name becomes two URL path segments.
  const encodedName = encodeURIComponent(packageName).replace(/^%40/, '@');
  return new URL(`${encodedName}/${encodeURIComponent(version)}`, base).href;
}

function npmPackageUrl(registryUrl, packageName) {
  const base = registryUrl.endsWith('/') ? registryUrl : `${registryUrl}/`;
  const encodedName = encodeURIComponent(packageName).replace(/^%40/, '@');
  return new URL(encodedName, base).href;
}

export function changedPublicPackageVersions({ repoRoot, baseRef }) {
  git(repoRoot, ['rev-parse', '--verify', `${baseRef}^{commit}`]);

  const workspaceManifestPaths = new Set(
    [...collectWorkspacePackages(repoRoot).values()].map(
      ({ dir }) => `${dir}/package.json`,
    ),
  );
  if (workspaceManifestPaths.size === 0) return [];

  const output = git(repoRoot, [
    'diff',
    '--name-only',
    '--diff-filter=ACMR',
    baseRef,
    'HEAD',
    '--',
    ...workspaceManifestPaths,
  ]);

  if (!output) return [];

  const changed = [];
  for (const manifestPath of output.split('\n')) {
    if (!workspaceManifestPaths.has(manifestPath)) continue;

    const current = parseManifest(
      readFileSync(path.join(repoRoot, manifestPath), 'utf8'),
      manifestPath,
    );
    if (current.private === true) continue;

    if (typeof current.name !== 'string' || current.name.length === 0) {
      throw new Error(`${manifestPath} is public but has no package name.`);
    }
    if (typeof current.version !== 'string' || current.version.length === 0) {
      throw new Error(`${manifestPath} is public but has no package version.`);
    }

    const previous = manifestAtRef(repoRoot, baseRef, manifestPath);
    if (
      previous?.private !== true &&
      previous?.name === current.name &&
      previous?.version === current.version
    ) {
      continue;
    }

    changed.push({
      manifestPath,
      name: current.name,
      previousVersion:
        typeof previous?.version === 'string' ? previous.version : null,
      version: current.version,
    });
  }

  return changed;
}

export async function checkNpmVersionCollisions({
  repoRoot,
  baseRef,
  registryUrl = DEFAULT_REGISTRY_URL,
  fetchImpl = fetch,
  timeoutMs = 15_000,
}) {
  const candidates = changedPublicPackageVersions({ repoRoot, baseRef });
  const firstPublicationApprovals = addedFirstPublicationApprovals(
    repoRoot,
    baseRef,
  );
  const usedFirstPublicationApprovals = new Set();

  for (const candidate of candidates) {
    const url = npmVersionUrl(registryUrl, candidate.name, candidate.version);
    let response;
    try {
      response = await fetchImpl(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new Error(
        `Could not verify ${candidate.name}@${candidate.version} against npm: ${error.message}`,
      );
    }

    if (response.status === 200) {
      throw new Error(
        `npm version collision: ${candidate.name}@${candidate.version} already exists. ` +
          `Choose a new version before merging; npm versions are immutable.`,
      );
    }

    if (response.status === 404) {
      // npm removes an unpublished version from the exact-version endpoint but
      // retains its publication timestamp in the full package document.
      const packageUrl = npmPackageUrl(registryUrl, candidate.name);
      let packageResponse;
      try {
        packageResponse = await fetchImpl(packageUrl, {
          headers: { accept: 'application/json' },
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        throw new Error(
          `Could not verify npm publication history for ${candidate.name}: ${error.message}`,
          { cause: error },
        );
      }

      if (packageResponse.status === 404) {
        const approvalKey = firstPublicationApprovalKey(candidate);
        if (firstPublicationApprovals.has(approvalKey)) {
          usedFirstPublicationApprovals.add(approvalKey);
          continue;
        }

        throw new Error(
          `Could not prove ${candidate.name}@${candidate.version} is publishable: ` +
            `npm has no package metadata, which is indistinguishable from a fully unpublished package. ` +
            `For a genuinely new package, add an exact, reasoned approval to ${FIRST_PUBLICATION_APPROVALS_PATH} in this pull request.`,
        );
      }
      if (packageResponse.status !== 200) {
        throw new Error(
          `Could not verify npm publication history for ${candidate.name}: ` +
            `registry returned HTTP ${packageResponse.status}.`,
        );
      }

      let packument;
      try {
        packument = await packageResponse.json();
      } catch (error) {
        throw new Error(
          `Could not parse npm publication history for ${candidate.name}: ${error.message}`,
          { cause: error },
        );
      }

      if (
        typeof packument !== 'object' ||
        packument === null ||
        typeof packument.time !== 'object' ||
        packument.time === null ||
        Array.isArray(packument.time)
      ) {
        throw new Error(
          `Could not verify npm publication history for ${candidate.name}: ` +
            `registry metadata has no version history.`,
        );
      }

      if (
        Object.prototype.hasOwnProperty.call(packument.time, candidate.version)
      ) {
        throw new Error(
          `npm version collision: ${candidate.name}@${candidate.version} was previously published and unpublished. ` +
            `Choose a new version before merging; npm versions are immutable.`,
        );
      }

      continue;
    }

    throw new Error(
      `Could not verify ${candidate.name}@${candidate.version} against npm: ` +
        `registry returned HTTP ${response.status}.`,
    );
  }

  const unusedFirstPublicationApprovals = [...firstPublicationApprovals]
    .filter(([key]) => !usedFirstPublicationApprovals.has(key))
    .map(([, approval]) => `${approval.name}@${approval.version}`);
  if (unusedFirstPublicationApprovals.length > 0) {
    throw new Error(
      `Unused first-publication approval(s): ${unusedFirstPublicationApprovals.join(', ')}. ` +
        `Approvals must be added only in the pull request that first needs them.`,
    );
  }

  return candidates;
}

function option(args, name) {
  const index = args.indexOf(name);
  if (index === -1 || !args[index + 1]) {
    throw new Error(`Missing required ${name} argument.`);
  }
  return args[index + 1];
}

async function main() {
  const baseRef = option(process.argv.slice(2), '--base');
  const registryUrl =
    process.env.NPM_REGISTRY_URL ||
    process.env.npm_config_registry ||
    DEFAULT_REGISTRY_URL;
  const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
  );
  const checked = await checkNpmVersionCollisions({
    repoRoot,
    baseRef,
    registryUrl,
  });

  if (checked.length === 0) {
    console.log(
      'npm version collision check: no changed public package versions',
    );
    return;
  }

  console.log(
    `npm version collision check: ${checked.map(({ name, version }) => `${name}@${version}`).join(', ')} are available`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
