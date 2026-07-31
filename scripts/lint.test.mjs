import assert from 'node:assert/strict';
import { test } from 'node:test';

import { planChangedLint, requiresFullLint } from './lint.mjs';

const exists = () => true;

test('configuration and dependency inputs force a full lint', () => {
  for (const path of [
    '.oxlintrc.json',
    'apps/architect/.oxlintrc.json',
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
