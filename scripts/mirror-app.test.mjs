import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  assertCommitPinnedActionUses,
  assertFrescoPublisherContract,
  mirrorCatalogEntries,
  seedMirror,
  withCatalogOverrides,
} from './mirror-app.mjs';
import { parseCatalog } from './resolve-manifest.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'mirror-app.mjs');

test('Fresco publisher pins every external action to a commit SHA', () => {
  const workflowPath = join(
    REPO_ROOT,
    'apps',
    'fresco',
    '.github',
    'workflows',
    'docker-publish.yml',
  );
  assert.doesNotThrow(() =>
    assertCommitPinnedActionUses(
      workflowPath,
      readFileSync(workflowPath, 'utf8'),
    ),
  );
  assert.throws(
    () =>
      assertCommitPinnedActionUses(
        workflowPath,
        'steps:\n  - uses: docker/login-action@v4\n',
      ),
    /must pin every external action to a full commit SHA.*docker\/login-action@v4/,
  );
});

test('Fresco publisher must already match the mirror target', () => {
  const workflow = '.github/workflows/docker-publish.yml';
  const contents =
    'steps:\n  - uses: docker/login-action@dbcb813823bdd20940b903addbd779551569679f\n';

  assert.doesNotThrow(() =>
    assertFrescoPublisherContract({
      workflow,
      trackedWorkflows: [workflow],
      sourceContents: contents,
      targetContents: contents,
    }),
  );
  assert.throws(
    () =>
      assertFrescoPublisherContract({
        workflow,
        trackedWorkflows: [workflow, '.github/workflows/target-owned.yml'],
        sourceContents: contents,
        targetContents: contents,
      }),
    /must already contain exactly/,
  );
  assert.throws(
    () =>
      assertFrescoPublisherContract({
        workflow,
        trackedWorkflows: [workflow],
        sourceContents: contents,
        targetContents: 'name: Drifted publisher\n',
      }),
    /must already match the monorepo copy/,
  );
});

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

test('Fresco mirror keeps only its matching GHCR publisher workflow', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'fresco-mirror-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  const fresco = join(directory, 'fresco');
  const remote = join(directory, 'remote.git');
  const seed = join(directory, 'seed');
  mkdirSync(join(fresco, '.github', 'workflows'), { recursive: true });
  writeFileSync(
    join(fresco, 'package.json'),
    `${JSON.stringify({ name: 'fresco', version: '0.0.0' }, null, 2)}\n`,
  );
  writeFileSync(
    join(fresco, 'tsconfig.json'),
    `${JSON.stringify({ extends: '@codaco/tsconfig/web.json' }, null, 2)}\n`,
  );
  writeFileSync(join(fresco, '.github', 'FUNDING.yml'), 'github: codaco\n');
  const publisherWorkflow =
    'name: Publish container\nsteps:\n  - uses: docker/login-action@dbcb813823bdd20940b903addbd779551569679f\n';
  writeFileSync(
    join(fresco, '.github', 'workflows', 'docker-publish.yml'),
    publisherWorkflow,
  );
  writeFileSync(
    join(fresco, '.github', 'workflows', 'future-action.yaml'),
    'name: Future action\n',
  );

  mkdirSync(join(seed, '.github', 'workflows'), { recursive: true });
  git(directory, 'init', '--bare', '--initial-branch=main', remote);
  git(seed, 'init', '--initial-branch=main');
  git(seed, 'config', 'user.email', 'ci@example.com');
  git(seed, 'config', 'user.name', 'ci');
  writeFileSync(join(seed, 'README.md'), 'mirror target\n');
  writeFileSync(
    join(seed, '.github', 'workflows', 'docker-publish.yml'),
    publisherWorkflow,
  );
  git(seed, 'add', '.');
  git(seed, 'commit', '-m', 'Initialize mirror target');
  git(seed, 'remote', 'add', 'origin', remote);
  git(seed, 'push', '-u', 'origin', 'main');

  execFileSync(
    'node',
    [
      SCRIPT,
      '--app',
      fresco,
      '--repo',
      'unused/local-mirror',
      '--version',
      '0.0.0',
      '--branch',
      'main',
    ],
    {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        GIT_AUTHOR_EMAIL: 'ci@example.com',
        GIT_AUTHOR_NAME: 'ci',
        MIRROR_REPO_URL: remote,
        MONOREPO_SHA: 'test-source-sha',
      },
      stdio: 'pipe',
    },
  );

  const mirroredPaths = git(
    directory,
    `--git-dir=${remote}`,
    'ls-tree',
    '-r',
    '--name-only',
    'main',
  ).split('\n');

  assert.ok(mirroredPaths.includes('.github/FUNDING.yml'));
  assert.deepEqual(
    mirroredPaths.filter((path) => path.startsWith('.github/workflows/')),
    ['.github/workflows/docker-publish.yml'],
  );
  assert.equal(
    git(
      directory,
      `--git-dir=${remote}`,
      'show',
      'main:.github/workflows/docker-publish.yml',
    ),
    readFileSync(
      join(fresco, '.github', 'workflows', 'docker-publish.yml'),
      'utf8',
    ).trim(),
  );
});

// The hotfix lane stages in one job and publishes from another, so the job
// holding the push token never runs code from the branch it releases. The
// staged tree must therefore be enough on its own: `--publish-from` reads the
// app name and the publisher workflow from it, and pushes what `--stage-only`
// left behind.
test('a staged tree can be published later, from a checkout that never staged it', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'fresco-two-phase-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  const fresco = join(directory, 'fresco');
  const remote = join(directory, 'remote.git');
  const seed = join(directory, 'seed');
  const stage = join(directory, 'stage');
  mkdirSync(join(fresco, '.github', 'workflows'), { recursive: true });
  writeFileSync(
    join(fresco, 'package.json'),
    `${JSON.stringify({ name: 'fresco', version: '0.0.0' }, null, 2)}\n`,
  );
  writeFileSync(
    join(fresco, 'tsconfig.json'),
    `${JSON.stringify({ extends: '@codaco/tsconfig/web.json' }, null, 2)}\n`,
  );
  writeFileSync(join(fresco, 'app.ts'), 'export const staged = true;\n');
  // The branch's own publisher is stale: the external repository already
  // tracks a newer one, pre-applied there and on main since this branch's
  // tag. The lane stages main's copy, so the push still matches.
  const stalePublisher =
    'name: Publish container\nsteps:\n  - uses: docker/login-action@0000000000000000000000000000000000000000\n';
  const publisherWorkflow =
    'name: Publish container\nsteps:\n  - uses: docker/login-action@dbcb813823bdd20940b903addbd779551569679f\n';
  writeFileSync(
    join(fresco, '.github', 'workflows', 'docker-publish.yml'),
    stalePublisher,
  );
  const trustedPublisher = join(directory, 'main-docker-publish.yml');
  writeFileSync(trustedPublisher, publisherWorkflow);

  mkdirSync(join(seed, '.github', 'workflows'), { recursive: true });
  git(directory, 'init', '--bare', '--initial-branch=main', remote);
  git(seed, 'init', '--initial-branch=main');
  git(seed, 'config', 'user.email', 'ci@example.com');
  git(seed, 'config', 'user.name', 'ci');
  writeFileSync(join(seed, 'README.md'), 'mirror target\n');
  writeFileSync(
    join(seed, '.github', 'workflows', 'docker-publish.yml'),
    publisherWorkflow,
  );
  git(seed, 'add', '.');
  git(seed, 'commit', '-m', 'Initialize mirror target');
  git(seed, 'remote', 'add', 'origin', remote);
  git(seed, 'push', '-u', 'origin', 'main');

  const stageArgs = (publisher) => [
    SCRIPT,
    '--app',
    fresco,
    '--repo',
    'unused/local-mirror',
    '--version',
    '0.0.0',
    '--branch',
    'main',
    '--publisher-workflow',
    publisher,
    '--stage-only',
  ];

  // Phase 1: no token. The trusted publisher is checked against the remote
  // now, so a mismatch surfaces here rather than at the push.
  execFileSync('node', stageArgs(trustedPublisher), {
    cwd: REPO_ROOT,
    env: { ...process.env, MIRROR_STAGE_DIR: stage, MIRROR_REPO_URL: remote },
    stdio: 'pipe',
  });
  assert.ok(existsSync(join(stage, 'app.ts')));
  assert.equal(
    readFileSync(
      join(stage, '.github', 'workflows', 'docker-publish.yml'),
      'utf8',
    ),
    publisherWorkflow,
  );
  assert.ok(!existsSync(join(stage, '.git')));

  // Staging the branch's stale publisher is refused up front.
  assert.throws(
    () =>
      execFileSync(
        'node',
        stageArgs(join(fresco, '.github', 'workflows', 'docker-publish.yml')),
        {
          cwd: REPO_ROOT,
          env: {
            ...process.env,
            MIRROR_STAGE_DIR: join(directory, 'stale-stage'),
            MIRROR_REPO_URL: remote,
          },
          stdio: 'pipe',
        },
      ),
    /must already match the monorepo copy/,
  );

  // Phase 2: only the staged tree and the remote.
  const outputPath = join(directory, 'github-output');
  writeFileSync(outputPath, '');
  const publishArgs = [
    SCRIPT,
    '--publish-from',
    stage,
    '--expect-app',
    'fresco',
    '--repo',
    'unused/local-mirror',
    '--version',
    '0.0.0',
    '--branch',
    'main',
  ];
  const publishEnv = {
    ...process.env,
    GIT_AUTHOR_EMAIL: 'ci@example.com',
    GIT_AUTHOR_NAME: 'ci',
    MIRROR_REPO_URL: remote,
    MONOREPO_SHA: 'hotfix-source-sha',
    GITHUB_OUTPUT: outputPath,
  };

  // A workflow that appeared in the stage after it was checked — the shape
  // a hostile lifecycle script would leave — is refused at the push, whatever
  // the publisher itself says.
  const stray = join(stage, '.github', 'workflows', 'stray.yml');
  writeFileSync(stray, 'name: Stray\n');
  assert.throws(
    () =>
      execFileSync('node', publishArgs, {
        cwd: directory,
        env: publishEnv,
        stdio: 'pipe',
      }),
    /must carry exactly \.github\/workflows\/docker-publish\.yml.*stray\.yml/,
  );
  rmSync(stray);

  // A workflows directory reached through a symlink lists the right file but
  // would be pushed as a link; refused likewise.
  const workflowsDir = join(stage, '.github', 'workflows');
  const realDir = join(directory, 'real-workflows');
  renameSync(workflowsDir, realDir);
  symlinkSync(realDir, workflowsDir);
  assert.throws(
    () =>
      execFileSync('node', publishArgs, {
        cwd: directory,
        env: publishEnv,
        stdio: 'pipe',
      }),
    /\.github\/workflows in the staged tree is a symlink/,
  );
  rmSync(workflowsDir);
  renameSync(realDir, workflowsDir);

  // A staged version that is not the one being released would tag the image
  // differently from the releases; refused before anything is cloned.
  const stagedManifestPath = join(stage, 'package.json');
  const stagedManifest = readFileSync(stagedManifestPath, 'utf8');
  writeFileSync(
    stagedManifestPath,
    stagedManifest.replace('"version": "0.0.0"', '"version": "9.9.9"'),
  );
  assert.throws(
    () =>
      execFileSync('node', publishArgs, {
        cwd: directory,
        env: publishEnv,
        stdio: 'pipe',
      }),
    /is version "9\.9\.9", not the "0\.0\.0"/,
  );
  writeFileSync(stagedManifestPath, stagedManifest);

  // The staged manifest is content the branch could have rewritten; the
  // caller says which app it is publishing, and a stage that disagrees is
  // refused before anything is cloned.
  assert.throws(
    () =>
      execFileSync(
        'node',
        publishArgs.map((arg) => (arg === 'fresco' ? 'not-fresco' : arg)),
        { cwd: directory, env: publishEnv, stdio: 'pipe' },
      ),
    /names package "fresco", not the "not-fresco"/,
  );

  execFileSync('node', publishArgs, {
    cwd: directory,
    env: publishEnv,
    stdio: 'pipe',
  });

  const mirroredPaths = git(
    directory,
    `--git-dir=${remote}`,
    'ls-tree',
    '-r',
    '--name-only',
    'main',
  ).split('\n');
  assert.ok(mirroredPaths.includes('app.ts'));
  assert.ok(!mirroredPaths.includes('README.md'));
  assert.equal(
    git(
      directory,
      `--git-dir=${remote}`,
      'show',
      'main:.github/workflows/docker-publish.yml',
    ),
    publisherWorkflow.trim(),
  );
  assert.equal(
    git(directory, `--git-dir=${remote}`, 'log', '-1', '--format=%s', 'main'),
    'Release v0.0.0 (mirrored from monorepo hotfix-source-sha)',
  );
  const mirrorSha = git(directory, `--git-dir=${remote}`, 'rev-parse', 'main');
  assert.equal(
    readFileSync(outputPath, 'utf8').trim(),
    `mirror_sha=${mirrorSha}`,
  );
});

// The seed is what keeps a hotfix's unchanged dependencies at the versions
// the release installed: both the lockfile and the generated workspace policy
// come from the mirror at the release, and a ref that lacks either is refused.
test('seeding a stage copies the released lockfile and workspace policy', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'fresco-seed-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const remote = join(directory, 'remote.git');
  const seed = join(directory, 'seed');
  const stage = join(directory, 'stage');
  mkdirSync(stage);
  mkdirSync(seed);
  git(directory, 'init', '--bare', '--initial-branch=main', remote);
  git(seed, 'init', '--initial-branch=main');
  git(seed, 'config', 'user.email', 'ci@example.com');
  git(seed, 'config', 'user.name', 'ci');
  writeFileSync(join(seed, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\n");
  git(seed, 'add', '.');
  git(seed, 'commit', '-m', 'lock only');
  git(seed, 'tag', 'v1.0.0');
  writeFileSync(
    join(seed, 'pnpm-workspace.yaml'),
    "packages:\n  - '.'\noverrides:\n",
  );
  git(seed, 'add', '.');
  git(seed, 'commit', '-m', 'release');
  git(seed, 'tag', 'v1.0.1');
  git(seed, 'remote', 'add', 'origin', remote);
  git(seed, 'push', '-q', '--tags', 'origin', 'main');

  seedMirror({ staging: stage, cloneUrl: remote, ref: 'v1.0.1' });
  assert.equal(
    readFileSync(join(stage, 'pnpm-lock.yaml'), 'utf8'),
    "lockfileVersion: '9.0'\n",
  );
  assert.equal(
    readFileSync(join(stage, 'pnpm-workspace.yaml'), 'utf8'),
    "packages:\n  - '.'\noverrides:\n",
  );

  assert.throws(
    () => seedMirror({ staging: stage, cloneUrl: remote, ref: 'v1.0.0' }),
    /has no pnpm-workspace\.yaml to seed/,
  );
});

// A released policy's catalog-backed overrides must follow the branch's
// catalog, or a re-pinned direct specifier loses to the release's override;
// keys the release did not carry are not added.
test('seeding brings catalog-backed overrides to the current catalog and adds none', () => {
  const catalog = parseCatalog(
    readFileSync(join(REPO_ROOT, 'pnpm-workspace.yaml'), 'utf8'),
  );
  const released = [
    'overrides:',
    "  'effect@3.17.7': '^0.0.1'",
    "  fast-uri: '^3.1.4'",
    '  # Next pins an exact PostCSS version; this is resolved from the root catalog.',
    "  postcss: '^0.0.1'",
    "  sharp: '^0.35.3'",
    '',
  ].join('\n');
  const current = withCatalogOverrides(released);
  assert.ok(current.includes(`  'effect@3.17.7': '${catalog.effect}'\n`));
  assert.ok(current.includes(`  postcss: '${catalog.postcss}'\n`));
  assert.ok(current.includes("  fast-uri: '^3.1.4'\n"));
  assert.ok(current.includes("  sharp: '^0.35.3'\n"));

  const older = "overrides:\n  sharp: '^0.35.3'\n";
  assert.equal(withCatalogOverrides(older), older);
});

// The catalog entries the mirror consumes on the app's behalf are read off
// the tree, so a re-pin of any of them is recognised as carried: the two
// override values, ts-reset, and everything the vendored Vitest config names
// through the catalog.
test('the mirror’s own catalog entries include the vendored Vitest config’s', () => {
  const entries = mirrorCatalogEntries();
  for (const expected of [
    'effect',
    'postcss',
    '@total-typescript/ts-reset',
    '@testing-library/dom',
    'motion',
    'vitest',
  ]) {
    assert.ok(
      entries.includes(expected),
      `${expected} missing from ${entries.join(', ')}`,
    );
  }
});
