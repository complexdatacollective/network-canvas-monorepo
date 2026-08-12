import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
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
  assert.doesNotMatch(legacySetup, /createRequire|\brequire\s*\(|process\.cwd/);
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
