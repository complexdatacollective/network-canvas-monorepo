#!/usr/bin/env node
// Release-lane guard: every package the lane publishes must already exist on
// npm.
//
// The release job publishes through npm trusted publishing (OIDC), and npm
// only lets a trusted publisher be configured on a package that already
// exists (npm/cli#8544) — so the lane can update packages but never create
// one. Every first publication is made by hand (CLAUDE.md, "First
// publications are made by hand"). `changeset publish` does not know that: it
// publishes every public package whose current version is absent from npm,
// changeset or not, in dependency order, and stops at the first failure — so
// a never-published package fails the whole publish run and leaves every
// package after it unpublished on main.
//
// Two call sites, one predicate:
//   version-packages-freshness (the Version Packages PR / merge-group tree)
//     always checks, and refuses the merge that would reach the publish path.
//   release (push to main), with --publish-path-only, checks only when no
//     normal-lane changeset remains — the tree changesets/action would
//     publish — and stops the job before the action publishes anything. While
//     changesets are pending the run only regenerates the release PR, so it is
//     left alone and never blocked on npm being reachable.
//
// Anything short of a definite answer from npm fails the check: a package that
// cannot be judged must not be published on a guess.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { readChangesets } from './changeset-app-utils.mjs';
import {
  DEFAULT_REGISTRY_URL,
  npmPackageUrl,
} from './check-npm-version-collisions.mjs';
import { unconsumedChangesets } from './check-version-packages-freshness.mjs';
import { collectWorkspacePackages } from './release-e2e-policy.mjs';

function ignoredPackages(repoRoot) {
  const config = JSON.parse(
    readFileSync(join(repoRoot, '.changeset', 'config.json'), 'utf8'),
  );
  return new Set(config.ignore ?? []);
}

// The packages `changeset publish` considers: public, and outside the
// changeset config's ignore list (the separately gated products).
export function lanePackages(repoRoot) {
  const ignored = ignoredPackages(repoRoot);
  const packages = [];
  for (const [name, { dir }] of collectWorkspacePackages(repoRoot)) {
    if (ignored.has(name)) continue;
    const manifest = JSON.parse(
      readFileSync(join(repoRoot, dir, 'package.json'), 'utf8'),
    );
    if (manifest.private === true) continue;
    if (typeof manifest.version !== 'string' || manifest.version.length === 0) {
      throw new Error(`${dir}/package.json is public but has no version.`);
    }
    packages.push({ name, version: manifest.version, dir });
  }
  return packages.toSorted((a, b) => a.name.localeCompare(b.name));
}

// Splits the lane packages into those npm has never heard of (the lane cannot
// publish them) and those whose current version npm lacks (the next publish
// run adds them). Every other outcome — a network failure, a non-2xx status,
// metadata without a version list — is a refusal, never a pass.
export async function classifyLanePackages(
  packages,
  {
    registryUrl = DEFAULT_REGISTRY_URL,
    fetchImpl = fetch,
    timeoutMs = 15_000,
  } = {},
) {
  const neverPublished = [];
  const pendingVersions = [];
  for (const pkg of packages) {
    let response;
    try {
      response = await fetchImpl(npmPackageUrl(registryUrl, pkg.name), {
        // The abbreviated document carries the version list without every
        // version's full manifest.
        headers: {
          accept:
            'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8',
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new Error(
        `Could not verify ${pkg.name} against npm: ${error.message}`,
        { cause: error },
      );
    }
    if (response.status === 404) {
      neverPublished.push(pkg);
      continue;
    }
    if (response.status !== 200) {
      throw new Error(
        `Could not verify ${pkg.name} against npm: registry returned HTTP ${response.status}.`,
      );
    }
    let packument;
    try {
      packument = await response.json();
    } catch (error) {
      throw new Error(
        `Could not parse npm metadata for ${pkg.name}: ${error.message}`,
        { cause: error },
      );
    }
    const versions = packument?.versions;
    if (typeof versions !== 'object' || versions === null) {
      throw new Error(
        `Could not verify ${pkg.name} against npm: registry metadata lists no versions.`,
      );
    }
    if (!Object.hasOwn(versions, pkg.version)) pendingVersions.push(pkg);
  }
  return { neverPublished, pendingVersions };
}

async function main() {
  const args = process.argv.slice(2);
  const publishPathOnly = args.includes('--publish-path-only');
  const unknown = args.filter((arg) => arg !== '--publish-path-only');
  if (unknown.length > 0) {
    console.error(
      `Unknown argument(s): ${unknown.join(' ')}\n` +
        'Usage: node scripts/check-first-publications.mjs [--publish-path-only]',
    );
    process.exitCode = 1;
    return;
  }

  const repoRoot = process.cwd();
  if (publishPathOnly) {
    const pending = unconsumedChangesets(
      readChangesets(join(repoRoot, '.changeset')),
      ignoredPackages(repoRoot),
    );
    if (pending.length > 0) {
      console.log(
        `${pending.length} normal-lane changeset(s) pending: this run regenerates the release PR and publishes\n` +
          'nothing, so the npm check is skipped. The Version Packages merge check refuses the merge that\n' +
          'would reach the publish path while npm lacks a package.',
      );
      return;
    }
  }

  const registryUrl =
    process.env.NPM_REGISTRY_URL ||
    process.env.npm_config_registry ||
    DEFAULT_REGISTRY_URL;
  const packages = lanePackages(repoRoot);
  const { neverPublished, pendingVersions } = await classifyLanePackages(
    packages,
    { registryUrl },
  );

  if (neverPublished.length === 0) {
    console.log(
      `npm knows every package the lane publishes (${packages.length}). ` +
        (pendingVersions.length === 0
          ? 'Nothing is waiting to be published.'
          : `The next publish run adds: ${pendingVersions
              .map((pkg) => `${pkg.name}@${pkg.version}`)
              .join(', ')}`),
    );
    return;
  }

  console.error(
    'The release lane cannot publish these packages. It publishes through npm trusted publishing,\n' +
      'which only publishes to a package npm already knows, and npm has no package named:\n',
  );
  for (const pkg of neverPublished) {
    console.error(`  ${pkg.name}@${pkg.version}  (${pkg.dir})`);
  }
  console.error(
    '\n`changeset publish` publishes every public package whose current version is absent from npm,\n' +
      'changeset or not, and stops at the first failure — so the next publish run would fail here and\n' +
      'leave every package after it unpublished. Publish each first version by hand, then configure its\n' +
      'trusted publisher: see "First publications are made by hand" in CLAUDE.md.',
  );
  process.exitCode = 1;
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
