#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  collectWorkspacePackages,
  E2E_SUITE_SUBJECTS,
  relevanceDirsForSubject,
  SUITE_KEYS,
} from '../../../../scripts/release-e2e-policy.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(SCRIPT_DIR, '../../../..');
const BASELINE_SEGMENT = '/e2e/visual-snapshots/';

const NONVISUAL_PATH_PATTERNS = [
  /^\.agents\//,
  /^\.changeset\//,
  /^\.claude\//,
  /^\.github\//,
  /^docs\//,
  /(^|\/)__tests__\//,
  /\.(?:md|mdx)$/,
  /\.(?:test|spec)\.[cm]?[jt]sx?$/,
  /\.d\.[cm]?ts$/,
];

const GLOBAL_RENDER_PATHS = new Set([
  '.npmrc',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'turbo.json',
]);

function git(root, args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

function gitLines(root, args) {
  try {
    const output = git(root, args);
    return output ? output.split('\n').filter(Boolean) : [];
  } catch {
    return [];
  }
}

function isKnownNonvisual(path) {
  return (
    path.includes(BASELINE_SEGMENT) ||
    NONVISUAL_PATH_PATTERNS.some((pattern) => pattern.test(path))
  );
}

function isGlobalRenderPath(path) {
  return (
    GLOBAL_RENDER_PATHS.has(path) ||
    /^tsconfig(?:\..+)?\.json$/.test(path) ||
    /^vite\.config\.[cm]?[jt]s$/.test(path)
  );
}

function owningPackage(path, packages) {
  return [...packages.values()].find(
    ({ dir }) => path === dir || path.startsWith(`${dir}/`),
  );
}

export function classifyVisualChanges(paths, root = DEFAULT_ROOT) {
  const packages = collectWorkspacePackages(root);
  const relevance = new Map(
    SUITE_KEYS.map((suite) => [
      suite,
      relevanceDirsForSubject(E2E_SUITE_SUBJECTS[suite], packages),
    ]),
  );
  const suites = Object.fromEntries(SUITE_KEYS.map((suite) => [suite, []]));
  const ignored = [];
  const failClosed = [];

  for (const path of [...new Set(paths)].toSorted((a, b) =>
    a.localeCompare(b),
  )) {
    if (isKnownNonvisual(path)) {
      ignored.push(path);
      continue;
    }

    if (isGlobalRenderPath(path)) {
      failClosed.push(path);
      for (const suite of SUITE_KEYS) suites[suite].push(path);
      continue;
    }

    const owner = owningPackage(path, packages);
    if (!owner) {
      // An unrecognised root/global path may alter a build or rendered asset.
      // Require semantic review for every suite rather than silently skipping.
      failClosed.push(path);
      for (const suite of SUITE_KEYS) suites[suite].push(path);
      continue;
    }

    for (const suite of SUITE_KEYS) {
      if (relevance.get(suite).has(owner.dir)) suites[suite].push(path);
    }
  }

  return {
    suites,
    ignored,
    failClosed,
  };
}

function changedPaths(root = DEFAULT_ROOT, baseRef = 'origin/main') {
  const paths = new Set();

  try {
    const mergeBase = git(root, ['merge-base', 'HEAD', baseRef]);
    for (const path of gitLines(root, [
      'diff',
      '--name-only',
      '--diff-filter=ACDMRTUXB',
      `${mergeBase}...HEAD`,
    ])) {
      paths.add(path);
    }
  } catch {
    // A shallow/offline checkout may not have the base. Working-tree changes
    // are still useful, and the CLI warns that committed changes were omitted.
  }

  for (const args of [
    ['diff', '--name-only', '--diff-filter=ACDMRTUXB'],
    ['diff', '--cached', '--name-only', '--diff-filter=ACDMRTUXB'],
    ['ls-files', '--others', '--exclude-standard'],
  ]) {
    for (const path of gitLines(root, args)) paths.add(path);
  }

  return [...paths].toSorted((a, b) => a.localeCompare(b));
}

function printReport(report, paths) {
  process.stdout.write(`Changed paths considered: ${paths.length}\n`);
  for (const suite of SUITE_KEYS) {
    const candidates = report.suites[suite];
    process.stdout.write(
      `${suite}: ${candidates.length > 0 ? 'REVIEW' : 'skip'}\n`,
    );
    for (const path of candidates) process.stdout.write(`  - ${path}\n`);
  }
  if (report.failClosed.length > 0) {
    process.stdout.write('Fail-closed global/unrecognised paths:\n');
    for (const path of report.failClosed) process.stdout.write(`  - ${path}\n`);
  }
  if (report.ignored.length > 0) {
    process.stdout.write('Known nonvisual paths:\n');
    for (const path of report.ignored) process.stdout.write(`  - ${path}\n`);
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const rootIndex = process.argv.indexOf('--root');
  const baseIndex = process.argv.indexOf('--base');
  const root =
    rootIndex >= 0 && process.argv[rootIndex + 1]
      ? resolve(process.argv[rootIndex + 1])
      : DEFAULT_ROOT;
  const base =
    baseIndex >= 0 && process.argv[baseIndex + 1]
      ? process.argv[baseIndex + 1]
      : 'origin/main';

  if (!existsSync(resolve(root, '.git'))) {
    process.stderr.write(`Not a Git worktree: ${root}\n`);
    process.exitCode = 1;
  } else {
    const paths = changedPaths(root, base);
    printReport(classifyVisualChanges(paths, root), paths);
  }
}
