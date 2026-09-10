#!/usr/bin/env node
// Bucket assignment for the sharded `test` job in
// .github/workflows/ci-and-release.yml.
//
// The workspace unit suites are embarrassingly parallel across MACHINES and
// stubbornly serial on one. Every vitest sizes its fork pool to the runner's
// CPU count, so a single suite already saturates a 4-vCPU standard runner and
// turbo's own `--concurrency` knob buys nothing: measured on the same thirteen
// tasks (#1801), 25m53s at `--concurrency=1`, 25m49s at 2, 26m08s at the
// default. The only lever left is more CPUs, and standard runners are free on
// this public repository — so the job runs as a matrix of shards, each shard a
// whole runner executing its own bucket one suite at a time.
//
// This module owns which package lands in which bucket, and turns a bucket
// into the turbo `--filter` arguments that restrict a run to it.
//
// HOW A SHARD IS RESTRICTED TO ITS BUCKET
//
// Not with positive filters: turbo unions the packages every `--filter`
// selects, so adding `--filter=@codaco/art` beside the affected selector
// `--filter=...[<base>]` would run art on every pull request whether or not
// the diff touched it. Negations subtract from that union instead, which is
// exactly the intersection a shard needs — the same mechanism that already
// keeps `@codaco/studio-server` out of the workspace run. So a shard passes a
// `--filter=!<pkg>` for every test-carrying package it does NOT own, and the
// affected selector stays untouched and authoritative.
//
// `@codaco/studio-server` gets its exclusion for free: it belongs to no
// bucket (it has its own `test-studio-server` job), so every shard negates it.
//
// Verified by EXECUTING turbo 2.10.4, not with `--dry` — `--dry`'s `packages`
// field reports a filtered scope even when the run ignores the filter. Against
// base b0bc600 the unsharded affected run selected 22 real `test` tasks; the
// same run plus this module's negations for a three-package bucket executed
// exactly `@codaco/art`, `@codaco/network-query` and `@codaco/shared-consts`.
//
// HOW THE BUCKETS WERE DERIVED
//
// The packing came from per-package wall time in the four longest
// full-cascade `test` jobs on record (runs 34457797127, 34439598092,
// 34452953003, 34453233041). The `seconds` below were then RE-MEASURED cold
// on the sharded job itself, run 34484836350, which ran every one of the 23
// packages with the cache forced off — so unlike the historical runs it has a
// real number for the five that are almost always a cache hit (the two
// Classic apps deliberately depend on published protocol-validation rather
// than the workspace copy, so nothing else invalidates them; app-i18n,
// interface-images and the ingress worker are tiny and stable).
//
// Turbo buffers a task's whole output and flushes it as one group when the
// task ends, so a package's elapsed time is the gap between its group and the
// next one's. Summed per shard that reproduces turbo's own reported run time
// to within a second (shard 1: 540.0 measured vs 539.3 reported; shard 5:
// 274.1 vs 273.4), which is what makes these numbers trustworthy.
//
//     shard 1  540.0s      shard 2  260.3s      shard 3  353.0s
//     shard 4  313.0s      shard 5  274.1s      total  1740.4s
//
// Treat them as a scale, not a stopwatch: the same suite varies by up to ~30%
// between runners (architect 260s here against 327-348s historically,
// protocol-builder 540s against 405-436s), so the packing is built for the
// ordering, not the decimals.
//
// Two hand placements override the packing:
//
//   * `@codaco/studio-sync` is pinned to the shard that starts Postgres, since
//     it is the only workspace suite outside `@codaco/studio-server` that
//     needs a database.
//   * `@codaco/site-navigation-element` pays a fixed `playwright install
//     --with-deps chromium` before its (tiny) suite, so it is weighted by that
//     install rather than by its tests.
//
// Five shards rather than four, even though four would give the same wall
// time today. The job cannot finish sooner than its largest single package
// however many runners it gets, and protocol-builder is that package at 540s;
// four shards would pack the remaining 1200s into ~400s buckets, which is only
// 26% under protocol-builder and so inside the ~30% runner-to-runner variance
// measured above — a shard would sometimes become the critical path instead.
// Five leaves the rest at 260-353s, comfortably clear, and the extra runner is
// free on a public repository. Going below 540s needs the protocol-builder
// suite itself split, which is a different change: turbo's unit of work is the
// package.
//
// TO REBALANCE: take a recent full-suite `test` shard log, read each package's
// elapsed time, and re-pack. The weights are documentation, not inputs — only
// the `packages` arrays decide what runs where — so a stale weight costs
// balance, never correctness.

import { globSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse } from 'yaml';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Packages that carry a `test` script but are deliberately not in any bucket.
 * @type {Record<string, string>}
 */
const NOT_SHARDED = {
  // Wall-clock-budgeted conformance suite with its own dedicated runner; see
  // the `test-studio-server` job.
  '@codaco/studio-server': 'runs in the test-studio-server job',
};

/**
 * The buckets, in shard order. `seconds` is the measured weight the packing
 * was built from and is never read by the code.
 * @type {{ shard: number, postgres?: true, packages: { name: string, seconds: number }[] }[]}
 */
export const TEST_SHARDS = [
  // One suite, alone, because it is the floor: no bucket can finish sooner
  // than its largest package, and this one is larger than a fifth of the
  // whole workspace. Everything else is packed to sit under it.
  {
    shard: 1,
    packages: [{ name: '@codaco/protocol-builder', seconds: 540 }],
  },
  {
    shard: 2,
    packages: [{ name: '@codaco/architect', seconds: 260.3 }],
  },
  {
    shard: 3,
    postgres: true,
    packages: [
      { name: '@codaco/interview', seconds: 189.5 },
      { name: '@codaco/interviewer-classic', seconds: 96.8 },
      { name: '@codaco/protocol-validation', seconds: 41.7 },
      { name: '@codaco/studio-sync', seconds: 20.5 },
      { name: '@codaco/network-exporters', seconds: 4.5 },
    ],
  },
  {
    shard: 4,
    packages: [
      { name: '@codaco/fresco-ui', seconds: 144.2 },
      { name: '@codaco/architect-classic', seconds: 62.4 },
      { name: '@codaco/protocol-utilities', seconds: 52.7 },
      { name: 'networkcanvas.com', seconds: 33.3 },
      { name: '@codaco/background-creator', seconds: 15.5 },
      { name: '@codaco/network-query', seconds: 2.4 },
      { name: '@codaco/shared-consts', seconds: 2.5 },
    ],
  },
  {
    shard: 5,
    packages: [
      { name: '@codaco/interviewer', seconds: 100.9 },
      { name: 'fresco', seconds: 66.9 },
      { name: '@codaco/studio-client', seconds: 48.8 },
      { name: '@codaco/site-navigation-element', seconds: 27.7 },
      { name: '@codaco/art', seconds: 10.3 },
      { name: '@codaco/documentation', seconds: 7.9 },
      { name: '@codaco/app-i18n', seconds: 3.7 },
      { name: '@codaco/interface-images', seconds: 6.1 },
      { name: 'studio-managed-ingress-worker', seconds: 1.8 },
    ],
  },
];

/** Every package name this module has assigned to a shard. */
export function shardedPackages() {
  return TEST_SHARDS.flatMap((s) => s.packages.map((p) => p.name));
}

/**
 * Every workspace package that declares a `test` script, read from
 * pnpm-workspace.yaml so a new package cannot slip past the coverage check.
 * @param {string} [root]
 * @returns {string[]}
 */
export function workspaceTestPackages(root = REPO_ROOT) {
  const workspace = parse(
    readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8'),
  );
  /** @type {string[]} */
  const globs = workspace.packages ?? [];
  const names = new Set();
  for (const pattern of globs) {
    for (const manifestPath of globSync(`${pattern}/package.json`, {
      cwd: root,
    })) {
      const manifest = JSON.parse(
        readFileSync(join(root, manifestPath), 'utf8'),
      );
      if (manifest.scripts?.test) names.add(manifest.name);
    }
  }
  // Sorted so the emitted filter list is stable across platforms: it is
  // compared against in tests and read by a human in the job log.
  return [...names].sort((a, b) => a.localeCompare(b));
}

/**
 * Fail closed on drift: a package that gained a `test` script but no bucket
 * would otherwise be negated by every shard and silently never run.
 * @param {string[]} [testPackages]
 */
export function assertShardCoverage(testPackages = workspaceTestPackages()) {
  const assigned = shardedPackages();
  const seen = new Set();
  for (const name of assigned) {
    if (seen.has(name)) {
      throw new Error(`${name} is assigned to more than one test shard`);
    }
    seen.add(name);
  }

  const known = new Set(testPackages);
  for (const name of assigned) {
    if (!known.has(name)) {
      throw new Error(
        `test shard references ${name}, which is not a workspace package with a "test" script`,
      );
    }
  }
  for (const name of Object.keys(NOT_SHARDED)) {
    if (!known.has(name)) {
      throw new Error(
        `NOT_SHARDED lists ${name}, which is not a workspace package with a "test" script`,
      );
    }
  }

  const unassigned = testPackages.filter(
    (name) => !seen.has(name) && !(name in NOT_SHARDED),
  );
  if (unassigned.length > 0) {
    throw new Error(
      `these workspace packages declare a "test" script but belong to no test shard, so no shard would run them: ${unassigned.join(', ')}. Add each to a bucket in scripts/test-shards.mjs (or to NOT_SHARDED with the job that does run it).`,
    );
  }
}

/**
 * The turbo arguments that restrict a run to one shard's bucket: one negation
 * per test-carrying package the shard does not own.
 * @param {number} shard
 * @param {string[]} [testPackages]
 * @returns {string[]}
 */
export function shardFilters(shard, testPackages = workspaceTestPackages()) {
  assertShardCoverage(testPackages);
  const bucket = TEST_SHARDS.find((s) => s.shard === shard);
  if (!bucket) {
    throw new Error(
      `unknown test shard ${shard}; defined shards are ${TEST_SHARDS.map((s) => s.shard).join(', ')}`,
    );
  }
  const owned = new Set(bucket.packages.map((p) => p.name));
  return testPackages
    .filter((name) => !owned.has(name))
    .map((name) => `--filter=!${name}`);
}

function main(argv) {
  const [command, argument] = argv;
  if (command === 'filters') {
    const shard = Number(argument);
    if (!Number.isInteger(shard)) {
      throw new Error(`usage: test-shards.mjs filters <shard>`);
    }
    return shardFilters(shard).join('\n');
  }
  if (command === 'check') {
    assertShardCoverage();
    return `every workspace test suite is covered by a shard (${shardedPackages().length} packages across ${TEST_SHARDS.length} shards)`;
  }
  throw new Error(`usage: test-shards.mjs <filters <shard>|check>`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const output = main(process.argv.slice(2));
    if (output) console.log(output);
  } catch (error) {
    console.error(`::error::${error.message}`);
    process.exit(1);
  }
}
