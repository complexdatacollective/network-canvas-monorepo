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

test('release job prunes ignored-lane changesets before changesets/action', () => {
  const releaseJob = workflow.match(
    /^ {2}release:\n(?<body>[\s\S]*?)(?=^ {2}\S)/m,
  )?.groups?.body;
  assert.ok(releaseJob, 'release job exists');

  const pruneIndex = releaseJob.indexOf(
    'run: node scripts/prune-ignored-changesets.mjs',
  );
  const actionIndex = releaseJob.indexOf('uses: changesets/action@');
  assert.ok(pruneIndex !== -1, 'release job runs prune-ignored-changesets.mjs');
  assert.ok(actionIndex !== -1, 'release job uses changesets/action');
  assert.ok(
    pruneIndex < actionIndex,
    'prune step must run before changesets/action reads changeset state',
  );
});
