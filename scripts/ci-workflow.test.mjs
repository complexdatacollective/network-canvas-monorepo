import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(
  new URL('../.github/workflows/ci-and-release.yml', import.meta.url),
  'utf8',
);

const topLevelConcurrency = workflow.match(
  /^concurrency:\n(?<config>[\s\S]*?)\n\njobs:/m,
)?.groups?.config;

test('superseded CI runs are cancelled for every pull request', () => {
  assert.ok(
    topLevelConcurrency,
    'top-level CI concurrency configuration exists',
  );
  assert.match(
    topLevelConcurrency,
    /cancel-in-progress: >-\n\s+\$\{\{ github\.event_name == 'pull_request'/,
  );
  assert.doesNotMatch(topLevelConcurrency, /github\.head_ref/);
});
