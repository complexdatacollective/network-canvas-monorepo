import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'mirror-app.mjs');

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

test('Fresco mirror omits all GitHub Actions workflows', (t) => {
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
  assert.equal(
    mirroredPaths.some((path) => path.startsWith('.github/workflows/')),
    false,
  );
});
