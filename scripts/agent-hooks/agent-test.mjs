#!/usr/bin/env node
// `pnpm agent:test`: in each workspace package that contains changed files,
// runs only the vitest tests whose import graph touches the files changed on
// this branch (vitest --changed <merge-base>, which also covers uncommitted
// work). `--dependents` also runs the packages that consume the changed ones;
// by default they are only listed, because a change in a widely imported
// package legitimately reaches most of the repository's tests (a
// shared-consts edit measured at eight minutes) and CI covers them anyway.
// Other arguments are passed through to vitest.
import { spawnSync } from 'node:child_process';

import {
  binPath,
  changedFiles,
  git,
  packagesForFiles,
  resolveRepoRoot,
  run,
} from './lib.mjs';

const root = resolveRepoRoot({});
const includeDependents = process.argv.includes('--dependents');
const extra = process.argv.slice(2).filter((arg) => arg !== '--dependents');
const changed = changedFiles(root);

if (changed.length === 0) {
  console.log('agent:test: no changes relative to origin/main.');
  process.exit(0);
}

const { packages, all } = packagesForFiles(changed, root, { script: 'test' });
const base =
  git(['merge-base', 'HEAD', 'origin/main'], root) ??
  git(['merge-base', 'HEAD', 'main'], root);

if (all) {
  console.log(
    'agent:test: shared configuration changed (root manifest, lockfile, turbo.json, or tooling/typescript). ' +
      'This run covers only the packages that contain changed files; CI runs the whole suite.',
  );
}
if (packages.length === 0) {
  console.log(
    'agent:test: no changed files inside a package with a test script.',
  );
  process.exit(0);
}

// A change in a package can break tests in the packages that consume its
// source. turbo's `...pkg` filter lists them; vitest --changed then selects
// only the tests whose import graph reaches the change.
function dependentsOf(names) {
  const turbo = binPath(root, 'turbo');
  if (!turbo) return [];
  const args = ['run', 'test', '--dry-run=json'];
  for (const name of names) args.push(`--filter=...${name}`);
  const result = run(turbo, args, {
    cwd: root,
    env: { TURBO_TELEMETRY_DISABLED: '1', TURBO_NO_UPDATE_NOTIFIER: '1' },
    timeoutMs: 60_000,
  });
  if (result.status !== 0) return [];
  try {
    const selected = JSON.parse(result.stdout).packages ?? [];
    return selected
      .filter((name) => !names.includes(name))
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

const dependents = dependentsOf(packages);
const targets = includeDependents ? [...packages, ...dependents] : packages;
if (!includeDependents && dependents.length > 0) {
  console.log(
    `agent:test: not running the ${dependents.length} dependent package(s) that consume the changed code (${dependents.join(', ')}); ` +
      'CI runs them, or pass --dependents to include them here.',
  );
}

const failed = [];
for (const name of targets) {
  console.log(
    `\n== ${name}: vitest --changed ${base ? base.slice(0, 12) : '(working tree)'}`,
  );
  // No `--` separator: pnpm would forward it to vitest, which then treats
  // the remaining arguments as name filters and runs every test.
  const args = ['--filter', name, 'test', '--changed'];
  if (base) args.push(base);
  args.push('--passWithNoTests', ...extra);
  const result = spawnSync('pnpm', args, { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) failed.push(name);
}

if (failed.length > 0) {
  console.log(`\nagent:test: failures in ${failed.join(', ')}`);
  process.exit(1);
}
console.log(`\nagent:test: OK (${targets.join(', ')})`);
