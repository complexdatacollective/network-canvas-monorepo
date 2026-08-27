#!/usr/bin/env node
// Bundles the PENDING workspace `@codaco/*` packages into a mirror-staged
// Fresco tree (produced by `MIRROR_STAGE_DIR=... scripts/mirror-app.mjs`), so
// the release-test image approximates the FUTURE released artifact instead of
// silently installing the currently published (stale) library versions from
// npm. Pre-publish, the pending source carries the same version numbers as the
// registry, so a plain lockfile resolution cannot distinguish them — tarballs
// can.
//
// What it does to the staged tree (and only the staged tree — the real
// Dockerfile and mirror pipeline are untouched):
//   1. `pnpm pack`s every published @codaco package in Fresco's workspace
//      dependency closure into <stage>/vendor/ (pack applies publishConfig,
//      exactly like `changeset publish`).
//   2. Adds pnpm overrides mapping each of those packages to its tarball, so
//      direct AND transitive ranges resolve to the pending code.
//   3. Patches the staged Dockerfile with grep-anchored edits (the same
//      fail-loud pattern mirror-app.mjs uses for the vitest config) so the
//      deps stage can see vendor/ and the runner stage installs its @codaco
//      runtime deps from the tarballs instead of the registry.
//
// Usage: node apps/fresco/release-test/scripts/bundle-pending-packages.mjs <stage-dir>
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readWorkspacePackages } from '../../../../scripts/resolve-manifest.mjs';

const repoRoot = fileURLToPath(new URL('../../../..', import.meta.url));

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} exited with ${result.status}`);
  }
}

// Fresco's published-workspace dependency closure: every non-private @codaco
// workspace package reachable from apps/fresco through workspace: specifiers.
// The app contributes dependencies AND devDependencies (both install during
// the image build); packages contribute only the fields that ship in their
// published manifests.
function collectClosure(wsPackages) {
  const packageDirs = {};
  for (const group of ['packages', 'tooling']) {
    const base = join(repoRoot, group);
    for (const entry of readdirSync(base)) {
      const pkgPath = join(base, entry, 'package.json');
      if (!existsSync(pkgPath)) continue;
      const json = JSON.parse(readFileSync(pkgPath, 'utf8'));
      if (json.name) packageDirs[json.name] = join(base, entry);
    }
  }

  const closure = new Set();
  const visit = (manifest, fields, from) => {
    for (const field of fields) {
      for (const [name, spec] of Object.entries(manifest[field] ?? {})) {
        if (typeof spec !== 'string' || !spec.startsWith('workspace:')) {
          continue;
        }
        const ws = wsPackages[name];
        if (!ws) throw new Error(`${from}: unknown workspace package ${name}`);
        if (ws.private) {
          // Private packages cannot appear in a published manifest's runtime
          // fields; the app's own private deps are dropped by resolveManifest.
          if (from === 'fresco') continue;
          if (field === 'devDependencies') continue;
          throw new Error(
            `${from} has a runtime workspace dependency on private package ${name}; it cannot be bundled.`,
          );
        }
        if (closure.has(name)) continue;
        closure.add(name);
        const dir = packageDirs[name];
        if (!dir) throw new Error(`No package directory found for ${name}`);
        visit(
          JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')),
          ['dependencies', 'optionalDependencies', 'peerDependencies'],
          name,
        );
      }
    }
  };

  const appManifest = JSON.parse(
    readFileSync(join(repoRoot, 'apps/fresco/package.json'), 'utf8'),
  );
  visit(appManifest, ['dependencies', 'devDependencies'], 'fresco');
  return [...closure].toSorted((a, b) => a.localeCompare(b));
}

// pnpm pack names scoped tarballs codaco-<name>-<version>.tgz.
function tarballName(name, version) {
  return `${name.replace('@', '').replace('/', '-')}-${version}.tgz`;
}

// Grep-anchored patch: fail loudly if the Dockerfile drifts rather than
// producing an image that silently skipped the bundling.
function patchOnce(content, anchor, replacement, description) {
  if (!content.includes(anchor)) {
    throw new Error(
      `Staged Dockerfile has no line matching the ${description} anchor:\n  ${anchor}\nThe bundling patch set needs updating for the current Dockerfile.`,
    );
  }
  return content.replace(anchor, replacement);
}

function main() {
  const stageDir = process.argv[2] && resolve(process.argv[2]);
  if (!stageDir || !existsSync(join(stageDir, 'Dockerfile'))) {
    console.error(
      'Usage: node apps/fresco/release-test/scripts/bundle-pending-packages.mjs <stage-dir>\n' +
        '<stage-dir> must be a mirror-staged Fresco tree (Dockerfile at its root).',
    );
    process.exit(1);
  }

  const wsPackages = readWorkspacePackages();
  const closure = collectClosure(wsPackages);
  const vendorDir = join(stageDir, 'vendor');

  // The Dockerfile patch set below names these packages explicitly.
  for (const required of [
    '@codaco/protocol-validation',
    '@codaco/shared-consts',
    '@codaco/interview',
  ]) {
    if (!closure.includes(required)) {
      throw new Error(
        `Fresco's workspace closure no longer contains ${required}; the runner-stage Dockerfile patches need updating.`,
      );
    }
  }

  // 1. Pack the pending packages. Their dists must already be built (the
  //    caller runs the turbo closure build first); pack applies publishConfig
  //    so each tarball is what `changeset publish` would upload.
  const tarballs = {};
  for (const name of closure) {
    run('pnpm', ['--filter', name, 'pack', '--pack-destination', vendorDir], {
      cwd: repoRoot,
    });
    const expected = tarballName(name, wsPackages[name].version);
    if (!existsSync(join(vendorDir, expected))) {
      throw new Error(
        `pnpm pack for ${name} did not produce vendor/${expected}`,
      );
    }
    tarballs[name] = expected;
  }

  // 2. Overrides: force every range for these packages (the app's, and the
  //    caret ranges inside the packed manifests) onto the pending tarballs.
  const workspaceYamlPath = join(stageDir, 'pnpm-workspace.yaml');
  const workspaceYaml = readFileSync(workspaceYamlPath, 'utf8');
  if (!/^overrides:$/m.test(workspaceYaml)) {
    throw new Error(
      `${workspaceYamlPath} has no overrides: block to extend; check FRESCO_WORKSPACE_YAML in scripts/mirror-app.mjs.`,
    );
  }
  const overrideLines = closure
    .map((name) => `  '${name}': 'file:vendor/${tarballs[name]}'`)
    .join('\n');
  writeFileSync(
    workspaceYamlPath,
    workspaceYaml.replace(
      /^overrides:$/m,
      `overrides:\n  # Pending workspace packages bundled by release-test (local tarballs).\n${overrideLines}`,
    ),
  );

  // 3. Dockerfile patches.
  const dockerfilePath = join(stageDir, 'Dockerfile');
  let dockerfile = readFileSync(dockerfilePath, 'utf8');

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

  // runner stage: the lockfile-pinned @codaco installs would resolve to
  // `file:vendor/...` (a path that does not exist under /tmp/runtime) — point
  // them at the vendored tarballs directly. shared-consts is installed
  // alongside so protocol-validation's caret range dedupes onto the pending
  // build instead of pulling the registry version.
  dockerfile = patchOnce(
    dockerfile,
    '      "@codaco/protocol-validation@$(LV @codaco/protocol-validation)"; \\',
    `      "/tmp/vendor/${tarballs['@codaco/protocol-validation']}" \\\n      "/tmp/vendor/${tarballs['@codaco/shared-consts']}"; \\`,
    'runner-stage protocol-validation install',
  );
  dockerfile = patchOnce(
    dockerfile,
    '    npm pack --silent --pack-destination /tmp "@codaco/interview@$(LV @codaco/interview)"; \\',
    `    cp /tmp/vendor/${tarballs['@codaco/interview']} /tmp/codaco-interview-vendored.tgz; \\`,
    'runner-stage interview pack',
  );

  writeFileSync(dockerfilePath, dockerfile);

  console.log(
    JSON.stringify({ bundled: closure.map((name) => tarballs[name]) }, null, 2),
  );
}

main();
