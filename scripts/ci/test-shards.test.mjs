import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { test } from 'vitest';

import {
  assertShardCoverage,
  shardedPackages,
  shardFilters,
  TEST_SHARDS,
  workspaceTestPackages,
} from './test-shards.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(scriptDir, 'test-shards.mjs');
const REPO_ROOT = resolve(scriptDir, '..', '..');

test('every workspace test suite belongs to exactly one shard', () => {
  // The whole point of the guard: a package that gains a `test` script but no
  // bucket is negated by every shard, so no shard runs it and CI stays green
  // while the suite silently stops executing.
  assert.doesNotThrow(() => assertShardCoverage());
});

test('the Studio server suite is in no bucket, so every shard negates it', () => {
  assert.ok(
    !shardedPackages().includes('@codaco/studio-server'),
    'the wall-clock-budgeted Studio suite keeps its own dedicated job',
  );
  for (const { shard } of TEST_SHARDS) {
    assert.ok(
      shardFilters(shard).includes('--filter=!@codaco/studio-server'),
      `shard ${shard} excludes the Studio server suite`,
    );
  }
});

test('a shard negates every test package it does not own, and none it does', () => {
  const all = workspaceTestPackages(REPO_ROOT);
  for (const { shard, packages } of TEST_SHARDS) {
    const owned = new Set(packages.map((p) => p.name));
    const filters = shardFilters(shard, all);
    assert.deepEqual(
      filters,
      all.filter((name) => !owned.has(name)).map((name) => `--filter=!${name}`),
      `shard ${shard} negates exactly its complement`,
    );
    for (const name of owned) {
      assert.ok(
        !filters.includes(`--filter=!${name}`),
        `shard ${shard} does not negate ${name}, which it owns`,
      );
    }
  }
});

test('the shards partition the workspace suites with no overlap or gap', () => {
  const assigned = shardedPackages();
  assert.equal(
    assigned.length,
    new Set(assigned).size,
    'no package is assigned twice',
  );
  const all = workspaceTestPackages(REPO_ROOT);
  assert.deepEqual(
    [...assigned].sort(),
    all.filter((name) => name !== '@codaco/studio-server').sort(),
    'the buckets cover every workspace test suite but the Studio server one',
  );
});

test('exactly one shard carries the only suite that needs Postgres', () => {
  // packages/studio-sync's conformance suite connects to 54318 and refuses to
  // skip under CI; it is the only workspace suite outside @codaco/studio-server
  // that needs a database, which is why only its shard starts one.
  const withPostgres = TEST_SHARDS.filter((s) => s.postgres === true);
  assert.equal(withPostgres.length, 1, 'one shard declares Postgres');
  assert.ok(
    withPostgres[0].packages.some((p) => p.name === '@codaco/studio-sync'),
    'the Postgres shard is the one holding @codaco/studio-sync',
  );
  for (const shard of TEST_SHARDS) {
    if (shard.postgres === true) continue;
    assert.ok(
      !shard.packages.some((p) => p.name === '@codaco/studio-sync'),
      `shard ${shard.shard} does not hold the Postgres-dependent suite`,
    );
  }
});

test('a deliberately-unsharded package added to a bucket fails the check', () => {
  // The drift this catches: a rebalance drops @codaco/studio-server into a
  // bucket. It is not a duplicate, it IS a workspace test package, and it is
  // no longer unassigned — so every other arm of the guard passes it. But the
  // shard that owns it stops negating it, and the wall-clock-budgeted suite
  // runs there as well as in its dedicated job.
  const rogue = {
    shard: 99,
    packages: [{ name: '@codaco/studio-server', seconds: 590 }],
  };
  TEST_SHARDS.push(rogue);
  try {
    assert.throws(
      () => assertShardCoverage(),
      /deliberately not sharded[\s\S]*test-studio-server/,
    );
  } finally {
    TEST_SHARDS.pop();
  }
  // And the real configuration is still clean once the rogue bucket is gone.
  assert.doesNotThrow(() => assertShardCoverage());
});

test('an unassigned test package fails the coverage check', () => {
  assert.throws(
    () =>
      assertShardCoverage([
        ...workspaceTestPackages(REPO_ROOT),
        '@codaco/newcomer',
      ]),
    /belong to no test shard/,
  );
});

test('an unknown shard number is refused rather than running everything', () => {
  assert.throws(() => shardFilters(9999), /unknown test shard/);
});

test('the CLI prints one filter per line and fails closed on a bad shard', () => {
  const ok = spawnSync(process.execPath, [SCRIPT, 'filters', '1'], {
    encoding: 'utf8',
  });
  assert.equal(ok.status, 0, ok.stderr);
  const lines = ok.stdout.trim().split('\n');
  assert.deepEqual(lines, shardFilters(1));
  for (const line of lines) {
    assert.match(line, /^--filter=!\S+$/);
  }

  const bad = spawnSync(process.execPath, [SCRIPT, 'filters', 'nope'], {
    encoding: 'utf8',
  });
  assert.notEqual(bad.status, 0, 'a non-numeric shard exits non-zero');
  assert.equal(bad.stdout.trim(), '', 'and prints no filters to consume');
});

test('the workspace scan reads pnpm-workspace.yaml rather than a fixed list', () => {
  const root = mkdtempSync(join(tmpdir(), 'test-shards-'));
  writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - libs/*\n');
  mkdirSync(join(root, 'libs', 'tested'), { recursive: true });
  mkdirSync(join(root, 'libs', 'untested'), { recursive: true });
  writeFileSync(
    join(root, 'libs', 'tested', 'package.json'),
    JSON.stringify({ name: '@x/tested', scripts: { test: 'vitest run' } }),
  );
  writeFileSync(
    join(root, 'libs', 'untested', 'package.json'),
    JSON.stringify({ name: '@x/untested', scripts: { build: 'tsc' } }),
  );

  assert.deepEqual(workspaceTestPackages(root), ['@x/tested']);
});
