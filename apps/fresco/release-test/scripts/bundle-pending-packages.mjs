#!/usr/bin/env node
// Bundles workspace `@codaco/*` packages into a mirror-staged Fresco tree
// (produced by `MIRROR_STAGE_DIR=... scripts/mirror-app.mjs`), so the
// release-test image approximates the artifact a release would build instead
// of silently installing the currently published library versions from npm.
//
// Which packages, by which rule:
//   - Default: the packages the PENDING release will actually publish, from
//     Changesets' assembled release plan. Pre-publish, the pending source
//     carries the same version numbers as the registry, so a plain lockfile
//     resolution cannot distinguish them — tarballs can.
//   - `--changed-since <ref>`: the packages whose source differs from <ref>,
//     plus their dependents — the rule the hotfix lane applies
//     (`scripts/mirror-app.mjs --vendor-changed-since`), so a hotfix branch
//     cut from a release tag is certified against the image that lane would
//     ship. The branch's own package.json already carries the hotfix version,
//     so no planned version is applied.
//
// The mechanism — packing, overrides, Dockerfile patches, the manifest — is
// scripts/vendor-workspace-packages.mjs, shared with that lane. Only the
// staged tree is touched; the real Dockerfile and mirror pipeline are not.
//
// Usage: node apps/fresco/release-test/scripts/bundle-pending-packages.mjs <stage-dir> [--changed-since <ref>]
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

import { readWorkspacePackages } from '../../../../scripts/resolve-manifest.mjs';
import {
  collectClosure,
  packagesChangedSince,
  vendorPackages,
  withDependents,
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

// Packages the pending release will actually publish, from Changesets' own
// assembled release plan (`changeset status`) — NOT from changeset
// frontmatter, which understates the plan: a major bump invalidates
// dependents' caret ranges and the planner auto-adds those dependents as
// patch releases no changeset names. Only planned releases may be vendored —
// an unplanned workspace package is not republished, so the released image
// installs its registry version; vendoring it would test a dependency
// combination that never ships.
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

function parseArgs(argv) {
  /** @type {{ stageDir: string | null, changedSince: string | null }} */
  const args = { stageDir: null, changedSince: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--changed-since') {
      args.changedSince = argv[i + 1] ?? null;
      i += 1;
    } else if (!args.stageDir) {
      args.stageDir = resolve(argv[i]);
    }
  }
  return args;
}

function main() {
  const { stageDir, changedSince } = parseArgs(process.argv.slice(2));
  if (!stageDir || !existsSync(join(stageDir, 'Dockerfile'))) {
    console.error(
      'Usage: node apps/fresco/release-test/scripts/bundle-pending-packages.mjs <stage-dir> [--changed-since <ref>]\n' +
        '<stage-dir> must be a mirror-staged Fresco tree (Dockerfile at its root).',
    );
    process.exit(1);
  }

  const wsPackages = readWorkspacePackages();
  const closure = collectClosure(wsPackages, 'apps/fresco');

  let names;
  let note;
  let plannedAppVersion = null;
  if (changedSince) {
    names = withDependents(
      packagesChangedSince(changedSince, closure, wsPackages),
      closure,
      wsPackages,
    );
    note = `Packages changed since ${changedSince} (and their dependents), bundled by release-test (local tarballs).`;
  } else {
    const pending = collectPendingReleases();
    names = closure.filter((name) => pending.has(name));
    note =
      'Packages this release publishes, bundled by release-test (local tarballs).';
    plannedAppVersion = applyPlannedAppVersion(stageDir, pending);
  }

  const manifest = {
    ...vendorPackages({ stageDir, names, closure, wsPackages, note }),
    plannedAppVersion,
  };
  writeBundleManifest(stageDir, manifest);
  console.log(JSON.stringify(manifest, null, 2));
}

main();
