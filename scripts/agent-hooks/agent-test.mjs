#!/usr/bin/env node
// `pnpm agent:test`: in each workspace package that contains changed files,
// runs only the vitest tests whose import graph touches the files changed on
// this branch (vitest --changed <merge-base>, which also covers uncommitted
// work). A changed package that has no test script of its own (for example
// packages/protocols, whose JSON is imported by other packages' tests) is
// covered by running its test-bearing dependents. `--dependents` also runs
// the dependents of packages that do have tests; by default those are only
// listed, because a change in a widely imported package legitimately reaches
// most of the repository's tests (a shared-consts edit measured at eight
// minutes) and CI covers them anyway. Other arguments are passed through to
// vitest.
import { spawnSync } from 'node:child_process';
import path from 'node:path';

import {
  binPath,
  changedFiles,
  git,
  packagesForFiles,
  resolveRepoRoot,
  run,
  workspacePackages,
} from './lib.mjs';

const root = resolveRepoRoot({});
const relative = (file) => path.relative(root, file);
const includeDependents = process.argv.includes('--dependents');
// --list prints the plan without running vitest.
const listOnly = process.argv.includes('--list');
const extra = process.argv
  .slice(2)
  .filter((arg) => arg !== '--dependents' && arg !== '--list');
const changed = changedFiles(root);

if (changed.length === 0) {
  console.log('agent:test: no changes relative to origin/main.');
  process.exit(0);
}

const { packages, seeds, all } = packagesForFiles(changed, root, {
  script: 'test',
});
const workspace = workspacePackages(root);
const hasTests = (name) => Boolean(workspace.get(name)?.manifest.scripts?.test);
const base =
  git(['merge-base', 'HEAD', 'origin/main'], root) ??
  git(['merge-base', 'HEAD', 'main'], root);

if (all) {
  console.log(
    'agent:test: shared configuration changed (root manifest, lockfile, turbo.json, tooling/typescript, or a root TypeScript source). ' +
      'This run covers only the packages that contain changed files; CI runs the whole suite.',
  );
}

// Test-bearing packages that consume the given packages (turbo's `...pkg`
// filter), excluding the seeds themselves.
function dependentsOf(names) {
  if (names.length === 0) return [];
  const turbo = binPath(root, 'turbo');
  if (!turbo) {
    fail(
      'node_modules/.bin/turbo is missing (dependencies not installed), so the packages whose tests reach this change cannot be found.',
    );
  }
  const args = ['run', 'test', '--dry-run=json'];
  for (const name of names) args.push(`--filter=...${name}`);
  const result = run(turbo, args, {
    cwd: root,
    env: { TURBO_TELEMETRY_DISABLED: '1', TURBO_NO_UPDATE_NOTIFIER: '1' },
    timeoutMs: 60_000,
  });
  if (result.error || result.status !== 0) {
    fail(
      `turbo could not list the packages that consume ${names.join(', ')}:\n${(result.error?.message ?? `${result.stdout}\n${result.stderr}`).trim()}`,
    );
  }
  let selected;
  try {
    selected = JSON.parse(result.stdout).packages ?? [];
  } catch {
    fail(`turbo returned an unreadable package graph for ${names.join(', ')}.`);
  }
  return selected
    .filter((name) => !seeds.includes(name) && hasTests(name))
    .sort((a, b) => a.localeCompare(b));
}

// Discovery failures exit non-zero: an unchecked change must never read as
// one that no test reaches.
function fail(message) {
  console.log(`agent:test: ${message}`);
  process.exit(2);
}

const testless = seeds.filter((name) => !hasTests(name));
const required = dependentsOf(testless);
const optional = dependentsOf(seeds).filter((name) => !required.includes(name));
const targets = [
  ...new Set([
    ...packages,
    ...required,
    ...(includeDependents ? optional : []),
  ]),
].sort((a, b) => a.localeCompare(b));

if (testless.length > 0 && required.length > 0) {
  console.log(
    `agent:test: ${testless.join(', ')} has no test script; running the tests of the packages that consume it (${required.join(', ')}).`,
  );
}
if (!includeDependents && optional.length > 0) {
  console.log(
    `agent:test: not running the ${optional.length} dependent package(s) that consume the changed code (${optional.join(', ')}); ` +
      'CI runs them, or pass --dependents to include them here.',
  );
}
// Root scripts are covered by `pnpm test:scripts` (scripts/*.test.mjs), not
// by any workspace package.
const ROOT_SCRIPTS = 'root scripts (pnpm test:scripts)';
if (changed.some((file) => relative(file).startsWith('scripts/'))) {
  targets.push(ROOT_SCRIPTS);
}
if (targets.length === 0) {
  console.log('agent:test: no tests reach the changed files.');
  process.exit(0);
}
if (listOnly) {
  console.log(
    `agent:test: would run vitest --changed in ${targets.join(', ')}`,
  );
  process.exit(0);
}

const failed = [];
for (const name of targets) {
  if (name === ROOT_SCRIPTS) {
    console.log(`\n== ${name}`);
    const result = spawnSync('pnpm', ['test:scripts'], {
      cwd: root,
      stdio: 'inherit',
    });
    if (result.status !== 0) failed.push(name);
    continue;
  }
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
