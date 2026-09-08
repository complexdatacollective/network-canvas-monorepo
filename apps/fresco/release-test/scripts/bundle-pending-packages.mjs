#!/usr/bin/env node
// Bundles the PENDING workspace `@codaco/*` packages into a mirror-staged
// Fresco tree (produced by `MIRROR_STAGE_DIR=... scripts/mirror-app.mjs`), so
// the release-test image approximates the FUTURE released artifact instead of
// silently installing the currently published (stale) library versions from
// npm. Pre-publish, the pending source carries the same version numbers as the
// registry, so a plain lockfile resolution cannot distinguish them — tarballs
// can.
//
// Which packages: the ones the pending release will actually PUBLISH — the
// packages in Changesets' assembled release plan (including auto-bumped
// dependents of major bumps) plus every closure package whose current version
// is not on npm: `changeset publish` publishes any public package whose
// version the registry lacks, changeset or not — a first publication, or a
// version an earlier publish run left behind. Closure packages that are
// neither are left to registry resolution — the released image will install
// their published versions, so vendoring them would test a dependency
// combination that never ships. The mechanism — packing, overrides,
// Dockerfile patches, the manifest — is scripts/vendor-workspace-packages.mjs,
// shared with the hotfix lane (`scripts/mirror-app.mjs --vendor-changed-since`,
// which build-image.sh runs directly when certifying a hotfix branch). Only
// the staged tree is touched; the real Dockerfile and mirror pipeline are not.
//
// Usage: node apps/fresco/release-test/scripts/bundle-pending-packages.mjs <stage-dir>
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  DEFAULT_REGISTRY_URL,
  npmVersionUrl,
} from '../../../../scripts/check-npm-version-collisions.mjs';
import { readWorkspacePackages } from '../../../../scripts/resolve-manifest.mjs';
import {
  collectClosure,
  vendorPackages,
  writeBundleManifest,
} from '../../../../scripts/vendor-workspace-packages.mjs';

// The repository root is the working directory (see resolve-manifest.mjs).
const repoRoot = process.cwd();

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} exited with ${result.status}`);
  }
}

// Packages the pending release will bump, from Changesets' own assembled
// release plan (`changeset status`) — NOT from changeset frontmatter, which
// understates the plan: a major bump invalidates dependents' caret ranges and
// the planner auto-adds those dependents as patch releases no changeset names.
function collectPendingReleases() {
  const planPath = join(
    mkdtempSync(join(tmpdir(), 'release-plan-')),
    'release-plan.json',
  );
  run('pnpm', ['exec', 'changeset', 'status', '--output', planPath], {
    cwd: repoRoot,
  });
  const plan = JSON.parse(readFileSync(planPath, 'utf8'));
  rmSync(join(planPath, '..'), { recursive: true, force: true });
  const releases = new Map(
    plan.releases
      .filter((release) => release.type !== 'none')
      .map((release) => [release.name, release.newVersion]),
  );
  return releases;
}

// The closure packages `changeset publish` will publish without a changeset
// naming them: those whose current version the registry does not have. On
// 2026-09-08 that was @codaco/app-i18n 0.1.0 — a first publication that no
// changeset planned, so the bundler left it to the registry and the staged
// lockfile could not resolve it at all.
//
// Nothing short of a definite answer will do: guessing "published" would test
// the registry's older (or absent) code, guessing "unpublished" would vendor
// code the release does not ship.
export async function unpublishedAtCurrentVersion(
  names,
  wsPackages,
  {
    registryUrl = DEFAULT_REGISTRY_URL,
    fetchImpl = fetch,
    timeoutMs = 15_000,
  } = {},
) {
  const unpublished = [];
  for (const name of names) {
    const { version } = wsPackages[name];
    const url = npmVersionUrl(registryUrl, name, version);
    let response;
    try {
      response = await fetchImpl(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new Error(
        `Could not check whether ${name}@${version} is on npm: ${error.message}`,
        { cause: error },
      );
    }
    if (response.status === 404) {
      unpublished.push(name);
      continue;
    }
    if (response.status !== 200) {
      throw new Error(
        `Could not check whether ${name}@${version} is on npm: registry returned HTTP ${response.status}.`,
      );
    }
  }
  return unpublished;
}

// Vendor what the release publishes — the planned bumps and the versions npm
// lacks — and leave the rest to the registry, in closure order.

// Vendor what the release publishes — the planned bumps and the versions npm
// lacks — and leave the rest to the registry, in closure order.
export function partitionClosure({ closure, planned, unpublished }) {
  const vendored = closure.filter(
    (name) => planned.has(name) || unpublished.includes(name),
  );
  const registry = closure.filter((name) => !vendored.includes(name));
  return { vendored, registry };
}

// The staged manifest still carries the RELEASED version (the Version
// Packages PR bumps it only on merge), but the real mirror is built after
// that bump — so bake the planned version in, or APP_VERSION and every
// version-derived behaviour under test would be the previous release's.
function applyPlannedAppVersion(stageDir, releases) {
  const plannedVersion = releases.get('fresco');
  if (!plannedVersion) return null;
  const manifestPath = join(stageDir, 'package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.version = plannedVersion;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return plannedVersion;
}

async function main() {
  const stageDir = process.argv[2] && resolve(process.argv[2]);
  if (!stageDir || !existsSync(join(stageDir, 'Dockerfile'))) {
    console.error(
      'Usage: node apps/fresco/release-test/scripts/bundle-pending-packages.mjs <stage-dir>\n' +
        '<stage-dir> must be a mirror-staged Fresco tree (Dockerfile at its root).',
    );
    process.exit(1);
  }

  const wsPackages = readWorkspacePackages();
  const closure = collectClosure(wsPackages, 'apps/fresco');
  const pending = collectPendingReleases();
  const unpublished = await unpublishedAtCurrentVersion(
    closure.filter((name) => !pending.has(name)),
    wsPackages,
    {
      registryUrl:
        process.env.NPM_REGISTRY_URL ||
        process.env.npm_config_registry ||
        DEFAULT_REGISTRY_URL,
    },
  );
  const { vendored: names } = partitionClosure({
    closure,
    planned: pending,
    unpublished,
  });
  const plannedAppVersion = applyPlannedAppVersion(stageDir, pending);

  const manifest = {
    ...vendorPackages({
      stageDir,
      names,
      closure,
      wsPackages,
      note: 'Packages this release publishes, bundled by release-test (local tarballs).',
    }),
    unpublished,
    plannedAppVersion,
  };
  writeBundleManifest(stageDir, manifest);
  console.log(JSON.stringify(manifest, null, 2));
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
