import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { assertCommitPinnedActionUses } from './mirror-app.mjs';

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

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

test('Fresco mirror keeps only its GHCR publisher workflow', (t) => {
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
  writeFileSync(
    join(fresco, '.github', 'workflows', 'docker-publish.yml'),
    'name: Publish container\n',
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
    join(seed, '.github', 'workflows', 'target-owned.yml'),
    'name: Target workflow\n',
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
      '0.0.0-test',
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
