#!/usr/bin/env node
// `pnpm agent:test`: in each workspace package that contains changed files,
// runs only the vitest tests whose import graph touches the files changed on
// this branch (vitest --changed <merge-base>, which also covers uncommitted
// work). Extra arguments are passed through to vitest.
import { spawnSync } from 'node:child_process';

import {
  changedFiles,
  git,
  packagesForFiles,
  resolveRepoRoot,
} from './lib.mjs';

const root = resolveRepoRoot({});
const extra = process.argv.slice(2);
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

const failed = [];
for (const name of packages) {
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
console.log(`\nagent:test: OK (${packages.join(', ')})`);
