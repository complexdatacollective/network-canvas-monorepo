import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(
  new URL('../.github/workflows/ci-and-release.yml', import.meta.url),
  'utf8',
);
const snapshotWorkflow = readFileSync(
  new URL(
    '../.github/workflows/regenerate-e2e-visual-snapshots.yml',
    import.meta.url,
  ),
  'utf8',
);
const nativePlaywrightSetup = readFileSync(
  new URL(
    '../.github/actions/native-playwright-setup/action.yml',
    import.meta.url,
  ),
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

test('pixel comparison and generation use native GitHub-hosted ARM64', () => {
  for (const [jobName, browserList] of [
    ['interview-e2e', 'chromium firefox webkit'],
    ['interviewer-e2e', 'chromium webkit'],
    ['architect-e2e', 'chromium'],
  ]) {
    const body = job(jobName);
    assert.ok(body, `${jobName} job exists`);
    assert.match(body, /runs-on: ubuntu-24\.04-arm/);
    assert.match(body, /uses: \.\/\.github\/actions\/native-playwright-setup/);
    assert.match(body, new RegExp(`browsers: ${browserList}`));
    assert.match(body, /run: \.\/scripts\/run-e2e-native\.sh/);
    assert.doesNotMatch(body, /e2e\/scripts\/run\.sh|docker/i);
  }
  assert.match(snapshotWorkflow, /runs-on: ubuntu-24\.04-arm/);
  assert.match(
    snapshotWorkflow,
    /uses: \.\/\.github\/actions\/native-playwright-setup/,
  );
  assert.match(snapshotWorkflow, /\.\/scripts\/run-e2e-native\.sh/);
  assert.doesNotMatch(snapshotWorkflow, /e2e\/scripts\/run\.sh|docker/i);
  assert.match(
    snapshotWorkflow,
    /if: inputs\.suite == 'interviewer'[\s\S]{0,180}browsers: chromium\n/,
  );
  assert.doesNotMatch(
    snapshotWorkflow,
    /if: inputs\.suite == 'interviewer'[\s\S]{0,180}browsers: chromium webkit/,
  );

  assert.match(
    nativePlaywrightSetup,
    /uses: \.\/\.github\/actions\/turbo-ci-setup/,
  );
  assert.match(nativePlaywrightSetup, /playwright install[\s\S]*--with-deps/);
  assert.match(nativePlaywrightSetup, /--only-shell/);
  assert.doesNotMatch(nativePlaywrightSetup, /actions\/cache|ms-playwright/);
});

test('release E2E has no self-hosted runner-selection machinery', () => {
  assert.equal(job('pick-e2e-runner'), undefined);
  assert.equal(job('e2e-queue-watchdog'), undefined);
  assert.doesNotMatch(workflow, /E2E_RUNNER_STATUS_TOKEN|self-hosted/);

  const interview = job('interview-e2e');
  assert.ok(interview, 'interview-e2e job exists');
  assert.match(interview, /needs: e2e-policy/);
  assert.match(interview, /PW_WORKERS: 4/);
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

test('unit tests use affected task selection for PRs and merge groups', () => {
  const testJob = job('test');
  assert.ok(testJob, 'test job exists');
  assert.match(
    testJob,
    /DIFF_BASE_SHA: \$\{\{ github\.event\.pull_request\.base\.sha \|\| github\.event\.merge_group\.base_sha \}\}/,
    'test job diffs each event against its full base',
  );
  assert.match(
    testJob,
    /pull_request\|merge_group\)/,
    'both PR and merge-group events enter the affected path',
  );
  assert.match(
    testJob,
    /TURBO_SCM_BASE="\$DIFF_BASE_SHA" pnpm exec turbo run test --affected/,
  );
  assert.match(
    testJob,
    /git cat-file -e "\$DIFF_BASE_SHA\^\{commit\}"/,
    'a missing diff base fails closed to the full suite',
  );
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

test('generated release PRs use the dedicated PAT and rely on native PR CI', () => {
  const releaseJob = job('release');
  assert.ok(releaseJob, 'release job exists');
  assert.match(
    releaseJob,
    /GITHUB_TOKEN: \$\{\{ secrets\.RELEASE_PR_TOKEN \}\}/,
  );
  assert.doesNotMatch(releaseJob, /gh workflow run ci-and-release\.yml/);
  assert.doesNotMatch(releaseJob, /actions: write/);

  const productReleaseJob = job('product-release-pr');
  assert.ok(productReleaseJob, 'product release PR job exists');
  assert.match(
    productReleaseJob,
    /token: \$\{\{ secrets\.RELEASE_PR_TOKEN \}\}/,
  );
  assert.doesNotMatch(productReleaseJob, /gh workflow run ci-and-release\.yml/);
  assert.doesNotMatch(productReleaseJob, /actions: write/);
});

test('e2e-policy receives the equivalence-reuse inputs', () => {
  const policyJob = job('e2e-policy');
  assert.ok(policyJob, 'e2e-policy job exists');
  assert.match(
    policyJob,
    /HEAD_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.event\.merge_group\.head_sha \}\}/,
    'policy step receives the PR tip (or merge-group head) as HEAD_SHA',
  );
  assert.match(
    policyJob,
    /HEAD_REPO: \$\{\{ github\.event\.pull_request\.head\.repo\.full_name \}\}/,
    'policy step receives the head repo for the fork guard',
  );
});
