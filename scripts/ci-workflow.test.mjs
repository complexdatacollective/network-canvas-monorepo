import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(
  new URL('../.github/workflows/ci-and-release.yml', import.meta.url),
  'utf8',
);
const snapshotWorkflow = readFileSync(
  new URL(
    '../.github/workflows/open-e2e-snapshot-update-pr.yml',
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
    /github\.event_name != 'merge_group'\n\s+&& github\.event_name != 'push'/,
  );
  assert.match(detectJob, /inputs\.interview_e2e_benchmark == true/);
});

test('both public sites crawl their matching Netlify deploy previews', () => {
  const detectJob = job('detect');
  assert.ok(detectJob, 'detect job exists');
  assert.match(detectJob, /docs: \$\{\{ steps\.flags\.outputs\.docs \}\}/);
  assert.match(
    detectJob,
    /website: \$\{\{ steps\.flags\.outputs\.website \}\}/,
  );
  assert.match(
    detectJob,
    /if \[\[ "\$docs" == "true" \|\| "\$website" == "true" \]\]; then\n\s+docs=true\n\s+website=true/,
    'a change to either public site triggers both preview crawls',
  );

  for (const [jobName, flag, siteName, startPath] of [
    ['docs-preview-checks', 'docs', 'documentation-dev', 'DOCS_URL'],
    [
      'website-preview-checks',
      'website',
      'networkcanvasdotdev',
      'WEBSITE_URL/en-US/',
    ],
  ]) {
    const previewJob = job(jobName);
    assert.ok(previewJob, `${jobName} exists`);
    assert.match(
      previewJob,
      new RegExp(`needs\\.detect\\.outputs\\.${flag} == 'true'`),
    );
    assert.match(previewJob, new RegExp(`const siteName = '${siteName}'`));
    assert.match(
      previewJob,
      new RegExp(
        `deploy-preview-\\$\\{context\\.issue\\.number\\}--\\$\\{siteName\\}\\.netlify\\.app`,
      ),
    );
    assert.match(previewJob, /@jthrilly\/dead-link-checker@\^1\.1\.0/);
    assert.match(previewJob, new RegExp(`"\\$${startPath}"`));
  }

  const carryForward = job('carry-forward-statuses');
  assert.ok(carryForward, 'carry-forward-statuses job exists');
  assert.match(carryForward, /- docs-preview-checks/);
  assert.match(carryForward, /- website-preview-checks/);
  assert.match(carryForward, /FLAG_DOCS: \["docs-preview-checks"\]/);
  assert.match(carryForward, /FLAG_WEBSITE: \["website-preview-checks"\]/);
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

test('automatic private E2E routing is idle-aware and library-lane only', () => {
  const picker = job('pick-e2e-runner');
  assert.ok(picker, 'pick-e2e-runner job exists');
  assert.match(picker, /\.busy == false/);
  assert.match(picker, /RELEASE_REF.*changeset-release\/main/s);
  assert.match(picker, /RUNNER_OVERRIDE/);
  assert.match(picker, /WORKER_OVERRIDE/);
});

test('manual Interview E2E benchmarks can select runner, workers, and shard', () => {
  assert.match(workflow, /interview_e2e_benchmark:/);
  assert.match(workflow, /interview_e2e_runner:/);
  assert.match(workflow, /interview_e2e_workers:/);
  assert.match(workflow, /interview_e2e_shard:/);

  const interview = job('interview-e2e');
  assert.ok(interview, 'interview-e2e job exists');
  assert.match(interview, /PW_WORKERS:/);
  assert.match(interview, /E2E_RUNNER_CLASS:/);
  assert.match(interview, /E2E_SHARD:/);
  assert.match(interview, /--shard=\$E2E_SHARD/);
});

test('manual Interview E2E benchmarks cannot enter the legacy release lane', () => {
  const detect = job('legacy-release-detect');
  assert.ok(detect, 'legacy-release-detect job exists');
  assert.match(
    detect,
    /!\(github\.event_name == 'workflow_dispatch'\n\s+&& inputs\.interview_e2e_benchmark == true\)/,
  );

  for (const jobName of [
    'interviewer-release-build',
    'architect-release-build',
    'interviewer-mirror',
    'interviewer-release-publish',
    'architect-mirror',
    'architect-release-publish',
  ]) {
    const downstream = job(jobName);
    assert.ok(downstream, `${jobName} exists`);
    assert.match(downstream, /needs:[\s\S]*?legacy-release-detect/);
    assert.match(
      downstream,
      /needs\.legacy-release-detect\.outputs\.(?:architect|interviewer)_released == 'true'/,
    );
  }
});

test('published Classic releases advance latest and rebuild the website', () => {
  for (const [jobName, repository] of [
    ['interviewer-release-publish', 'interviewer'],
    ['architect-release-publish', 'architect'],
  ]) {
    const publishJob = job(jobName);
    assert.ok(publishJob, `${jobName} exists`);
    assert.match(
      publishJob,
      new RegExp(`repository: complexdatacollective/${repository}`),
    );
    assert.match(publishJob, /draft: false[\s\S]*?make_latest: 'true'/);
  }

  const websiteRelease = job('apps-release-website');
  assert.ok(websiteRelease, 'apps-release-website exists');
  assert.match(
    websiteRelease,
    /group: apps-release-networkcanvas\.com-production/,
  );

  const websiteRefresh = job('refresh-website-after-classic-release');
  assert.ok(websiteRefresh, 'Classic website refresh job exists');
  assert.match(websiteRefresh, /- apps-release-website/);
  assert.match(websiteRefresh, /- interviewer-release-publish/);
  assert.match(websiteRefresh, /- architect-release-publish/);
  assert.match(websiteRefresh, /always\(\)/);
  assert.match(
    websiteRefresh,
    /needs\.interviewer-release-publish\.result == 'success'/,
  );
  assert.match(
    websiteRefresh,
    /needs\.architect-release-publish\.result == 'success'/,
  );
  assert.match(
    websiteRefresh,
    /group: apps-release-networkcanvas\.com-production/,
  );
  assert.match(websiteRefresh, /TURBO_FORCE: 'true'/);
  assert.match(websiteRefresh, /ref: main/);
  assert.match(
    websiteRefresh,
    /netlify-cli@26 deploy --build --prod[\s\S]*?--filter=networkcanvas\.com/,
  );
});

test('pull requests lint only changed files while merge groups lint fully', () => {
  const lint = job('lint');
  assert.ok(lint, 'lint job exists');
  assert.match(lint, /fetch-depth: 0/);
  assert.match(lint, /pnpm lint:changed HEAD\^1/);
  assert.match(lint, /pnpm exec turbo run \/\/#lint/);
});

test('short quality checks share one setup without joining the critical path', () => {
  const support = job('quality-support');
  assert.ok(support, 'quality-support job exists');
  assert.match(support, /uses: \.\/\.github\/actions\/turbo-ci-setup/);
  assert.match(support, /pnpm exec turbo run \/\/#knip/);
  assert.match(support, /pnpm check:changesets/);
  assert.match(support, /pnpm test:scripts/);
  assert.match(support, /turbo run build --filter='\.\/packages\/\*'/);
  assert.match(support, /turbo run typecheck/);

  for (const removed of [
    'knip',
    'check-changesets',
    'test-scripts',
    'build',
    'typecheck',
  ]) {
    assert.equal(job(removed), undefined, `${removed} job was consolidated`);
  }

  const quality = job('quality');
  assert.ok(quality, 'quality job exists');
  assert.match(quality, /- quality-support/);
  assert.doesNotMatch(quality, /- knip|- check-changesets|- test-scripts/);
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
  assert.match(policyJob, /fetch-depth: 0/);
  assert.match(
    policyJob,
    /BASE_SHA: \$\{\{ github\.event\.pull_request\.base\.sha \|\| github\.event\.merge_group\.base_sha \}\}/,
  );
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

test('Architect and Interviewer share one generated app release lane', () => {
  const productReleaseJob = job('product-release-pr');
  assert.ok(productReleaseJob, 'product release PR job exists');
  assert.match(productReleaseJob, /slug: apps/);
  assert.match(
    productReleaseJob,
    /--package '@codaco\/architect' --package '@codaco\/interviewer'/,
  );
  assert.match(
    productReleaseJob,
    /branch: changeset-release\/\$\{\{ matrix\.slug \}\}/,
  );
  assert.match(productReleaseJob, /Retire superseded separate app release PRs/);
  assert.doesNotMatch(productReleaseJob, /slug: architect/);
  assert.doesNotMatch(productReleaseJob, /slug: interviewer/);
});

test('snapshot update workflow accepts only current release branches', () => {
  assert.match(snapshotWorkflow, /'changeset-release\/apps'/);
  assert.match(snapshotWorkflow, /'changeset-release\/main'/);
  assert.doesNotMatch(snapshotWorkflow, /'changeset-release\/architect'/);
  assert.doesNotMatch(snapshotWorkflow, /'changeset-release\/interviewer'/);
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
