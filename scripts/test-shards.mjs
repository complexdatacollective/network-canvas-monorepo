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
// From per-package wall time in the four longest full-cascade `test` jobs on
// record (runs 34457797127, 34439598092, 34452953003, 34453233041 — 24m00s to
// 25m56s of turbo run time each). Turbo buffers a task's whole output and
// flushes it as one group when the task ends, so a package's elapsed time is
// the gap between its group and the next one's; that matched vitest's own
// `Duration` line plus 2-5s of process startup for every package
// cross-checked. Run-to-run spread was small (protocol-builder 405-436s,
// architect 327-348s), so these are weights, not noise.
//
// The `seconds` below are from the widest of those runs. Five packages were a
// cache hit in all four — the two Classic apps deliberately depend on
// published protocol-validation rather than the workspace copy, so nothing
// else invalidates them, and app-i18n, interface-images and the ingress
// worker are tiny and stable. Their weights are extrapolated from a local
// `--force --summarize` run scaled by the CI/local ratio the other sixteen
// packages showed (median 2.4), and are the only estimated numbers here.
//
// The packing is longest-processing-time-first, which lands:
//
//     shard 1  430.6s      shard 2  346.0s      shard 3  314.6s
//     shard 4  290.1s      shard 5  271.5s
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
// Five shards rather than four because the job cannot finish sooner than its
// largest single package however many runners it gets, and protocol-builder is
// that package at 430.6s. Four shards would have packed the rest into buckets
// of ~380-430s, leaving no margin: a shard that drifted past protocol-builder
// would become the critical path. Five leaves the rest at ~270-350s, so
// protocol-builder is the sole constraint on both the affected and the
// full-suite path, and the extra runner is free on a public repository. Going
// below 430s needs the protocol-builder suite itself split, which is a
// different change: turbo's unit of work is the package.
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
    packages: [{ name: '@codaco/protocol-builder', seconds: 430.6 }],
  },
  {
    shard: 2,
    packages: [{ name: '@codaco/architect', seconds: 346.0 }],
  },
  {
    shard: 3,
    postgres: true,
    packages: [
      { name: '@codaco/interview', seconds: 190.2 },
      { name: '@codaco/interviewer-classic', seconds: 56 },
      { name: '@codaco/protocol-validation', seconds: 43.0 },
      { name: '@codaco/studio-sync', seconds: 20.9 },
      { name: '@codaco/network-exporters', seconds: 4.5 },
    ],
  },
  {
    shard: 4,
    packages: [
      { name: '@codaco/fresco-ui', seconds: 149.8 },
      { name: '@codaco/architect-classic', seconds: 31 },
      { name: '@codaco/protocol-utilities', seconds: 54.2 },
      { name: 'networkcanvas.com', seconds: 34.4 },
      { name: '@codaco/background-creator', seconds: 16.4 },
      { name: '@codaco/network-query', seconds: 2.6 },
      { name: '@codaco/shared-consts', seconds: 1.7 },
    ],
  },
  {
    shard: 5,
    packages: [
      { name: '@codaco/interviewer', seconds: 100.9 },
      { name: 'fresco', seconds: 66.5 },
      { name: '@codaco/studio-client', seconds: 47.4 },
      { name: '@codaco/site-navigation-element', seconds: 27.6 },
      { name: '@codaco/art', seconds: 10.5 },
      { name: '@codaco/documentation', seconds: 8.1 },
      { name: '@codaco/app-i18n', seconds: 5 },
      { name: '@codaco/interface-images', seconds: 4 },
      { name: 'studio-managed-ingress-worker', seconds: 1.5 },
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
