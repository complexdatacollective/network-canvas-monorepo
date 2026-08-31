#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DEFAULT_REGISTRY_URL = 'https://registry.npmjs.org/';
const PACKAGE_MANIFEST_PATHSPEC = ':(glob)packages/*/package.json';

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

export function npmVersionUrl(registryUrl, packageName, version) {
  const base = registryUrl.endsWith('/') ? registryUrl : `${registryUrl}/`;
  // npm's scoped-package endpoint keeps the leading @ readable but must encode
  // the scope separator, or the package name becomes two URL path segments.
  const encodedName = encodeURIComponent(packageName).replace(/^%40/, '@');
  return new URL(`${encodedName}/${encodeURIComponent(version)}`, base).href;
}

export function changedPublicPackageVersions({ repoRoot, baseRef }) {
  git(repoRoot, ['rev-parse', '--verify', `${baseRef}^{commit}`]);

  const output = git(repoRoot, [
    'diff',
    '--name-only',
    '--diff-filter=ACMR',
    baseRef,
    'HEAD',
    '--',
    PACKAGE_MANIFEST_PATHSPEC,
  ]);

  if (!output) return [];

  const changed = [];
  for (const manifestPath of output.split('\n')) {
    if (!/^packages\/[^/]+\/package\.json$/.test(manifestPath)) continue;

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
    if (previous?.version === current.version) continue;

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

    if (response.status === 404) continue;
    if (response.status === 200) {
      throw new Error(
        `npm version collision: ${candidate.name}@${candidate.version} already exists. ` +
          `Choose a new version before merging; npm versions are immutable.`,
      );
    }

    throw new Error(
      `Could not verify ${candidate.name}@${candidate.version} against npm: ` +
        `registry returned HTTP ${response.status}.`,
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
