import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { vendorSharedVitestConfig } from './mirror-app.mjs';
import { resolveManifest } from './resolve-manifest.mjs';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const sharedSetupPath = 'tooling/vitest/modern/disable-animations.js';
const sharedSetupFilename = '@codaco/vitest-config/modern/setup-path';
const legacySetupPath = 'tooling/vitest/legacy/disable-animations.js';
const legacySetupFilename = '@codaco/vitest-config/legacy/setup-path';
const dependencyGroups = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
];

function collectWorkspaceManifests(directory) {
  const manifests = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'node_modules') continue;

    const workspaceDirectory = path.join(directory, entry.name);
    const manifestPath = path.join(workspaceDirectory, 'package.json');

    if (existsSync(manifestPath)) {
      manifests.push(manifestPath);
      continue;
    }

    manifests.push(...collectWorkspaceManifests(workspaceDirectory));
  }

  return manifests;
}

function declaresDependency(manifest, dependencyName) {
  return dependencyGroups.some(
    (group) => manifest[group]?.[dependencyName] !== undefined,
  );
}

function dependencySpecifier(manifest, dependencyName) {
  for (const group of dependencyGroups) {
    const specifier = manifest[group]?.[dependencyName];
    if (specifier !== undefined) return specifier;
  }
  return undefined;
}

function findVitestConfigs(workspaceDirectory) {
  return readdirSync(workspaceDirectory)
    .filter((file) => /^vitest\.config\.[cm]?[jt]s$/.test(file))
    .map((file) => path.join(workspaceDirectory, file));
}

function findUnconfiguredWorkspaces({
  dependencyName,
  setupFilename,
  workspaceManifests,
}) {
  const uncoveredWorkspaces = [];

  for (const manifestPath of workspaceManifests) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (
      manifest.name === '@codaco/vitest-config' ||
      !declaresDependency(manifest, 'vitest') ||
      !declaresDependency(manifest, dependencyName)
    ) {
      continue;
    }

    const workspaceDirectory = path.dirname(manifestPath);
    const configPaths = findVitestConfigs(workspaceDirectory);
    const configured = configPaths.some((configPath) => {
      const config = readFileSync(configPath, 'utf8');
      const setupIndex = config.indexOf(setupFilename);
      const storybookIndex = config.indexOf("name: 'storybook'");

      return (
        setupIndex !== -1 &&
        (storybookIndex === -1 || setupIndex < storybookIndex)
      );
    });

    if (!configured) {
      uncoveredWorkspaces.push(path.relative(repoRoot, workspaceDirectory));
    }
  }

  return uncoveredWorkspaces;
}

function findConsumersMissingWorkspaceDependency({
  consumerDependency,
  requiredDependency,
  workspaceManifests,
}) {
  const missingDependency = [];

  for (const manifestPath of workspaceManifests) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (
      manifest.name === requiredDependency ||
      !declaresDependency(manifest, 'vitest') ||
      !declaresDependency(manifest, consumerDependency)
    ) {
      continue;
    }

    const specifier = dependencySpecifier(manifest, requiredDependency);
    if (typeof specifier !== 'string' || !specifier.startsWith('workspace:')) {
      missingDependency.push(
        path.relative(repoRoot, path.dirname(manifestPath)),
      );
    }
  }

  return missingDependency;
}

const workspaceManifests = ['apps', 'packages', 'tooling', 'workers'].flatMap(
  (directory) => collectWorkspaceManifests(path.join(repoRoot, directory)),
);

test('the shared Vitest setup disables Motion and Base UI animations', () => {
  const setup = readFileSync(path.join(repoRoot, sharedSetupPath), 'utf8');

  assert.match(setup, /MotionGlobalConfig\.skipAnimations\s*=\s*true/);
  assert.match(setup, /globalThis\.BASE_UI_ANIMATIONS_DISABLED\s*=\s*true/);
});

test('the shared Vitest setup widens the Testing Library wait budget', () => {
  const setup = readFileSync(path.join(repoRoot, sharedSetupPath), 'utf8');

  // Testing Library's own default is one second, which a loaded CI runner
  // exceeds on renders that take tens of milliseconds locally.
  const configured = setup.match(/asyncUtilTimeout:\s*([\d_]+)/);
  assert.ok(configured, `${sharedSetupPath} must configure asyncUtilTimeout`);
  assert.ok(
    Number(configured[1].replaceAll('_', '')) >= 5000,
    `${sharedSetupPath} must give waitFor/findBy at least 5s, got ${configured[1]}`,
  );
});

/**
 * The chain of `{ … }` blocks enclosing `offset`, innermost first, as
 * `[start, end]` pairs. Strings and comments are skipped, so neither a brace
 * inside a glob nor an apostrophe inside prose can shift the nesting.
 *
 * A whole-file scan is not good enough here: a config's projects each carry
 * their own `testTimeout`, and a Storybook project's generous one must not be
 * read as cover for a unit project that declares none.
 */
function enclosingBlocks(source, offset) {
  const open = [];
  const blocks = [];

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const pair = source.slice(index, index + 2);

    if (pair === '//') {
      const newline = source.indexOf('\n', index);
      index = newline === -1 ? source.length : newline;
      continue;
    }

    if (pair === '/*') {
      const close = source.indexOf('*/', index + 2);
      index = close === -1 ? source.length : close + 1;
      continue;
    }

    if (character === "'" || character === '"' || character === '`') {
      index += 1;
      while (index < source.length && source[index] !== character) {
        if (source[index] === '\\') index += 1;
        index += 1;
      }
      continue;
    }

    if (character === '{') {
      open.push(index);
    } else if (character === '}') {
      const start = open.pop();
      if (start !== undefined && start < offset && index > offset) {
        blocks.push([start, index]);
      }
    }
  }

  // Blocks are recorded as they close, and an enclosing block cannot close
  // before the block it encloses — so this is already innermost-first.
  return blocks;
}

/**
 * A block's own properties, with every nested `{ … }` blanked out. Without
 * this, the root `test` block of a config whose `projects` array holds a
 * 60-second Storybook project would appear to declare that timeout itself.
 */
function ownProperties(source, [start, end]) {
  let own = '';
  let depth = 0;

  for (let index = start + 1; index < end; index += 1) {
    const character = source[index];
    const pair = source.slice(index, index + 2);

    if (pair === '//') {
      const newline = source.indexOf('\n', index);
      index = newline === -1 ? end : newline;
      continue;
    }

    if (pair === '/*') {
      const close = source.indexOf('*/', index + 2);
      index = close === -1 ? end : close + 1;
      continue;
    }

    if (character === "'" || character === '"' || character === '`') {
      // Consumed whole so a brace inside cannot shift the depth, but kept
      // verbatim so string-valued properties such as `name` survive.
      const opened = index;
      index += 1;
      while (index < end && source[index] !== character) {
        if (source[index] === '\\') index += 1;
        index += 1;
      }
      if (depth === 0) own += source.slice(opened, index + 1);
      continue;
    }

    if (character === '{') depth += 1;
    else if (character === '}') depth -= 1;
    else if (depth === 0) own += character;
  }

  return own;
}

test('every jsdom project loading the shared setup outlasts its wait budget', () => {
  // A `testTimeout` at or below the wait budget cuts `waitFor` short, so the
  // failure arrives as a bare timeout instead of the DOM the wait gave up on.
  const tooTight = [];

  for (const manifestPath of workspaceManifests) {
    const workspaceDirectory = path.dirname(manifestPath);

    for (const configPath of findVitestConfigs(workspaceDirectory)) {
      const config = readFileSync(configPath, 'utf8');

      // Every use in `setupFiles` is one project loading the shared setup; the
      // bare import specifier at the top of the file is not.
      const uses = [...config.matchAll(/disableModernAnimationsSetup/g)]
        .map((match) => match.index)
        .filter((index) => !/^\s*import\b/.test(lineAt(config, index)));

      for (const use of uses) {
        // Projects here all use `extends: true`, so a `testTimeout` on an
        // enclosing block still governs; take the nearest one declared.
        const nearest = enclosingBlocks(config, use)
          .map((block) =>
            /testTimeout:\s*([\d_]+)/.exec(ownProperties(config, block)),
          )
          .find(Boolean);

        const timeout = nearest
          ? Number(nearest[1].replaceAll('_', ''))
          : undefined;
        if (timeout === undefined || timeout < 20_000) {
          tooTight.push(
            `${path.relative(repoRoot, configPath)} (${projectNameAt(config, use) ?? 'root'}: ${timeout ?? 'unset'})`,
          );
        }
      }
    }
  }

  assert.deepEqual(
    tooTight,
    [],
    `Every Vitest project loading ${sharedSetupPath} must set testTimeout to at least 20s: ${tooTight.join(', ')}`,
  );
});

function lineAt(source, offset) {
  const start = source.lastIndexOf('\n', offset) + 1;
  const end = source.indexOf('\n', offset);
  return source.slice(start, end === -1 ? undefined : end);
}

/** The `name:` of the project block that loads the setup, for the failure text. */
function projectNameAt(source, offset) {
  for (const block of enclosingBlocks(source, offset)) {
    const named = /name:\s*'([^']+)'/.exec(ownProperties(source, block));
    if (named) return named[1];
  }
  return undefined;
}

test('every Testing Library Vitest workspace loads the shared setup', () => {
  // Motion is the usual reason to need the shared setup, but the wait budget it
  // configures matters to any workspace that queries the DOM asynchronously.
  const uncoveredWorkspaces = findUnconfiguredWorkspaces({
    dependencyName: '@testing-library/react',
    setupFilename: sharedSetupFilename,
    workspaceManifests,
  });

  assert.deepEqual(
    uncoveredWorkspaces,
    [],
    `Testing Library Vitest workspaces must load ${sharedSetupPath} in their unit or browser setupFiles: ${uncoveredWorkspaces.join(', ')}`,
  );
});

test('Testing Library Vitest consumers inherit setup changes through Vitest tooling', () => {
  const missingDependency = findConsumersMissingWorkspaceDependency({
    consumerDependency: '@testing-library/react',
    requiredDependency: '@codaco/vitest-config',
    workspaceManifests,
  });

  assert.deepEqual(
    missingDependency,
    [],
    `Testing Library Vitest consumers must declare @codaco/vitest-config as a workspace dependency so Turbo selects them when ${sharedSetupPath} changes: ${missingDependency.join(', ')}`,
  );
});

test('every modern Motion Vitest workspace loads the shared animation setup', () => {
  const uncoveredWorkspaces = findUnconfiguredWorkspaces({
    dependencyName: 'motion',
    setupFilename: sharedSetupFilename,
    workspaceManifests,
  });

  assert.deepEqual(
    uncoveredWorkspaces,
    [],
    `Modern Motion Vitest workspaces must load ${sharedSetupPath} in their unit or browser setupFiles: ${uncoveredWorkspaces.join(', ')}`,
  );
});

test('modern Motion Vitest consumers inherit setup changes through Vitest tooling', () => {
  const missingDependency = findConsumersMissingWorkspaceDependency({
    consumerDependency: 'motion',
    requiredDependency: '@codaco/vitest-config',
    workspaceManifests,
  });

  assert.deepEqual(
    missingDependency,
    [],
    `Modern Motion Vitest consumers must declare @codaco/vitest-config as a workspace dependency so Turbo selects them when ${sharedSetupPath} changes: ${missingDependency.join(', ')}`,
  );
});

test('every legacy Framer Motion Vitest workspace loads the shared animation setup', () => {
  const uncoveredWorkspaces = findUnconfiguredWorkspaces({
    dependencyName: 'framer-motion',
    setupFilename: legacySetupFilename,
    workspaceManifests,
  });

  assert.deepEqual(
    uncoveredWorkspaces,
    [],
    `Legacy Framer Motion Vitest workspaces must load ${legacySetupPath} in setupFiles: ${uncoveredWorkspaces.join(', ')}`,
  );
});

test('legacy Framer Motion consumers inherit setup changes through Vitest tooling', () => {
  const missingDependency = findConsumersMissingWorkspaceDependency({
    consumerDependency: 'framer-motion',
    requiredDependency: '@codaco/vitest-config',
    workspaceManifests,
  });

  assert.deepEqual(
    missingDependency,
    [],
    `Legacy Framer Motion consumers must declare @codaco/vitest-config as a workspace dependency so Turbo selects them when ${legacySetupPath} changes: ${missingDependency.join(', ')}`,
  );
});

test('legacy animation setup and Vitest configs stay ESM-native', () => {
  const legacySetup = readFileSync(
    path.join(repoRoot, legacySetupPath),
    'utf8',
  );
  assert.doesNotMatch(legacySetup, /createRequire|\brequire\s*\(/);
  assert.match(legacySetup, /import\.meta\.resolve/);
  assert.match(legacySetup, /pathToFileURL/);
  assert.match(legacySetup, /vi\.importActual\(['"]react['"]\)/);

  for (const workspace of [
    'apps/architect-classic',
    'apps/interviewer-classic',
  ]) {
    const esmConfig = path.join(repoRoot, workspace, 'vitest.config.mjs');
    const ambiguousConfig = path.join(repoRoot, workspace, 'vitest.config.js');
    assert.equal(
      existsSync(esmConfig),
      true,
      `${workspace} uses an .mjs config`,
    );
    assert.equal(
      existsSync(ambiguousConfig),
      false,
      `${workspace} has no package-type-dependent .js config`,
    );

    const config = readFileSync(esmConfig, 'utf8');
    assert.match(config, /fileURLToPath/);
    assert.match(config, /import\.meta\.resolve\(disableAnimationsSetup\)/);
    assert.doesNotMatch(config, /createRequire|\brequire\s*\(|__dirname/);
  }
});

test('modern animation setup and path export stay ESM-native', () => {
  const modernSetup = readFileSync(
    path.join(repoRoot, sharedSetupPath),
    'utf8',
  );
  const pathExport = readFileSync(
    path.join(repoRoot, 'tooling/vitest/modern/setup-path.js'),
    'utf8',
  );

  assert.match(modernSetup, /from ['"]motion\/react['"]/);
  assert.doesNotMatch(modernSetup, /createRequire|\brequire\s*\(|__dirname/);
  assert.match(pathExport, /fileURLToPath/);
  assert.doesNotMatch(pathExport, /createRequire|\brequire\s*\(|__dirname/);
});

test('mirrored apps vendor the private shared Vitest package', () => {
  for (const app of [
    'apps/architect-classic',
    'apps/interviewer-classic',
    'apps/fresco',
  ]) {
    const appDirectory = path.join(repoRoot, app);
    const { manifest, dropped } = resolveManifest(appDirectory);
    const staging = mkdtempSync(path.join(tmpdir(), 'vitest-config-mirror-'));

    try {
      if (app === 'apps/fresco') {
        copyFileSync(
          path.join(appDirectory, 'Dockerfile'),
          path.join(staging, 'Dockerfile'),
        );
      }
      vendorSharedVitestConfig(staging, manifest, dropped);

      assert.equal(
        manifest.devDependencies['@codaco/vitest-config'],
        'file:vendor/vitest-config',
        `${app} points at the vendored package`,
      );

      const vendoredPackagePath = path.join(
        staging,
        'vendor/vitest-config/package.json',
      );
      const vendoredPackage = JSON.parse(
        readFileSync(vendoredPackagePath, 'utf8'),
      );
      const isClassic = app.endsWith('-classic');
      assert.equal(vendoredPackage.type, 'module');
      assert.doesNotMatch(
        readFileSync(vendoredPackagePath, 'utf8'),
        /(?:workspace|catalog):/,
      );
      assert.equal(
        vendoredPackage.files.includes('legacy/**'),
        isClassic,
        `${app} packages only the legacy setup when it uses Framer Motion`,
      );
      assert.equal(
        vendoredPackage.files.includes('modern/**'),
        !isClassic,
        `${app} packages only the modern setup when it uses Motion`,
      );
      assert.equal(
        vendoredPackage.dependencies?.motion !== undefined,
        !isClassic,
        `${app} does not introduce Motion's React 18+ peer requirement into a React 16 Classic mirror`,
      );
      if (app === 'apps/fresco') {
        const dockerfile = readFileSync(
          path.join(staging, 'Dockerfile'),
          'utf8',
        );
        const vendorCopy = dockerfile.indexOf(
          'COPY vendor/vitest-config ./vendor/vitest-config',
        );
        const frozenInstall = dockerfile.indexOf('pnpm i --frozen-lockfile');
        assert.notEqual(vendorCopy, -1, 'Fresco copies the vendored package');
        assert.ok(
          vendorCopy < frozenInstall,
          'Fresco copies the vendored package before its frozen install',
        );
      }
    } finally {
      rmSync(staging, { recursive: true, force: true });
    }
  }
});

test('shared animation helpers are not global inputs for unrelated test tasks', () => {
  const turboConfig = readFileSync(path.join(repoRoot, 'turbo.json'), 'utf8');
  const testStart = turboConfig.indexOf('    "test": {');
  const testEnd = turboConfig.indexOf('    "test:watch": {', testStart);
  assert.notEqual(testStart, -1, 'base test task exists');
  assert.notEqual(testEnd, -1, 'test:watch follows the base test task');

  const baseTestTask = turboConfig.slice(testStart, testEnd);
  assert.doesNotMatch(baseTestTask, /vitest\.setup\.disable-animations/);
  assert.doesNotMatch(baseTestTask, /tooling\/vitest/);
});

test('Turbo resolves animation setup changes only through consumer task graphs', () => {
  const output = execFileSync(
    'pnpm',
    ['exec', 'turbo', 'run', 'test', '--dry=json'],
    { cwd: repoRoot, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
  );
  const dryRun = JSON.parse(output.slice(output.indexOf('{')));
  const task = (taskId) => {
    const match = dryRun.tasks.find((candidate) => candidate.taskId === taskId);
    assert.ok(match, `${taskId} exists in the Turbo task graph`);
    return match;
  };

  assert.ok(
    Object.hasOwn(
      task('@codaco/vitest-config#topo').inputs,
      'modern/disable-animations.js',
    ),
    'Vitest tooling hashes the modern animation setup',
  );
  for (const modernTask of [
    '@codaco/architect#test',
    '@codaco/fresco-ui#test',
    '@codaco/interview#test',
  ]) {
    assert.ok(
      task(modernTask).dependencies.includes('@codaco/vitest-config#topo'),
      `${modernTask} inherits the shared modern setup`,
    );
  }
  for (const classicTask of [
    '@codaco/architect-classic#test',
    '@codaco/interviewer-classic#test',
  ]) {
    assert.ok(
      task(classicTask).dependencies.includes('@codaco/vitest-config#topo'),
      `${classicTask} inherits the shared legacy setup`,
    );
  }

  const unrelatedTask = task('@codaco/network-query#test');
  assert.equal(
    Object.keys(unrelatedTask.inputs).some((input) =>
      input.includes('disable-animations'),
    ),
    false,
    'an unrelated unit task has no shared animation helper input',
  );
  assert.equal(
    unrelatedTask.dependencies.some((dependency) =>
      dependency.includes('vitest-config'),
    ),
    false,
    'an unrelated unit task has no shared Vitest tooling dependency',
  );
});
