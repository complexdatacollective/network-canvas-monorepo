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

// Entries left by a removal that was still running when a previous hook
// exited.
git(['worktree', 'prune'], root);

const head = git(['rev-parse', 'HEAD'], root) ?? '';
const porcelain = run(
  'git',
  ['status', '--porcelain=v1', '--untracked-files=all'],
  { cwd: root },
).stdout;

function knipIn(cwd, label) {
  console.log(`knip: checking ${label}`);
  const result = spawnSync(
    path.join(cwd, 'node_modules', '.bin', 'knip'),
    ['--no-progress'],
    {
      cwd,
      stdio: 'inherit',
      env: { ...process.env, SKIP_ENV_VALIDATION: 'true' },
    },
  );
  return result.status === 0;
}

// Copies a node_modules directory into the checkout, keeping every symlink
// as written; the pnpm store directory itself is linked, not copied.
function borrowNodeModules(sourceDir, targetDir) {
  mkdirSync(targetDir, { recursive: true });
  for (const entry of readdirSync(sourceDir)) {
    const source = path.join(sourceDir, entry);
    const target = path.join(targetDir, entry);
    if (entry === '.pnpm' && lstatSync(source).isDirectory()) {
      symlinkSync(source, target);
      continue;
    }
    cpSync(source, target, { recursive: true, verbatimSymlinks: true });
  }
}

function prepareCheckout(temp) {
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

let ok = true;
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
  prepareCheckout(temp);
  const reason =
    sha === head
      ? 'working tree has uncommitted changes'
      : 'not the checked-out HEAD';
  if (!knipIn(temp, `${short} in a temporary worktree (${reason})`)) ok = false;
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

if (!ok) {
  console.log(
    'knip found unused files, exports, or dependencies in the pushed code. Fix them before pushing (pnpm agent:check shows the report for the working tree).',
  );
  process.exit(1);
}
