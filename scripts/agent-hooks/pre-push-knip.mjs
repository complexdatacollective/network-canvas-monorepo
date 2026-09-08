#!/usr/bin/env node
// Runs knip for each pushed revision (arguments: the local SHAs of the
// branch refs being pushed, from the pre-push hook's stdin). A revision that
// is the clean checked-out HEAD is checked in place. Any other revision, or
// a working tree with uncommitted changes, is checked out into a temporary
// worktree so unrelated local edits can neither mask a finding in the pushed
// code nor block a clean push.
//
// The temporary checkout has no install of its own. It gets a copy of every
// node_modules symlink tree (root and per package, copied verbatim so the
// relative links that pnpm writes resolve inside the checkout, including the
// links between workspace packages), a link to the shared pnpm store, and
// links to the generated inputs knip depends on. Nothing in that checkout
// may invoke pnpm: its dependency-status check treats such a tree as foreign
// and offers to purge node_modules, which would remove the real store links.
import { spawn, spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  symlinkSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  ensureKnipInputs,
  git,
  knipCodegenOutputs,
  knipTargetForPush,
  nodeModulesDirs,
  resolveRepoRoot,
  run,
} from './lib.mjs';

const root = resolveRepoRoot({});
const shas = [...new Set(process.argv.slice(2).filter(Boolean))];
if (shas.length === 0) process.exit(0);

// Reclaim checkouts a previous hook left behind (an interrupted push cannot
// run its cleanup), then prune entries whose directories are already gone.
for (const line of (git(['worktree', 'list', '--porcelain'], root) ?? '').split(
  '\n',
)) {
  const dir = line.startsWith('worktree ')
    ? line.slice('worktree '.length)
    : null;
  if (dir && path.basename(dir).startsWith('knip-push-')) {
    run('git', ['worktree', 'remove', '--force', dir], { cwd: root });
  }
}
git(['worktree', 'prune'], root);

let activeCheckout = null;
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    if (activeCheckout) {
      run('git', ['worktree', 'remove', '--force', activeCheckout], {
        cwd: root,
      });
    }
    process.exit(130);
  });
}

// The generated inputs knip depends on (fresco#codegen outputs) must exist
// in the real tree: both the in-place check and the temporary checkout,
// which links them from here, read them.
if (!ensureKnipInputs(root)) {
  console.log(
    'knip: could not generate the inputs knip depends on (see turbo.json, //#knip dependsOn); run `pnpm install` and retry.',
  );
  process.exit(1);
}

const head = git(['rev-parse', 'HEAD'], root) ?? '';
const porcelain = run(
  'git',
  ['status', '--porcelain=v1', '--untracked-files=all'],
  { cwd: root },
).stdout;

function knipIn(cwd, label) {
  console.log(`knip: checking ${label}`);
  const binary = path.join(cwd, 'node_modules', '.bin', 'knip');
  if (!existsSync(binary)) {
    console.log(
      'knip: node_modules/.bin/knip is missing (dependencies not installed); cannot check this push.',
    );
    return false;
  }
  const result = spawnSync(binary, ['--no-progress'], {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, SKIP_ENV_VALIDATION: 'true' },
  });
  if (result.error) {
    console.log(`knip: did not finish: ${result.error.message}`);
    return false;
  }
  if (result.status !== 0) findings = true;
  return result.status === 0;
}

const BORROW_SKIP = new Set(['.cache', '.vite', '.vite-temp', '.turbo']);

// Copies a node_modules directory into the checkout, keeping every symlink
// as written; the pnpm store directory itself is linked, not copied.
function borrowNodeModules(sourceDir, targetDir) {
  mkdirSync(targetDir, { recursive: true });
  for (const entry of readdirSync(sourceDir)) {
    // Build and dev-server caches are large and knip never reads them.
    if (BORROW_SKIP.has(entry)) continue;
    const source = path.join(sourceDir, entry);
    const target = path.join(targetDir, entry);
    if (entry === '.pnpm' && lstatSync(source).isDirectory()) {
      symlinkSync(source, target);
      continue;
    }
    cpSync(source, target, { recursive: true, verbatimSymlinks: true });
  }
}

// The pushed revision's dependency graph is the working tree's only when
// the lockfile and manifests agree; otherwise it gets its own install
// (offline from the pnpm store, scripts skipped like CI's install).
function dependencyGraphDiffers(sha) {
  const manifests = (git(['ls-files', '*/package.json'], root) ?? '')
    .split('\n')
    .filter(Boolean);
  const graphFiles = [
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'package.json',
    ...manifests,
  ];
  // Uncommitted edits to the graph files may already be installed in the
  // working tree, so a dirty graph file also means "do not borrow".
  const dirty = porcelain
    .split('\n')
    .map((line) => line.slice(3).trim())
    .filter(Boolean);
  if (
    dirty.some(
      (file) => graphFiles.includes(file) || /(^|\/)package\.json$/.test(file),
    )
  ) {
    return true;
  }
  const diff = run(
    'git',
    ['diff', '--quiet', sha, 'HEAD', '--', ...graphFiles],
    {
      cwd: root,
    },
  );
  return diff.status !== 0;
}

function prepareCheckout(temp, sha) {
  if (dependencyGraphDiffers(sha)) {
    console.log(
      'knip: the pushed revision changes dependencies; installing them for the check',
    );
    const install = spawnSync(
      'pnpm',
      ['install', '--prefer-offline', '--frozen-lockfile', '--ignore-scripts'],
      { cwd: temp, stdio: 'inherit', env: { ...process.env, CI: 'true' } },
    );
    if (install.status !== 0) {
      console.log('knip: install failed in the temporary worktree');
      return false;
    }
    linkCodegenOutputs(temp);
    return true;
  }
  const manifests = (git(['ls-files', '*/package.json'], temp) ?? '').split(
    '\n',
  );
  for (const dir of nodeModulesDirs(root, manifests)) {
    const target = path.join(temp, dir);
    if (!existsSync(target)) continue;
    borrowNodeModules(
      path.join(root, dir, 'node_modules'),
      path.join(target, 'node_modules'),
    );
  }
  linkCodegenOutputs(temp);
  return true;
}

function linkCodegenOutputs(temp) {
  for (const absolute of knipCodegenOutputs(root)) {
    if (!existsSync(absolute)) continue;
    const target = path.join(temp, path.relative(root, absolute));
    try {
      mkdirSync(path.dirname(target), { recursive: true });
      symlinkSync(absolute, target);
    } catch {
      // Already present in the pushed revision.
    }
  }
}

function scheduleRemoval(temp) {
  // Removing a full checkout takes tens of seconds; do not hold the push.
  spawn(
    'sh',
    [
      '-c',
      `git -C "${root}" worktree remove --force "${temp}" || rm -rf "${temp}"`,
    ],
    { detached: true, stdio: 'ignore' },
  ).unref();
}

let ok = true;
let findings = false;
for (const sha of shas) {
  const short = sha.slice(0, 10);
  if (knipTargetForPush(sha, { head, porcelain }) === 'in-place') {
    if (!knipIn(root, `${short} (checked-out HEAD, clean tree)`)) ok = false;
    continue;
  }
  const temp = mkdtempSync(path.join(os.tmpdir(), 'knip-push-'));
  const added = run('git', ['worktree', 'add', '--detach', '-q', temp, sha], {
    cwd: root,
  });
  if (added.status !== 0) {
    console.log(
      `knip: could not check out ${short} into a temporary worktree:\n${added.stderr.trim()}`,
    );
    ok = false;
    continue;
  }
  // Every exit path after a successful add removes the checkout.
  activeCheckout = temp;
  try {
    if (!prepareCheckout(temp, sha)) {
      ok = false;
      continue;
    }
    const reason =
      sha === head
        ? 'working tree has uncommitted changes'
        : 'not the checked-out HEAD';
    if (!knipIn(temp, `${short} in a temporary worktree (${reason})`))
      ok = false;
  } finally {
    activeCheckout = null;
    scheduleRemoval(temp);
  }
}

if (!ok) {
  console.log(
    findings
      ? 'knip found unused files, exports, or dependencies in the pushed code. Fix them before pushing (pnpm agent:check shows the report for the working tree).'
      : 'knip could not check this push (see above); the push is refused rather than passed unchecked.',
  );
  process.exit(1);
}
