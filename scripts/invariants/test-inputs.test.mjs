import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test } from 'vitest';
import { parse } from 'yaml';

// Turbo hashes a task's `inputs`, and those inputs also decide whether
// `--affected` selects the package at all. A test file, or a module it
// imports, that no input covers can change without its suite running: the
// cached green result replays. Every unit-test task that narrows its inputs
// must therefore cover each test file and everything it reaches
// through relative imports, and its vitest config. A file in another
// workspace package is left out only when that package is a workspace
// dependency: the `^topo` edge then re-hashes the consumer whenever it changes.
// Files a test reads through `fs` with a computed path are out of reach.

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);
const toRepoPath = (file) =>
  path.relative(repoRoot, file).split(path.sep).join('/');

const turbo = JSON.parse(
  readFileSync(path.join(repoRoot, 'turbo.json'), 'utf8')
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n'),
);
const workspaceGlobs = parse(
  readFileSync(path.join(repoRoot, 'pnpm-workspace.yaml'), 'utf8'),
).packages;

// Untracked files count too, so a new test is checked before it is committed.
const repoFiles = execFileSync(
  'git',
  ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
  { cwd: repoRoot, encoding: 'utf8' },
)
  .split('\0')
  .filter((file) => file !== '' && existsSync(path.join(repoRoot, file)));

const packageDirs = repoFiles
  .filter((file) => file.endsWith('/package.json'))
  .map((file) => path.posix.dirname(file))
  .filter((dir) => workspaceGlobs.some((glob) => path.matchesGlob(dir, glob)));

const packagesDeepestFirst = packageDirs.toSorted(
  (a, b) => b.length - a.length,
);
const ownerOf = (repoPath) =>
  packagesDeepestFirst.find((dir) => repoPath.startsWith(`${dir}/`));

const manifests = new Map(
  packageDirs.map((dir) => [
    dir,
    JSON.parse(readFileSync(path.join(repoRoot, dir, 'package.json'), 'utf8')),
  ]),
);
const dirByName = new Map(
  [...manifests].map(([dir, manifest]) => [manifest.name, dir]),
);
const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
];

// The workspace packages `packageDir` depends on, directly or through others.
function workspaceDependencyClosure(packageDir) {
  const closure = new Set();
  const pending = [packageDir];
  while (pending.length > 0) {
    const manifest = manifests.get(pending.pop());
    for (const field of DEPENDENCY_FIELDS) {
      for (const name of Object.keys(manifest[field] ?? {})) {
        const dir = dirByName.get(name);
        if (dir === undefined || closure.has(dir)) continue;
        closure.add(dir);
        pending.push(dir);
      }
    }
  }
  return closure;
}

const EXTENSIONS = [
  '',
  '.ts',
  '.tsx',
  '.mts',
  '.mjs',
  '.js',
  '.jsx',
  '.json',
  '/index.ts',
  '/index.tsx',
  '/index.js',
];

function resolveRelative(fromFile, specifier) {
  const base = path.resolve(path.dirname(fromFile), specifier);
  for (const extension of EXTENSIONS) {
    const candidate = `${base}${extension}`;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

const SPECIFIERS = [
  /(?:^|\n)\s*(?:import|export)\b[^'"]*?from\s+['"](\.{1,2}\/[^'"]+)['"]/g,
  /(?:^|\n)\s*import\s+['"](\.{1,2}\/[^'"]+)['"]/g,
  /\bimport\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g,
  /\bvi\.(?:mock|importActual)\(\s*['"](\.{1,2}\/[^'"]+)['"]/g,
  /\bnew URL\(\s*['"](\.{1,2}\/[^'"]+)['"],\s*import\.meta\.url/g,
];

function relativeImportGraph(entries) {
  const seen = new Set();
  const pending = [...entries];
  while (pending.length > 0) {
    const file = pending.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    if (!/\.[cm]?[jt]sx?$/.test(file)) continue;
    const text = readFileSync(file, 'utf8');
    for (const pattern of SPECIFIERS) {
      for (const match of text.matchAll(pattern)) {
        const resolved = resolveRelative(file, match[1]);
        if (resolved) pending.push(resolved);
      }
    }
  }
  return seen;
}

function covered(inputs, packageDir, repoPath) {
  if (inputs.includes('$TURBO_DEFAULT$')) return true;
  const candidate = (glob) =>
    glob.startsWith('$TURBO_ROOT$/')
      ? path.matchesGlob(repoPath, glob.slice('$TURBO_ROOT$/'.length))
      : repoPath.startsWith(`${packageDir}/`) &&
        path.matchesGlob(repoPath.slice(packageDir.length + 1), glob);
  const positive = inputs.filter((glob) => !glob.startsWith('!'));
  const negative = inputs
    .filter((glob) => glob.startsWith('!'))
    .map((glob) => glob.slice(1));
  return positive.some(candidate) && !negative.some(candidate);
}

// Classic's integration suites run outside the `test` task. Playwright specs
// are `*.spec.ts`, so the `*.test.*` files under an `e2e` directory (Interview's
// e2e helpers, host and matrix, and @codaco/e2e-helpers) are vitest units and
// are walked.
const NOT_UNIT = new Set(['integration-tests', 'node_modules']);
const isUnitTest = (repoPath, packageDir) =>
  /\.test\.[cm]?[jt]sx?$/.test(repoPath) &&
  !repoPath
    .slice(packageDir.length + 1)
    .split('/')
    .some((segment) => NOT_UNIT.has(segment));
const isVitestConfig = (repoPath, packageDir) =>
  /^vitest\.config\.[cm]?[jt]s$/.test(repoPath.slice(packageDir.length + 1));

// The files of each package that its `task` inputs miss, among the entry files
// and everything they reach through relative imports.
function uncovered(task, isEntry) {
  const gaps = [];
  let checkedPackages = 0;
  for (const packageDir of packageDirs) {
    const manifest = manifests.get(packageDir);
    if (manifest.scripts?.[task] === undefined) continue;
    const inputs =
      turbo.tasks[`${manifest.name}#${task}`]?.inputs ??
      turbo.tasks[task]?.inputs;
    if (inputs === undefined) continue;
    checkedPackages += 1;
    const dependencies = workspaceDependencyClosure(packageDir);

    const entries = repoFiles.filter(
      (file) => ownerOf(file) === packageDir && isEntry(file, packageDir),
    );
    const reached = relativeImportGraph(
      entries.map((file) => path.join(repoRoot, file)),
    );
    for (const file of reached) {
      const repoPath = toRepoPath(file);
      // Installed dependencies are hashed through the lockfile.
      if (repoPath.split('/').includes('node_modules')) continue;
      const owner = ownerOf(repoPath);
      if (dependencies.has(owner)) continue;
      if (!covered(inputs, packageDir, repoPath)) {
        gaps.push(`${manifest.name}: ${repoPath}`);
      }
    }
  }
  return { gaps, checkedPackages };
}

test(
  'every unit-test task with inputs covers its tests and what they import',
  { timeout: 120_000 },
  () => {
    const { gaps, checkedPackages } = uncovered(
      'test',
      (file, packageDir) =>
        isUnitTest(file, packageDir) || isVitestConfig(file, packageDir),
    );
    assert.ok(checkedPackages > 5, 'the walk found the narrowed test tasks');
    assert.deepEqual(
      gaps,
      [],
      'add these paths (or a glob over them) to the package test task inputs in turbo.json',
    );
  },
);

test(
  'every Storybook test task with inputs covers its stories and what they import',
  { timeout: 120_000 },
  () => {
    const { gaps, checkedPackages } = uncovered(
      'test:storybook',
      (file, packageDir) =>
        /\.stories\.[cm]?[jt]sx?$/.test(file) ||
        file.startsWith(`${packageDir}/.storybook/`),
    );
    assert.ok(checkedPackages > 2, 'the walk found the Storybook test tasks');
    assert.deepEqual(
      gaps,
      [],
      'add these paths (or a glob over them) to the package test:storybook task inputs in turbo.json',
    );
  },
);

test('the documentation test inputs cover its Netlify edge-function tests', () => {
  const edgeTest =
    'apps/documentation/netlify/edge-functions/__tests__/locale.test.ts';
  assert.ok(repoFiles.includes(edgeTest), `${edgeTest} exists`);
  const inputs = turbo.tasks['@codaco/documentation#test'].inputs;
  assert.ok(covered(inputs, 'apps/documentation', edgeTest));
});

// A `pkg#task` entry replaces the generic task, so an entry written as "the
// generic test plus more" has to be kept in step with the generic one by hand.
test('protocol-builder test keeps every generic test input and env var', () => {
  const generic = turbo.tasks.test;
  const builder = turbo.tasks['@codaco/protocol-builder#test'];
  assert.deepEqual(
    generic.inputs.filter((glob) => !builder.inputs.includes(glob)),
    [],
  );
  assert.deepEqual(builder.env, generic.env);
});
