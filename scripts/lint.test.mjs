import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  changedPaths,
  planChangedLint,
  requiresFullLint,
  runLint,
} from './lint.mjs';

const exists = () => true;

test('configuration and dependency inputs force a full lint', () => {
  for (const path of [
    '.oxlintrc.json',
    'apps/architect/.oxlintrc.json',
    'apps/architect/.oxfmtrc.json',
    'apps/architect/.oxfmtrc.jsonc',
    'apps/interviewer/oxfmt.config.ts',
    'packages/interview/oxfmt.config.mts',
    'apps/interviewer/tsconfig.app.json',
    'packages/interview/package.json',
    'pnpm-lock.yaml',
    'tooling/oxlint/react.json',
    'tooling/tailwind/fresco/fresco.css',
    '.github/actions/turbo-ci-setup/action.yml',
    '.github/workflows/ci-and-release.yml',
    'scripts/lint.mjs',
  ]) {
    assert.equal(requiresFullLint(path), true, path);
    assert.equal(planChangedLint([path], exists).full, true, path);
  }
});

test('changed files are routed only to the tools that support them', () => {
  assert.deepEqual(
    planChangedLint(
      [
        'apps/architect/src/App.tsx',
        'docs/guide.md',
        '.github/workflows/example.yml',
        'config/netlify.toml',
        'packages/art/image.png',
        'scripts/check.sh',
      ],
      exists,
    ),
    {
      full: false,
      reason: '',
      oxlintFiles: ['apps/architect/src/App.tsx'],
      oxfmtFiles: [
        'apps/architect/src/App.tsx',
        'docs/guide.md',
        '.github/workflows/example.yml',
        'config/netlify.toml',
      ],
    },
  );
});

test('deleted files and unsupported files are ignored', () => {
  const plan = planChangedLint(
    ['apps/architect/src/deleted.ts', 'packages/art/image.png'],
    (path) => !path.endsWith('deleted.ts'),
  );
  assert.equal(plan.full, false);
  assert.deepEqual(plan.oxlintFiles, []);
  assert.deepEqual(plan.oxfmtFiles, []);
});

test('deleted lint configuration and manifests force a full lint', () => {
  for (const path of [
    'apps/architect/.oxlintrc.json',
    'apps/architect/package.json',
    'packages/interview/tsconfig.json',
  ]) {
    const plan = planChangedLint([path], () => false);
    assert.equal(plan.full, true, path);
    assert.match(plan.reason, new RegExp(path.replaceAll('.', '\\.')));
  }
});

test('Git change detection includes deleted files', () => {
  const directory = mkdtempSync(join(tmpdir(), 'network-canvas-lint-test-'));
  try {
    execFileSync('git', ['init', '--quiet'], { cwd: directory });
    writeFileSync(join(directory, 'package.json'), '{}\n');
    execFileSync('git', ['add', 'package.json'], { cwd: directory });
    execFileSync(
      'git',
      [
        '-c',
        'user.name=Lint Test',
        '-c',
        'user.email=lint-test@example.invalid',
        'commit',
        '--quiet',
        '-m',
        'Add manifest',
      ],
      { cwd: directory },
    );
    rmSync(join(directory, 'package.json'));
    execFileSync('git', ['add', '--all'], { cwd: directory });
    execFileSync(
      'git',
      [
        '-c',
        'user.name=Lint Test',
        '-c',
        'user.email=lint-test@example.invalid',
        'commit',
        '--quiet',
        '-m',
        'Delete manifest',
      ],
      { cwd: directory },
    );

    assert.deepEqual(changedPaths('HEAD^', 'HEAD', directory), [
      'package.json',
    ]);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test('changed-file formatting tolerates an explicit set ignored by Oxfmt', async () => {
  const status = await runLint({
    full: false,
    reason: '',
    oxlintFiles: [],
    oxfmtFiles: ['apps/architect-classic/public/dev-app-update.yml'],
  });

  assert.equal(status, 0);
});

test('changed-file linting tolerates an explicit set ignored by Oxlint', async () => {
  const status = await runLint({
    full: false,
    reason: '',
    oxlintFiles: ['packages/interface-images/src/generated/manifest.ts'],
    oxfmtFiles: [],
  });

  assert.equal(status, 0);
});
