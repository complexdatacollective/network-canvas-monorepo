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

function job(name) {
  return workflow.match(
    new RegExp(
      `^ {2}${name}:\\n(?<body>[\\s\\S]*?)(?=^ {2}\\S|$(?![\\s\\S]))`,
      'm',
    ),
  )?.groups?.body;
}

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

test('detect never runs on push-to-main (its consumers are PR/dispatch only)', () => {
  const detectJob = job('detect');
  assert.ok(detectJob, 'detect job exists');
  assert.match(
    detectJob,
    /if: github\.event_name != 'merge_group' && github\.event_name != 'push'/,
  );
});

test('each release E2E suite gates on its own policy flag', () => {
  for (const [jobName, flag] of [
    ['interview-e2e', 'interview'],
    ['interviewer-e2e', 'interviewer'],
    ['architect-e2e', 'architect'],
    ['pick-e2e-runner', 'interview'],
    ['e2e-queue-watchdog', 'interview'],
  ]) {
    const body = job(jobName);
    assert.ok(body, `${jobName} job exists`);
    assert.match(
      body,
      new RegExp(`needs\\.e2e-policy\\.outputs\\.${flag} == 'true'`),
      `${jobName} is gated on the ${flag} suite flag`,
    );
  }
});

test('the quality gate verifies each required E2E suite individually', () => {
  const qualityJob = job('quality');
  assert.ok(qualityJob, 'quality job exists');
  for (const suite of ['interview', 'interviewer', 'architect']) {
    assert.match(
      qualityJob,
      new RegExp(
        `E2E_${suite.toUpperCase()}_REQUIRED: \\$\\{\\{ needs\\.e2e-policy\\.outputs\\.${suite} \\}\\}`,
      ),
      `quality receives the ${suite} requirement flag`,
    );
  }
  assert.match(qualityJob, /verify_required_e2e interview-e2e/);
  assert.match(qualityJob, /verify_required_e2e interviewer-e2e/);
  assert.match(qualityJob, /verify_required_e2e architect-e2e/);
});

test('e2e-policy can query the Actions API for the merge-queue fast path', () => {
  const policyJob = job('e2e-policy');
  assert.ok(policyJob, 'e2e-policy job exists');
  assert.match(policyJob, /GH_TOKEN: \$\{\{ github\.token \}\}/);
});

test('release job prunes ignored-lane changesets before changesets/action', () => {
  const releaseJob = job('release');
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
