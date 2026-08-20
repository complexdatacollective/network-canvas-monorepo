import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { E2E_JOB_NAMES } from './release-e2e-policy.mjs';

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
const frescoPackage = JSON.parse(
  readFileSync(new URL('../apps/fresco/package.json', import.meta.url), 'utf8'),
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

test('full CI runs on PRs to main while merge groups request only quality', () => {
  assert.match(workflow, /^  pull_request:\n    branches: \[main\]$/m);
  assert.match(workflow, /^  merge_group:\n    types: \[checks_requested\]$/m);

  for (const jobName of [
    'detect',
    'e2e-policy',
    'lint',
    'quality-support',
    'test',
  ]) {
    const body = job(jobName);
    assert.ok(body, `${jobName} exists`);
    assert.match(
      body,
      /github\.event_name != 'merge_group'/,
      `${jobName} skips merge groups`,
    );
  }

  const quality = job('quality');
  assert.ok(quality, 'quality job exists');
  assert.match(quality, /if \[\[ "\$EVENT_NAME" == "merge_group" \]\]; then/);
  assert.match(quality, /PR quality verdicts are authoritative/);
});

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

test('website dead-link crawl waits for the documentation preview it links to', () => {
  // The website preview rewrites docs links to the documentation deploy
  // preview (apps/networkcanvas.com/next.config.ts), so the crawl must not
  // start until that preview is live too.
  const previewJob = job('website-preview-checks');
  assert.ok(previewJob, 'website-preview-checks job exists');
  assert.match(
    previewJob,
    /- id: docs-preview\n\s+name: Wait for Netlify documentation preview\n\s+if: needs\.detect\.outputs\.docs == 'true'/,
    'the documentation deploy-preview wait exists and is gated on the docs flag',
  );
  assert.match(previewJob, /const siteName = 'documentation-dev'/);
  assert.match(previewJob, /Confirm documentation preview is reachable/);

  const docsWaitIndex = previewJob.indexOf('- id: docs-preview');
  const crawlIndex = previewJob.indexOf('Dead-link check');
  assert.ok(crawlIndex !== -1, 'website dead-link check exists');
  assert.ok(
    docsWaitIndex < crawlIndex,
    'the documentation wait runs before the dead-link crawl',
  );
});

test('each E2E suite gates on its own policy flag', () => {
  for (const [jobName, flag] of [
    ['interview-e2e', 'interview'],
    ['interview-e2e-native', 'interview'],
    ['interviewer-e2e', 'interviewer'],
    ['interviewer-e2e-native', 'interviewer'],
    ['architect-e2e', 'architect'],
    ['architect-e2e-native', 'architect'],
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

test('automatic private E2E routing is idle-aware and normal-release-lane only', () => {
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

test('classic release builds use the proven macOS signing secrets', () => {
  for (const jobName of [
    'interviewer-release-build',
    'architect-release-build',
  ]) {
    const releaseBuild = job(jobName);
    assert.ok(releaseBuild, `${jobName} exists`);
    assert.match(releaseBuild, /secrets\.MAC_CSC_LINK/);
    assert.match(releaseBuild, /secrets\.MAC_CSC_KEY_PASSWORD/);
    assert.match(releaseBuild, /secrets\.APPLE_ID/);
    assert.match(releaseBuild, /secrets\.APPLE_APP_SPECIFIC_PASSWORD/);
    assert.match(releaseBuild, /secrets\.APPLE_TEAM_ID/);
    assert.doesNotMatch(releaseBuild, /Decode App Store Connect API key/);
    assert.doesNotMatch(releaseBuild, /secrets\.CSC_LINK/);
    assert.doesNotMatch(releaseBuild, /secrets\.APPLE_API_KEY/);
  }
});

test('Classic release names remain bare semver for legacy update checks', () => {
  for (const [jobName, app] of [
    ['interviewer-mirror', 'interviewer'],
    ['architect-mirror', 'architect'],
  ]) {
    const mirrorJob = job(jobName);
    assert.ok(mirrorJob, `${jobName} exists`);
    assert.match(
      mirrorJob,
      new RegExp(
        `name: \\$\\{\\{ needs\\.legacy-release-detect\\.outputs\\.${app}_version \\}\\}`,
      ),
    );
    assert.doesNotMatch(mirrorJob, /name: Network Canvas/);
  }
});

test('Fresco postinstall is portable to Windows release runners', () => {
  assert.equal(
    frescoPackage.scripts.postinstall,
    'cross-env SKIP_ENV_VALIDATION=true prisma generate && cross-env SKIP_ENV_VALIDATION=true next typegen',
  );
  assert.equal(frescoPackage.devDependencies['cross-env'], '^10.1.0');
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

test('pull requests lint only changed files and merge groups skip lint', () => {
  const lint = job('lint');
  assert.ok(lint, 'lint job exists');
  assert.match(lint, /github\.event_name != 'merge_group'/);
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
  assert.match(support, /pnpm check:compat-protocols/);
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

test('e2e-policy can query the Actions API for release-PR reuse', () => {
  const policyJob = job('e2e-policy');
  assert.ok(policyJob, 'e2e-policy job exists');
  assert.match(policyJob, /GH_TOKEN: \$\{\{ github\.token \}\}/);
  assert.match(policyJob, /fetch-depth: 0/);
  assert.match(
    policyJob,
    /BASE_SHA: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/,
  );
  assert.doesNotMatch(policyJob, /github\.event\.merge_group/);
});

test('unit tests use affected task selection for PRs and skip merge groups', () => {
  const testJob = job('test');
  assert.ok(testJob, 'test job exists');
  assert.match(
    testJob,
    /DIFF_BASE_SHA: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/,
    'test job diffs the PR against its full base',
  );
  assert.match(testJob, /github\.event_name != 'merge_group'/);
  assert.match(
    testJob,
    /if \[\[ "\$GITHUB_EVENT_NAME" == "pull_request" \]\] \\/,
  );
  assert.doesNotMatch(testJob, /pull_request\|merge_group/);
  assert.match(
    testJob,
    /TURBO_SCM_BASE="\$DIFF_BASE_SHA" pnpm exec turbo run test --affected/,
  );
  assert.match(
    testJob,
    /git cat-file -e "\$DIFF_BASE_SHA\^\{commit\}"/,
    'a missing diff base fails closed to the full suite',
  );
  assert.match(
    testJob,
    /':\(exclude\)scripts\/\*\.test\.mjs'/,
    'repository script tests do not invalidate workspace unit tests',
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

  // The prune is working-tree-only. It survives as a deletion-free no-op solely
  // because the action's Git CLI push path opens with `git reset --hard`. The
  // v2 default (GitHub API push) commits the whole diff against the pushed SHA,
  // which would delete the gated-product changesets for real.
  assert.match(
    releaseJob,
    /push-with-git-cli: true/,
    "the working-tree prune depends on the Git CLI push path's reset",
  );
});

test('release job uses the changesets/action v2 input names', () => {
  const releaseJob = job('release');
  assert.ok(releaseJob, 'release job exists');

  assert.match(releaseJob, /version-script: pnpm run version-packages/);
  assert.match(releaseJob, /publish-script: pnpm run publish-packages/);
  assert.match(releaseJob, /create-github-releases: true/);
  // v1 spellings are silently ignored by v2, so a stale name would quietly
  // fall back to `changeset version` and skip publishing altogether.
  for (const legacyInput of [
    'version:',
    'publish:',
    'createGithubReleases:',
    'commit:',
    'title:',
    'branch:',
    'cwd:',
  ]) {
    assert.ok(
      !releaseJob.includes(`\n          ${legacyInput}`),
      `release job must not use the v1 input \`${legacyInput}\``,
    );
  }
});

test('generated release PRs use the dedicated PAT and rely on native PR CI', () => {
  const releaseJob = job('release');
  assert.ok(releaseJob, 'release job exists');
  // changesets/action v2 ignores the GITHUB_TOKEN environment variable; the
  // PAT only takes effect through the `github-token` input.
  assert.match(
    releaseJob,
    /github-token: \$\{\{ secrets\.RELEASE_PR_TOKEN \}\}/,
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

test('normal-lane apps do not get separate generated release PRs', () => {
  const releaseJob = job('release');
  const productReleaseJob = job('product-release-pr');
  assert.ok(releaseJob, 'release job exists');
  assert.ok(productReleaseJob, 'product release PR job exists');
  assert.match(releaseJob, /uses: changesets\/action@/);
  assert.doesNotMatch(productReleaseJob, /slug: apps/);
  assert.doesNotMatch(productReleaseJob, /@codaco\/architect/);
  assert.doesNotMatch(productReleaseJob, /@codaco\/background-creator/);
  assert.doesNotMatch(productReleaseJob, /@codaco\/interviewer/);
  assert.match(
    productReleaseJob,
    /branch: changeset-release\/\$\{\{ matrix\.slug \}\}/,
  );
});

test('Background Creator is built before merge despite having no E2E suite', () => {
  const supportJob = job('quality-support');
  assert.ok(supportJob, 'quality support job exists');
  assert.match(
    supportJob,
    /turbo run build --filter='\.\/packages\/\*' --filter=@codaco\/background-creator/,
  );
});

test('stable app versions deploy to their Netlify production sites', () => {
  const detectJob = job('apps-release-detect');
  assert.ok(detectJob, 'apps release detector exists');
  for (const [app, siteSecret] of [
    ['architect', 'ARCHITECT'],
    ['background-creator', 'BACKGROUND_CREATOR'],
    ['interviewer', 'INTERVIEWER'],
  ]) {
    assert.match(
      detectJob,
      new RegExp(
        `PKG_JSON: apps/${app}/package\\.json[\\s\\S]*?RELEASE_CHANNEL: stable-tagged`,
      ),
    );

    const releaseJob = job(`apps-release-${app}`);
    assert.ok(releaseJob, `${app} production release job exists`);
    assert.match(
      releaseJob,
      new RegExp(
        `netlify-cli@22 deploy --no-build --prod[\\s\\S]*?--site="\\$\\{\\{ secrets\\.NETLIFY_SITE_ID_${siteSecret} \\}\\}"`,
      ),
    );
    assert.match(releaseJob, /prerelease: false/);
    assert.match(releaseJob, /make_latest: 'true'/);
    assert.match(
      releaseJob,
      new RegExp(`group: apps-release-@codaco/${app}$`, 'm'),
      `${app} releases must serialize across versions`,
    );
    assert.match(releaseJob, /fetch-depth: 0/);
    assert.match(releaseJob, /bash \.github\/scripts\/app-release-guard\.sh/);
    assert.match(releaseJob, /--since "\$SINCE"/);
  }
});

test('snapshot update workflow accepts only current release branches', () => {
  assert.match(snapshotWorkflow, /'changeset-release\/main'/);
  assert.doesNotMatch(snapshotWorkflow, /'changeset-release\/apps'/);
  assert.doesNotMatch(snapshotWorkflow, /'changeset-release\/architect'/);
  assert.doesNotMatch(
    snapshotWorkflow,
    /'changeset-release\/background-creator'/,
  );
  assert.doesNotMatch(snapshotWorkflow, /'changeset-release\/interviewer'/);
});

test('closed snapshot PRs cannot leave permanent pending state', () => {
  assert.match(
    snapshotWorkflow,
    /id: snapshot_source[\s\S]*?state: 'open'[\s\S]*?base: 'main'[\s\S]*?head,/,
  );
  assert.match(
    snapshotWorkflow,
    /pull\.head\.repo\?\.full_name === `\$\{context\.repo\.owner\}\/\$\{context\.repo\.repo\}` &&\n\s+pull\.head\.ref === snapshotBranch/,
  );
  assert.match(
    snapshotWorkflow,
    /steps\.snapshot_source\.outputs\.open == 'true'/,
  );
  assert.doesNotMatch(
    snapshotWorkflow,
    /git ls-remote --exit-code --heads origin/,
  );
});

test('the informational Pages deploy has a bounded failure window', () => {
  const reportJob = job('e2e-report');
  assert.ok(reportJob, 'e2e-report job exists');
  assert.match(
    reportJob,
    /- name: Deploy report to Pages\n\s+id: deploy\n\s+if: [^\n]+\n\s+uses: actions\/deploy-pages@[^\n]+\n\s+timeout-minutes: 3\n\s+continue-on-error: true/,
  );
});

test('the unified E2E report aggregates every suite job and publishes failures only', () => {
  assert.equal(
    job('interview-e2e-report'),
    undefined,
    'the per-suite interview report job was replaced by e2e-report',
  );

  const reportJob = job('e2e-report');
  assert.ok(reportJob, 'e2e-report job exists');
  for (const name of Object.values(E2E_JOB_NAMES).flat()) {
    assert.match(
      reportJob,
      new RegExp(`^ {6}- ${name}$`, 'm'),
      `e2e-report needs ${name}`,
    );
    assert.match(
      reportJob,
      new RegExp(`merge_report ${name} `),
      `${name} is mapped in the merge step`,
    );
  }

  // Reports go to Pages only for FAILED jobs, and a green job removes its
  // branch's stale failure report — only the latest run's report is kept.
  assert.match(reportJob, /case "\$result" in\n\s+failure\)/);
  assert.match(reportJob, /Only the latest run's report is kept/);

  // Review hardening: distinct refs must never share a report directory
  // (lossy tr normalisation collides feature/foo with feature-foo), and the
  // published tree must never be empty (an empty state-branch commit fails
  // and leaves a deleted report live).
  assert.match(
    reportJob,
    /printf '%s-%s\\n' "\$s" "\$\(printf '%s' "\$1" \| sha256sum \| cut -c1-8\)"/,
    'the slug carries a digest of the raw ref',
  );
  assert.match(
    reportJob,
    /> merged\/index\.html/,
    'a root marker keeps the published tree non-empty',
  );

  // A failed job's previous report is removed even when this failure died
  // before producing a replacement artifact — the old rm must precede the
  // artifact-existence check.
  const failureCase = reportJob.match(/failure\)([\s\S]*?);;/)?.[1] ?? '';
  assert.ok(
    failureCase.indexOf('rm -rf "$dir"') !== -1 &&
      failureCase.indexOf('rm -rf "$dir"') <
        failureCase.indexOf('[ -d "$src" ]'),
    'the failure case removes the stale report before checking the artifact',
  );

  // The merge step (and therefore the orphan sweep) is not gated on any
  // suite having run, so all-skipped runs still clean up deleted branches'
  // reports. Its only gate is the stale-head guard; the artifact download
  // stays failure-gated.
  assert.match(
    reportJob,
    /- name: Merge failure reports into per-job branch subdirectories\n(?:\s+#[^\n]*\n)*\s+id: merge\n\s+if: steps\.guard\.outputs\.current == 'true'\n\s+env:/,
    'the merge step is gated only on the stale-head guard',
  );

  // A truncated slug component stays within filesystem limits; the digest
  // suffix keeps truncated names unambiguous.
  assert.match(
    reportJob,
    /s=\$\{s:0:100\}/,
    'the readable slug portion is bounded',
  );

  // A transiently failed Pages deploy must be retried: gh-pages-deployed
  // advances only on deploy success, and a mismatch versus gh-pages forces
  // needs_deploy on the next run.
  assert.match(reportJob, /pending_deploy/);
  assert.match(
    reportJob,
    /gh-pages:refs\/heads\/gh-pages-deployed/,
    'the deployed pointer is recorded from the state branch',
  );
  assert.match(
    reportJob,
    /- name: Record the deployed state\n(?:\s+#[^\n]*\n)*\s+if: >-\n\s+\$\{\{ steps\.merge\.outputs\.needs_deploy == 'true'\n\s+&& steps\.deploy\.outcome == 'success' \}\}/,
    'the deployed pointer advances only when deploy-pages succeeded',
  );

  // A rerun of an outdated head must not rewrite the report site or the
  // sticky comment with obsolete results.
  assert.match(
    reportJob,
    /- name: Confirm this run still describes the PR head\n(?:\s+#[^\n]*\n)*\s+id: guard\n/,
    'the stale-head guard step exists',
  );

  // Orphan sweep: reports for branches that no longer exist are deleted on
  // every report run, and a failed live-branch listing skips the sweep
  // rather than deleting on doubt.
  assert.match(reportJob, /git ls-remote --heads/);
  assert.match(
    reportJob,
    /if \[ -s "\$RUNNER_TEMP\/live-slugs\.txt" \]; then/,
    'the sweep only runs with a non-empty live-branch listing',
  );
  assert.ok(
    reportJob.indexOf('merge_report architect-e2e-native') <
      reportJob.indexOf('if [ -s "$RUNNER_TEMP/live-slugs.txt" ]'),
    'the sweep runs after merging, so a branch deleted mid-run cannot re-publish its orphan',
  );
  assert.match(
    reportJob,
    /grep -qxF -- /,
    'the slug pattern is terminated so dash-leading slugs cannot parse as grep options',
  );
  assert.match(
    reportJob,
    /success \| skipped\)/,
    'a skipped job also drops its stale report',
  );
  const doubtGuards = reportJob.match(/never delete on doubt/g) ?? [];
  assert.ok(
    doubtGuards.length >= 2,
    'both the listing and the sweep document the fail-safe',
  );

  // The status comment is a single sticky comment, updated in place, only
  // ever posted on pull requests, and never rewritten by an obsolete rerun.
  assert.match(reportJob, /<!-- network-canvas-e2e-status -->/);
  assert.match(
    reportJob,
    /\$\{\{ always\(\) && github\.event_name == 'pull_request'\n\s+&& steps\.guard\.outputs\.current == 'true' \}\}/,
  );
  assert.match(reportJob, /updateComment/);
  assert.match(reportJob, /createComment/);

  // The decision matrix comes from the policy job's reasons output.
  assert.match(reportJob, /needs\.e2e-policy\.outputs\.reasons/);
  const policyJob = job('e2e-policy');
  assert.match(policyJob, /reasons=\$\(jq -c '\.reasons \/\/ \{\}'/);
  assert.match(
    policyJob,
    /reasons: \$\{\{ steps\.policy\.outputs\.reasons \}\}/,
  );
});

test('e2e-policy receives affected-PR and equivalence-reuse inputs', () => {
  const policyJob = job('e2e-policy');
  assert.ok(policyJob, 'e2e-policy job exists');
  assert.match(
    policyJob,
    /BASE_SHA: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/,
    'policy step receives the PR base as BASE_SHA',
  );
  assert.match(
    policyJob,
    /HEAD_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/,
    'policy step receives the PR tip as HEAD_SHA',
  );
  assert.match(
    policyJob,
    /HEAD_REPO: \$\{\{ github\.event\.pull_request\.head\.repo\.full_name \}\}/,
    'policy step receives the head repo for the fork guard',
  );
});

// The policy looks its verdict jobs up by exact name, and a miss is silent:
// `validated[key]` just becomes false, disabling reuse without failing
// anything. Bind the map to the workflow so a rename cannot merge half-done.
test('every job the E2E policy names is a real, gated workflow job', () => {
  for (const [suite, names] of Object.entries(E2E_JOB_NAMES)) {
    assert.ok(names.length > 0, `${suite} names at least one job`);
    for (const name of names) {
      assert.ok(job(name), `${name} exists as a workflow job`);
      assert.match(
        workflow,
        new RegExp(`^ {6}- ${name}$`, 'm'),
        `${name} is in the quality gate's needs list`,
      );
      assert.match(
        workflow,
        new RegExp(`verify_required_e2e ${name} `),
        `${name} is verified by the quality gate`,
      );
    }
  }
});

// The two lanes are only safe while each stays on its own side of the pixel
// boundary: the native lane must never reach a capture (its baselines were
// rasterised in the pinned image), and must never author one.
test('the native E2E lane cannot touch pixel baselines', () => {
  for (const name of Object.values(E2E_JOB_NAMES).flat()) {
    const body = job(name);
    if (!name.endsWith('-native')) {
      assert.match(
        body,
        /--grep @visual|--project=chromium-visual/,
        `${name} runs only the visual half`,
      );
      continue;
    }
    assert.match(
      body,
      /E2E_PIXEL_LANE: native/,
      `${name} arms the capture guard`,
    );
    // Comments in these jobs legitimately cite run.sh to explain themselves,
    // so judge the executable lines only.
    const commands = body
      .split('\n')
      .filter((line) => !/^\s*#/.test(line))
      .join('\n');
    assert.doesNotMatch(
      commands,
      /run\.sh/,
      `${name} does not shell out to the Docker runner`,
    );
    assert.doesNotMatch(
      commands,
      /--update-snapshots/,
      `${name} cannot author baselines`,
    );
  }
});

test('Architect E2E builds disable both animation systems', () => {
  const nativeJob = job('architect-e2e-native');
  assert.ok(nativeJob, 'architect-e2e-native job exists');
  assert.match(
    nativeJob,
    /VITE_DISABLE_ANIMATIONS: 'true'/,
    'the native build disables Motion and Base UI animations',
  );

  const dockerRunner = readFileSync(
    new URL('../apps/architect/e2e/scripts/run.sh', import.meta.url),
    'utf8',
  );
  assert.match(
    dockerRunner,
    /-e VITE_DISABLE_ANIMATIONS=true/,
    'the Docker build disables Motion and Base UI animations',
  );
});
