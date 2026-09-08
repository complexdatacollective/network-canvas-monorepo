#!/usr/bin/env node
// Vendors workspace `@codaco/*` packages into a mirror-staged Fresco tree as
// packed tarballs, so the image built from that tree runs the packages' source
// from THIS checkout instead of installing whatever npm publishes under the
// same version numbers.
//
// Two callers, one mechanism:
//   - apps/fresco/release-test/scripts/bundle-pending-packages.mjs vendors the
//     packages the pending Changesets release plan will publish, so the
//     release-test image approximates the future released artifact.
//   - scripts/mirror-app.mjs --vendor-changed-since <ref> vendors the packages
//     whose source differs from <ref>, so a hotfix cut from a release tag
//     ships its cherry-picked library fixes without publishing anything to npm.
//
// Either way the staged tree gets: <stage>/vendor/*.tgz (pnpm pack applies
// publishConfig, exactly like `changeset publish`), pnpm overrides mapping
// each vendored package onto its tarball so direct AND transitive ranges
// resolve to it, grep-anchored Dockerfile edits so both install stages see
// vendor/, and a bundle-manifest.json recording what was vendored and what
// stayed on the registry.
//
// The repository root is the working directory, for the reason given in
// resolve-manifest.mjs: the hotfix lane runs main's copy of this file against
// another branch's tree.
//
// CLI:
//   node scripts/vendor-workspace-packages.mjs --assert-lockfile <stage-dir>
//     Fails unless the staged lockfile resolves every package named in
//     <stage-dir>/bundle-manifest.json to its tarball and nowhere else.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { parseCatalog } from './resolve-manifest.mjs';

// Read at call time rather than import time, so a caller that changes
// directory after importing (the tests do) is honoured.
const repoRoot = () => process.cwd();

// The fields that ship in a published manifest. A package's devDependencies
// never install for a consumer, so they neither extend the closure nor make
// the package a dependent of anything.
const PUBLISHED_DEP_FIELDS = [
  'dependencies',
  'optionalDependencies',
  'peerDependencies',
];

// Every field, for asking what a package is BUILT from: a devDependency (a
// shared tsconfig, a build tool) shapes the artifact even though it never
// ships in it. Runtime dependencies on other workspace packages are
// `withDependents`' business.
const ALL_DEP_FIELDS = [...PUBLISHED_DEP_FIELDS, 'devDependencies'];

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} exited with ${result.status}`);
  }
}

function readManifest(dir) {
  return JSON.parse(
    readFileSync(join(repoRoot(), dir, 'package.json'), 'utf8'),
  );
}

// The workspace packages `manifest` names in `fields`, in declaration order.
function workspaceDeps(manifest, fields) {
  const names = [];
  for (const field of fields) {
    for (const [name, spec] of Object.entries(manifest[field] ?? {})) {
      if (typeof spec === 'string' && spec.startsWith('workspace:')) {
        names.push(name);
      }
    }
  }
  return names;
}

// The app's published-workspace dependency closure: every non-private
// workspace package reachable from `appDir` through workspace: specifiers,
// sorted by name. The app contributes dependencies AND devDependencies (both
// install during the image build); packages contribute only the fields that
// ship in their published manifests.
export function collectClosure(wsPackages, appDir = 'apps/fresco') {
  const appManifest = readManifest(appDir);
  const appName = appManifest.name ?? appDir;
  const closure = new Set();
  const visit = (manifest, fields, from) => {
    for (const name of workspaceDeps(manifest, fields)) {
      const ws = wsPackages[name];
      if (!ws) throw new Error(`${from}: unknown workspace package ${name}`);
      if (ws.private) {
        // Private packages cannot appear in a published manifest's runtime
        // fields; the app's own private deps are dropped by resolveManifest.
        if (from === appName) continue;
        throw new Error(
          `${from} has a runtime workspace dependency on private package ${name}; it cannot be bundled.`,
        );
      }
      if (closure.has(name)) continue;
      closure.add(name);
      visit(readManifest(ws.dir), PUBLISHED_DEP_FIELDS, name);
    }
  };
  visit(appManifest, ['dependencies', 'devDependencies'], appName);
  return [...closure].toSorted((a, b) => a.localeCompare(b));
}

// The default catalog entries whose pinned version differs between `ref` and
// HEAD (added, removed or changed). A catalog that did not exist at `ref`
// counts as wholly changed.
function catalogEntriesChangedSince(ref) {
  const head = parseCatalog(
    readFileSync(join(repoRoot(), 'pnpm-workspace.yaml'), 'utf8'),
  );
  const shown = spawnSync('git', ['show', `${ref}:pnpm-workspace.yaml`], {
    cwd: repoRoot(),
    encoding: 'utf8',
  });
  const before = shown.status === 0 ? parseCatalog(shown.stdout) : {};
  const changed = new Set();
  for (const name of new Set([...Object.keys(before), ...Object.keys(head)])) {
    if (before[name] !== head[name]) changed.add(name);
  }
  return changed;
}

// The members of `names` whose built artifact would differ from the one
// `ref` produced: the package's own directory changed, a default catalog
// entry it consumes (in any field) was re-pinned, or a workspace package it
// is built with — a devDependency such as a shared tsconfig — changed. A
// hotfix that only re-pins a catalog entry used by one closure
// package must still vendor that package: the verify step builds it against
// the new pin, and an image installing the published artifact would not
// carry the change at all. Committed state only — a hotfix lane releases a
// checked-out branch, never a working tree — so any change under a directory
// counts, tests and stories included: a needless tarball costs bytes, a
// missing one ships stale code.
export function packagesChangedSince(ref, names, wsPackages) {
  const changedCatalog = catalogEntriesChangedSince(ref);
  const dirChanged = new Map();
  const directoryChanged = (name) => {
    if (!dirChanged.has(name)) {
      const { dir } = wsPackages[name];
      const result = spawnSync(
        'git',
        ['diff', '--quiet', ref, 'HEAD', '--', dir],
        { cwd: repoRoot(), encoding: 'utf8' },
      );
      if (result.status !== 0 && result.status !== 1) {
        throw new Error(
          `git diff --quiet ${ref} HEAD -- ${dir} exited with ${result.status}: ${result.stderr}`,
        );
      }
      dirChanged.set(name, result.status === 1);
    }
    return dirChanged.get(name);
  };

  return names.filter((name) => {
    if (directoryChanged(name)) return true;
    const manifest = readManifest(wsPackages[name].dir);
    for (const field of ALL_DEP_FIELDS) {
      for (const [dep, spec] of Object.entries(manifest[field] ?? {})) {
        if (typeof spec !== 'string') continue;
        if (spec.startsWith('catalog:') && changedCatalog.has(dep)) return true;
        if (
          field === 'devDependencies' &&
          spec.startsWith('workspace:') &&
          wsPackages[dep] &&
          directoryChanged(dep)
        ) {
          return true;
        }
      }
    }
    return false;
  });
}

// `names` plus every closure package that depends on one of them, directly or
// through other closure packages, in closure order. A dependent's published
// build is what the image would otherwise install, and that build was made
// against the dependency as it was — so a dependent goes into the image
// rebuilt from this tree too, whatever its own source did. The overrides make
// its ranges resolve to the vendored tarballs regardless.
export function withDependents(names, closure, wsPackages) {
  const selected = new Set(names);
  let grew = true;
  while (grew) {
    grew = false;
    for (const name of closure) {
      if (selected.has(name)) continue;
      const deps = workspaceDeps(
        readManifest(wsPackages[name].dir),
        PUBLISHED_DEP_FIELDS,
      );
      if (deps.some((dep) => selected.has(dep))) {
        selected.add(name);
        grew = true;
      }
    }
  }
  return closure.filter((name) => selected.has(name));
}

// pnpm pack names scoped tarballs codaco-<name>-<version>.tgz.
export function tarballName(name, version) {
  return `${name.replace('@', '').replace('/', '-')}-${version}.tgz`;
}

// Grep-anchored patch: fail loudly if the Dockerfile drifts rather than
// producing an image that silently skipped the vendoring.
function patchOnce(content, anchor, replacement, description) {
  if (!content.includes(anchor)) {
    throw new Error(
      `Staged Dockerfile has no line matching the ${description} anchor:\n  ${anchor}\nThe vendoring patch set needs updating for the current Dockerfile.`,
    );
  }
  return content.replace(anchor, replacement);
}

// The staged Dockerfile with the edits the vendored `tarballs` require. Pure,
// so the exact install lines can be asserted; `vendorPackages` writes it back.
export function patchDockerfileForVendor(dockerfile, tarballs) {
  // deps stage: pnpm resolves the file: overrides relative to /app, so the
  // tarballs must be in place before `pnpm i --frozen-lockfile`.
  dockerfile = patchOnce(
    dockerfile,
    'COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml prisma.config.ts env.js ./',
    'COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml prisma.config.ts env.js ./\nCOPY vendor ./vendor',
    'deps-stage dependency COPY',
  );

  // runner stage: make the vendored tarballs available to the runtime-deps
  // install (the builder stage has them via `COPY . .`).
  dockerfile = patchOnce(
    dockerfile,
    'COPY --from=builder /app/pnpm-lock.yaml /tmp/pnpm-lock.yaml',
    'COPY --from=builder /app/pnpm-lock.yaml /tmp/pnpm-lock.yaml\nCOPY --from=builder /app/vendor /tmp/vendor',
    'runner-stage lockfile COPY',
  );

  // runner stage: a vendored package's lockfile pin reads `file:vendor/...`
  // (a path that does not exist under /tmp/runtime), so its install must point
  // at the tarball; a registry-resolved package keeps the original LV() pin.
  const pvVendored = tarballs['@codaco/protocol-validation'];
  const scVendored = tarballs['@codaco/shared-consts'];
  if (pvVendored || scVendored) {
    const pvArg = pvVendored
      ? `      "/tmp/vendor/${pvVendored}"`
      : '      "@codaco/protocol-validation@$(LV @codaco/protocol-validation)"';
    // shared-consts is protocol-validation's dependency. Vendored, its tarball
    // is installed explicitly and dedupes against the caret range. Not
    // vendored while protocol-validation is, it still has to be named, at
    // the version the pnpm lock resolved: this is a fresh `npm install` with
    // no lockfile, and the vendored tarball's caret range would otherwise let
    // npm take whatever newer version the registry holds — different shared
    // constants for the startup scripts than for the bundle that was built
    // and certified.
    const scArg = scVendored
      ? ` \\\n      "/tmp/vendor/${scVendored}"`
      : pvVendored
        ? ' \\\n      "@codaco/shared-consts@$(LV @codaco/shared-consts)"'
        : '';
    dockerfile = patchOnce(
      dockerfile,
      '      "@codaco/protocol-validation@$(LV @codaco/protocol-validation)"; \\',
      `${pvArg}${scArg}; \\`,
      'runner-stage protocol-validation install',
    );
  }
  if (tarballs['@codaco/interview']) {
    dockerfile = patchOnce(
      dockerfile,
      '    npm pack --silent --pack-destination /tmp "@codaco/interview@$(LV @codaco/interview)"; \\',
      `    cp /tmp/vendor/${tarballs['@codaco/interview']} /tmp/codaco-interview-vendored.tgz; \\`,
      'runner-stage interview pack',
    );
  }
  return dockerfile;
}

// Vendors `names` (a subset of `closure`) into the staged tree and returns
// the bundle manifest: { vendored: { name: tarball }, registry: [names] }.
// With no names the tree is left untouched — the pure pipeline tree already
// matches an image that installs everything from the registry. `note` is the
// comment written above the overrides, naming which caller put them there.
export function vendorPackages({ stageDir, names, closure, wsPackages, note }) {
  const registry = closure.filter((name) => !names.includes(name));
  const manifest = { vendored: {}, registry };
  if (names.length === 0) return manifest;

  const vendorDir = join(stageDir, 'vendor');

  // 1. Pack. Each package's dist must already be built (callers run the turbo
  //    closure build first); pack applies publishConfig so each tarball is
  //    what `changeset publish` would upload.
  const tarballs = {};
  for (const name of names) {
    run('pnpm', ['--filter', name, 'pack', '--pack-destination', vendorDir], {
      cwd: repoRoot(),
    });
    const expected = tarballName(name, wsPackages[name].version);
    if (!existsSync(join(vendorDir, expected))) {
      throw new Error(
        `pnpm pack for ${name} did not produce vendor/${expected}`,
      );
    }
    tarballs[name] = expected;
    manifest.vendored[name] = expected;
  }

  // 2. Overrides: force every range for these packages (the app's, and the
  //    caret ranges inside the packed manifests) onto the tarballs.
  const workspaceYamlPath = join(stageDir, 'pnpm-workspace.yaml');
  const workspaceYaml = readFileSync(workspaceYamlPath, 'utf8');
  if (!/^overrides:$/m.test(workspaceYaml)) {
    throw new Error(
      `${workspaceYamlPath} has no overrides: block to extend; check frescoWorkspaceYaml in scripts/mirror-app.mjs.`,
    );
  }
  const overrideLines = names
    .map((name) => `  '${name}': 'file:vendor/${tarballs[name]}'`)
    .join('\n');
  writeFileSync(
    workspaceYamlPath,
    workspaceYaml.replace(
      /^overrides:$/m,
      `overrides:\n  # ${note}\n${overrideLines}`,
    ),
  );

  // 3. Dockerfile patches — only where a vendored package requires them; the
  //    registry-resolved remainder keeps the original Dockerfile lines.
  const dockerfilePath = join(stageDir, 'Dockerfile');
  writeFileSync(
    dockerfilePath,
    patchDockerfileForVendor(readFileSync(dockerfilePath, 'utf8'), tarballs),
  );

  return manifest;
}

export function writeBundleManifest(stageDir, manifest) {
  writeFileSync(
    join(stageDir, 'bundle-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}

// The lockfile is what the Dockerfile's `--frozen-lockfile` install obeys, so
// a vendored package that the lockfile still resolves from the registry — or
// resolves BOTH ways, through some range the override missed — would put
// registry code in the image while the manifest claims otherwise.
export function assertVendoredLockfile(stageDir, manifest) {
  const lockfile = readFileSync(join(stageDir, 'pnpm-lock.yaml'), 'utf8');
  const problems = [];
  for (const [name, tarball] of Object.entries(manifest.vendored)) {
    if (!lockfile.includes(`file:vendor/${tarball}`)) {
      problems.push(
        `${name}: no file:vendor/${tarball} resolution in lockfile`,
      );
    }
    if (new RegExp(`${name}@\\d`).test(lockfile)) {
      problems.push(`${name}: vendored but also resolved from the registry`);
    }
  }
  if (problems.length) {
    throw new Error(
      `vendoring guard failed:\n${problems.map((p) => `  ${p}`).join('\n')}`,
    );
  }
  const vendored = Object.keys(manifest.vendored).length;
  return `${vendored} vendored, ${manifest.registry.length} from registry (${manifest.registry.join(', ') || 'none'})`;
}

function main(argv) {
  const at = argv.indexOf('--assert-lockfile');
  const stageDir = at !== -1 && argv[at + 1] ? resolve(argv[at + 1]) : null;
  if (!stageDir) {
    console.error(
      'Usage: node scripts/vendor-workspace-packages.mjs --assert-lockfile <stage-dir>',
    );
    process.exit(1);
  }
  const manifest = JSON.parse(
    readFileSync(join(stageDir, 'bundle-manifest.json'), 'utf8'),
  );
  console.log(
    `bundling guard OK: ${assertVendoredLockfile(stageDir, manifest)}`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main(process.argv.slice(2));
}
