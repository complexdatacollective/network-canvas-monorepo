#!/usr/bin/env node
// Mirrors a monorepo app's source into its standalone external repository as a
// single linear-append commit (history preserved, all tracked files replaced).
// Every `workspace:`/`catalog:` specifier is resolved (see resolve-manifest.mjs)
// so the tree installs outside the workspace, and `node_modules` / build output
// are NOT committed.
//
// The default shape targets the legacy Electron apps on `master` and is plain
// `npm install`-able. Fresco mirrors to `main` as a pnpm project — see
// APP_MIRROR_OVERRIDES, which also regenerates the single-package
// pnpm-workspace.yaml its Dockerfile expects.
//
// For Architect, the Interviewer preview bundle (built in the monorepo) is vendored
// into the mirror and the electron-builder `extraResources` paths are rewritten to
// point at it, so the standalone repo is self-consistent.
//
// Usage:
//   node scripts/mirror-app.mjs --app <appDir> --repo <owner/name> --version <version> [--branch <name>] [--with-lockfile]
// Env:
//   LEGACY_RELEASE_GH_TOKEN  cross-repo token with contents:write (required to push)
//   MONOREPO_SHA             source commit sha (recorded in the commit message)
//   GITHUB_OUTPUT            when set, `mirror_sha=<sha>` is appended for the workflow
//   MIRROR_DRY_RUN           when "true", stage + commit locally but skip the push
import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { parseCatalog, resolveManifest } from './resolve-manifest.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const workspaceCatalog = parseCatalog(
  readFileSync(join(repoRoot, 'pnpm-workspace.yaml'), 'utf8'),
);

function requireCatalogVersion(name) {
  const version = workspaceCatalog[name];
  if (!version) {
    throw new Error(`No default catalog entry for "${name}".`);
  }
  return version;
}

const effectVersion = requireCatalogVersion('effect');

const GITIGNORE = `node_modules/
dist/
out/
release-builds/
.turbo/
coverage/
*.log
.DS_Store
`;

// Strip any embedded credentials (e.g. the tokenized clone URL
// https://x-access-token:<token>@github.com/...) before putting a string into a
// thrown error, so LEGACY_RELEASE_GH_TOKEN never reaches the logs.
function redact(text) {
  return String(text ?? '').replace(/\/\/[^/@\s]+@/g, '//***@');
}

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${cmd} ${redact(args.join(' '))} exited with ${result.status}`,
    );
  }
  return result;
}

function capture(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${cmd} ${redact(args.join(' '))} exited with ${result.status}\n${redact(result.stderr)}`,
    );
  }
  return result.stdout.trim();
}

// Per-app deviations from the default (legacy Electron app) mirror shape.
// Fresco is a pnpm-installed Next.js app whose Dockerfile builds the mirrored
// tree directly, so it needs its own workspace manifest and lockfile rather
// than the npm-installable shape the classic apps use, and it already ships a
// .gitignore covering its own build output.
const APP_MIRROR_OVERRIDES = {
  fresco: {
    keepOwnGitignore: true,
    // `packageManager` is stripped in the monorepo (the root pins pnpm for
    // every workspace) but the standalone Dockerfile runs `corepack enable`,
    // which reads it from package.json.
    restorePackageManager: true,
    lockfile: 'pnpm',
    extraExcludes: [
      '.next',
      '.turbo',
      'storybook-static',
      'test-results',
      'playwright-report',
      // Agent tooling is monorepo-only: the skills live in the canonical
      // .agents/skills tree at the repo root, and the mirror is not a place
      // anyone develops.
      '.agents',
      '.claude',
    ],
  },
};

function parseArgs(argv) {
  const args = { withLockfile: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--with-lockfile') args.withLockfile = true;
    else if (a.startsWith('--')) {
      args[a.slice(2)] = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

// Recursively copy src -> dest, skipping the named top-level entries. Anchored to
// the top level so a legitimately-named nested directory isn't dropped.
function copyTree(src, dest, excludeTopLevel) {
  const exclude = new Set(excludeTopLevel);
  cpSync(src, dest, {
    recursive: true,
    filter: (from) => {
      const rel = relative(src, from);
      if (rel === '') return true;
      return !exclude.has(rel.split(sep)[0]);
    },
  });
}

// Copy the app source into staging, excluding everything regenerated by a build
// or install.
function stageSource(appDir, staging, extraExcludes = []) {
  copyTree(appDir, staging, [
    'node_modules',
    'dist',
    'out',
    'release-builds',
    '.turbo',
    'coverage',
    '.git',
    ...extraExcludes,
  ]);
}

// The mirrored tree is a single-package pnpm workspace. Its manifest carries
// only the settings that affect a standalone install of the app — the catalog
// is deliberately absent because resolve-manifest has already replaced every
// `catalog:` specifier with a concrete version.
const FRESCO_WORKSPACE_YAML = `# Generated by scripts/mirror-app.mjs — edit apps/fresco in the
# network-canvas monorepo, not this file.
packages:
  - '.'

# Supply-chain cooldown: refuse dependency versions younger than 24h.
minimumReleaseAge: 1440
minimumReleaseAgeStrict: false
# '@codaco/*' is a permanent exemption: these are first-party packages whose
# releases we control, and a release mirrors here the moment they are published
# — so the cooldown would otherwise block every release for a day.
minimumReleaseAgeExclude:
  - '@codaco/*'

autoInstallPeers: true

allowBuilds:
  '@parcel/watcher': true
  '@prisma/engines': true
  '@tailwindcss/oxide': true
  core-js-pure: true
  esbuild: true
  prisma: true
  sharp: true
  unrs-resolver: true
  '@posthog/cli': false
  core-js: false
  msgpackr-extract: false
  protobufjs: false

# Keep security-sensitive transitives on patched versions when upstream
# manifests still pin vulnerable releases.
overrides:
  'effect@3.17.7': '${effectVersion}'
  fast-uri: '^3.1.4'
  find-my-way: '^9.7.0'
  postcss: '^8.5.23'
  sharp: '^0.35.3'
  valibot: '^1.4.2'
`;

// Fresco's tsconfig extends the private `@codaco/tsconfig` package, which
// resolve-manifest correctly drops from the mirrored manifest — it is
// unpublished, so the standalone tree cannot install it. Vendor the shared
// configs into the tree and repoint `extends` at them, so the Dockerfile's
// `next build` can still load the base config. The configs name
// `@total-typescript/ts-reset` in `types`; that is a root devDependency here
// rather than one of Fresco's own, so it has to be added to the mirrored
// manifest too or the vendored config resolves to nothing.
function vendorSharedTsconfig(staging, manifest) {
  const sharedDir = join(repoRoot, 'tooling', 'typescript');
  const vendorDir = join(staging, 'tsconfig');
  // web.json extends './base.json', so co-locating the pair keeps that working.
  for (const file of ['base.json', 'web.json']) {
    cpSync(join(sharedDir, file), join(vendorDir, file));
  }

  const tsconfigPath = join(staging, 'tsconfig.json');
  const original = readFileSync(tsconfigPath, 'utf8');
  const shared = '"@codaco/tsconfig/web.json"';
  if (!original.includes(shared)) {
    throw new Error(
      `Expected ${tsconfigPath} to extend ${shared}; the mirror's tsconfig rewrite would be a no-op.`,
    );
  }
  writeFileSync(
    tsconfigPath,
    original.replace(shared, '"./tsconfig/web.json"'),
  );

  const tsResetVersion = requireCatalogVersion('@total-typescript/ts-reset');
  manifest.devDependencies ??= {};
  manifest.devDependencies['@total-typescript/ts-reset'] = tsResetVersion;
}

// Mirrored apps keep their Vitest configs, but resolveManifest drops the
// private shared config package. Vendor that package as a local ESM dependency
// so standalone mirrors retain the same setup without publishing internal
// tooling to npm.
export function vendorSharedVitestConfig(staging, manifest, dropped) {
  if (!dropped.includes('@codaco/vitest-config')) return;

  const sharedDir = join(repoRoot, 'tooling', 'vitest');
  const vendorDir = join(staging, 'vendor', 'vitest-config');
  copyTree(sharedDir, vendorDir, ['node_modules']);

  const { manifest: vendoredManifest } = resolveManifest(sharedDir);
  const dependencyFields = [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
    'peerDependencies',
  ];
  const usesDependency = (name) =>
    dependencyFields.some((field) => manifest[field]?.[name] !== undefined);

  if (!usesDependency('motion')) {
    vendoredManifest.files = vendoredManifest.files.filter(
      (entry) => entry !== 'modern/**',
    );
    delete vendoredManifest.exports['./modern/disable-animations'];
    delete vendoredManifest.exports['./modern/setup-path'];
    delete vendoredManifest.dependencies.motion;
    // Only the modern setup configures Testing Library; the legacy one does not
    // import it.
    delete vendoredManifest.dependencies['@testing-library/dom'];
  }
  if (!usesDependency('framer-motion')) {
    vendoredManifest.files = vendoredManifest.files.filter(
      (entry) => entry !== 'legacy/**',
    );
    delete vendoredManifest.exports['./legacy/disable-animations'];
    delete vendoredManifest.exports['./legacy/setup-path'];
  }

  writeFileSync(
    join(vendorDir, 'package.json'),
    `${JSON.stringify(vendoredManifest, null, 2)}\n`,
  );

  manifest.devDependencies ??= {};
  manifest.devDependencies['@codaco/vitest-config'] =
    'file:vendor/vitest-config';

  if (manifest.name === 'fresco') {
    const dockerfilePath = join(staging, 'Dockerfile');
    const dockerfile = readFileSync(dockerfilePath, 'utf8');
    const dependencyFiles =
      'COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml prisma.config.ts env.js ./';
    const vendoredConfig = 'COPY vendor/vitest-config ./vendor/vitest-config';
    if (!dockerfile.includes(dependencyFiles)) {
      throw new Error(
        `Expected ${dockerfilePath} to copy dependency files before installing; the vendored Vitest config would be unavailable.`,
      );
    }
    writeFileSync(
      dockerfilePath,
      dockerfile.replace(
        dependencyFiles,
        `${dependencyFiles}\n${vendoredConfig}`,
      ),
    );
  }
}

// Architect renders the Interviewer app in its preview window from a bundle that
// electron-builder copies via extraResources. In the monorepo that bundle lives at
// ../interviewer-classic/out; vendor it into the mirror and repoint the config.
function vendorInterviewerPreview(appDir, staging) {
  const interviewerOut = join(appDir, '..', 'interviewer-classic', 'out');
  const vendorDir = join(staging, 'interviewer-preview');
  for (const part of ['renderer', 'preload']) {
    const from = join(interviewerOut, part);
    if (!existsSync(from)) {
      throw new Error(
        `Cannot vendor Interviewer preview: ${from} not found. Build the interviewer app first.`,
      );
    }
    cpSync(from, join(vendorDir, part), { recursive: true });
  }
  const configPath = join(staging, 'electron-builder.config.js');
  const original = readFileSync(configPath, 'utf8');
  const rendererPattern = /['"]\.\.\/interviewer-classic\/out\/renderer['"]/g;
  const preloadPattern = /['"]\.\.\/interviewer-classic\/out\/preload['"]/g;
  // Fail loudly rather than silently leaving broken extraResources paths in the
  // mirror if the source config's path text ever drifts.
  if (!rendererPattern.test(original) || !preloadPattern.test(original)) {
    throw new Error(
      `Expected ../interviewer-classic/out renderer+preload paths in ${configPath}; ` +
        'the Architect preview vendoring rewrite would be a no-op.',
    );
  }
  const config = original
    .replace(rendererPattern, "'interviewer-preview/renderer'")
    .replace(preloadPattern, "'interviewer-preview/preload'");
  writeFileSync(configPath, config);
}

function main() {
  const {
    app,
    repo,
    version,
    withLockfile,
    branch = 'master',
  } = parseArgs(process.argv.slice(2));
  if (!app || !repo || !version) {
    console.error(
      'Usage: node scripts/mirror-app.mjs --app <appDir> --repo <owner/name> --version <version> [--branch <name>] [--with-lockfile]',
    );
    process.exit(1);
  }

  const appDir = resolve(app);
  const manifest = JSON.parse(
    readFileSync(join(appDir, 'package.json'), 'utf8'),
  );
  const appName = manifest.name;
  const dryRun = process.env.MIRROR_DRY_RUN === 'true';
  const token = process.env.LEGACY_RELEASE_GH_TOKEN;
  // MIRROR_REPO_URL overrides the GitHub URL (used by tests against a local
  // remote, and for non-github mirrors). When unset, a token is required to push.
  const repoUrlOverride = process.env.MIRROR_REPO_URL;
  if (!token && !dryRun && !repoUrlOverride) {
    throw new Error('LEGACY_RELEASE_GH_TOKEN is required to push the mirror.');
  }

  const overrides = APP_MIRROR_OVERRIDES[appName] ?? {};

  const staging = mkdtempSync(join(tmpdir(), 'mirror-stage-'));
  console.error(`[mirror] staging ${appName} -> ${staging}`);

  stageSource(appDir, staging, overrides.extraExcludes);

  const { manifest: resolved, dropped } = resolveManifest(appDir);
  if (overrides.restorePackageManager) {
    const root = JSON.parse(
      readFileSync(join(repoRoot, 'package.json'), 'utf8'),
    );
    if (!root.packageManager) {
      throw new Error(
        'Root package.json has no `packageManager`; the mirrored app needs it for corepack.',
      );
    }
    resolved.packageManager = root.packageManager;
  }
  if (appName === 'fresco') {
    // Before the manifest is written — this adds a devDependency to it.
    vendorSharedTsconfig(staging, resolved);
  }
  vendorSharedVitestConfig(staging, resolved, dropped);
  writeFileSync(
    join(staging, 'package.json'),
    `${JSON.stringify(resolved, null, 2)}\n`,
  );
  if (dropped.length) {
    console.error(
      `[mirror] dropped private workspace deps: ${dropped.join(', ')}`,
    );
  }

  if (!overrides.keepOwnGitignore) {
    writeFileSync(join(staging, '.gitignore'), GITIGNORE);
  }

  if (appName === '@codaco/architect-classic') {
    vendorInterviewerPreview(appDir, staging);
  }

  if (appName === 'fresco') {
    // The Dockerfile COPYs pnpm-workspace.yaml unconditionally; the monorepo
    // deleted the app-level one when Fresco moved in, so regenerate it here.
    writeFileSync(join(staging, 'pnpm-workspace.yaml'), FRESCO_WORKSPACE_YAML);
  }

  if (withLockfile) {
    if (overrides.lockfile === 'pnpm') {
      // The Dockerfile installs with `--frozen-lockfile`, so the mirror must
      // ship a lockfile that matches the resolved manifest exactly.
      console.error('[mirror] generating pnpm-lock.yaml');
      run('pnpm', ['install', '--lockfile-only', '--ignore-scripts'], {
        cwd: staging,
      });
    } else {
      console.error(
        '[mirror] generating package-lock.json (validates npm resolvability)',
      );
      run('npm', ['install', '--package-lock-only', '--ignore-scripts'], {
        cwd: staging,
      });
    }
  }

  // Clone the external master and replace its entire tracked tree with the staging
  // tree, then commit on top (linear append) and push.
  const checkout = mkdtempSync(join(tmpdir(), 'mirror-repo-'));
  const cloneUrl =
    repoUrlOverride ??
    (dryRun
      ? `https://github.com/${repo}.git`
      : `https://x-access-token:${token}@github.com/${repo}.git`);
  run('git', [
    'clone',
    '--branch',
    branch,
    '--single-branch',
    cloneUrl,
    checkout,
  ]);

  run('git', ['-C', checkout, 'rm', '-r', '--quiet', '.']);
  copyTree(staging, checkout, ['.git']);
  run('git', ['-C', checkout, 'add', '-A']);

  // If the mirrored tree is byte-identical to current master (e.g. a forced
  // re-release with no source change), there's nothing to commit — `git commit`
  // would exit non-zero and abort the rerun. Skip commit/push and reuse HEAD.
  const hasChanges =
    spawnSync('git', ['-C', checkout, 'diff', '--cached', '--quiet']).status !==
    0;

  if (hasChanges) {
    const sourceSha =
      process.env.MONOREPO_SHA || capture('git', ['rev-parse', 'HEAD']);
    const message = `Release v${version} (mirrored from monorepo ${sourceSha})`;
    const authorName =
      process.env.GIT_AUTHOR_NAME || 'Network Canvas Release Bot';
    const authorEmail =
      process.env.GIT_AUTHOR_EMAIL || 'releases@networkcanvas.com';
    run('git', [
      '-C',
      checkout,
      '-c',
      `user.name=${authorName}`,
      '-c',
      `user.email=${authorEmail}`,
      '-c',
      'commit.gpgsign=false',
      'commit',
      '-m',
      message,
    ]);

    if (dryRun) {
      console.error('[mirror] MIRROR_DRY_RUN=true — skipping push.');
    } else {
      run('git', ['-C', checkout, 'push', 'origin', branch]);
    }
  } else {
    console.error(
      '[mirror] no content changes vs current master; reusing existing HEAD.',
    );
  }

  const mirrorSha = capture('git', ['-C', checkout, 'rev-parse', 'HEAD']);
  console.error(`[mirror] ${appName} mirrored at ${mirrorSha}`);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `mirror_sha=${mirrorSha}\n`);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
