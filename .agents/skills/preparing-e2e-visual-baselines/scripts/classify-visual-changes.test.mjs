import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  changedPaths,
  classifyVisualChanges,
} from './classify-visual-changes.mjs';

const ROOT = new URL('../../../..', import.meta.url).pathname;

test('routes app-only UI changes only to that app', () => {
  const report = classifyVisualChanges(
    ['apps/architect/src/components/Panel.tsx'],
    ROOT,
  );

  assert.deepEqual(report.suites.architect, [
    'apps/architect/src/components/Panel.tsx',
  ]);
  assert.deepEqual(report.suites.interview, []);
  assert.deepEqual(report.suites.interviewer, []);
});

test('routes Interview and Fresco UI changes through their consumers', () => {
  const paths = [
    'packages/fresco-ui/src/components/Button/Button.tsx',
    'packages/interview/src/interfaces/Form/Prompt.tsx',
  ];
  const report = classifyVisualChanges(paths, ROOT);

  for (const suite of ['architect', 'interview', 'interviewer']) {
    assert.deepEqual(report.suites[suite], paths);
  }
});

test('ignores known nonvisual changes', () => {
  const paths = [
    '.github/workflows/ci-and-release.yml',
    'apps/interviewer/src/state/session.test.ts',
    'docs/ci.md',
  ];
  const report = classifyVisualChanges(paths, ROOT);

  assert.deepEqual(report.suites, {
    interview: [],
    interviewer: [],
    architect: [],
  });
  assert.deepEqual(
    report.ignored,
    paths.toSorted((a, b) => a.localeCompare(b)),
  );
});

test('routes visual E2E specs only to the suite they drive', () => {
  const paths = {
    architect: 'apps/architect/e2e/specs/codebook-and-summary.spec.ts',
    interview: 'packages/interview/e2e/specs/matrix/visual.spec.ts',
    interviewer: 'apps/interviewer/e2e/specs/settings.spec.ts',
  };
  const report = classifyVisualChanges(Object.values(paths), ROOT);

  for (const [suite, path] of Object.entries(paths)) {
    assert.deepEqual(report.suites[suite], [path]);
  }
  assert.deepEqual(report.ignored, []);
});

test('fails closed for lockfile and unknown root build inputs', () => {
  const paths = ['build-theme.mjs', 'pnpm-lock.yaml'];
  const report = classifyVisualChanges(paths, ROOT);

  const sortedPaths = paths.toSorted((a, b) => a.localeCompare(b));
  assert.deepEqual(report.failClosed, sortedPaths);
  for (const suite of ['architect', 'interview', 'interviewer']) {
    assert.deepEqual(report.suites[suite], sortedPaths);
  }
});

test('fails closed when the committed comparison base is unavailable', () => {
  assert.throws(
    () => changedPaths(ROOT, 'refs/heads/classifier-missing-base'),
    /Unable to compare committed changes with refs\/heads\/classifier-missing-base/,
  );
});
