import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { test } from 'vitest';

import { GATED_PRODUCT_RELEASE_LANES } from '../release/changeset-app-utils.mjs';
import { E2E_JOB_NAMES } from './release-e2e-policy.mjs';
import { STORYBOOK_SHARDS, TEST_SHARDS } from './test-shards.mjs';
import {
  codeOf,
  findSteps,
  getJob,
  getStep,
  hasJob,
  liveSteps,
  needsOf,
  raw,
  readActionsYaml,
  readWorkflow,
  scriptsOf,
  stepIndex,
  WORKFLOW_DIR,
  workflowFiles,
} from './workflow-model.mjs';

const parsedWorkflow = readWorkflow('ci-and-release.yml');
const ciJob = (name) => getJob(parsedWorkflow, name);
const deadLinkChecker = readFileSync(
  new URL('../dead-links/dead-link-checker.mjs', import.meta.url),
  'utf8',
);
const rootPackage = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
);
const deadLinkAction = readActionsYaml(
  new URL('../../.github/actions/dead-link-check/action.yml', import.meta.url),
);
const refreshWorkflow = readWorkflow('dead-link-cache-refresh.yml');
const snapshotWorkflow = readWorkflow('open-e2e-snapshot-update-pr.yml');
const frescoPackage = JSON.parse(
  readFileSync(
    new URL('../../apps/fresco/package.json', import.meta.url),
    'utf8',
  ),
);

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// PART-LOCAL HELPERS
const RELEASE_PUSH_ONLY =
  "github.ref == 'refs/heads/main' && github.event_name == 'push'";

test('full CI runs on PRs to main and integration branches while merge groups request only quality', () => {
  assert.deepEqual(parsedWorkflow.on.pull_request.branches, [
    'main',
    'integration/**',
    'schema-*',
  ]);
  // Pushes stay main-only: the release, publish, deploy and mirror jobs are
  // reached from this trigger, and an integration branch must never release.
  assert.deepEqual(parsedWorkflow.on.push, { branches: ['main'] });
  assert.deepEqual(parsedWorkflow.on.merge_group, {
    types: ['checks_requested'],
  });

  for (const jobName of [
    'detect',
    'e2e-policy',
    'lint',
    'quality-support',
    'test',
  ]) {
    assert.match(
      ciJob(jobName).if,
      /github\.event_name != 'merge_group'/,
      `${jobName} skips merge groups`,
    );
  }

  const verify = getStep(ciJob('quality'), {
    name: 'Verify all quality checks passed',
  });
  assert.equal(verify.env.EVENT_NAME, '${{ github.event_name }}');
  assert.match(
    verify.run,
    /if \[\[ "\$EVENT_NAME" == "merge_group" \]\]; then\n\s+echo "PR quality verdicts are authoritative[^\n]*"\n\s+exit 0\n\s*fi/,
  );
});

test('release, publish, deploy and mirror jobs never run for an integration base', () => {
  // Every job below is reachable only from a push to (or a dispatch on) main,
  // directly or through a `needs:` chain rooted in a job that is. A
  // pull_request event, whatever its base, can start none of them.
  for (const jobName of [
    'release',
    'product-release-pr',
    'apps-release-detect',
  ]) {
    assert.equal(
      ciJob(jobName).if,
      RELEASE_PUSH_ONLY,
      `${jobName} runs only for a push to main`,
    );
  }
  assert.match(
    ciJob('legacy-release-detect').if,
    /^github\.ref == 'refs\/heads\/main' && \(github\.event_name == 'push' \|\| github\.event_name == 'workflow_dispatch'\)(?: && |$)/,
  );
  for (const [jobName, root] of [
    ['apps-release-architect', 'apps-release-detect'],
    ['apps-release-architect-subpath-dist', 'apps-release-detect'],
    ['apps-release-interviewer', 'apps-release-detect'],
    ['apps-release-interviewer-subpath-dist', 'apps-release-detect'],
    ['apps-release-background-creator', 'apps-release-detect'],
    ['apps-release-fresco', 'apps-release-detect'],
    ['apps-release-documentation', 'apps-release-detect'],
    ['apps-release-website', 'apps-release-detect'],
    ['apps-release-protocol-review', 'apps-release-detect'],
    ['interviewer-release-build', 'legacy-release-detect'],
    ['architect-release-build', 'legacy-release-detect'],
    ['interviewer-mirror', 'legacy-release-detect'],
    ['architect-mirror', 'legacy-release-detect'],
    ['interviewer-release-publish', 'legacy-release-detect'],
    ['architect-release-publish', 'legacy-release-detect'],
  ]) {
    const releaseJob = ciJob(jobName);
    assert.ok(needsOf(releaseJob).includes(root), `${jobName} needs ${root}`);
    // The release decision must be a conjunct of the job's own condition: an
    // `||` would let the job run without it.
    assert.match(
      releaseJob.if,
      new RegExp(
        `^needs\\.${escapeRegExp(root)}\\.outputs\\.\\w+_released == 'true'(?: && |$)`,
      ),
      `${jobName} is gated on ${root}'s release decision`,
    );
    assert.doesNotMatch(releaseJob.if, /\|\|/);
  }
});

// One branch can back pull requests into several bases (say `schema-9` and
// `main`), and their merge trees differ. These two tests run the real
// carry-forward script and the real report-key script against stand-ins for
// GitHub, and fail if a verdict or a report crosses from one pull request to
// the other.
test('carry-forward-statuses copies a verdict only from runs of the same pull request and base', async () => {
  const { script } = getStep(ciJob('carry-forward-statuses'), {
    uses: 'actions/github-script',
  }).with;
  const AsyncFunction = async function () {}.constructor;
  // The title GitHub gives a pull request run, rendered from the workflow's
  // own `run-name` format string.
  const format = parsedWorkflow['run-name'].match(/format\('([^']+)'/)?.[1];
  assert.ok(format, 'the workflow titles pull request runs with run-name');
  const titleOf = (number, base, prTitle) =>
    format.replace('{0}', number).replace('{1}', base).replace('{2}', prTitle);
  // Both pull requests from the branch are open, so GitHub lists BOTH on every
  // one of the branch's runs: `pull_requests` cannot tell the runs apart, and
  // the title is the only thing that can.
  const run = (id, number, base, jobConclusion, displayTitle) => ({
    id,
    run_number: id,
    head_sha: `sha-${id}`,
    html_url: `https://example.test/runs/${id}`,
    display_title:
      displayTitle ??
      (number === null ? 'a push' : titleOf(number, base, 'Release')),
    pull_requests: [
      { number: 5, base: { ref: 'main' } },
      { number: 7, base: { ref: 'schema-9' } },
    ],
    jobConclusion,
  });
  const execute = async (runs, env) => {
    const created = [];
    const github = {
      rest: {
        actions: {
          listWorkflowRunsForRepo: async () => ({
            data: { workflow_runs: runs },
          }),
          listJobsForWorkflowRun: async ({ run_id: runId }) => ({
            data: {
              jobs: [
                {
                  name: 'docs-preview-checks',
                  conclusion: runs.find(({ id }) => id === runId).jobConclusion,
                  html_url: `https://example.test/jobs/${runId}`,
                },
              ],
            },
          }),
        },
        checks: { create: async (args) => created.push(args) },
      },
    };
    const saved = { ...process.env };
    Object.assign(process.env, {
      FLAG_DOCS: 'false',
      FLAG_WEBSITE: 'true',
      PR_HEAD_REF: 'changeset-release/documentation',
      PR_HEAD_SHA: 'sha-current',
      PR_NUMBER: '5',
      PR_BASE_REF: 'main',
      ...env,
    });
    try {
      await new AsyncFunction('github', 'context', 'core', script)(
        github,
        {
          repo: { owner: 'o', repo: 'r' },
          runId: 999,
          sha: 'sha-current',
        },
        { info() {} },
      );
    } finally {
      for (const key of Object.keys(process.env)) {
        if (!(key in saved)) delete process.env[key];
      }
      Object.assign(process.env, saved);
    }
    return created;
  };

  // The newest run is the other pull request's (same branch, base schema-9)
  // and failed; the older run is this pull request's and passed. Only the
  // latter may be carried.
  let created = await execute(
    [run(3, 7, 'schema-9', 'failure'), run(2, 5, 'main', 'success')],
    {},
  );
  assert.equal(created.length, 1);
  assert.equal(created[0].conclusion, 'success');
  assert.match(created[0].output.summary, /#2\b/);

  // Nothing from another pull request is ever carried.
  created = await execute([run(3, 7, 'schema-9', 'success')], {});
  assert.deepEqual(created, []);

  // A pull request retargeted to another base starts over.
  created = await execute([run(2, 5, 'main', 'success')], {
    PR_BASE_REF: 'schema-9',
  });
  assert.deepEqual(created, []);

  // PR #55 is not PR #5, and a run with a title this workflow did not give
  // it (one started before `run-name` existed) cannot be proven to match.
  created = await execute([run(2, 55, 'main', 'success')], {});
  assert.deepEqual(created, []);
  created = await execute(
    [run(2, 5, 'main', 'success', 'Release the documentation site')],
    {},
  );
  assert.deepEqual(created, []);
});

test('e2e-report keys a pull request report by its number and sweeps by open pull request', () => {
  const meta = getStep(ciJob('e2e-report'), { id: 'meta' });
  const dir = mkdtempSync(join(tmpdir(), 'e2e-report-meta-'));
  try {
    const bin = join(dir, 'bin');
    mkdirSync(bin);
    // `git ls-remote` lists two branches; `gh api` lists the open pull
    // requests, one of them from a branch that is gone.
    writeFileSync(
      join(bin, 'git'),
      '#!/bin/sh\nprintf "aaa\\trefs/heads/feat/x\\nbbb\\trefs/heads/gh-pages\\n"\n',
      { mode: 0o755 },
    );
    writeFileSync(
      join(bin, 'gh'),
      '#!/bin/sh\nif [ "$GH_FAIL" = 1 ]; then exit 1; fi\nprintf "feat/x\\t11\\nfeat/x\\t12\\ngone/branch\\t13\\n"\n',
      { mode: 0o755 },
    );
    const execute = (env) => {
      const output = join(dir, 'output');
      writeFileSync(output, '');
      rmSync(join(dir, 'live-slugs.txt'), { force: true });
      const result = spawnSync('bash', ['-e', '-c', meta.run], {
        encoding: 'utf8',
        env: {
          PATH: `${bin}:${process.env.PATH}`,
          GITHUB_OUTPUT: output,
          GITHUB_REPOSITORY: 'o/r',
          GH_TOKEN: 'token',
          RUNNER_TEMP: dir,
          REF: 'feat/x',
          ...env,
        },
      });
      assert.equal(result.status, 0, result.stderr);
      const outputs = Object.fromEntries(
        readFileSync(output, 'utf8')
          .split('\n')
          .filter(Boolean)
          .map((line) => line.split(/=(.*)/s).slice(0, 2)),
      );
      const live = existsSync(join(dir, 'live-slugs.txt'))
        ? readFileSync(join(dir, 'live-slugs.txt'), 'utf8')
            .split('\n')
            .filter(Boolean)
        : null;
      return { outputs, live };
    };

    const first = execute({ PR_NUMBER: '11' });
    const second = execute({ PR_NUMBER: '12' });
    const push = execute({ PR_NUMBER: '' });
    // Two pull requests from one branch never share a directory ...
    assert.notEqual(first.outputs.slug, second.outputs.slug);
    assert.match(first.outputs.slug, /^feat-x-[0-9a-f]{8}-pr11$/);
    assert.match(second.outputs.slug, /^feat-x-[0-9a-f]{8}-pr12$/);
    // ... the number-less key is still reported so the old directory can be
    // dropped, and a run with no pull request keeps using it.
    assert.equal(first.outputs.legacy_slug, push.outputs.slug);
    assert.match(first.outputs.legacy_slug, /^feat-x-[0-9a-f]{8}$/);
    // Every open pull request's key is live, so the sweep keeps its report;
    // the key of a pull request that is no longer open is not.
    for (const key of [first.outputs.slug, second.outputs.slug]) {
      assert.ok(first.live.includes(key), `${key} is live`);
    }
    assert.ok(first.live.includes(first.outputs.legacy_slug));
    assert.ok(!first.live.some((key) => key.endsWith('-pr99')));
    assert.ok(first.live.some((key) => key.startsWith('gone-branch-')));

    // A failed pull-request listing removes the file: the sweep is skipped
    // rather than deleting every pull request's report on doubt.
    assert.equal(execute({ PR_NUMBER: '11', GH_FAIL: '1' }).live, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  const merge = getStep(ciJob('e2e-report'), { id: 'merge' });
  assert.match(merge.env.LEGACY_SLUG, /steps\.meta\.outputs\.legacy_slug/);
  assert.match(
    merge.run,
    /local legacy="merged\/\$job\/\$LEGACY_SLUG"[\s\S]*?rm -rf "\$legacy"/,
    'a report under the old number-less key is dropped',
  );
});

test('a rerun of an older run never updates reports or the comment for a retargeted pull request', () => {
  const guard = getStep(ciJob('e2e-report'), { id: 'guard' });
  const dir = mkdtempSync(join(tmpdir(), 'e2e-report-guard-'));
  try {
    const bin = join(dir, 'bin');
    mkdirSync(bin);
    // The pull request as GitHub reports it now: `<head sha> <base ref>`.
    writeFileSync(
      join(bin, 'gh'),
      '#!/bin/sh\nif [ -z "$LIVE" ]; then exit 1; fi\necho "$LIVE"\n',
      { mode: 0o755 },
    );
    const current = (live) => {
      const output = join(dir, 'output');
      writeFileSync(output, '');
      const result = spawnSync('bash', ['-e', '-c', guard.run], {
        encoding: 'utf8',
        env: {
          PATH: `${bin}:${process.env.PATH}`,
          GITHUB_OUTPUT: output,
          GITHUB_REPOSITORY: 'o/r',
          GH_TOKEN: 'token',
          PR_NUMBER: '5',
          EVENT_HEAD_SHA: 'aaa',
          EVENT_BASE_REF: 'main',
          LIVE: live,
        },
      });
      assert.equal(result.status, 0, result.stderr);
      return readFileSync(output, 'utf8').trim();
    };
    assert.equal(current('aaa main'), 'current=true');
    // The head moved on.
    assert.equal(current('bbb main'), 'current=false');
    // Same head, but the pull request now targets another base: the older
    // run describes a different merge tree and shares this one's report key.
    assert.equal(current('aaa schema-9'), 'current=false');
    // An API failure proceeds, as before.
    assert.equal(current(''), 'current=true');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  assert.match(
    guard.env.EVENT_BASE_REF,
    /github\.event\.pull_request\.base\.ref/,
  );
});

test('every reader of earlier runs, releases or release PRs is scoped to the base it describes', () => {
  // Jobs and steps keyed on a release branch's NAME must also require the
  // base main: the same branch can back a pull request into an integration
  // branch, and that is not the release PR.
  for (const jobName of [
    'docs-preview-checks',
    'website-preview-checks',
    'version-packages-freshness',
  ]) {
    assert.match(
      ciJob(jobName).if,
      /github\.base_ref == 'main'/,
      `${jobName} requires the release PR's base`,
    );
  }
  assert.equal(
    getStep(ciJob('e2e-policy'), { id: 'policy' }).env.BASE_REF,
    '${{ github.base_ref }}',
    'the E2E policy is told the pull request base',
  );
  // Lookups of "the" release PR by head branch name.
  assert.match(
    getStep(ciJob('version-packages-freshness'), { id: 'head' }).run,
    /pulls\?state=open&base=main&head=/,
  );
  assert.match(
    getStep(ciJob('release'), {
      name: 'Close a release PR the tip no longer needs',
    }).run,
    /--base main --head changeset-release\/main/,
  );
});

test('superseded CI runs are cancelled for every pull request', () => {
  const { concurrency } = parsedWorkflow;
  assert.ok(concurrency, 'top-level CI concurrency configuration exists');
  assert.match(
    concurrency['cancel-in-progress'],
    /^\$\{\{ github\.event_name == 'pull_request' \|\|/,
  );
  assert.doesNotMatch(concurrency.group, /github\.head_ref/);
  assert.doesNotMatch(concurrency['cancel-in-progress'], /github\.head_ref/);
});

test('detect never runs on push-to-main (its consumers are PR/dispatch only)', () => {
  const detectIf = ciJob('detect').if;
  assert.match(
    detectIf,
    /^github\.event_name != 'merge_group' && github\.event_name != 'push'(?: && |$)/,
  );
  assert.match(detectIf, /inputs\.interview_e2e_benchmark == true/);
});

// The website is also crawled for a pull request that changes its
// publications; see the publications tests below.
test('both public sites are crawled for their generated release PRs', () => {
  const detectJob = ciJob('detect');
  assert.equal(detectJob.outputs.docs, '${{ steps.flags.outputs.docs }}');
  assert.equal(detectJob.outputs.website, '${{ steps.flags.outputs.website }}');
  assert.match(
    getStep(detectJob, { id: 'flags' }).run,
    /if \[\[ "\$docs" == "true" \|\| "\$website" == "true" \]\]; then\n\s+docs=true\n\s+website=true/,
    'a change to either public site triggers both preview crawls',
  );

  for (const [jobName, flag, siteName, crawlURL, reportName] of [
    [
      'docs-preview-checks',
      'docs',
      'documentation-dev',
      '${{ steps.netlify-preview.outputs.url }}',
      'docs-dead-link-report',
    ],
    [
      'website-preview-checks',
      'website',
      'networkcanvasdotdev',
      '${{ steps.netlify-preview.outputs.url }}/en-US/',
      'website-dead-link-report',
    ],
  ]) {
    const previewJob = ciJob(jobName);
    assert.ok(
      needsOf(previewJob).includes('detect'),
      `${jobName} needs detect`,
    );
    assert.match(
      previewJob.if,
      new RegExp(`needs\\.detect\\.outputs\\.${flag} == 'true'`),
    );
    assert.match(
      previewJob.if,
      /github\.head_ref == 'changeset-release\/documentation'/,
      `${jobName} runs for a Documentation release PR`,
    );
    assert.match(
      previewJob.if,
      /github\.head_ref == 'changeset-release\/website'/,
      `${jobName} runs for a Website release PR`,
    );
    assert.doesNotMatch(
      previewJob.if,
      /startsWith\(github\.head_ref, 'changeset-release\/'\)/,
      `${jobName} does not run for unrelated release lanes`,
    );
    const waitScript = getStep(previewJob, { id: 'netlify-preview' }).with
      .script;
    assert.match(waitScript, new RegExp(`const siteName = '${siteName}'`));
    assert.match(
      waitScript,
      /deploy-preview-\$\{context\.issue\.number\}--\$\{siteName\}\.netlify\.app/,
    );
    assert.match(
      waitScript,
      /status\.description === 'Deploy Preview canceled\.'/,
      'a successful ignored Netlify deploy may reuse the stable PR alias',
    );
    assert.match(
      waitScript,
      /previewUrl\.hostname === 'app\.netlify\.com'/,
      'the ignored-deploy fallback only accepts Netlify dashboard URLs',
    );
    getStep(previewJob, { uses: 'actions/checkout' });
    getStep(previewJob, { uses: 'pnpm/setup' });
    getStep(previewJob, { uses: 'actions/setup-node' });
    getStep(previewJob, {
      run: /^pnpm install --frozen-lockfile --ignore-scripts$/m,
    });

    const deadLinkStep = getStep(previewJob, {
      uses: './.github/actions/dead-link-check',
    });
    assert.equal(deadLinkStep.with?.url, crawlURL);
    assert.equal(deadLinkStep.with?.['report-name'], reportName);

    // A pull request must never write the shared cache: its entry would be
    // visible only to that PR, while the weekly refresh on main is what every
    // run actually reads.
    assert.notEqual(
      deadLinkStep.with?.['save-cache'],
      'true',
      `${jobName} does not publish a branch-scoped cache`,
    );
    assert.ok(
      stepIndex(previewJob, { uses: 'actions/checkout' }) <
        stepIndex(previewJob, { uses: './.github/actions/dead-link-check' }),
      `${jobName} checks out the local checker and action before running them`,
    );
  }

  const carryForward = ciJob('carry-forward-statuses');
  assert.ok(needsOf(carryForward).includes('docs-preview-checks'));
  assert.ok(needsOf(carryForward).includes('website-preview-checks'));
  const carryStep = getStep(carryForward, { uses: 'actions/github-script' });
  assert.equal(carryStep.env.FLAG_DOCS, '${{ needs.detect.outputs.docs }}');
  assert.equal(
    carryStep.env.FLAG_WEBSITE,
    '${{ needs.detect.outputs.website }}',
  );
  assert.match(carryStep.with.script, /FLAG_DOCS: \["docs-preview-checks"\]/);
  assert.match(
    carryStep.with.script,
    /FLAG_WEBSITE: \["website-preview-checks"\]/,
  );
});

test('the dead-link checker drives a browser and never an HTTP client', () => {
  assert.match(deadLinkChecker, /import\(['"]playwright['"]\)/);
  assert.match(deadLinkChecker, /BrowserVerifier/);
  // The whole point of the browser-only model is that there is no second
  // client whose disguise has to be maintained per publisher, so nothing may
  // reintroduce a fetch path or a spoofed identity beside it.
  assert.doesNotMatch(deadLinkChecker, /await fetch\(/);
  assert.doesNotMatch(
    deadLinkChecker,
    /rejectUnauthorized|NODE_TLS_REJECT_UNAUTHORIZED/,
  );
  assert.equal(rootPackage.devDependencies.playwright, 'catalog:');
});

test('the dead-link action runs headed Chrome and reads a shared cache', () => {
  const actionRuns = deadLinkAction.runs;
  const check = getStep(actionRuns, { name: 'Dead-link check' });
  // Headed is the load-bearing part: challenge providers reject automated
  // headless Chrome whatever User-Agent it sends, so a crawl that quietly
  // lost its display server would report live links as dead.
  assert.match(check.run, /xvfb-run --auto-servernum/);
  assert.doesNotMatch(raw(check).run, /--headless/);
  // A spoofed User-Agent is what publishers fingerprint against, and sending
  // one from real Chrome is what broke the Zenodo citations.
  assert.doesNotMatch(raw(check).run, /--user-agent/);
  assert.match(check.run, /--github-actions/);
  assert.match(check.run, /--cache=/);
  assert.doesNotMatch(
    raw(check).run,
    /dead-link-checker\.mjs[^\n]* (-v|--yes)/,
  );
  // The HTTP-client crawl ran serially so a cluster of links on one publisher
  // could not look like a bot burst. A browser is slower per link, so this
  // trades some of that back — pin the value rather than letting it drift,
  // since burst behaviour is what provokes the WAF blocks the checker now
  // correctly reports as dead.
  assert.equal(deadLinkAction.inputs.concurrent.default, '4');
  // A 401/403 from someone else's host is excused only for URLs listed by
  // hand. It has to be a list and not a count: a count lets a link that starts
  // refusing us hide behind one that stopped.
  assert.equal(
    deadLinkAction.inputs['allow-refused'].default,
    '.github/dead-link-refusals.json',
  );
  assert.match(check.run, /--allow-refused="\$CHECK_ALLOW_REFUSED"/);
  assert.match(check.run, /--concurrent="\$CHECK_CONCURRENT"/);

  const restore = getStep(actionRuns, {
    name: 'Restore external-link cache',
  });
  const save = getStep(actionRuns, { name: 'Save external-link cache' });
  assert.match(restore.uses, /^actions\/cache\/restore@/);
  assert.equal(restore.with['restore-keys'], 'dead-link-cache-v1-');
  assert.match(save.uses, /^actions\/cache\/save@/);
  // Only successes are cached, so saving after a failed crawl cannot carry a
  // failure forward — and skipping the save would let one dead third-party
  // link stop the cache refreshing for good.
  assert.match(save.if, /always\(\)/);
  assert.equal(restore.with.path, save.with.path);

  const upload = getStep(actionRuns, { name: 'Upload dead-link report' });
  assert.equal(upload.if, 'always()');
  assert.match(upload.uses, /^actions\/upload-artifact@/);
  assert.equal(upload.with['if-no-files-found'], 'error');
});

test('the weekly refresh publishes the cache every pull request reads', () => {
  // Only a run on the default branch writes a cache that other refs can
  // restore, so the schedule is what makes the preview jobs' restores hit.
  assert.ok(refreshWorkflow.on.schedule?.[0]?.cron, 'the refresh is scheduled');
  assert.ok(refreshWorkflow.on.workflow_dispatch !== undefined);

  const refresh = getJob(refreshWorkflow, 'refresh');
  const crawls = findSteps(refresh, {
    uses: './.github/actions/dead-link-check',
  });
  assert.equal(crawls.length, 2, 'both public sites are refreshed');
  for (const crawl of crawls) {
    // A dead link on one site must not skip the other site's crawl, nor the
    // cache save; the gate step is what reports the verdict.
    assert.equal(crawl['continue-on-error'], true);
  }
  const [documentation, website] = crawls;
  assert.match(documentation.with.url, /documentation\.networkcanvas\.com/);
  assert.match(website.with.url, /networkcanvas\.com\/en-US\//);
  // NEITHER crawl restores, and that is the whole job. Last week's entries are
  // minutes short of the one-week TTL when this starts, so a restore would
  // serve them as hits instead of rechecking them and republish them with
  // their original timestamps — expiring minutes into the week they were meant
  // to cover, and rechecking links fortnightly rather than weekly.
  assert.equal(documentation.with['restore-cache'], 'false');
  assert.equal(website.with['restore-cache'], 'false');
  assert.equal(website.with['save-cache'], 'true');
  assert.notEqual(documentation.with['save-cache'], 'true');

  const gate = getStep(refresh, { run: /dead-link-refresh-gate\.mjs/ });
  assert.equal(
    liveSteps(refresh).at(-1),
    gate,
    'the gate is the last step, after both crawls',
  );
  assert.ok(
    !gate['continue-on-error'],
    'the gate is what fails the run when a link is dead',
  );
});

test('an ignored Netlify deploy reuses only its verified PR preview alias', async () => {
  const previewScript = getStep(ciJob('docs-preview-checks'), {
    id: 'netlify-preview',
  }).with?.script;
  assert.equal(
    typeof previewScript,
    'string',
    'the preview wait script exists',
  );

  const runPreviewScript = async (status) => {
    const outputs = new Map();
    const failures = [];
    const github = {
      paginate: async () => [status],
      rest: { repos: { listCommitStatusesForRef() {} } },
    };
    const context = {
      issue: { number: 1443 },
      payload: { pull_request: { head: { sha: 'test-head' } } },
      repo: { owner: 'test-owner', repo: 'test-repo' },
    };
    const core = {
      setFailed: (message) => failures.push(message),
      setOutput: (name, value) => outputs.set(name, value),
    };
    const AsyncFunction = async function () {}.constructor;

    await new AsyncFunction('github', 'context', 'core', previewScript)(
      github,
      context,
      core,
    );

    return { failures, outputs };
  };

  const ignoredDeploy = {
    context: 'netlify/documentation-dev/deploy-preview',
    description: 'Deploy Preview canceled.',
    state: 'success',
    target_url:
      'https://app.netlify.com/projects/documentation-dev/deploys/6a8f036639821f00084e3a3c',
  };
  const ignoredResult = await runPreviewScript(ignoredDeploy);
  assert.deepEqual(ignoredResult.failures, []);
  assert.equal(
    ignoredResult.outputs.get('url'),
    'https://deploy-preview-1443--documentation-dev.netlify.app',
  );

  const wrongProjectResult = await runPreviewScript({
    ...ignoredDeploy,
    target_url:
      'https://app.netlify.com/projects/another-site/deploys/6a8f036639821f00084e3a3c',
  });
  assert.equal(wrongProjectResult.outputs.has('url'), false);
  assert.match(wrongProjectResult.failures[0], /pointed to unexpected URL/);

  const ordinaryDashboardResult = await runPreviewScript({
    ...ignoredDeploy,
    description: 'Deploy Preview ready!',
  });
  assert.equal(ordinaryDashboardResult.outputs.has('url'), false);
  assert.match(
    ordinaryDashboardResult.failures[0],
    /pointed to unexpected URL/,
  );
});

test('website dead-link crawl waits for the documentation preview it links to', () => {
  // The website preview rewrites docs links to the documentation deploy
  // preview (apps/networkcanvas.com/next.config.ts), so the crawl must not
  // start until that preview is live too.
  const previewJob = ciJob('website-preview-checks');
  const docsWait = getStep(previewJob, { id: 'docs-preview' });
  assert.equal(
    docsWait.name,
    'Wait for Netlify documentation preview',
    'the documentation deploy-preview wait exists',
  );
  assert.equal(
    docsWait.if,
    "needs.detect.outputs.docs == 'true'",
    'the documentation deploy-preview wait is gated on the docs flag',
  );
  assert.match(docsWait.with.script, /const siteName = 'documentation-dev'/);
  getStep(previewJob, { name: 'Confirm documentation preview is reachable' });

  assert.ok(
    stepIndex(previewJob, { id: 'docs-preview' }) <
      stepIndex(previewJob, { uses: './.github/actions/dead-link-check' }),
    'the documentation wait runs before the dead-link crawl',
  );
});

// PART-LOCAL HELPERS

// The first live step whose uncommented `run` script matches `pattern`.
const stepRunning = (job, pattern) =>
  getStep(
    job,
    (step) => typeof step.run === 'string' && pattern.test(step.run),
  );

const liveJobs = (parsed) =>
  Object.keys(parsed.jobs ?? {})
    .filter((name) => hasJob(parsed, name))
    .map((name) => parsed.jobs[name]);

// Jobs that call a reusable workflow have no steps of their own.
const liveStepsOf = (parsed) =>
  liveJobs(parsed)
    .filter((job) => Array.isArray(job.steps))
    .flatMap((job) => liveSteps(job));

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
    const suiteJob = ciJob(jobName);
    assert.ok(
      needsOf(suiteJob).includes('e2e-policy'),
      `${jobName} needs e2e-policy`,
    );
    assert.match(
      suiteJob.if,
      new RegExp(`needs\\.e2e-policy\\.outputs\\.${flag} == 'true'`),
      `${jobName} is gated on the ${flag} suite flag`,
    );
  }
});

test('automatic private E2E routing is idle-aware and normal-release-lane only', () => {
  const picker = ciJob('pick-e2e-runner');
  const pick = getStep(picker, { id: 'pick' });
  const code = pick.run;
  assert.match(code, /\.busy == false/);
  assert.equal(
    pick.env.RELEASE_REF,
    '${{ needs.e2e-policy.outputs.release_ref }}',
  );
  assert.match(code, /"\$RELEASE_REF" == "changeset-release\/main"/);
  assert.match(pick.env.RUNNER_OVERRIDE, /inputs\.interview_e2e_runner/);
  assert.match(code, /"\$RUNNER_OVERRIDE"/);
  assert.match(pick.env.WORKER_OVERRIDE, /inputs\.interview_e2e_workers/);
  assert.match(code, /"\$WORKER_OVERRIDE"/);
  assert.equal(picker.outputs.runs_on, '${{ steps.pick.outputs.runs_on }}');
});

test('manual Interview E2E benchmarks cannot enter the legacy release lane', () => {
  assert.match(
    ciJob('legacy-release-detect').if,
    /!\(github\.event_name == 'workflow_dispatch'\s+&& inputs\.interview_e2e_benchmark == true\)/,
  );

  for (const jobName of [
    'interviewer-release-build',
    'architect-release-build',
    'interviewer-mirror',
    'interviewer-release-publish',
    'architect-mirror',
    'architect-release-publish',
  ]) {
    const downstream = ciJob(jobName);
    assert.ok(
      needsOf(downstream).includes('legacy-release-detect'),
      `${jobName} needs legacy-release-detect`,
    );
    assert.match(
      downstream.if,
      /needs\.legacy-release-detect\.outputs\.(?:architect|interviewer)_released == 'true'/,
    );
  }
});

test('classic release builds use the proven macOS signing secrets', () => {
  for (const jobName of [
    'interviewer-release-build',
    'architect-release-build',
  ]) {
    const packageStep = stepRunning(ciJob(jobName), /electron-builder/);
    for (const [variable, secret] of [
      ['CSC_LINK', 'MAC_CSC_LINK'],
      ['CSC_KEY_PASSWORD', 'MAC_CSC_KEY_PASSWORD'],
      ['APPLE_ID', 'APPLE_ID'],
      ['APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_APP_SPECIFIC_PASSWORD'],
      ['APPLE_TEAM_ID', 'APPLE_TEAM_ID'],
    ]) {
      assert.match(
        packageStep.env?.[variable] ?? '',
        new RegExp(`secrets\\.${secret}\\b`),
        `${jobName} packages with ${variable} from secrets.${secret}`,
      );
    }
  }
});

test('Classic release names remain bare semver for legacy update checks', () => {
  for (const [jobName, app] of [
    ['interviewer-mirror', 'interviewer'],
    ['architect-mirror', 'architect'],
  ]) {
    const mirrorJob = ciJob(jobName);
    const release = getStep(mirrorJob, {
      uses: 'softprops/action-gh-release',
    });
    assert.equal(
      release.with.name,
      `\${{ needs.legacy-release-detect.outputs.${app}_version }}`,
    );
    for (const step of liveSteps(mirrorJob)) {
      for (const name of [step.name, step.with?.name]) {
        assert.doesNotMatch(String(name ?? ''), /^Network Canvas/);
      }
    }
  }
});

test('Fresco postinstall is portable to Windows release runners', () => {
  // POSIX `VAR=value cmd` fails under cmd.exe; every assignment goes through
  // cross-env.
  for (const command of frescoPackage.scripts.postinstall.split('&&')) {
    assert.match(command.trim(), /^cross-env SKIP_ENV_VALIDATION=true /);
  }
  assert.ok(
    frescoPackage.devDependencies['cross-env'],
    'cross-env is installed',
  );
});

test('published Classic releases advance latest and rebuild the website', () => {
  for (const [jobName, repository] of [
    ['interviewer-release-publish', 'interviewer'],
    ['architect-release-publish', 'architect'],
  ]) {
    const publish = getStep(ciJob(jobName), {
      uses: 'softprops/action-gh-release',
    });
    assert.equal(
      publish.with.repository,
      `complexdatacollective/${repository}`,
    );
    assert.equal(publish.with.draft, false);
    assert.equal(publish.with.make_latest, 'true');
  }

  assert.equal(
    ciJob('apps-release-website').concurrency.group,
    'apps-release-networkcanvas.com-production',
  );

  const websiteRefresh = ciJob('refresh-website-after-classic-release');
  for (const need of [
    'apps-release-website',
    'interviewer-release-publish',
    'architect-release-publish',
  ]) {
    assert.ok(
      needsOf(websiteRefresh).includes(need),
      `the website refresh needs ${need}`,
    );
  }
  assert.match(websiteRefresh.if, /always\(\)/);
  assert.match(
    websiteRefresh.if,
    /needs\.interviewer-release-publish\.result == 'success'/,
  );
  assert.match(
    websiteRefresh.if,
    /needs\.architect-release-publish\.result == 'success'/,
  );
  assert.equal(
    websiteRefresh.concurrency.group,
    'apps-release-networkcanvas.com-production',
  );
  assert.equal(websiteRefresh.env.TURBO_FORCE, 'true');
  assert.equal(
    getStep(websiteRefresh, { uses: 'actions/checkout' }).with.ref,
    'main',
  );
  stepRunning(
    websiteRefresh,
    /netlify-cli@\d+ deploy --build --prod[\s\S]*?--filter=networkcanvas\.com/,
  );
});

test('lint runs the whole repository through turbo and merge groups skip it', () => {
  const lint = ciJob('lint');
  assert.match(lint.if, /github\.event_name != 'merge_group'/);
  stepRunning(lint, /pnpm exec turbo run \/\/#lint/);
});

test('short quality checks share one setup without joining the critical path', () => {
  const support = ciJob('quality-support');
  getStep(support, { uses: './.github/actions/turbo-ci-setup' });
  for (const command of [
    /pnpm exec turbo run \/\/#knip/,
    /pnpm check:changesets/,
    /pnpm check:compat-protocols/,
    /pnpm check:mapbox-tokens/,
    /pnpm --filter @codaco\/studio-api check:schema-docs/,
    // Through turbo, so the guard suite is cached like every other test task.
    /turbo run \/\/#test:scripts/,
    /turbo run \/\/#test:invariants/,
    /turbo run build --filter='\.\/packages\/\*'/,
    /turbo run typecheck/,
  ]) {
    stepRunning(support, command);
  }

  assert.ok(
    needsOf(ciJob('quality')).includes('quality-support'),
    'quality needs quality-support',
  );
});

test('the quality gate verifies each required E2E suite individually', () => {
  const verify = getStep(ciJob('quality'), {
    name: 'Verify all quality checks passed',
  });
  const code = verify.run;
  for (const suite of ['interview', 'interviewer', 'architect']) {
    const variable = `E2E_${suite.toUpperCase()}_REQUIRED`;
    assert.equal(
      verify.env[variable],
      `\${{ needs.e2e-policy.outputs.${suite} }}`,
      `quality receives the ${suite} requirement flag`,
    );
    assert.match(
      code,
      new RegExp(`verify_required_e2e ${suite}-e2e "\\$${variable}"`),
      `quality checks the ${suite} suite against its own flag`,
    );
  }
});

test('e2e-policy can query the Actions API for release-PR reuse', () => {
  const policyJob = ciJob('e2e-policy');
  assert.equal(
    getStep(policyJob, { id: 'policy' }).env.GH_TOKEN,
    '${{ github.token }}',
  );
  assert.equal(
    getStep(policyJob, { uses: 'actions/checkout' }).with['fetch-depth'],
    0,
  );
});

test('unit tests use affected task selection for PRs and skip merge groups', () => {
  const testJob = ciJob('test');
  const runStep = stepRunning(
    testJob,
    /node scripts\/ci\/test-shards\.mjs filters/,
  );
  const code = runStep.run;
  assert.equal(
    runStep.env.DIFF_BASE_SHA,
    '${{ github.event.pull_request.base.sha }}',
    'test job diffs the PR against its full base',
  );
  assert.match(testJob.if, /github\.event_name != 'merge_group'/);
  assert.match(code, /if \[\[ "\$GITHUB_EVENT_NAME" == "pull_request" \]\] \\/);
  assert.doesNotMatch(
    `${testJob.if}\n${scriptsOf(raw(testJob))}`,
    /pull_request\|merge_group/,
  );
  // Deliberately not `--affected`. Turbo 2.10.4 ignores every `--filter`
  // for task selection when `--affected` is present, while still printing a
  // "Packages in scope" line that honours it — so the Studio-server
  // exclusion and the per-shard bucket would both read as working while
  // every shard ran the whole affected set, the Studio suite included. The
  // explicit `...[<base>]` selector that `--affected` is sugar for obeys
  // every filter, and was verified selection-equivalent to `--affected`
  // across several bases. Pin the explicit form, and refuse any turbo
  // invocation that reaches for `--affected` again, so neither the exclusion
  // nor the sharding can be quietly re-broken.
  assert.match(
    code,
    /pnpm exec turbo run test \\\n\s+--filter="\.\.\.\[\$DIFF_BASE_SHA\]" \\\n\s+"\$\{SHARD_FILTERS\[@\]\}"/,
    'the affected path scopes to the PR base and to this shard',
  );
  // The fallback runs whenever the diff touches anything outside the turbo
  // input trees — including an edit to this very workflow file, which is how
  // most changes to the job itself are exercised. Without its own assertion,
  // a shard restriction dropped or misquoted here would leave every shard
  // running the whole workspace, and no other assertion
  // would have looked at the line.
  assert.match(
    code,
    /pnpm exec turbo run test "\$\{SHARD_FILTERS\[@\]\}"/,
    'the full-suite fallback is scoped to this shard too',
  );
  // Both invocations, and no others: a third turbo run without the shard
  // restriction would be an unrestricted workspace run on five runners.
  const shardedRuns =
    scriptsOf(testJob).match(
      /pnpm exec turbo run test\b(?:[^\n]*\\\n)*[^\n]*/g,
    ) ?? [];
  assert.equal(shardedRuns.length, 2, 'exactly two turbo invocations');
  for (const run of shardedRuns) {
    assert.match(
      run,
      /"\$\{SHARD_FILTERS\[@\]\}"/,
      `every turbo run is shard-restricted: ${run}`,
    );
  }
  assert.match(
    code,
    /if ! node scripts\/ci\/test-shards\.mjs filters "\$SHARD" >/,
    'the shard filters are gated on the exit status, not on the output being non-empty',
  );
  // Over the raw scripts, comments included: a comment can only make this
  // stricter.
  assert.doesNotMatch(
    scriptsOf(raw(testJob)),
    /turbo run [^\n]*--affected/,
    'turbo ignores --filter under --affected, so no invocation here may use it',
  );
  assert.match(
    code,
    /git cat-file -e "\$DIFF_BASE_SHA\^\{commit\}"/,
    'a missing diff base fails closed to the full suite',
  );
  assert.match(
    code,
    /':\(exclude\)scripts\/\*\.test\.mjs'/,
    'repository script tests do not invalidate workspace unit tests',
  );
});

test('the test matrix runs exactly the shards scripts/ci/test-shards.mjs defines', () => {
  // The dangerous drift is a bucket with no runner: its packages are negated
  // by every shard that DOES run, so nothing executes them and CI stays
  // green while those suites silently stop running.
  // A split bucket needs one leg per part, or a part's files never run.
  const testJob = ciJob('test');
  const legs = testJob.strategy.matrix.include;
  assert.deepEqual(
    legs
      .map((leg) => `${leg.shard}${leg.part ? ` ${leg.part}` : ''}`)
      .toSorted(),
    TEST_SHARDS.flatMap((s) =>
      s.parts === undefined
        ? [`${s.shard}`]
        : Array.from(
            { length: s.parts },
            (_, i) => `${s.shard} ${i + 1}/${s.parts}`,
          ),
    ).toSorted(),
    'every defined bucket, and every part of a split one, has a matrix leg and vice versa',
  );

  assert.equal(
    testJob.strategy['fail-fast'],
    false,
    'a red shard must not cancel its siblings and hide their verdicts',
  );

  // Only the bucket holding @codaco/studio-sync starts a database, and it is
  // started by a step because `services:` cannot vary per matrix leg.
  const postgresLegs = legs.filter((leg) => leg.postgres === true);
  assert.equal(postgresLegs.length, 1, 'one leg declares Postgres');
  assert.equal(
    postgresLegs[0].shard,
    TEST_SHARDS.find((s) => s.postgres === true)?.shard,
    'the Postgres leg is the bucket that holds the Postgres-dependent suite',
  );
  assert.ok(
    !('services' in testJob),
    'no leg pays the 24s container init it does not need',
  );

  // Three secrets reach only the shard whose bucket holds the one package
  // that reads them.
  const envLegs = legs.filter((leg) => leg.protocolValidation === true);
  assert.equal(envLegs.length, 1, 'one leg writes the protocol-validation env');
  assert.equal(
    envLegs[0].shard,
    TEST_SHARDS.find((s) =>
      s.packages.some((p) => p.name === '@codaco/protocol-validation'),
    )?.shard,
    'the env leg is the bucket that holds @codaco/protocol-validation',
  );

  const runCode = stepRunning(
    testJob,
    /node scripts\/ci\/test-shards\.mjs filters "\$SHARD"/,
  ).run;
  assert.match(
    runCode,
    /PART_ARGS=\(-- "--shard=\$PART"\)/,
    'a split leg passes its part through turbo to vitest',
  );
  assert.equal(
    getStep(testJob, { name: /^Write protocol-validation \.env/ }).if,
    'matrix.protocolValidation',
    'the secret-writing step is gated on that leg',
  );

  // The runner image ships no R, and the background-creator suite that runs
  // its generated R script refuses to skip under CI.
  const rLegs = legs.filter((leg) => leg.rscript === true);
  assert.equal(rLegs.length, 1, 'one leg installs R');
  assert.equal(
    rLegs[0].shard,
    TEST_SHARDS.find((s) =>
      s.packages.some((p) => p.name === '@codaco/background-creator'),
    )?.shard,
    'the R leg is the bucket that holds @codaco/background-creator',
  );
  const setupR = getStep(testJob, { uses: 'r-lib/actions/setup-r' });
  assert.equal(setupR.if, 'matrix.rscript');
  assert.match(setupR.uses, /^r-lib\/actions\/setup-r@[0-9a-f]{40}$/);
  assert.ok(
    testJob.steps.indexOf(setupR) <
      stepIndex(testJob, { run: /node scripts\/ci\/test-shards\.mjs filters/ }),
    'R is on PATH before the suites run',
  );
  // The image has no Latin-1 locale either, and the suite's Latin-1 case
  // refuses to skip under CI. The name must be one the suite tries.
  const generatesLatin1 =
    /^sudo localedef -i en_US -f ISO-8859-1 en_US\.ISO-8859-1\nlocale -a \| grep -qx 'en_US\.iso88591'\n?$/;
  const latin1 = getStep(testJob, { run: /localedef/ });
  assert.equal(latin1.if, 'matrix.rscript');
  assert.match(latin1.run, generatesLatin1);
  assert.ok(
    stepIndex(testJob, { run: /localedef/ }) <
      stepIndex(testJob, { run: /node scripts\/ci\/test-shards\.mjs filters/ }),
    'the locale exists before the suites run',
  );
  assert.match(
    readFileSync(
      new URL(
        '../../apps/background-creator/src/scripts/__tests__/r-exec.test.ts',
        import.meta.url,
      ),
      'utf8',
    ),
    /'en_US\.iso88591'/,
    'the generated locale is one of the suite candidates',
  );

  // The seed installs both too, but a failed download must not end the seed
  // before anything is cached: each is reported by name instead, and the
  // suite then fails in the seeding test run.
  const seed = ciJob('seed-turbo-cache');
  const report = getStep(seed, { name: 'Report seed step outcomes' });
  const seedTestIndex = stepIndex(seed, { run: /turbo run[^\n]*test/ });
  const seedR = getStep(seed, { uses: 'r-lib/actions/setup-r' });
  assert.equal(seedR.if, undefined, 'the all-package seeding run always has R');
  assert.equal(seedR.uses, setupR.uses, 'both jobs pin the same setup-r');
  const seedLatin1 = getStep(seed, { run: /localedef/ });
  assert.equal(seedLatin1.if, undefined);
  assert.equal(
    seedLatin1.run,
    latin1.run,
    'both jobs generate the same locale',
  );
  for (const [step, outcome] of [
    [seedR, 'R_OUTCOME'],
    [seedLatin1, 'LATIN1_LOCALE_OUTCOME'],
  ]) {
    assert.ok(
      seed.steps.indexOf(step) < seedTestIndex,
      `${step.name} runs first`,
    );
    assert.equal(step['continue-on-error'], true);
    assert.equal(report.env[outcome], `\${{ steps.${step.id}.outcome }}`);
    assert.match(report.run, new RegExp(`"[^"=]+=\\$${outcome}" \\\\`));
  }

  // Ordering, not just presence. The `services:` block this replaced made
  // Actions block every step on the container's healthcheck, so a container
  // that could not start failed the job before a checkout or an install had
  // been paid for. Both Postgres steps must therefore precede turbo-ci-setup.
  const start = getStep(testJob, { name: /^Start Postgres/ });
  const wait = getStep(testJob, { name: 'Wait for Postgres' });
  assert.equal(start.if, 'matrix.postgres');
  assert.equal(wait.if, 'matrix.postgres');
  const startAt = stepIndex(testJob, { name: /^Start Postgres/ });
  const waitAt = stepIndex(testJob, { name: 'Wait for Postgres' });
  const setupAt = stepIndex(testJob, {
    uses: './.github/actions/turbo-ci-setup',
  });
  assert.ok(
    startAt < waitAt && waitAt < setupAt,
    'a Postgres that cannot start fails the shard before the install is paid for',
  );
  assert.match(
    wait.run,
    /The Postgres container stopped before accepting connections/,
    'a stopped container is reported at once rather than waited out',
  );
});

test('the storybook matrix runs exactly the legs scripts/ci/test-shards.mjs defines', () => {
  const storybook = ciJob('test-storybook');
  const legs = storybook.strategy.matrix.include;
  assert.deepEqual(
    legs.map((leg) => [leg.shard, leg.browsers, leg.releaseBrowsers]),
    STORYBOOK_SHARDS.map((s) => [s.shard, s.browsers, s.releaseBrowsers]),
    'every storybook bucket has a leg installing the browsers it declares',
  );
  // fresco-ui's Firefox pass runs on generated release PRs only, and the leg
  // installs Firefox exactly when it does.
  assert.equal(
    storybook.env.STORYBOOK_FIREFOX,
    "${{ startsWith(github.head_ref, 'changeset-release/') }}",
  );
  const install = getStep(storybook, {
    uses: './.github/actions/playwright-browsers',
  });
  assert.match(
    install.with.browsers,
    /env\.STORYBOOK_FIREFOX == 'true'\s+&& matrix\.releaseBrowsers/,
  );
  assert.equal(storybook.strategy['fail-fast'], false);

  const codegenLegs = legs.filter((leg) => leg.frescoCodegen === true);
  assert.deepEqual(
    codegenLegs.map((leg) => leg.shard),
    STORYBOOK_SHARDS.filter((s) =>
      s.packages.some((p) => p.name === 'fresco'),
    ).map((s) => s.shard),
    "Fresco's codegen runs on the leg that holds its stories",
  );
  assert.equal(
    stepRunning(storybook, /turbo run fresco#codegen/).if,
    'matrix.frescoCodegen',
  );

  const code = scriptsOf(storybook);
  assert.match(
    code,
    /if ! node scripts\/ci\/test-shards\.mjs filters "\$SHARD" storybook >/,
    'each leg derives its bucket from the one source of truth, gated on the exit status',
  );
  const runs =
    code.match(/pnpm exec turbo run test:storybook\b(?:[^\n]*\\\n)*[^\n]*/g) ??
    [];
  assert.equal(runs.length, 2, 'exactly two turbo invocations');
  for (const run of runs) {
    assert.match(
      run,
      /"\$\{SHARD_FILTERS\[@\]\}"/,
      `every turbo run is leg-restricted: ${run}`,
    );
  }
  // Over the raw scripts, comments included: a comment can only make this
  // stricter.
  assert.doesNotMatch(
    scriptsOf(raw(storybook)),
    /turbo run [^\n]*--affected/,
    'turbo ignores --filter under --affected, so no invocation here may use it',
  );
});

// One shared step installs every browser, so the time limit and retries in
// .github/actions/playwright-browsers cover all of them.
test('every CI browser install goes through the shared install action', () => {
  for (const file of workflowFiles()) {
    // Raw text: a comment naming the command can only make this stricter.
    const source = readFileSync(new URL(file, WORKFLOW_DIR), 'utf8');
    assert.doesNotMatch(
      source,
      /exec playwright install/,
      `${file} installs browsers without the time limit and retries`,
    );
  }
  const installs = liveStepsOf(parsedWorkflow).filter(
    (step) => step.uses === './.github/actions/playwright-browsers',
  );
  assert.ok(
    installs.length >= 6,
    'the native E2E lanes, Storybook, Studio and the cache warm use the action',
  );
});

const CACHE_KEY_SCRIPT = '.github/actions/playwright-browsers/cache-key.sh';

// Runs cache-key.sh against an os-release file with the given lines, and
// returns its exit status and what it wrote to $GITHUB_OUTPUT.
function playwrightCacheKey(osReleaseLines) {
  const dir = mkdtempSync(join(tmpdir(), 'playwright-cache-key-'));
  try {
    const output = join(dir, 'output');
    writeFileSync(output, '');
    const env = { ...process.env, GITHUB_OUTPUT: output };
    if (osReleaseLines === undefined) {
      env.OS_RELEASE_FILE = join(dir, 'absent');
    } else {
      env.OS_RELEASE_FILE = join(dir, 'os-release');
      writeFileSync(env.OS_RELEASE_FILE, `${osReleaseLines.join('\n')}\n`);
    }
    const run = spawnSync('bash', [CACHE_KEY_SCRIPT], {
      cwd: fileURLToPath(new URL('../..', import.meta.url)),
      env,
      encoding: 'utf8',
    });
    const outputs = Object.fromEntries(
      readFileSync(output, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => line.split(/=(.*)/s).slice(0, 2)),
    );
    return { status: run.status, log: run.stdout + run.stderr, outputs };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Playwright downloads a different WebKit for each Ubuntu release and keeps
// it in a directory named only by the build number, so a cache entry restored
// on another release is used as it is and cannot start. The key is the only
// thing that keeps the two apart.
test('the Playwright browser cache is keyed by the platform the browsers were downloaded for', () => {
  const noble = playwrightCacheKey([
    'NAME="Ubuntu"',
    'ID=ubuntu',
    'VERSION_ID="24.04"',
  ]);
  const next = playwrightCacheKey([
    'NAME="Ubuntu"',
    'ID=ubuntu',
    'VERSION_ID="26.04"',
  ]);
  assert.equal(noble.status, 0, noble.log);
  assert.equal(next.status, 0, next.log);
  assert.match(noble.outputs.version, /^\d+\.\d+\.\d+$/);
  assert.equal(next.outputs.version, noble.outputs.version);

  assert.notEqual(
    next.outputs['cache-key'],
    noble.outputs['cache-key'],
    'two Ubuntu releases never share an entry',
  );
  const architecture = execFileSync('uname', ['-m'], {
    encoding: 'utf8',
  }).trim();
  assert.equal(
    noble.outputs['cache-key'],
    `playwright-ubuntu24.04-${architecture}-${noble.outputs.version}`,
  );
  // The same platform reads the entry it wrote.
  assert.deepEqual(
    playwrightCacheKey(['VERSION_ID="26.04"', 'ID=ubuntu']).outputs,
    next.outputs,
  );
});

test('the Playwright browser cache has no key when the OS release is unknown', () => {
  for (const { what, lines } of [
    { what: 'no os-release file', lines: undefined },
    { what: 'no VERSION_ID', lines: ['NAME="Ubuntu"', 'ID=ubuntu'] },
    { what: 'no ID', lines: ['VERSION_ID="26.04"'] },
    { what: 'an empty VERSION_ID', lines: ['ID=ubuntu', 'VERSION_ID=""'] },
  ]) {
    const result = playwrightCacheKey(lines);
    assert.notEqual(result.status, 0, `${what}: the step fails`);
    assert.match(result.log, /::error::could not read the OS release/);
    assert.deepEqual(result.outputs, {}, `${what}: no key is written`);
  }
});

// One writer and many readers of one entry: they agree on the key only while
// both take it from the same script.
test('the cache warm and every browser install take the cache key from one script', () => {
  assert.ok(existsSync(new URL(`../../${CACHE_KEY_SCRIPT}`, import.meta.url)));
  const action = readActionsYaml(
    new URL(
      '../../.github/actions/playwright-browsers/action.yml',
      import.meta.url,
    ),
  );
  const warm = ciJob('warm-playwright-cache');
  const KEY = '${{ steps.pw.outputs.cache-key }}';

  const actionSteps = action.runs.steps;
  const resolve = actionSteps.find((step) => step.id === 'pw');
  assert.equal(resolve.run, 'bash "$GITHUB_ACTION_PATH/cache-key.sh"');
  const restores = actionSteps.filter((step) =>
    step.uses?.startsWith('actions/cache'),
  );
  assert.equal(restores.length, 1);
  assert.match(restores[0].uses, /^actions\/cache\/restore@/);
  assert.equal(restores[0].with.key, KEY);
  assert.equal(restores[0].with['restore-keys'], undefined);
  assert.ok(actionSteps.indexOf(resolve) < actionSteps.indexOf(restores[0]));

  assert.equal(getStep(warm, { id: 'pw' }).run, `bash ${CACHE_KEY_SCRIPT}`);
  const write = getStep(warm, { uses: /^actions\/cache@/ });
  assert.equal(write.with.key, KEY);
  assert.equal(write.with['restore-keys'], undefined);
  assert.ok(stepIndex(warm, { id: 'pw' }) < warm.steps.indexOf(write));

  // No other step anywhere caches the browser directory under a key of its
  // own.
  for (const file of workflowFiles()) {
    for (const step of liveStepsOf(readWorkflow(file))) {
      if (!step.uses?.startsWith('actions/cache')) continue;
      if (!String(step.with?.path).includes('ms-playwright')) continue;
      assert.equal(step.with.key, KEY, `${file} caches browsers under ${KEY}`);
    }
  }
});

test('every CI turbo invocation is capped at one task, job-wide', () => {
  // Every vitest sizes its fork pool to the runner's CPUs, so one suite
  // already fills the 4-vCPU runner; concurrent suites starve each other
  // into 20s timeouts without shortening the job (PR #1801).
  //
  // This used to be asserted per invocation, which is how `quality-support`
  // came to run `turbo run typecheck` uncapped and kill the runner on a pull
  // request that invalidated six packages at once (#2023). The cap is now one
  // variable per workflow, so this guards that rather than each call site.
  let capped = 0;
  for (const file of workflowFiles()) {
    const source = readFileSync(new URL(file, WORKFLOW_DIR), 'utf8');

    // A per-invocation flag would override the workflow's variable and drift
    // from it, which is the arrangement #2023 replaced. The continuation group
    // matters: these commands are routinely wrapped across `\`-continued
    // lines, and `test:storybook` was written that way until this change, so a
    // line-bounded pattern would miss the most likely way the flag comes back.
    // Raw text: a comment can only make this stricter.
    assert.doesNotMatch(
      source,
      /turbo run(?:[^\n]*\\\n)*[^\n]*--concurrency/,
      `${file} passes --concurrency at a call site instead of setting TURBO_CONCURRENCY`,
    );

    const parsed = readWorkflow(file);
    // A job or step value would override the workflow's for that scope.
    for (const scope of [...liveJobs(parsed), ...liveStepsOf(parsed)]) {
      if (scope.env && 'TURBO_CONCURRENCY' in scope.env) {
        assert.equal(
          String(scope.env.TURBO_CONCURRENCY),
          '1',
          `${file} overrides TURBO_CONCURRENCY below the workflow`,
        );
      }
    }

    const runsTurbo = liveStepsOf(parsed).some(
      (step) => typeof step.run === 'string' && /exec turbo run/.test(step.run),
    );
    if (!runsTurbo) continue;
    assert.equal(
      parsed.env?.TURBO_CONCURRENCY,
      '1',
      `${file} runs turbo without setting TURBO_CONCURRENCY`,
    );
    capped += 1;
  }
  // A rename of a workflow that runs turbo must not silently empty this loop.
  assert.ok(
    capped >= 5,
    `expected every turbo workflow to be capped, saw ${capped}`,
  );

  const seedJob = ciJob('seed-turbo-cache');
  stepRunning(seedJob, /pnpm exec turbo run test\b/);
  for (const step of liveSteps(seedJob)) {
    assert.doesNotMatch(
      raw(step).run ?? '',
      /turbo run (?:build|typecheck)[^\n]*\btest\b/,
      'the seed does not run tests in the same turbo invocation as build or typecheck',
    );
  }
});

test('turbo runs at the one version the root package.json pins', () => {
  // A step that fetches its own turbo drifts from the installed one: the
  // Studio image pruned with 2.10.4, change detection listed packages with
  // 2.9.6 and the Netlify deploy-preview ignore commands queried with 2.10.4,
  // so a turbo.json key that only the installed 2.11.5 knew failed the Studio
  // stack build, silently emptied change detection, and built every preview
  // the ignore commands should have skipped.
  const pinned = rootPackage.devDependencies.turbo;
  assert.match(
    pinned,
    /^\d+\.\d+\.\d+$/,
    'root package.json pins turbo exactly, so a fetch of that version matches the lockfile',
  );

  const actionDir = new URL('../../.github/actions/', import.meta.url);
  const dockerfile = new URL('../../apps/studio/Dockerfile', import.meta.url);
  const appsDir = new URL('../../apps/', import.meta.url);
  const netlifyConfigs = readdirSync(appsDir)
    .map((app) => new URL(`${app}/netlify.toml`, appsDir))
    .filter((url) => existsSync(url));
  const netlifyIgnore = new URL(
    'netlify-ignore-deploy-preview.sh',
    import.meta.url,
  );
  const sources = [
    ...workflowFiles().map((file) => new URL(file, WORKFLOW_DIR)),
    ...readdirSync(actionDir, { recursive: true })
      .filter((file) => file.endsWith('.yml'))
      .map((file) => new URL(file, actionDir)),
    dockerfile,
    ...netlifyConfigs,
    netlifyIgnore,
  ];
  // Raw text: a comment naming a version can only make this stricter.
  for (const url of sources) {
    assert.doesNotMatch(
      readFileSync(url, 'utf8'),
      /(?<![\w-])turbo@\d/,
      `${url.pathname} hard-codes a turbo version instead of reading the root pin`,
    );
  }

  // The callers without an install must read the pin, not drop turbo.
  const readsPin = /require\('\.\/package\.json'\)\.devDependencies\.turbo/;
  const dockerCode = codeOf(readFileSync(dockerfile, 'utf8'));
  assert.match(dockerCode, readsPin);
  assert.match(dockerCode, /dlx "turbo@\$\(node -p/);
  const detectCode = getStep(ciJob('detect'), { id: 'flags' }).run;
  assert.match(detectCode, readsPin);
  assert.match(detectCode, /npx --yes "turbo@\$\{TURBO_VERSION\}" ls/);

  // The shared deploy-preview ignore script has already changed to the
  // repository root, so ./package.json is the root manifest.
  const ignoreCode = codeOf(readFileSync(netlifyIgnore, 'utf8'));
  assert.match(ignoreCode, /cd "\$root"/);
  assert.match(
    ignoreCode,
    /turbo_version="\$\(node -p "require\('\.\/package\.json'\)\.devDependencies\.turbo"\)"/,
  );
  assert.match(
    ignoreCode,
    /npx --yes "turbo@\$\{turbo_version\}" query affected/,
  );
});

test('every Netlify deploy preview is skipped through the shared ignore script', () => {
  // One script decides every site's preview, so a fix to the decision (such
  // as measuring from where the pull request left main) reaches all of them.
  const appsDir = new URL('../../apps/', import.meta.url);
  let ignoreCommands = 0;
  for (const app of readdirSync(appsDir)) {
    const url = new URL(`${app}/netlify.toml`, appsDir);
    if (!existsSync(url)) continue;
    const source = codeOf(readFileSync(url, 'utf8'));
    const preview = source
      .split('[context.deploy-preview]')[1]
      ?.split(/^\[/m)[0];
    if (preview === undefined) continue;
    assert.doesNotMatch(
      preview,
      /query affected/,
      `${url.pathname} decides its deploy preview inline instead of through the shared script`,
    );
    assert.match(
      preview,
      new RegExp(
        String.raw`ignore = ".*bash \\"\$\(git rev-parse --show-toplevel\)/scripts/ci/netlify-ignore-deploy-preview\.sh\\" --config apps/${app.replace('.', String.raw`\.`)}/netlify\.toml `,
      ),
      `${url.pathname} does not skip its deploy preview through the shared script with its own config`,
    );
    ignoreCommands += 1;
  }
  // A move of the Netlify configs must not silently empty this loop.
  assert.ok(
    ignoreCommands >= 6,
    `expected six Netlify ignore commands, saw ${ignoreCommands}`,
  );
});

// PART-LOCAL HELPERS

// The scripts of every live step of the jobs as written, comments included,
// for checks that something must never appear in them.
const everyRun = (...jobs) =>
  jobs
    .flatMap((job) => liveSteps(job))
    .map((step) => raw(step).run ?? '')
    .join('\n');
const stepNamed = (job, name) => getStep(job, { name });
const indexNamed = (job, name) => stepIndex(job, { name });

test('release job prunes ignored-lane changesets before changesets/action', () => {
  const releaseJob = ciJob('release');

  const pruneIndex = stepIndex(releaseJob, {
    run: /^node scripts\/release\/prune-ignored-changesets\.mjs\s*$/,
  });
  const actionIndex = stepIndex(releaseJob, { uses: 'changesets/action' });
  assert.ok(
    pruneIndex < actionIndex,
    'prune step must run before changesets/action reads changeset state',
  );

  // The prune is working-tree-only. It survives as a deletion-free no-op solely
  // because the action's Git CLI push path opens with `git reset --hard`. The
  // v2 default (GitHub API push) commits the whole diff against the pushed SHA,
  // which would delete the gated-product changesets for real.
  assert.equal(
    getStep(releaseJob, { uses: 'changesets/action' }).with[
      'push-with-git-cli'
    ],
    true,
    "the working-tree prune depends on the Git CLI push path's reset",
  );
});

test('release job uses the changesets/action v2 input names', () => {
  const action = getStep(ciJob('release'), { uses: 'changesets/action' });

  assert.equal(action.with['version-script'], 'pnpm run version-packages');
  assert.equal(action.with['publish-script'], 'pnpm run publish-packages');
  assert.equal(action.with['create-github-releases'], true);
  // v1 spellings are silently ignored by v2, so a stale name would quietly
  // fall back to `changeset version` and skip publishing altogether.
  for (const legacyInput of [
    'version',
    'publish',
    'createGithubReleases',
    'commit',
    'title',
    'branch',
    'cwd',
  ]) {
    assert.ok(
      !Object.hasOwn(action.with, legacyInput),
      `release job must not use the v1 input \`${legacyInput}\``,
    );
  }
});

test('generated release PRs use the dedicated PAT and rely on native PR CI', () => {
  const releaseJob = ciJob('release');
  // changesets/action v2 ignores the GITHUB_TOKEN environment variable; the
  // PAT only takes effect through the `github-token` input.
  assert.equal(
    getStep(releaseJob, { uses: 'changesets/action' }).with['github-token'],
    '${{ secrets.RELEASE_PR_TOKEN }}',
  );
  assert.doesNotMatch(
    everyRun(releaseJob),
    /gh workflow run ci-and-release\.yml/,
  );
  assert.equal(releaseJob.permissions?.actions, undefined);
  assert.doesNotMatch(JSON.stringify(raw(releaseJob)), /"actions":"write"/);

  const productReleaseJob = ciJob('product-release-pr');
  assert.equal(
    getStep(productReleaseJob, { uses: 'peter-evans/create-pull-request' }).with
      .token,
    '${{ secrets.RELEASE_PR_TOKEN }}',
  );
  assert.doesNotMatch(
    everyRun(productReleaseJob),
    /gh workflow run ci-and-release\.yml/,
  );
  assert.equal(productReleaseJob.permissions?.actions, undefined);
  assert.doesNotMatch(
    JSON.stringify(raw(productReleaseJob)),
    /"actions":"write"/,
  );
});

test('product release PR matrix covers every gated release lane completely', () => {
  // The matrix and GATED_PRODUCT_RELEASE_LANES must not drift: a lane missing
  // here never gets a release PR, and a lane package missing from package_args
  // makes version-gated-products.mjs reject the invocation as incomplete.
  const productReleaseJob = ciJob('product-release-pr');
  const entries = productReleaseJob.strategy.matrix.include;
  for (const [lane, packages] of Object.entries(GATED_PRODUCT_RELEASE_LANES)) {
    const entry = entries.find(({ slug }) => slug === lane);
    assert.ok(entry, `matrix has an entry for the ${lane} lane`);
    for (const pkg of packages) {
      assert.ok(
        entry.package_args.includes(`--package '${pkg}'`),
        `${lane} lane passes --package '${pkg}'`,
      );
    }
  }
  assert.match(
    getStep(productReleaseJob, {
      run: /node scripts\/release\/version-gated-products\.mjs/,
    }).run,
    /version-gated-products\.mjs \$\{\{ matrix\.package_args \}\}/,
    'the lane packages reach the versioning script',
  );
});

test('normal-lane apps do not get separate generated release PRs', () => {
  const releaseJob = ciJob('release');
  const productReleaseJob = ciJob('product-release-pr');
  getStep(releaseJob, { uses: 'changesets/action' });
  assert.ok(
    !productReleaseJob.strategy.matrix.include.some(
      ({ slug }) => slug === 'apps',
    ),
  );
  const definition = JSON.stringify(raw(productReleaseJob));
  assert.doesNotMatch(definition, /@codaco\/architect/);
  assert.doesNotMatch(definition, /@codaco\/background-creator/);
  assert.doesNotMatch(definition, /@codaco\/interviewer/);
  assert.equal(
    getStep(productReleaseJob, { uses: 'peter-evans/create-pull-request' }).with
      .branch,
    'changeset-release/${{ matrix.slug }}',
  );
});

test('release-sensitive app builds run before merge', () => {
  const build = getStep(ciJob('quality-support'), { id: 'build' });
  assert.match(
    build.run,
    /^pnpm exec turbo run build --filter='\.\/packages\/\*' --filter=@codaco\/background-creator$/m,
  );
  // Architect and Interviewer take the source-map upload path only when both
  // credentials are non-empty; the values themselves are dummies.
  assert.match(String(build.env.POSTHOG_PERSONAL_API_KEY), /\S+/);
  assert.match(String(build.env.POSTHOG_PROJECT_ID), /\S+/);
  assert.match(
    build.env.POSTHOG_CLI_BINARY_PATH,
    /posthog-cli-upload-stub\.mjs$/,
  );
  assert.match(build.run, /^pnpm --filter=@codaco\/architect build$/m);
  assert.match(build.run, /^pnpm --filter=@codaco\/interviewer build$/m);
  assert.match(build.run, /^pnpm --filter=@codaco\/studio-web build$/m);
});

// Every check in quality-support is `continue-on-error`, so the job's own
// conclusion says nothing about them: the final step is what fails the job.
// A check added without a line there passes silently forever.
test('every quality-support check is consulted by the step that fails the job', () => {
  const supportJob = ciJob('quality-support');
  const verify = getStep(supportJob, { name: 'Verify support checks passed' });
  assert.equal(supportJob.steps.at(-1), verify);
  assert.equal(verify.if, 'always()');

  const checks = findSteps(
    supportJob,
    (step) => step['continue-on-error'] === true,
  );
  assert.ok(checks.length >= 8, 'quality-support runs the short checks');

  for (const { id, name } of checks) {
    assert.ok(id, `${name} has a step id`);
    const outcome = Object.entries(verify.env).find(
      ([, value]) => value === `\${{ steps.${id}.outcome }}`,
    );
    assert.ok(outcome, `${id}'s outcome reaches the verify step`);
    assert.match(
      verify.run,
      new RegExp(`=\\$${escapeRegExp(outcome[0])}"`),
      `${id}'s outcome is checked, not just passed in`,
    );
  }
});

test('changed public npm versions are checked against the registry before merge', () => {
  const supportJob = ciJob('quality-support');
  assert.equal(
    getStep(supportJob, { uses: 'actions/checkout' }).with['fetch-depth'],
    0,
  );
  const check = getStep(supportJob, { id: 'npm_versions' });
  assert.equal(check['continue-on-error'], true);
  assert.equal(check.env.BASE_SHA, '${{ github.event.pull_request.base.sha }}');
  assert.match(
    check.run,
    /if \[\[ "\$GITHUB_EVENT_NAME" != "pull_request" \]\]; then[\s\S]*?node scripts\/release\/check-npm-version-collisions\.mjs --base "\$BASE_SHA"/,
  );
});

test('stable app versions deploy to their Netlify production sites', () => {
  const detectJob = ciJob('apps-release-detect');
  for (const [app, siteSecret] of [
    ['architect', 'ARCHITECT'],
    ['background-creator', 'BACKGROUND_CREATOR'],
    ['interviewer', 'INTERVIEWER'],
  ]) {
    const detect = getStep(detectJob, (step) => {
      return step.env?.PKG_JSON === `apps/${app}/package.json`;
    });
    assert.equal(detect.env.RELEASE_CHANNEL, 'stable-tagged');
    assert.equal(detect.run, 'bash .github/scripts/detect-app-release.sh');

    const releaseJob = ciJob(`apps-release-${app}`);
    assert.match(
      getStep(releaseJob, { run: /netlify-cli@\d+ deploy/ }).run,
      new RegExp(
        `netlify-cli@\\d+ deploy --no-build --prod[\\s\\S]*?--site="\\$\\{\\{ secrets\\.NETLIFY_SITE_ID_${siteSecret} \\}\\}"`,
      ),
    );
    const release = getStep(releaseJob, {
      uses: 'softprops/action-gh-release',
    });
    assert.equal(release.with.prerelease, false);
    assert.equal(release.with.make_latest, 'true');
    assert.equal(
      releaseJob.concurrency.group,
      `apps-release-@codaco/${app}`,
      `${app} releases must serialize across versions`,
    );
    assert.equal(
      getStep(releaseJob, { uses: 'actions/checkout' }).with['fetch-depth'],
      0,
    );
    const guard = getStep(releaseJob, { id: 'guard' });
    assert.equal(guard.run, 'bash .github/scripts/app-release-guard.sh');
    assert.ok(
      stepIndex(releaseJob, { id: 'guard' }) <
        stepIndex(releaseJob, { run: /netlify-cli@\d+ deploy/ }),
      `${app} is guarded before it deploys`,
    );
    const notes = getStep(releaseJob, {
      run: /scripts\/release\/release-notes\.mjs/,
    });
    assert.match(notes.run, /--since "\$SINCE"/);
    assert.equal(notes.env.SINCE, '${{ steps.guard.outputs.newest }}');
  }
});

// Architect 9 bundles Architect 8 at /v8/ from a tarball attached to the 8.x
// release (apps/architect/RELEASING.md, "Sub-path dist tarball").
test('Architect 8.x releases in either lane chain the sub-path dist after the release', () => {
  const architect = ciJob('apps-release-architect');
  assert.equal(
    architect.outputs.released,
    "${{ steps.guard.outputs.skip != 'true' }}",
  );
  assert.equal(
    architect.outputs.tag,
    '@codaco/architect@${{ needs.apps-release-detect.outputs.architect_version }}',
  );
  // The tag is created at the commit built and deployed, not at whatever
  // main's tip is when the release is published.
  assert.equal(architect.outputs.sha, '${{ github.sha }}');
  const architectRelease = getStep(architect, {
    uses: 'softprops/action-gh-release',
  });
  assert.equal(architectRelease.with.target_commitish, '${{ github.sha }}');

  const chained = ciJob('apps-release-architect-subpath-dist');
  assert.deepEqual(needsOf(chained), [
    'apps-release-detect',
    'apps-release-architect',
  ]);
  assert.match(
    chained.if,
    /needs\.apps-release-architect\.outputs\.released == 'true'/,
  );
  assert.match(
    chained.if,
    /startsWith\(needs\.apps-release-detect\.outputs\.architect_version, '8\.'\)/,
  );
  assert.equal(chained.uses, './.github/workflows/app-subpath-dist.yml');
  assert.deepEqual(chained.permissions, { contents: 'write' });
  assert.deepEqual(chained.with, {
    app: 'architect',
    tag: '${{ needs.apps-release-architect.outputs.tag }}',
    expected_sha: '${{ needs.apps-release-architect.outputs.sha }}',
  });
  // A dist failure must not fail the release job it follows.
  assert.doesNotMatch(JSON.stringify(raw(architect).steps), /subpath-dist/);

  const hotfix = readWorkflow('hotfix-release.yml');
  assert.equal(
    getJob(hotfix, 'hotfix-release').outputs.tag,
    '${{ steps.version.outputs.tag }}',
  );
  const hotfixDist = getJob(hotfix, 'architect-subpath-dist');
  assert.deepEqual(needsOf(hotfixDist), ['hotfix-release']);
  assert.match(hotfixDist.if, /inputs\.app == 'architect'/);
  assert.match(
    hotfixDist.if,
    /startsWith\(needs\.hotfix-release\.outputs\.version, '8\.'\)/,
  );
  assert.equal(hotfixDist.uses, './.github/workflows/app-subpath-dist.yml');
  assert.deepEqual(hotfixDist.permissions, { contents: 'write' });
  assert.deepEqual(hotfixDist.with, {
    app: 'architect',
    tag: '${{ needs.hotfix-release.outputs.tag }}',
    expected_sha: '${{ needs.hotfix-release.outputs.sha }}',
  });
});

// Architect 9 bundles Architect 8, and Interviewer 9 bundles Interviewer 8, at
// /v8/ from a tarball attached to the 8.x release ("Sub-path dist tarball" in
// apps/<app>/RELEASING.md). The lane runs after a release has shipped, so it
// must never be able to fail one, replace a pinned tarball, or move the
// repository's latest release.
test('the app sub-path dist lane builds a released tag without a write token', () => {
  const dist = readWorkflow('app-subpath-dist.yml');
  assert.deepEqual(Object.keys(dist.on).toSorted(), [
    'workflow_call',
    'workflow_dispatch',
  ]);
  assert.deepEqual(dist.on.workflow_dispatch.inputs.app.options, [
    'architect',
    'interviewer',
  ]);
  assert.equal(dist.on.workflow_call.inputs.app.required, true);
  assert.equal(dist.on.workflow_dispatch.inputs.replace.default, false);
  assert.equal(dist.on.workflow_call.inputs.replace.default, false);
  assert.equal(dist.on.workflow_call.inputs.skip_ineligible.default, true);
  assert.equal(dist.on.workflow_dispatch.inputs.skip_ineligible, undefined);
  assert.equal(dist.on.workflow_call.secrets, undefined);
  assert.deepEqual(dist.permissions, { contents: 'read' });
  // A chained run names the commit its lane released; the tag must point at
  // it, or the tarball would ship a later commit's tree under that version.
  assert.equal(dist.on.workflow_call.inputs.expected_sha.default, '');
  assert.equal(dist.on.workflow_dispatch.inputs.expected_sha, undefined);

  const resolve = getJob(dist, 'resolve');
  const build = getJob(dist, 'build');
  const publish = getJob(dist, 'publish');
  assert.match(
    stepNamed(resolve, 'Validate the dispatch').run,
    /"\$DISPATCH_REF" != 'refs\/heads\/main'/,
  );
  // A called workflow's app is a free string: it is checked against the two
  // apps before it names anything, and reaches the shell only through env.
  const validate = getStep(resolve, { id: 'app' });
  assert.equal(validate.env.APP, '${{ inputs.app }}');
  assert.match(validate.run, /architect\) label=Architect ;;/);
  assert.match(validate.run, /interviewer\) label=Interviewer ;;/);
  assert.match(validate.run, /\*\)\n\s+echo "::error::/);
  assert.ok(
    stepIndex(resolve, { id: 'app' }) < stepIndex(resolve, { id: 'guard' }),
  );
  assert.doesNotMatch(
    everyRun(resolve),
    /\$\{\{\s*inputs\.app\s*\}\}/,
    'the app never reaches a script by interpolation',
  );
  const guard = getStep(resolve, { id: 'guard' });
  assert.equal(guard.run, 'bash .github/scripts/release-line-tag-guard.sh');
  assert.equal(guard.env.APP, '${{ inputs.app }}');
  assert.equal(guard.env.FORCE, 'false');
  // Major-generic: /vN/ and <app>-vN-dist.tgz from the tag's own major.
  const eligible = getStep(resolve, { id: 'eligible' });
  assert.match(eligible.run, /echo "base=\/v\$\{MAJOR\}\/"/);
  assert.match(eligible.run, /echo "asset=\$\{APP\}-v\$\{MAJOR\}-dist\.tgz"/);
  // Eligible only when the tag's build reads the app's base-path variable.
  assert.match(eligible.run, /git grep -q -F -e "\$BASE_VARIABLE" "\$TAG" --/);
  const existing = getStep(resolve, { id: 'existing' });
  assert.equal(existing.env.REPLACE, '${{ inputs.replace }}');
  assert.match(existing.run, /if \[\[ "\$REPLACE" == 'true' \]\]; then/);
  assert.match(existing.run, /echo "skip=true"/);
  // Skipped only when both assets are there: a run that stopped between the
  // uploads fails loudly instead of skipping without a checksum or a pin.
  assert.match(
    existing.run,
    /"\$has_tarball" == 'true' && "\$has_checksum" == 'true'/,
  );
  assert.match(existing.run, /has only part of its sub-path dist/);
  const commitCheck = stepNamed(
    resolve,
    'Check the tag names the released commit',
  );
  assert.equal(commitCheck.if, "inputs.expected_sha != ''");
  assert.equal(commitCheck.env.TAGGED, '${{ steps.guard.outputs.sha }}');
  assert.equal(commitCheck.env.EXPECTED, '${{ inputs.expected_sha }}');
  assert.match(
    commitCheck.run,
    /if \[\[ "\$TAGGED" != "\$EXPECTED" \]\]; then/,
  );
  assert.match(commitCheck.run, /exit 1/);
  assert.ok(
    indexNamed(resolve, 'Resolve and guard tag') <
      indexNamed(resolve, 'Check the tag names the released commit'),
  );

  assert.deepEqual(build.permissions, { contents: 'read' });
  assert.match(build.if, /needs\.resolve\.outputs\.eligible == 'true'/);
  assert.match(build.if, /needs\.resolve\.outputs\.skip != 'true'/);
  const buildStep = stepNamed(build, 'Build the app under its sub-path');
  assert.equal(buildStep.env.BASE, '${{ needs.resolve.outputs.base }}');
  assert.equal(
    buildStep.env.BASE_VARIABLE,
    '${{ needs.resolve.outputs.base_variable }}',
  );
  // Not through turbo: a cached root-mode dist must never be labelled as the
  // sub-path one.
  assert.equal(
    buildStep.run,
    'env "${BASE_VARIABLE}=${BASE}" pnpm --filter "@codaco/${APP}" build',
  );
  const buildSource = JSON.stringify(raw(build));
  assert.doesNotMatch(buildSource, /secrets\.|GH_TOKEN|github\.token/);
  assert.doesNotMatch(buildSource, /POSTHOG/);
  const pack = getStep(build, { id: 'pack' });
  assert.match(
    pack.run,
    /node \.dist-tooling\/scripts\/release\/package-app-subpath-dist\.mjs \\\n\s+--app "\$APP"/,
  );
  assert.ok(
    indexNamed(build, 'Build the app under its sub-path') <
      stepIndex(build, { id: 'pack' }),
  );
  // The packer imports the shared base-path helper.
  const tooling = stepNamed(build, 'Check out the packing tooling');
  assert.match(tooling.with['sparse-checkout'], /^scripts\/buildtime$/m);
  // Only Architect's sub-path tarball carries a build-info stamp;
  // Interviewer's sub-path build writes its own dist-info.json.
  const stamp = stepNamed(build, 'Stamp the built commit');
  assert.equal(stamp.if, "inputs.app == 'architect'");
  assert.match(
    stamp.run,
    /node \.dist-tooling\/scripts\/release\/write-build-info\.mjs/,
  );

  assert.deepEqual(publish.permissions, { contents: 'write' });
  assert.ok(
    !publish.steps.some((step) => step.uses?.startsWith('actions/checkout@')),
    'publish never checks out code',
  );
  assert.match(
    stepNamed(publish, 'Verify the downloaded tarball').run,
    /sha256sum -c "\$\{ASSET\}\.sha256"/,
  );
  const upload = getStep(publish, { id: 'upload' });
  assert.equal(upload.env.REPLACE, '${{ inputs.replace }}');
  assert.match(upload.run, /if \[\[ "\$REPLACE" != 'true' \]\]; then/);
  assert.match(upload.run, /https:\/\/uploads\.github\.com\/repos\//);
  assert.match(
    stepNamed(publish, 'Verify the uploaded tarball').run,
    /"sha256:\$\{SHA256\}"/,
  );
  const summary = stepNamed(publish, 'Summary');
  assert.match(summary.run, /GITHUB_STEP_SUMMARY/);
  assert.match(summary.run, /apps\/\$\{APP\}\/legacy-\$\{APP\}\.json/);
  // One upload per app and major line at a time.
  assert.equal(
    publish.concurrency.group,
    '${{ inputs.app }}-subpath-dist-v${{ needs.resolve.outputs.major }}',
  );

  const definition = JSON.stringify(raw(dist));
  assert.doesNotMatch(definition, /netlify/i);
  assert.doesNotMatch(definition, /softprops\/action-gh-release/);
});

test('Interviewer 8.x releases in either lane chain the sub-path dist after the release', () => {
  const interviewer = ciJob('apps-release-interviewer');
  assert.equal(
    interviewer.outputs.released,
    "${{ steps.guard.outputs.skip != 'true' }}",
  );
  assert.equal(
    interviewer.outputs.tag,
    '@codaco/interviewer@${{ needs.apps-release-detect.outputs.interviewer_version }}',
  );
  // The tag is created at the commit built and deployed, not at whatever
  // main's tip is when the release is published.
  assert.equal(interviewer.outputs.sha, '${{ github.sha }}');
  const interviewerRelease = getStep(interviewer, {
    uses: 'softprops/action-gh-release',
  });
  assert.equal(interviewerRelease.with.target_commitish, '${{ github.sha }}');

  const chained = ciJob('apps-release-interviewer-subpath-dist');
  assert.deepEqual(needsOf(chained), [
    'apps-release-detect',
    'apps-release-interviewer',
  ]);
  assert.match(
    chained.if,
    /needs\.apps-release-interviewer\.outputs\.released == 'true'/,
  );
  assert.match(
    chained.if,
    /startsWith\(needs\.apps-release-detect\.outputs\.interviewer_version, '8\.'\)/,
  );
  assert.equal(chained.uses, './.github/workflows/app-subpath-dist.yml');
  assert.deepEqual(chained.permissions, { contents: 'write' });
  assert.deepEqual(chained.with, {
    app: 'interviewer',
    tag: '${{ needs.apps-release-interviewer.outputs.tag }}',
    expected_sha: '${{ needs.apps-release-interviewer.outputs.sha }}',
  });
  // A dist failure must not fail the release job it follows.
  assert.doesNotMatch(JSON.stringify(raw(interviewer).steps), /subpath-dist/);

  const hotfix = readWorkflow('hotfix-release.yml');
  const hotfixDist = getJob(hotfix, 'interviewer-subpath-dist');
  assert.deepEqual(needsOf(hotfixDist), ['hotfix-release']);
  assert.match(hotfixDist.if, /inputs\.app == 'interviewer'/);
  assert.match(
    hotfixDist.if,
    /startsWith\(needs\.hotfix-release\.outputs\.version, '8\.'\)/,
  );
  assert.equal(hotfixDist.uses, './.github/workflows/app-subpath-dist.yml');
  assert.deepEqual(hotfixDist.permissions, { contents: 'write' });
  assert.deepEqual(hotfixDist.with, {
    app: 'interviewer',
    tag: '${{ needs.hotfix-release.outputs.tag }}',
    expected_sha: '${{ needs.hotfix-release.outputs.sha }}',
  });
});

// Older-line patches for Architect and Interviewer once 9.x is production:
// tag, release and tarball, never a deploy, never "Latest", and never holding
// the normal lane's lock.
test('the app maintenance lane releases an older line without deploying it', () => {
  const maintenance = readWorkflow('app-maintenance-release.yml');
  const definition = JSON.stringify(raw(maintenance));
  assert.deepEqual(Object.keys(maintenance.on), ['workflow_dispatch']);
  const apps = maintenance.on.workflow_dispatch.inputs.app.options;
  assert.deepEqual(apps, ['interviewer', 'architect']);
  assert.deepEqual(maintenance.permissions, { contents: 'read' });
  assert.equal(
    maintenance.concurrency.group,
    '${{ inputs.app }}-maintenance-release',
  );
  assert.doesNotMatch(definition, /netlify/i);
  assert.doesNotMatch(definition, /secrets\./);
  assert.notEqual(
    maintenance.concurrency.group,
    'apps-release-@codaco/${{ inputs.app }}',
  );

  const verify = getJob(maintenance, 'verify');
  const release = getJob(maintenance, 'release');
  // Each app releases through its own reviewer-gated environment.
  assert.equal(release.environment, '${{ inputs.app }}-maintenance-release');

  const dispatch = stepNamed(verify, 'Validate the dispatch');
  assert.match(dispatch.run, /"\$DISPATCH_REF" != 'refs\/heads\/main'/);
  assert.match(
    dispatch.run,
    /if \[\[ "\$APP" != 'interviewer' && "\$APP" != 'architect' \]\]; then/,
  );
  assert.match(dispatch.run, /"\$SOURCE_REF" != "maintenance\/\$\{APP\}-"\*/);
  assert.match(
    getStep(verify, { id: 'commit' }).run,
    /git merge-base --is-ancestor "\$sha" origin\/main/,
  );
  assert.deepEqual(verify.permissions, { contents: 'read' });
  assert.equal(verify.env.SCOPE, 'line');
  assert.equal(verify.env.APP, '${{ inputs.app }}');
  assert.doesNotMatch(
    everyRun(verify, release),
    /\$\{\{\s*inputs\./,
    'inputs reach the scripts only through env',
  );
  assert.equal(
    getStep(verify, { id: 'version' }).run,
    'node .maintenance-lane/.github/scripts/resolve-hotfix-release.mjs',
  );
  assert.match(
    stepNamed(verify, 'Verify the app and its workspace dependencies').run,
    /pnpm exec turbo run typecheck test --filter="@codaco\/\$\{APP\}\.\.\."/,
  );
  assert.match(
    stepNamed(verify, 'Verify the sub-path build').run,
    /env "\$\{APP\^\^\}_BASE_PATH=\/v\$\{VERSION%%\.\*\}\/" pnpm --filter "@codaco\/\$\{APP\}" build/,
  );

  assert.deepEqual(release.permissions, { contents: 'write' });
  assert.equal(release.env.SCOPE, 'line');
  assert.equal(release.env.APP, '${{ inputs.app }}');
  assert.doesNotMatch(everyRun(release), /pnpm/);
  const releaseCheckout = getStep(
    release,
    (step) =>
      step.uses?.startsWith('actions/checkout@') &&
      step.with?.path === undefined,
  );
  assert.equal(release.steps[0], releaseCheckout);
  assert.equal(releaseCheckout.with.ref, '${{ needs.verify.outputs.sha }}');
  const recheck = getStep(release, { id: 'version' });
  assert.match(recheck.run, /git fetch --tags --force origin/);
  assert.match(
    recheck.run,
    /node \.maintenance-lane\/\.github\/scripts\/resolve-hotfix-release\.mjs/,
  );
  assert.match(
    getStep(release, { id: 'claim' }).run,
    /gh api -X POST "repos\/\$GITHUB_REPOSITORY\/git\/refs"/,
  );
  const notes = stepNamed(release, 'Release notes');
  assert.match(notes.run, /--since "\$SINCE"/);
  assert.match(notes.run, /--pkg "\$\{PACKAGE\}"/);
  const create = stepNamed(release, 'Create the release');
  assert.match(create.uses, /^softprops\/action-gh-release@[0-9a-f]{40}$/);
  assert.equal(create.with.make_latest, 'false');
  assert.equal(create.with.prerelease, false);
  assert.equal(create.with.target_commitish, '${{ needs.verify.outputs.sha }}');
  assert.equal(
    create.with.name,
    '${{ steps.version.outputs.label }} ${{ steps.version.outputs.version }}',
  );
  // Nothing that can fail runs between the claim and the release, and a claim
  // left without a release is given up so a re-run is not blocked by its tag.
  assert.ok(
    indexNamed(release, 'Release notes') <
      indexNamed(release, 'Claim the release tag'),
    'release notes are written before the tag is claimed',
  );
  assert.equal(
    indexNamed(release, 'Create the release'),
    indexNamed(release, 'Claim the release tag') + 1,
  );
  const rollback = stepNamed(
    release,
    'Release the claimed tag if no release was created',
  );
  assert.match(rollback.if, /always\(\)/);
  assert.match(rollback.if, /steps\.claim\.outcome == 'success'/);
  assert.match(rollback.if, /steps\.create\.outcome != 'success'/);
  assert.match(rollback.run, /gh release view "\$TAG"/);
  assert.match(
    rollback.run,
    /gh api -X DELETE "repos\/\$GITHUB_REPOSITORY\/git\/refs\/tags\/\$TAG"/,
  );

  // A re-run after a run that died between the claim and the release (so
  // the rollback never ran) gives up only a lightweight tag on the verified
  // commit with no release, before the re-check would refuse the version.
  const reclaimName =
    'Give up a claim an earlier attempt left without a release';
  const reclaim = stepNamed(release, reclaimName);
  assert.ok(
    indexNamed(release, reclaimName) <
      indexNamed(release, 'Re-check the version against the newest releases'),
  );
  assert.equal(reclaim.env.SHA, '${{ needs.verify.outputs.sha }}');
  assert.equal(
    reclaim.env.TAG,
    '@codaco/${{ inputs.app }}@${{ needs.verify.outputs.version }}',
  );
  assert.match(reclaim.run, /'\.object\.type' <<<"\$ref"\)" != 'commit'/);
  assert.match(reclaim.run, /'\.object\.sha' <<<"\$ref"\)" != "\$SHA"/);
  assert.match(reclaim.run, /"\$status" != HTTP\/\*' 404'\*/);
  assert.match(
    reclaim.run,
    /gh api -X DELETE "repos\/\$GITHUB_REPOSITORY\/git\/refs\/tags\/\$TAG"/,
  );
  // The checkout already fetched the tag, and the re-check's fetch would not
  // prune it.
  assert.match(reclaim.run, /git tag -d "\$TAG"/);

  // A fresh dispatch meets the same claim in verify, whose resolver would
  // refuse the version before the release job could give the claim up. It
  // sets aside only its own checkout's copy, under the same conditions.
  const setAsideName =
    'Set aside a claim an earlier attempt left without a release';
  const setAside = stepNamed(verify, setAsideName);
  assert.ok(
    indexNamed(verify, setAsideName) <
      indexNamed(verify, 'Resolve and validate the version'),
  );
  assert.equal(setAside.env.SHA, '${{ steps.commit.outputs.sha }}');
  assert.match(
    setAside.run,
    /git cat-file -t "refs\/tags\/\$tag"\)" != 'commit'/,
  );
  assert.match(setAside.run, /git rev-parse "refs\/tags\/\$tag"\)" != "\$SHA"/);
  assert.match(setAside.run, /"\$status" != HTTP\/\*' 404'\*/);
  assert.match(setAside.run, /git tag -d "\$tag"/);
  assert.doesNotMatch(raw(setAside).run, /-X DELETE/);

  // The set-aside reads the app's own package and tag, never Architect's.
  assert.match(setAside.run, /"apps\/\$\{APP\}\/package\.json"/);
  assert.match(setAside.run, /tag="@codaco\/\$\{APP\}@\$version"/);
  assert.doesNotMatch(raw(setAside).run, /architect/);

  const dist = getJob(maintenance, 'subpath-dist');
  assert.deepEqual(needsOf(dist), ['verify', 'release']);
  assert.equal(dist.uses, './.github/workflows/app-subpath-dist.yml');
  assert.deepEqual(dist.with, {
    app: '${{ inputs.app }}',
    tag: '${{ needs.release.outputs.tag }}',
    expected_sha: '${{ needs.verify.outputs.sha }}',
    skip_ineligible: false,
  });
});

test('Fresco mirrors under the same release guard as the Netlify lanes', () => {
  const detect = getStep(ciJob('apps-release-detect'), { id: 'fresco' });
  assert.deepEqual(detect.env, {
    PKG_JSON: 'apps/fresco/package.json',
    PKG_NAME: 'fresco',
    RELEASE_CHANNEL: 'stable-tagged',
  });
  assert.equal(detect.run, 'bash .github/scripts/detect-app-release.sh');

  const fresco = ciJob('apps-release-fresco');
  assert.deepEqual(needsOf(fresco), ['apps-release-detect', 'release']);
  // One group per app, not per version: two concurrent main runs holding
  // different untagged versions must serialise over check → mirror → tag, or
  // an older version can be pushed on top of the newer one (2026-09-02).
  assert.equal(
    fresco.concurrency.group,
    'apps-release-fresco',
    'Fresco releases must serialise across versions',
  );
  assert.equal(
    getStep(fresco, { uses: 'actions/checkout' }).with['fetch-depth'],
    0,
  );
  const guard = getStep(fresco, { id: 'guard' });
  assert.deepEqual(guard.env, {
    PKG_NAME: 'fresco',
    VERSION: '${{ needs.apps-release-detect.outputs.fresco_version }}',
  });
  assert.equal(guard.run, 'bash .github/scripts/app-release-guard.sh');
  assert.doesNotMatch(
    everyRun(fresco),
    /git rev-parse -q --verify "refs\/tags\/\$TAG"/,
    'the inline tag-only check is gone',
  );
  const notes = stepNamed(fresco, 'fresco release notes');
  assert.equal(notes.env.SINCE, '${{ steps.guard.outputs.newest }}');
  assert.match(notes.run, /--since "\$SINCE"/);
  const guardIndex = stepIndex(fresco, { id: 'guard' });
  for (const step of [
    'Mirror source to the Fresco repository',
    'fresco release notes',
    'Create the release on the Fresco repository',
    'Tag the released version in this repository',
  ]) {
    assert.equal(
      stepNamed(fresco, step).if,
      "steps.guard.outputs.skip != 'true'",
      `${step} is gated on the guard`,
    );
    assert.ok(
      guardIndex < indexNamed(fresco, step),
      `${step} follows the guard`,
    );
  }
});

// PART-LOCAL HELPERS

// The superseded-push guard step, exactly as the release-side jobs run it.
function assertTipGuard(job) {
  const tip = getStep(job, { id: 'tip' });
  assert.equal(tip.name, "Confirm this run still describes main's tip");
  assert.deepEqual(tip.env, {
    EXPECTED_SHA: '${{ github.sha }}',
    REF: '${{ github.ref }}',
  });
  assert.equal(tip.run, 'bash .github/scripts/superseded-push-guard.sh');
  return stepIndex(job, { id: 'tip' });
}

test('Studio releases publish signed, attested images under the app-lane guard', () => {
  const detect = ciJob('apps-release-detect');
  assert.equal(
    getStep(detect, { id: 'studio' }).run,
    'node scripts/release/studio-release.mjs plan',
  );
  assert.equal(
    detect.outputs.studio_released,
    '${{ steps.studio.outputs.released }}',
  );

  const studio = ciJob('apps-release-studio');
  assert.deepEqual(studio.needs, ['apps-release-detect', 'studio-upgrade']);
  assert.equal(
    studio.if,
    "needs.apps-release-detect.outputs.studio_released == 'true'",
  );
  assert.deepEqual(studio.concurrency, {
    'group': 'apps-release-studio',
    'cancel-in-progress': false,
  });
  assert.deepEqual(studio.permissions, {
    'contents': 'write',
    'packages': 'write',
    'id-token': 'write',
  });
  assert.equal(
    studio.env.CERT_IDENTITY,
    'https://github.com/${{ github.workflow_ref }}',
  );
  assert.equal(
    studio.env.CERT_ISSUER,
    'https://token.actions.githubusercontent.com',
  );

  assert.equal(
    liveSteps(studio).length,
    studio.steps.length,
    'no Studio release step is switched off',
  );
  const [checkout, guard, ...rest] = studio.steps;
  assert.match(checkout.uses, /^actions\/checkout@/);
  assert.equal(checkout.with['fetch-depth'], 0);
  assert.equal(checkout.with['fetch-tags'], true);
  assert.equal(guard.id, 'guard');
  assert.equal(guard.env.PKG_NAME, 'studio');
  assert.equal(guard.run, 'bash .github/scripts/app-release-guard.sh');
  for (const step of rest) {
    assert.equal(
      step.if,
      "steps.guard.outputs.skip != 'true'",
      `${step.name ?? step.uses} is gated on the guard`,
    );
  }

  for (const [id, target] of [
    ['api', 'studio-api'],
    ['web', 'studio-web'],
  ]) {
    const build = getStep(studio, { id });
    assert.match(build.uses, /^docker\/build-push-action@[0-9a-f]{40}$/);
    assert.equal(build.with.file, 'apps/studio/Dockerfile');
    assert.equal(build.with.target, target);
    assert.equal(build.with.platforms, 'linux/amd64,linux/arm64');
    assert.equal(build.with.push, true);
    assert.equal(
      build.with.tags.trim(),
      `ghcr.io/complexdatacollective/${target}:\${{ env.VERSION }}\nghcr.io/complexdatacollective/${target}:\${{ github.sha }}`,
    );
    assert.match(
      build.with.secrets,
      /posthog_personal_api_key=\$\{\{ secrets\.POSTHOG_PERSONAL_API_KEY \}\}\nposthog_project_id=\$\{\{ secrets\.POSTHOG_PROJECT_ID \}\}/,
    );
    assert.equal(build.with['build-args'], 'SOURCE_MAPS_TARGET=codaco-studio');
  }

  const order = [
    'Generate the SBOMs',
    'Sign the images and attest their SBOMs',
    'Verify the signatures and attestations',
    'Confirm both images pull without credentials',
    'Write the release notes and studio-release.json',
    'Create the studio@${{ env.VERSION }} release',
    'Point latest at this release',
  ].map((name) => stepIndex(studio, { name }));
  assert.deepEqual(
    order,
    order.toSorted((a, b) => a - b),
    'nothing is tagged before the images verify and pull anonymously, and latest moves only once the release is published',
  );

  const step = (name) => getStep(studio, { name }).run;
  assert.match(
    step('Sign the images and attest their SBOMs'),
    /cosign sign --yes --recursive "\$API_REF" "\$WEB_REF"/,
  );
  assert.equal(
    studio.env.SBOM_REFERENCE_TYPE,
    'https://networkcanvas.com/studio/sbom-reference/v1',
  );
  for (const image of ['api', 'web']) {
    assert.match(
      step('Sign the images and attest their SBOMs'),
      new RegExp(
        `cosign attest --yes --type "\\$SBOM_REFERENCE_TYPE" --predicate "\\$RUNNER_TEMP/studio-${image}\\.sbom-reference\\.json" "\\$${image.toUpperCase()}_REF"`,
      ),
    );
  }
  assert.doesNotMatch(
    raw(getStep(studio, { name: 'Sign the images and attest their SBOMs' }))
      .run,
    /--predicate "[^"]*\.cdx\.json"/,
    'no SBOM goes to the public transparency log whole',
  );
  assert.match(
    step('Generate the SBOMs'),
    /studio-release\.mjs bundle --out "\$sboms\/web-bundle\.json"/,
  );
  assert.match(
    step('Generate the SBOMs'),
    /--runtime "\$sboms\/web-bundle\.json" --out "\$RUNNER_TEMP\/studio-web\.cdx\.json"/,
  );
  const verify = step('Verify the signatures and attestations');
  assert.match(
    verify,
    /cosign verify --certificate-identity "\$CERT_IDENTITY" --certificate-oidc-issuer "\$CERT_ISSUER" "\$ref"/,
  );
  assert.match(
    verify,
    /cosign verify-attestation --type "\$SBOM_REFERENCE_TYPE" --certificate-identity "\$CERT_IDENTITY" --certificate-oidc-issuer "\$CERT_ISSUER" "\$ref"/,
  );
  assert.match(verify, /sha256sum "\$sbom"/);
  const release = step('Create the studio@${{ env.VERSION }} release');
  assert.match(release, /gh release create "studio@\$VERSION"/);
  const draft = release.search(
    /select\(\.draft and \.tag_name == \\"studio@\$VERSION\\"\)[\s\S]*gh api -X DELETE "repos\/\$GITHUB_REPOSITORY\/releases\/\$draft"/,
  );
  assert.ok(
    draft !== -1 && draft < release.indexOf('gh release create'),
    'a retry deletes the draft a failed run left before creating the release again',
  );
  assert.match(release, /--target "\$GITHUB_SHA"/);
  assert.match(release, /--latest=false/);
  for (const asset of [
    'studio-release.json',
    'studio-api.cdx.json',
    'studio-web.cdx.json',
  ]) {
    assert.match(
      release,
      new RegExp(`"\\$RUNNER_TEMP/${escapeRegExp(asset)}"`),
    );
  }

  // On every pull request, so the Studio release PR is refused before it
  // merges rather than when the upgrade lane runs on main.
  const support = ciJob('quality-support');
  const check = stepIndex(support, {
    run: 'node scripts/release/studio-release.mjs check',
  });
  const setup = stepIndex(support, {
    uses: './.github/actions/turbo-ci-setup',
  });
  assert.ok(
    check > setup,
    'every pull request checks that studio-api moves with every Studio package, once Node is set up',
  );
  assert.equal(support.steps[check].id, 'studio-release');
  const verdict = getStep(support, { name: 'Verify support checks passed' });
  assert.equal(
    verdict.env.STUDIO_RELEASE_OUTCOME,
    '${{ steps.studio-release.outcome }}',
  );
  assert.match(
    verdict.run,
    /"studio-release=\$STUDIO_RELEASE_OUTCOME"/,
    'quality-support fails when the check fails',
  );
  // Full history: the check compares with the newest release tag.
  assert.equal(
    getStep(support, { uses: 'actions/checkout' }).with['fetch-depth'],
    0,
  );
});

test('release-side jobs stop once their main commit has been superseded', () => {
  const releaseJob = ciJob('release');
  const tipIndex = assertTipGuard(releaseJob);
  const actionIndex = stepIndex(releaseJob, { uses: 'changesets/action' });
  assert.ok(
    tipIndex < actionIndex,
    'the guard runs before changesets/action reads the tree',
  );
  // Last thing before the action: the build takes minutes, and a check made
  // any earlier would leave that whole window open again.
  const action = releaseJob.steps[actionIndex];
  assert.equal(
    actionIndex,
    tipIndex + 1,
    'changesets/action is the next step after the guard',
  );
  assert.equal(action.id, 'changesets');
  assert.equal(
    action.if,
    "steps.tip.outputs.current == 'true'",
    'changesets/action is gated on the guard',
  );

  // The check cannot lock main, so a push can land between it and the
  // action. Serialising the job makes the run for that push act last, and
  // that run — holding the tip with nothing left to version — closes any
  // release PR the superseded run left behind.
  assert.deepEqual(
    releaseJob.concurrency,
    { 'group': 'release-main', 'cancel-in-progress': false },
    'release jobs serialise without cancelling a publish mid-flight',
  );
  const cleanupName = 'Close a release PR the tip no longer needs';
  const cleanupIndex = stepIndex(releaseJob, { name: cleanupName });
  assert.ok(cleanupIndex > actionIndex, 'cleanup runs after the action');
  const cleanup = releaseJob.steps[cleanupIndex];
  assert.equal(
    cleanup.if,
    "steps.tip.outputs.current == 'true' && steps.changesets.outputs['has-changesets'] == 'false'",
  );
  assert.match(
    cleanup.run,
    /gh pr list --repo "\$GITHUB_REPOSITORY" --state open \\\n\s+--base main --head changeset-release\/main --json number/,
  );
  assert.match(cleanup.run, /gh pr close "\$number"/);

  const productReleaseJob = ciJob('product-release-pr');
  const productTip = assertTipGuard(productReleaseJob);
  for (const name of [
    'Compute ${{ matrix.product }} version bump',
    'Open/update the ${{ matrix.product }} release PR',
  ]) {
    assert.equal(
      getStep(productReleaseJob, { name }).if,
      "steps.tip.outputs.current == 'true'",
    );
    assert.ok(
      stepIndex(productReleaseJob, { name }) > productTip,
      `${name} runs after the guard`,
    );
  }

  // The app lanes deliberately do not use it: app-release-guard.sh already
  // makes a superseded tree harmless, and skipping on supersession would
  // defer every release that lands during a burst of merges.
  for (const app of [
    'architect',
    'interviewer',
    'background-creator',
    'fresco',
    'studio',
  ]) {
    assert.doesNotMatch(
      JSON.stringify(raw(ciJob(`apps-release-${app}`))),
      /superseded-push-guard/,
    );
  }
});

test('a stale Version Packages PR cannot merge', () => {
  const freshness = ciJob('version-packages-freshness');
  const condition = freshness.if;
  // Every merge-group commit — it is the merged tree that matters, and the
  // queue entry does not say which branch it merges — plus the release PR's
  // own runs for early signal.
  assert.match(condition, /github\.event_name == 'merge_group'/);
  assert.match(
    condition,
    /github\.event_name == 'pull_request'\s+&& github\.base_ref == 'main'\s+&& github\.head_ref == 'changeset-release\/main'/,
  );
  // The queue batches entries, each built on the ones ahead of it, and a
  // group's ref names only its last PR — membership must come from ancestry
  // of the open release PR's head, never from the ref suffix.
  const resolve = getStep(freshness, { id: 'head' });
  assert.match(
    resolve.run,
    /pulls\?state=open&base=main&head=\$\{GITHUB_REPOSITORY_OWNER\}:changeset-release\/main"[^\n]*\n\s+--jq '\.\[0\]\.head\.sha \/\/ empty'/,
  );
  assert.match(
    resolve.run,
    /compare\/\$\{vp_head\}\.\.\.\$\{GITHUB_SHA\}"[^\n]*\n\s+--jq \.status/,
  );
  assert.match(resolve.run, /ahead \| identical\) release_pr=true/);
  assert.doesNotMatch(JSON.stringify(raw(freshness)), /merge_group\.head_ref/);
  assert.doesNotMatch(JSON.stringify(raw(freshness)), /head_commit\.message/);
  // A judgement that cannot be made must fail the entry, not wave it through:
  // nothing in the resolving step may swallow a failed API call.
  assert.doesNotMatch(raw(resolve).run, /\|\| true|2>\/dev\/null|set \+e/);
  assert.equal(resolve['continue-on-error'], undefined);
  const check = getStep(freshness, {
    run: /^node scripts\/release\/check-version-packages-freshness\.mjs\s*$/,
  });
  assert.equal(check.if, "steps.head.outputs.release_pr == 'true'");

  const quality = ciJob('quality');
  assert.ok(needsOf(quality).includes('version-packages-freshness'));
  const gate = getStep(quality, { name: 'Verify all quality checks passed' });
  assert.equal(
    gate.env.FRESHNESS_RESULT,
    '${{ needs.version-packages-freshness.result }}',
  );
  const verdictIndex = gate.run.indexOf(
    'if [[ "$FRESHNESS_RESULT" != "success" && "$FRESHNESS_RESULT" != "skipped" ]]; then',
  );
  const mergeGroupExit = gate.run.indexOf(
    'if [[ "$EVENT_NAME" == "merge_group" ]]; then',
  );
  assert.ok(verdictIndex !== -1, 'quality consults the freshness verdict');
  assert.ok(
    mergeGroupExit !== -1 && verdictIndex < mergeGroupExit,
    'the verdict is consulted before the merge-group early exit',
  );
});

test('closed snapshot PRs cannot leave permanent pending state', () => {
  const snapshotJob = getJob(snapshotWorkflow, 'open-snapshot-update');
  const source = getStep(snapshotJob, { id: 'snapshot_source' });
  assert.match(
    source.with.script,
    /state: 'open'[\s\S]*?base: 'main'[\s\S]*?head,/,
  );
  assert.match(
    source.with.script,
    /pull\.head\.repo\?\.full_name === `\$\{context\.repo\.owner\}\/\$\{context\.repo\.repo\}` &&\n\s+pull\.head\.ref === snapshotBranch/,
  );
  const consumer = { if: /steps\.snapshot_source\.outputs\.open == 'true'/ };
  getStep(snapshotJob, consumer);
  assert.ok(
    stepIndex(snapshotJob, consumer) >
      stepIndex(snapshotJob, { id: 'snapshot_source' }),
    'the open verdict is read after it is computed',
  );
});

test('the informational Pages deploy has a bounded failure window', () => {
  const deploy = getStep(ciJob('e2e-report'), {
    name: 'Deploy report to Pages',
  });
  assert.equal(deploy.id, 'deploy');
  assert.equal(typeof deploy.if, 'string');
  assert.notEqual(deploy.if.trim(), '');
  assert.match(deploy.uses, /^actions\/deploy-pages@/);
  assert.equal(deploy['timeout-minutes'], 3);
  assert.equal(deploy['continue-on-error'], true);
});

test('the unified E2E report aggregates every suite job and publishes failures only', () => {
  const reportJob = ciJob('e2e-report');
  const meta = getStep(reportJob, { id: 'meta' });
  const merge = getStep(reportJob, { id: 'merge' });
  for (const name of Object.values(E2E_JOB_NAMES).flat()) {
    assert.ok(needsOf(reportJob).includes(name), `e2e-report needs ${name}`);
    assert.match(
      merge.run,
      new RegExp(`merge_report ${name} `),
      `${name} is mapped in the merge step`,
    );
  }

  // Reports go to Pages only for FAILED jobs, and a green job removes its
  // branch's stale failure report — only the latest run's report is kept.
  assert.match(merge.run, /case "\$result" in\n\s+failure\)/);

  // Review hardening: distinct refs must never share a report directory
  // (lossy tr normalisation collides feature/foo with feature-foo), and the
  // published tree must never be empty (an empty state-branch commit fails
  // and leaves a deleted report live).
  assert.match(
    meta.run,
    /printf '%s' "\$1" \| sha256sum \| cut -c1-8/,
    'the slug carries a digest of the raw ref',
  );
  assert.match(
    merge.run,
    /> merged\/index\.html/,
    'a root marker keeps the published tree non-empty',
  );

  // A failed job's previous report is removed even when this failure died
  // before producing a replacement artifact — the old rm must precede the
  // artifact-existence check.
  const failureCase = merge.run.match(/failure\)([\s\S]*?);;/)?.[1] ?? '';
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
  assert.equal(
    merge.name,
    'Merge failure reports into per-job branch subdirectories',
  );
  assert.equal(
    merge.if,
    "steps.guard.outputs.current == 'true'",
    'the merge step is gated only on the stale-head guard',
  );

  // A transiently failed Pages deploy must be retried: gh-pages-deployed
  // advances only on deploy success, and a mismatch versus gh-pages forces
  // needs_deploy on the next run.
  assert.match(meta.run, /pending_deploy=%s/);
  assert.equal(
    merge.env.PENDING_DEPLOY,
    '${{ steps.meta.outputs.pending_deploy }}',
  );
  assert.match(merge.run, /if \[ "\$PENDING_DEPLOY" = "true" \]; then/);
  const record = getStep(reportJob, { name: 'Record the deployed state' });
  assert.match(
    record.run,
    /gh-pages:refs\/heads\/gh-pages-deployed/,
    'the deployed pointer is recorded from the state branch',
  );
  assert.match(
    record.if,
    /^\$\{\{ steps\.merge\.outputs\.needs_deploy == 'true'\s+&& steps\.deploy\.outcome == 'success' \}\}$/,
    'the deployed pointer advances only when deploy-pages succeeded',
  );

  // A rerun of an outdated head must not rewrite the report site or the
  // sticky comment with obsolete results.
  assert.equal(
    getStep(reportJob, {
      name: 'Confirm this run still describes the PR head',
    }).id,
    'guard',
    'the stale-head guard step exists',
  );

  // Orphan sweep: reports for branches that no longer exist are deleted on
  // every report run, and a failed live-branch listing skips the sweep
  // rather than deleting on doubt.
  assert.match(meta.run, /git ls-remote --heads/);
  assert.match(
    merge.run,
    /if \[ -s "\$RUNNER_TEMP\/live-slugs\.txt" \]; then/,
    'the sweep only runs with a non-empty live-branch listing',
  );
  assert.ok(
    merge.run.indexOf('merge_report architect-e2e-native') <
      merge.run.indexOf('if [ -s "$RUNNER_TEMP/live-slugs.txt" ]'),
    'the sweep runs after merging, so a branch deleted mid-run cannot re-publish its orphan',
  );
  assert.match(
    merge.run,
    /grep -qxF -- /,
    'the slug pattern is terminated so dash-leading slugs cannot parse as grep options',
  );
  assert.match(
    merge.run,
    /success \| skipped\)/,
    'a skipped job also drops its stale report',
  );

  // The status comment is a single sticky comment, updated in place, only
  // ever posted on pull requests, and never rewritten by an obsolete rerun.
  const comment = getStep(reportJob, { name: 'Upsert the E2E status comment' });
  assert.match(comment.with.script, /<!-- network-canvas-e2e-status -->/);
  assert.match(
    comment.if,
    /^\$\{\{ always\(\) && github\.event_name == 'pull_request'\s+&& steps\.guard\.outputs\.current == 'true' \}\}$/,
  );
  assert.match(comment.with.script, /updateComment/);
  assert.match(comment.with.script, /createComment/);

  // The decision matrix comes from the policy job's reasons output.
  assert.equal(comment.env.REASONS, '${{ needs.e2e-policy.outputs.reasons }}');
  const policyJob = ciJob('e2e-policy');
  assert.match(
    getStep(policyJob, { id: 'policy' }).run,
    /reasons=\$\(jq -c '\.reasons \/\/ \{\}'/,
  );
  assert.equal(
    policyJob.outputs.reasons,
    '${{ steps.policy.outputs.reasons }}',
  );
});

test('e2e-policy receives affected-PR and equivalence-reuse inputs', () => {
  const policy = getStep(ciJob('e2e-policy'), { id: 'policy' });
  assert.equal(
    policy.env.BASE_SHA,
    '${{ github.event.pull_request.base.sha }}',
    'policy step receives the PR base as BASE_SHA',
  );
  assert.equal(
    policy.env.HEAD_SHA,
    '${{ github.event.pull_request.head.sha }}',
    'policy step receives the PR tip as HEAD_SHA',
  );
  assert.equal(
    policy.env.HEAD_REPO,
    '${{ github.event.pull_request.head.repo.full_name }}',
    'policy step receives the head repo for the fork guard',
  );
});

// The policy looks its verdict jobs up by exact name, and a miss is silent:
// `validated[key]` just becomes false, disabling reuse without failing
// anything. Bind the map to the workflow so a rename cannot merge half-done.
test('every job the E2E policy names is a real, gated workflow job', () => {
  const quality = ciJob('quality');
  const gate = getStep(quality, { name: 'Verify all quality checks passed' });
  for (const [suite, names] of Object.entries(E2E_JOB_NAMES)) {
    assert.ok(names.length > 0, `${suite} names at least one job`);
    for (const name of names) {
      ciJob(name);
      assert.ok(
        needsOf(quality).includes(name),
        `${name} is in the quality gate's needs list`,
      );
      assert.match(
        gate.run,
        new RegExp(`verify_required_e2e ${name} `),
        `${name} is verified by the quality gate`,
      );
    }
  }
});

// Feature PRs capture Interview's pixels in Chromium alone; the other two
// engines capture on generated release PRs, which always run the lane in full.
test('Interview captures Firefox and WebKit pixels on release PRs only', () => {
  const run = getStep(ciJob('interview-e2e'), { name: 'Run E2E tests' });
  assert.equal(
    run.env.RELEASE_BRANCH,
    "${{ startsWith(github.head_ref, 'changeset-release/') }}",
  );
  assert.match(run.run, /args=\(--project=chromium-visual\)\n/);
  assert.match(
    run.run,
    /if \[\[ "\$RELEASE_BRANCH" == "true" \|\| "\$E2E_BENCHMARK" == "true" \]\]; then\n\s+args\+=\(--project=firefox-visual --project=webkit-visual\)/,
  );
});

// The two lanes are only safe while each stays on its own side of the pixel
// boundary: the native lane must never reach a capture (its baselines were
// rasterised in the pinned image), and must never author one.
test('the native E2E lane cannot touch pixel baselines', () => {
  for (const name of Object.values(E2E_JOB_NAMES).flat()) {
    const body = ciJob(name);
    if (!name.endsWith('-native')) {
      getStep(body, { run: /--grep @visual|--project=chromium-visual/ });
      continue;
    }
    assert.equal(
      body.env?.E2E_PIXEL_LANE,
      'native',
      `${name} arms the capture guard`,
    );
    // The parsed job carries no YAML comments, but its scripts keep theirs: a
    // comment that interpolates an expression is still substituted.
    const commands = JSON.stringify(raw(body));
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

for (const app of ['architect', 'interviewer']) {
  test(`${app} E2E builds disable both animation systems`, () => {
    assert.equal(
      ciJob(`${app}-e2e-native`).env?.VITE_DISABLE_ANIMATIONS,
      'true',
      'the native build disables Motion and Base UI animations',
    );

    const dockerRunner = codeOf(
      readFileSync(
        new URL(`../../apps/${app}/e2e/scripts/run.sh`, import.meta.url),
        'utf8',
      ),
    );
    assert.match(
      dockerRunner,
      /-e VITE_DISABLE_ANIMATIONS=true/,
      'the Docker build disables Motion and Base UI animations',
    );
  });
}

test('release job refuses a first publication on the publish path before changesets/action', () => {
  const releaseJob = ciJob('release');
  const pruneIndex = stepIndex(releaseJob, {
    run: 'node scripts/release/prune-ignored-changesets.mjs',
  });
  const checkIndex = stepIndex(releaseJob, {
    run: 'node scripts/release/check-first-publications.mjs --publish-path-only',
  });
  const actionIndex = stepIndex(releaseJob, { uses: 'changesets/action' });
  // After the prune, so the publish-path decision sees only normal-lane
  // changesets; before the action, so nothing is published first.
  assert.ok(
    pruneIndex < checkIndex,
    'the first-publication check runs after the ignored-lane prune',
  );
  assert.ok(
    checkIndex < actionIndex,
    'the first-publication check runs before changesets/action publishes',
  );
});

test('the Version Packages merge check refuses a publish npm cannot make', () => {
  const step = getStep(ciJob('version-packages-freshness'), {
    name: 'Refuse a release PR whose publish needs a package npm does not know',
  });
  assert.equal(step.if, "steps.head.outputs.release_pr == 'true'");
  assert.equal(
    step.run,
    'node scripts/release/check-first-publications.mjs',
    'the merge check runs check-first-publications.mjs on the tree that merges the release PR',
  );
});

test('the Version Packages merge check refuses generated app release notes', () => {
  const step = getStep(ciJob('version-packages-freshness'), {
    name: 'Refuse a release PR whose app release notes are still generated',
  });
  assert.equal(step.if, "steps.head.outputs.release_pr == 'true'");
  // The base is the tree the release merges into in both modes; a merge-group
  // entry's first parent can be an earlier entry that already carries the
  // release, which would hide every version bump from the check.
  assert.equal(
    step.env?.BASE_SHA,
    '${{ github.event.pull_request.base.sha || github.event.merge_group.base_sha }}',
  );
  assert.match(step.run, /git fetch --no-tags --depth=1 origin "\$BASE_SHA"/);
  assert.match(
    step.run,
    /node scripts\/release\/check-app-release-notes\.mjs --base "\$BASE_SHA"/,
  );
});

// ── The Studio deployment stack (#1909) ───────────────────────────────────
//
// `apps/studio/stack-test` is four bash scripts and a directory of Compose
// overrides, run by the `studio-stack` job. Nothing in that job names them
// generically — every script and every variant is spelled out — so these tests
// read the directory and the workflow together. A script renamed on disk, or a
// variant added and not run, is then a red test in seconds rather than
// coverage that quietly narrowed.

const stackTestDirectory = new URL(
  '../../apps/studio/stack-test/',
  import.meta.url,
);

function stackTestVariants() {
  return readdirSync(new URL('variants/', stackTestDirectory))
    .filter((entry) => entry.endsWith('.yml'))
    .map((entry) => entry.replace(/\.yml$/, ''))
    .toSorted();
}

/** The studio-stack leg a step is gated to, read from its `if:`. */
function legOf(step) {
  return /matrix\.leg == '(?<leg>[^']+)'/.exec(step.if ?? '')?.groups?.leg;
}

function egressVariants() {
  const variants = ciJob('studio-egress').strategy?.matrix?.variant;
  assert.ok(Array.isArray(variants), 'studio-egress has a variant matrix');
  return variants.map(String).toSorted((a, b) => a.localeCompare(b));
}

/** A live step of `job` runs `command` as a whole line of its script. */
function runsLine(job, command) {
  return (
    findSteps(job, {
      run: new RegExp(`^${escapeRegExp(command)}$`, 'm'),
    }).length > 0
  );
}

const qualityStep = () =>
  getStep(ciJob('quality'), { name: 'Verify all quality checks passed' });

test('the studio-stack job runs every stack-test script that exists', () => {
  const studioStack = ciJob('studio-stack');

  for (const script of ['build.sh', 'up.sh', 'assert.sh', 'down.sh']) {
    assert.ok(
      existsSync(new URL(script, stackTestDirectory)),
      `apps/studio/stack-test/${script} exists on disk`,
    );
    assert.ok(
      findSteps(studioStack, {
        run: new RegExp(
          `^${escapeRegExp(`apps/studio/stack-test/${script}`)}(?: |$)`,
          'm',
        ),
      }).length > 0,
      `the studio-stack job runs ${script}`,
    );
  }
});

test('the studio-stack job runs every variant through up, assert and down', () => {
  const studioStack = ciJob('studio-stack');

  const egress = egressVariants();
  const variants = stackTestVariants().filter(
    (variant) => !egress.includes(variant),
  );
  // The reference stack, every swap docs/self-host/swap.md documents, and the
  // stack with a second API replica (docs/self-host/run.md).
  assert.deepEqual(variants, [
    'external-bucket',
    'external-bucket-azure',
    'external-postgres',
    'external-redis',
    'own-proxy',
    'reference',
    'two-api',
  ]);

  for (const variant of variants) {
    for (const script of ['up.sh', 'assert.sh', 'down.sh']) {
      assert.ok(
        runsLine(
          studioStack,
          `apps/studio/stack-test/${script} --variant ${variant}`,
        ),
        `the studio-stack job runs ${script} for the ${variant} variant`,
      );
    }
  }

  // Every teardown runs whatever the assertions did. A variant that failed
  // half way through otherwise leaves containers holding the fixed subnets and
  // ports the next one needs, and every later variant then fails for a reason
  // that is not its own.
  const teardowns = findSteps(studioStack, { run: /down\.sh --variant \S+/ });
  assert.equal(teardowns.length, variants.length);
  for (const step of teardowns) {
    assert.match(step.if ?? '', /^always\(\)/, `${step.name} is if: always()`);
  }
  assert.equal(
    liveSteps(studioStack).filter((step) =>
      String(step.if ?? '').startsWith('always()'),
    ).length,
    variants.length,
    'each down.sh step is if: always()',
  );
});

// The variants run on three legs because on one host they can only take
// turns. A variant whose steps name no leg, or a leg the matrix lacks, would
// never run, and the up/assert/down test above would still pass.
test('every studio-stack variant runs on exactly one leg, with its teardown', () => {
  const studioStack = ciJob('studio-stack');
  const { strategy } = studioStack;
  assert.equal(strategy['fail-fast'], false, 'a failed leg hides no other');
  const legs = strategy.matrix.include.map((entry) => entry.leg);

  const ran = new Map();
  for (const step of liveSteps(studioStack)) {
    const variant = /--variant (?<v>\S+)/.exec(step.run ?? '')?.groups?.v;
    if (!variant) continue;
    const leg = legOf(step);
    assert.ok(legs.includes(leg), `${step.name} runs on a leg the matrix has`);
    const legsForVariant = ran.get(variant) ?? new Set();
    legsForVariant.add(leg);
    ran.set(variant, legsForVariant);
    if (/down\.sh/.test(step.run)) {
      assert.match(step.if, /^always\(\) && /, `${step.name} always runs`);
    }
  }
  for (const [variant, onLegs] of ran) {
    assert.equal(onLegs.size, 1, `${variant} runs on one leg`);
  }
  for (const leg of legs) {
    assert.ok(
      [...ran.values()].some((onLegs) => onLegs.has(leg)),
      `the ${leg} leg runs a variant`,
    );
  }

  // The walk-through is the one step that needs the workspace and a browser,
  // so the leg that runs it is the one that installs them.
  const participantsLeg = legOf(
    getStep(studioStack, { run: /participants\.sh/ }),
  );
  assert.ok(participantsLeg, 'the walk-through runs on one named leg');
  for (const action of [
    './.github/actions/turbo-ci-setup',
    './.github/actions/playwright-browsers',
  ]) {
    const installs = findSteps(studioStack, { uses: action });
    assert.ok(installs.length > 0, `studio-stack uses ${action}`);
    for (const step of installs) {
      assert.equal(legOf(step), participantsLeg);
    }
  }
});

const writesCache = (step) => step.env?.BUILD_CACHE_TO !== undefined;

// Pull requests read the Studio image cache and never write it: a write from a
// pull request is readable by that pull request alone, and the Actions cache
// is at its ceiling. `version=2` because buildx otherwise asks the retired
// version 1 service, which refuses every import and export.
test('pull requests read the Studio image cache that only main writes', () => {
  for (const name of ['studio-stack', 'studio-egress']) {
    const build = getStep(ciJob(name), { name: 'Build the stack images' });
    assert.equal(
      build.env.BUILD_CACHE_FROM,
      'type=gha,version=2,scope=studio-stack-{target}',
      `${name} reads the version 2 cache`,
    );
    assert.ok(!('BUILD_CACHE_TO' in build.env), `${name} does not write it`);
  }

  const warm = ciJob('warm-studio-image-cache');
  assert.match(warm.if, /github\.ref == 'refs\/heads\/main'/);
  assert.equal(warm['continue-on-error'], true);
  const write = getStep(warm, writesCache);
  assert.equal(
    write.env.BUILD_CACHE_TO,
    'type=gha,version=2,scope=studio-stack-{target},mode=max',
  );
  assert.equal(write.if, "steps.decide.outputs.warm == 'true'");

  // The marker that stops later pushes rewriting the cache is saved only
  // after the export, so an export that failed is retried on the next push.
  const decide = getStep(warm, { id: 'decide' });
  assert.match(decide.env.MARKER, /^studio-image-deps-\$\{\{ hashFiles\(/);
  const save = { uses: 'actions/cache/save' };
  assert.ok(
    stepIndex(warm, save) > stepIndex(warm, writesCache),
    'the marker follows the export',
  );
  assert.equal(
    getStep(warm, save).with.key,
    '${{ steps.decide.outputs.marker }}',
  );
});

test('the studio-egress job runs each egress variant through up, egress and down', () => {
  const egressJob = ciJob('studio-egress');
  assert.deepEqual(egressVariants(), ['telemetry-off', 'telemetry-on']);

  const lib = readFileSync(new URL('lib.sh', stackTestDirectory), 'utf8');
  assert.match(
    lib,
    /^egress_variant\(\) \{\n {2}case "\$VARIANT" in\n {4}telemetry-off \| telemetry-on\) return 0 ;;$/m,
    'lib.sh treats exactly the matrix variants as egress variants',
  );

  for (const script of ['build.sh', 'up.sh', 'egress.sh', 'down.sh']) {
    assert.ok(
      existsSync(new URL(script, stackTestDirectory)),
      `apps/studio/stack-test/${script} exists on disk`,
    );
  }
  assert.ok(
    runsLine(egressJob, 'apps/studio/stack-test/build.sh'),
    'the studio-egress job builds the images',
  );
  for (const script of ['up.sh', 'egress.sh', 'down.sh']) {
    assert.ok(
      runsLine(
        egressJob,
        `apps/studio/stack-test/${script} --variant \${{ matrix.variant }}`,
      ),
      `the studio-egress job runs ${script} for its variant`,
    );
  }
  const teardown = getStep(egressJob, { name: 'Tear down' });
  assert.equal(
    teardown.if,
    'always()',
    'the teardown runs whatever the egress proof did',
  );
  assert.match(teardown.run, /^apps\/studio\/stack-test\/down\.sh /);
  assert.ok(
    stepIndex(egressJob, { run: /^apps\/studio\/stack-test\/egress\.sh /m }) <
      stepIndex(egressJob, { name: 'Tear down' }),
    'the teardown follows the egress proof',
  );
  assert.equal(egressJob.strategy['fail-fast'], false);
});

test('studio-egress is selected by the studio flag and required by the quality gate', () => {
  const egressJob = ciJob('studio-egress');
  assert.match(
    egressJob.if,
    /needs\.detect\.outputs\.studio == 'true'/,
    'the job is gated on the studio flag',
  );
  for (const excluded of ['merge_group', 'push']) {
    assert.match(
      egressJob.if,
      new RegExp(`github\\.event_name != '${excluded}'`),
      `the job never runs on ${excluded}`,
    );
  }

  assert.ok(
    needsOf(ciJob('quality')).includes('studio-egress'),
    'quality needs the job',
  );
  const verify = qualityStep();
  assert.equal(
    verify.env.STUDIO_EGRESS_RESULT,
    '${{ needs.studio-egress.result }}',
    'quality receives the job result',
  );
  assert.match(
    verify.run,
    /^if \[\[ "\$STUDIO_STACK_REQUIRED" == "true" \]\]; then\n\s+if \[\[ "\$STUDIO_EGRESS_RESULT" != "success" \]\]; then\n\s+echo "::error::quality gate failed[^\n]*\n\s+exit 1$/m,
    'quality fails when a required studio-egress did not succeed',
  );
});

// The object-store contract suite inside @codaco/studio-api#test refuses to
// skip under CI, so every job that runs that suite has to start the dev Garage
// and Azurite before it — in the job, ahead of the suite, not merely somewhere.
test('every job running the Studio server suite starts its object stores first', () => {
  for (const name of ['test-studio-server', 'seed-turbo-cache']) {
    const body = ciJob(name);
    const start = stepIndex(body, {
      run: /^pnpm --filter @codaco\/studio-api dev:object-stores$/m,
    });
    const suite = stepIndex(body, {
      run: /^pnpm exec turbo run '@codaco\/studio-api#test'$/m,
    });
    assert.ok(start < suite, `${name} starts them before the suite runs`);
  }
});

test('the stack-test scripts and the workflow agree on the variant list', () => {
  const lib = readFileSync(new URL('lib.sh', stackTestDirectory), 'utf8');
  const declared = /^VARIANTS=\((?<names>[^)]*)\)$/m.exec(lib)?.groups?.names;
  assert.ok(declared, 'lib.sh declares VARIANTS');
  assert.deepEqual(
    declared.trim().split(/\s+/).toSorted(),
    stackTestVariants(),
    'lib.sh accepts exactly the variants that have an override file',
  );
});

test('own-proxy has a guide block to extract its configuration from', () => {
  // That variant reads its nginx configuration out of the guide at run time,
  // so that what an institution pastes is what was tested. `up.sh` fails
  // loudly when the block stops parsing; this fails in seconds rather than
  // twenty minutes into a CI job.
  const swap = readFileSync(
    new URL('../../apps/studio/docs/self-host/swap.md', import.meta.url),
    'utf8',
  );
  const block = /^```nginx$\n(?<config>[\s\S]*?)^```$/m.exec(swap)?.groups
    ?.config;
  assert.ok(block, 'swap.md carries a fenced nginx block');
  for (const required of [
    'upstream studio_api { server api:3000; }',
    'upstream studio_web { server web:80; }',
    'location = /readyz',
    'location = /ws',
    'location @maintenance',
    'server_name studio.example.org;',
  ]) {
    assert.ok(
      block.includes(required),
      `the nginx block still has: ${required}`,
    );
  }
});

/** The script of detect's `flags` step, which computes every detect output. */
const detectFlagsScript = () => getStep(ciJob('detect'), { id: 'flags' }).run;

function runDetectFlag(pkg, env) {
  const definition = detectFlagsScript().match(
    /^(?<indent> *)flag\(\) \{\n[\s\S]*?^\k<indent>\}$/m,
  );
  assert.ok(definition, 'detect defines flag()');
  const body = definition[0]
    .split('\n')
    .map((line) => line.slice(definition.groups.indent.length))
    .join('\n');
  const script = [
    'set -eo pipefail',
    `npx() {
      case "$*" in
        *"--filter=@codaco/known..."*) echo '{"packages":{"items":[{"path":"packages/known"}]}}' ;;
        *) echo "x No package found with name '$*' in workspace" >&2; return 1 ;;
      esac
    }`,
    body,
    `result=$(flag ${JSON.stringify(pkg)})`,
    'echo "result=$result"',
  ].join('\n');
  return spawnSync('bash', ['-c', script], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      TURBO_VERSION: '0.0.0',
      PREV: '',
      CURR: 'HEAD',
      FORCE_RUN: 'false',
      WORKFLOW_CHANGED: 'false',
      ...env,
    },
  });
}

test('detect fails closed on a flag naming no workspace package', () => {
  const known = runDetectFlag('@codaco/known', {});
  assert.equal(known.status, 0, known.stderr);
  assert.match(known.stdout, /^result=true$/m);

  for (const forced of [
    {},
    { FORCE_RUN: 'true' },
    { WORKFLOW_CHANGED: 'true' },
    { PREV: 'HEAD' },
  ]) {
    const unknown = runDetectFlag('@codaco/renamed-away', forced);
    assert.notEqual(
      unknown.status,
      0,
      `a stale name answers ${unknown.stdout} under ${JSON.stringify(forced)}`,
    );
    assert.doesNotMatch(unknown.stdout, /^result=/m);
    assert.match(
      unknown.stderr,
      /::error::detect: '@codaco\/renamed-away' names no workspace package/,
    );
  }
});

// ── Flags that decide what the quality gate requires ──────────────────────
//
// `quality` requires a conditional job only when its detect flag is true and
// reads no earlier run's verdict, so every such flag must be judged on the
// whole pull request. A push-to-push flag would let an unrelated push after a
// failing run skip the job and pass the gate.

// The detect outputs `quality` requires a job on, each proved cumulative by
// `runGateSelection` below.
const GATE_FLAGS = ['studio'];

const detectOutputsIn = (text) =>
  [...String(text ?? '').matchAll(/needs\.detect\.outputs\.(\w+)/g)].map(
    ([, flag]) => flag,
  );

test('every job quality requires on a detect flag is decided by a cumulative flag', () => {
  const qualityJob = ciJob('quality');
  const needs = needsOf(qualityJob);
  assert.ok(needs.length > 0, 'quality lists its needs');
  // Flags read by the `if:` of a job quality needs, and flags quality itself
  // reads to decide whether a job is required.
  const selecting = new Set();
  for (const name of needs) {
    for (const flag of detectOutputsIn(ciJob(name).if)) selecting.add(flag);
  }
  const required = new Set(
    detectOutputsIn(
      JSON.stringify([qualityJob.if, qualityJob.env, liveSteps(qualityJob)]),
    ),
  );
  assert.ok(
    required.has('studio'),
    'quality reads the studio flag from its live steps',
  );
  assert.deepEqual(
    [...selecting].toSorted((a, b) => a.localeCompare(b)),
    GATE_FLAGS,
    'a job quality needs is selected by a detect flag not proved cumulative',
  );
  assert.deepEqual(
    [...required].toSorted((a, b) => a.localeCompare(b)),
    GATE_FLAGS,
    'quality requires a job on a detect flag not proved cumulative',
  );
});

// Runs one block of detect's flags step against a throwaway repository.
// `flag` is stubbed by the package's paths — studio-api and studio-sync stand
// in for its dependency closure — and diffs over whatever PREV it is handed,
// so a block's merge-base range is exercised for real. Each entry of `pushes`
// is one commit; PREV is the last push's parent, as on a `synchronize`, and
// origin/main is the commit before the first push. `preamble` sets the values
// that earlier lines of the step would have computed, and the result has the
// final value of each name in `outputs`.
function runDetectBlock({ pattern, pushes = [], preamble = [], outputs }) {
  const block = detectFlagsScript().match(pattern);
  assert.ok(block, `detect contains the block ${pattern}`);
  const stub = [
    'flag() {',
    '  [[ -z "$PREV" ]] && { echo true; return; }',
    '  git diff --quiet "$PREV" "$CURR" -- apps/studio/api packages/studio-sync && echo false || echo true',
    '}',
  ].join('\n');
  const body = [
    stub,
    ...preamble,
    block[0]
      .split('\n')
      .map((line) => line.slice(block.groups.indent.length))
      .join('\n'),
    ...outputs.map((name) => `echo "${name}=$${name}"`),
  ].join('\n');
  const repo = mkdtempSync(join(tmpdir(), 'detect-flags-'));
  try {
    const git = (...args) =>
      execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
    git('init', '-q');
    git('config', 'user.email', 'ci@example.org');
    git('config', 'user.name', 'CI');
    writeFileSync(join(repo, 'README'), 'base\n');
    git('add', '-A');
    git('commit', '-qm', 'base');
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    for (const [index, changed] of pushes.entries()) {
      for (const file of changed) {
        mkdirSync(dirname(join(repo, file)), { recursive: true });
        writeFileSync(join(repo, file), `push ${index}\n`);
      }
      git('add', '-A');
      git('commit', '-q', '--allow-empty', '-m', `push ${index}`);
    }
    const result = spawnSync('bash', ['-c', `set -eo pipefail\n${body}`], {
      cwd: repo,
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH,
        GITHUB_EVENT_NAME: 'pull_request',
        GITHUB_BASE_REF: 'main',
        FORCE_RUN: 'false',
        // The push-to-push answer, set so a flag that leans on it shows.
        WORKFLOW_CHANGED: 'false',
        PREV: git('rev-parse', 'HEAD^1'),
        CURR: git('rev-parse', 'HEAD'),
      },
    });
    assert.equal(result.status, 0, result.stderr);
    return Object.fromEntries(
      outputs.map((name) => [
        name,
        result.stdout.match(new RegExp(`^${name}=(?<value>.*)$`, 'm'))?.groups
          ?.value,
      ]),
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
}

// Runs detect's gate block: the merge base and the studio flag.
const runGateSelection = ({ pushes }) =>
  runDetectBlock({
    pattern:
      /^(?<indent> *)gate_base="\$PREV"\n[\s\S]*?^\k<indent>studio=false\n[\s\S]*?^\k<indent>fi$/m,
    pushes,
    outputs: GATE_FLAGS,
  });

const PUBLICATIONS_CSV = 'apps/networkcanvas.com/content/publications.csv';

// Runs detect from the merge base through the pairing of the two public
// sites, with `docs` and `website` set to the push-to-push answers that the
// package flags would have given.
const runPublicationsSelection = ({ pushes, website }) =>
  runDetectBlock({
    pattern:
      /^(?<indent> *)gate_base="\$PREV"\n[\s\S]*?^\k<indent>if \[\[ "\$docs" == "true" \|\| "\$website" == "true" \]\]; then\n[\s\S]*?^\k<indent>fi$/m,
    pushes,
    preamble: [`docs=${website}`, `website=${website}`],
    outputs: ['publications', 'website', 'docs'],
  });

test('detect flags a pull request that changes the publications on the whole pull request', () => {
  // The first push adds a publication: the package flag already says the
  // website changed.
  assert.deepEqual(
    runPublicationsSelection({ pushes: [[PUBLICATIONS_CSV]], website: true }),
    { publications: 'true', website: 'true', docs: 'true' },
  );
  // A later push that changes no package, such as one that adds a refusing
  // link to the refusals list, still selects the crawl. `website` is forced
  // true with it, so carry-forward-statuses does not republish an earlier
  // verdict over the crawl that runs on this commit.
  assert.deepEqual(
    runPublicationsSelection({
      pushes: [[PUBLICATIONS_CSV], ['.github/dead-link-refusals.json']],
      website: false,
    }),
    { publications: 'true', website: 'true', docs: 'true' },
  );
  // Other website changes do not select the crawl on a feature PR.
  assert.deepEqual(
    runPublicationsSelection({
      pushes: [['apps/networkcanvas.com/content/grants.csv']],
      website: true,
    }),
    { publications: 'false', website: 'true', docs: 'true' },
  );
  assert.deepEqual(
    runPublicationsSelection({ pushes: [['README.md']], website: false }),
    { publications: 'false', website: 'false', docs: 'false' },
  );
}, 60_000);

// Evaluates the subset of the GitHub Actions expression syntax that the
// preview-check conditions use: string literals, context properties, ==, !=,
// !, && , || and parentheses. A context property missing from `context`
// throws, so a condition that comes to read something new fails loudly.
function evaluateCondition(expression, context) {
  const tokens = [
    ...expression.matchAll(
      /\s*(?:(?<operator>\|\||&&|==|!=|!|\(|\))|'(?<literal>[^']*)'|(?<path>[A-Za-z_][\w.-]*)|(?<other>\S))/g,
    ),
  ].map(({ groups }) => {
    assert.equal(groups.other, undefined, `unparsed text in ${expression}`);
    return groups;
  });
  let position = 0;
  const peek = () => tokens[position]?.operator;
  const take = (operator) => {
    assert.equal(peek(), operator, `expected ${operator} in ${expression}`);
    position += 1;
  };
  const primary = () => {
    if (peek() === '!') {
      take('!');
      return !primary();
    }
    if (peek() === '(') {
      take('(');
      const value = or();
      take(')');
      return value;
    }
    const { literal, path } = tokens[position] ?? {};
    position += 1;
    if (literal !== undefined) return literal;
    assert.ok(path, `expected a value in ${expression}`);
    assert.ok(Object.hasOwn(context, path), `the condition reads ${path}`);
    return context[path];
  };
  const equality = () => {
    const left = primary();
    if (peek() === '==' || peek() === '!=') {
      const operator = peek();
      take(operator);
      const right = primary();
      return operator === '==' ? left === right : left !== right;
    }
    return left;
  };
  const and = () => {
    let value = equality();
    while (peek() === '&&') {
      take('&&');
      value = equality() && value;
    }
    return value;
  };
  const or = () => {
    let value = and();
    while (peek() === '||') {
      take('||');
      value = and() || value;
    }
    return value;
  };
  const result = or();
  assert.equal(position, tokens.length, `unparsed text in ${expression}`);
  return Boolean(result);
}

const previewPullRequest = ({ head, docs, website, publications }) => ({
  'github.event_name': 'pull_request',
  'github.base_ref': 'main',
  'github.head_ref': head,
  'needs.detect.outputs.docs': docs,
  'needs.detect.outputs.website': website,
  'needs.detect.outputs.publications': publications,
});

const previewJobRuns = (jobName, context) =>
  evaluateCondition(ciJob(jobName).if, context);

test('a pull request that changes the publications crawls the website preview and not the documentation preview', () => {
  const detectJob = ciJob('detect');
  assert.equal(
    detectJob.outputs.publications,
    '${{ steps.flags.outputs.publications }}',
  );
  assert.match(
    detectFlagsScript(),
    /^echo "publications=\$publications" >> "\$GITHUB_OUTPUT"$/m,
  );

  // The weekly publications PR, and a later push to it.
  const publicationsPR = previewPullRequest({
    head: 'pr/laughing-brown-s5phpl',
    docs: 'true',
    website: 'true',
    publications: 'true',
  });
  assert.ok(previewJobRuns('website-preview-checks', publicationsPR));
  assert.ok(
    !previewJobRuns('docs-preview-checks', publicationsPR),
    'the publications list adds no route that the documentation links to',
  );
  // An ordinary website change still does not crawl either site.
  const websitePR = {
    ...publicationsPR,
    'needs.detect.outputs.publications': 'false',
  };
  assert.ok(!previewJobRuns('website-preview-checks', websitePR));
  assert.ok(!previewJobRuns('docs-preview-checks', websitePR));
  // Both release PRs still crawl both sites, with or without the flag.
  for (const head of [
    'changeset-release/documentation',
    'changeset-release/website',
  ]) {
    for (const publications of ['true', 'false']) {
      const releasePR = previewPullRequest({
        head,
        docs: 'true',
        website: 'true',
        publications,
      });
      assert.ok(previewJobRuns('website-preview-checks', releasePR), head);
      assert.ok(previewJobRuns('docs-preview-checks', releasePR), head);
    }
  }
  // A pull request into an integration branch is not crawled.
  assert.ok(
    !previewJobRuns('website-preview-checks', {
      ...publicationsPR,
      'github.base_ref': 'schema-9',
    }),
  );
});

test('detect selects studio-stack on the whole pull request', () => {
  // Anything in the api image's package graph, the stack's files outside it,
  // and the workflow that defines the job — each on its own.
  for (const file of [
    'apps/studio/api/src/server.ts',
    'packages/studio-sync/src/jobs.ts',
    'apps/studio/Dockerfile',
    'apps/studio/docker-compose.yml',
    'apps/studio/docker-compose.local.yml',
    'apps/studio/.env.example',
    'apps/studio/stack-test/run.sh',
    'apps/studio/docs/self-host/upgrade.md',
    '.github/workflows/ci-and-release.yml',
    '.dockerignore',
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'patches/some-package.patch',
    'turbo.json',
  ]) {
    assert.equal(
      runGateSelection({ pushes: [[file]] }).studio,
      'true',
      `a change to ${file} selects studio-stack`,
    );
    // The gap this guards: a later push that touches nothing the stack reads
    // still runs it, so a failed stack test cannot be skipped past.
    assert.equal(
      runGateSelection({ pushes: [[file], ['README.md']] }).studio,
      'true',
      `an unrelated push after a change to ${file} still selects studio-stack`,
    );
  }
  // Studio's web app is not in the api image's graph and does not select it,
  // nor do the upgrade lane's own inputs.
  for (const file of [
    'apps/studio/web/src/main.tsx',
    'apps/studio/release-test/run.sh',
  ]) {
    assert.equal(runGateSelection({ pushes: [[file]] }).studio, 'false');
  }
  assert.equal(
    runGateSelection({ pushes: [['apps/architect/x.ts'], ['README.md']] })
      .studio,
    'false',
  );
}, 120_000);

test('studio-stack is selected by detect and required by the quality gate', () => {
  const detectJob = ciJob('detect');
  assert.equal(
    detectJob.outputs?.studio,
    '${{ steps.flags.outputs.studio }}',
    'detect publishes the studio flag',
  );
  assert.match(
    detectFlagsScript(),
    /^echo "studio=\$studio" >> "\$GITHUB_OUTPUT"$/m,
    'the flags step writes the studio output',
  );
  // The package flag alone cannot see these: none of them is inside a package
  // `turbo ls` walks, so a change confined to one would leave the job unrun on
  // exactly the commit that needed it.
  const stackPaths = /^studio_stack_paths=\(\n(?<list>[\s\S]*?)\n\)$/m
    .exec(detectFlagsScript())
    ?.groups?.list.split('\n')
    .map((line) => line.trim());
  assert.ok(stackPaths, 'detect lists the stack paths in studio_stack_paths');
  assert.match(
    detectFlagsScript(),
    /git diff --quiet "\$gate_base" "\$CURR" -- \\\n\s+"\$\{studio_stack_paths\[@\]\}"/,
    'the studio flag diffs the listed paths',
  );
  for (const path of [
    'apps/studio/Dockerfile',
    "'apps/studio/docker-compose*.yml'",
    'apps/studio/.env.example',
    'apps/studio/stack-test',
    'apps/studio/docs/self-host',
  ]) {
    assert.ok(
      stackPaths.includes(path),
      `detect watches ${path} for the studio flag`,
    );
  }

  const studioStack = ciJob('studio-stack');
  assert.match(
    studioStack.if,
    /needs\.detect\.outputs\.studio == 'true'/,
    'the job is gated on the flag',
  );
  for (const excluded of ['merge_group', 'push']) {
    assert.match(
      studioStack.if,
      new RegExp(`github\\.event_name != '${excluded}'`),
      `the job never runs on ${excluded}`,
    );
  }

  assert.ok(
    needsOf(ciJob('quality')).includes('studio-stack'),
    'quality needs the job',
  );
  const verify = qualityStep();
  assert.equal(
    verify.env.STUDIO_STACK_REQUIRED,
    '${{ needs.detect.outputs.studio }}',
    'quality receives the flag that selected the job',
  );
  assert.equal(
    verify.env.STUDIO_STACK_RESULT,
    '${{ needs.studio-stack.result }}',
    'quality receives the job result',
  );
  // Keyed on the flag, never on the result alone: a job that never ran must
  // not read as a pass on a change that needed it.
  assert.match(
    verify.run,
    /^if \[\[ "\$STUDIO_STACK_REQUIRED" == "true" \]\]; then\n\s+if \[\[ "\$STUDIO_STACK_RESULT" != "success" \]\]; then\n\s+echo "::error::quality gate failed[^\n]*\n\s+exit 1$/m,
    'quality fails when a required studio-stack did not succeed',
  );
});

// ── The Studio upgrade lane (#1901) ────────────────────────────────────────
//
// `apps/studio/release-test/run.sh` is the whole lane; the job runs it and
// nothing else, so these tests pin when it runs, what it is given, and that
// a Studio release cannot publish without it.

test('studio-upgrade deployments run with telemetry off', () => {
  const runScript = readFileSync(
    new URL('../../apps/studio/release-test/run.sh', import.meta.url),
    'utf8',
  );
  const env = /cat > "\$DEPLOY_DIR\/\.env" <<ENV\n([\s\S]*?)\nENV\n/.exec(
    runScript,
  )?.[1];
  assert.ok(env, 'run.sh writes the deployment .env from one heredoc');
  assert.deepEqual(
    env.split('\n').filter((line) => line.startsWith('STUDIO_TELEMETRY=')),
    ['STUDIO_TELEMETRY=false'],
  );
});

test('studio-upgrade runs the lane only once a Studio release is authorised, and gates its publish', () => {
  const upgrade = ciJob('studio-upgrade');
  assert.ok(
    existsSync(
      new URL('../../apps/studio/release-test/run.sh', import.meta.url),
    ),
    'apps/studio/release-test/run.sh exists on disk',
  );
  const lane = getStep(upgrade, {
    run: 'apps/studio/release-test/run.sh --runs A,B',
  });
  // apps-release-detect runs only on a push to main, and `studio_released`
  // is true only for a Studio version the release PR moved and no tag holds.
  assert.deepEqual(needsOf(upgrade), ['apps-release-detect']);
  assert.equal(
    upgrade.if,
    "needs.apps-release-detect.outputs.studio_released == 'true'",
  );
  assert.match(
    ciJob('apps-release-detect').if,
    /^github\.ref == 'refs\/heads\/main' && github\.event_name == 'push'$/,
  );
  // Run C pulls a tagged release's images from ghcr.io, logging in with the
  // job's token, which needs the permission to read packages.
  assert.equal(upgrade.permissions?.packages, 'read');
  assert.equal(lane.env?.GITHUB_TOKEN, '${{ secrets.GITHUB_TOKEN }}');
  // build-next.sh seals against history and run C checks out a tag.
  const checkout = getStep(upgrade, { uses: 'actions/checkout' });
  assert.equal(checkout.with?.['fetch-depth'], 0);
  assert.ok(
    stepIndex(upgrade, { uses: 'actions/checkout' }) <
      upgrade.steps.indexOf(lane),
    'the lane runs on the full checkout',
  );

  // Nothing is published until the lane has passed.
  const release = ciJob('apps-release-studio');
  assert.deepEqual(needsOf(release), ['apps-release-detect', 'studio-upgrade']);
  assert.doesNotMatch(
    release.if,
    /always\(\)|failure\(\)|cancelled\(\)/,
    'the release runs only when the lane succeeded',
  );

  // Never on a pull request, so the gate neither waits for it nor reads it.
  const qualityJob = ciJob('quality');
  assert.ok(!needsOf(qualityJob).includes('studio-upgrade'));
  assert.doesNotMatch(
    JSON.stringify(raw(qualityJob)),
    /studio-upgrade|STUDIO_UPGRADE/,
  );
  assert.doesNotMatch(JSON.stringify(raw(ciJob('detect'))), /studio_upgrade/);
});

// PostHog resolves a minified stack frame by matching the chunk ID injected
// into the bundle at build time against an uploaded map, so maps are only
// useful when they come from the very build that produced the deployed
// artefact. Each app below both wires `withPostHogConfig`/the Vite plugin into
// its build config and is deployed from a build this workflow runs, so the
// credentials have to reach that build step — silently losing them turns every
// future exception in that app back into unresolved frames.
const SOURCE_MAP_UPLOADING_RELEASES = {
  'apps-release-architect': '@codaco/architect',
  'apps-release-interviewer': '@codaco/interviewer',
  'apps-release-documentation': '@codaco/documentation',
  'apps-release-website': 'networkcanvas.com',
  'refresh-website-after-classic-release': 'networkcanvas.com',
};

test('every production build that uploads source maps gets the credentials', () => {
  for (const [jobName, filter] of Object.entries(
    SOURCE_MAP_UPLOADING_RELEASES,
  )) {
    // A turbo build, or a netlify-cli deploy that runs the build itself; a
    // `deploy --no-build` of an earlier build is not the build.
    const buildStep = getStep(
      ciJob(jobName),
      (step) =>
        typeof step.run === 'string' &&
        new RegExp(`--filter=${escapeRegExp(filter)}(?:\\s|$)`, 'm').test(
          step.run,
        ) &&
        /^\s*(?:pnpm exec turbo run build|.*deploy --build)\b/m.test(step.run),
    );

    assert.equal(
      buildStep.env?.POSTHOG_PERSONAL_API_KEY,
      '${{ secrets.POSTHOG_PERSONAL_API_KEY }}',
      `${jobName}'s build step receives POSTHOG_PERSONAL_API_KEY`,
    );
    assert.equal(
      buildStep.env?.POSTHOG_PROJECT_ID,
      '${{ secrets.POSTHOG_PROJECT_ID }}',
      `${jobName}'s build step receives POSTHOG_PROJECT_ID`,
    );
  }
});

const scriptBody = (command) => {
  const script = /^pnpm (?:run )?([\w:-]+)$/.exec(command)?.[1];
  assert.ok(script, `"${command}" is not a pnpm script call`);
  const body = frescoPackage.scripts[script];
  assert.ok(body, `apps/fresco/package.json has no "${script}" script`);
  return body;
};

test('a Fresco preview on Netlify migrates only its own database', () => {
  // Deploy previews used to read the production DATABASE_URL and run the
  // production build. A preview of the schema-9 branch that ran
  // setup-database.ts migrated the sandbox's protocols and interviews to a
  // schema main refuses to run, and every interview link on the live
  // deployment failed (12 Oct 2026). Previews now get a Neon branch of their
  // base's database, and build-preview.ts migrates it only when
  // PREVIEW_DATABASE_BRANCH names the preview's own branch.
  const toml = readFileSync(
    new URL('../../apps/fresco/netlify.toml', import.meta.url),
    'utf8',
  );

  const commands = new Map();
  let section = null;
  for (const line of toml.split('\n')) {
    const header = /^\[([^\]]+)\]\s*$/.exec(line);
    if (header) {
      section = header[1];
      continue;
    }
    const command = /^command\s*=\s*"([^"]*)"\s*$/.exec(line);
    if (command && section) commands.set(section, command[1]);
  }

  assert.match(
    scriptBody(commands.get('build')),
    /setup-database/,
    'the production build must still run setup-database.ts',
  );
  for (const context of ['context.deploy-preview', 'context.branch-deploy']) {
    assert.equal(
      scriptBody(commands.get(context)),
      'tsx ./scripts/build-preview.ts',
      `${context} must decide through build-preview.ts whether to migrate`,
    );
  }

  const previewWorkflow = readWorkflow('fresco-preview-database.yml');
  assert.deepEqual(previewWorkflow.on.pull_request.types, [
    'opened',
    'reopened',
    'synchronize',
    'edited',
    'closed',
  ]);
  const provision = getJob(previewWorkflow, 'provision');
  const teardown = getJob(previewWorkflow, 'teardown');
  const runsScript = { run: /fresco-preview-database\.mjs/ };
  const provisionSteps = findSteps(provision, runsScript);
  const teardownSteps = findSteps(teardown, runsScript);
  assert.equal(provisionSteps.length, 1, 'one provision step');
  assert.equal(teardownSteps.length, 1, 'one teardown step');
  for (const step of [...provisionSteps, ...teardownSteps]) {
    assert.equal(
      step.env.NETLIFY_SITE_ID,
      '${{ secrets.NETLIFY_SITE_ID_FRESCO }}',
    );
    assert.equal(step.env.NEON_API_KEY, '${{ secrets.NEON_API_KEY }}');
    assert.equal(step.env.NEON_PROJECT_ID, '${{ secrets.NEON_PROJECT_ID }}');
    // Pull requests sharing a head branch share its database; the script
    // needs this one's number to find the others.
    assert.equal(step.env.PR_NUMBER, '${{ github.event.pull_request.number }}');
    assert.equal(step.env.GITHUB_TOKEN, '${{ github.token }}');
    assert.match(step.run, /--pr "\$PR_NUMBER"/);
    // Branch names reach the script through the environment, never inlined
    // into the shell, where a crafted name could run commands.
    assert.doesNotMatch(raw(step).run, /\$\{\{/);
  }
  assert.match(provision.if, /github\.event\.action != 'closed'/);
  assert.match(teardown.if, /github\.event\.action == 'closed'/);
});

// Architect 9 and Interviewer 9 each serve their 8.x line at /v8/ from their
// own deploy, extracted at build time from the tarball apps/<app>/legacy-<app>.json
// pins. A production deploy without it would strand every researcher who kept
// a schema 8 protocol on 8.x, so both lanes that deploy each app require it in
// the build (which fails while nothing is pinned) and check the built dist
// again, outside the turbo cache, before anything goes out.
for (const { app, label, envName } of [
  {
    app: 'architect',
    label: 'Architect 8',
    envName: 'ARCHITECT_REQUIRE_LEGACY_V8',
  },
  {
    app: 'interviewer',
    label: 'Interviewer 8',
    envName: 'INTERVIEWER_REQUIRE_LEGACY_V8',
  },
]) {
  test(`every ${app} production build requires the bundled ${label}`, () => {
    const hotfixWorkflow = readWorkflow('hotfix-release.yml');
    const lanes = [
      {
        name: `apps-release-${app}`,
        job: ciJob(`apps-release-${app}`),
        required: 'true',
        firstOutward: `Deploy ${app} to production`,
      },
      {
        name: 'hotfix-release',
        job: getJob(hotfixWorkflow, 'hotfix-release'),
        required: `\${{ inputs.app == '${app}' && hashFiles('apps/${app}/legacy-${app}.json') != '' && 'true' || '' }}`,
        // The tag is claimed before the deploy; neither may happen first.
        firstOutward: 'Claim the release tag',
      },
    ];

    for (const { name, job, required, firstOutward } of lanes) {
      const builds = (step) =>
        new RegExp(
          `turbo run build --filter="?@codaco\\/(?:${app}|\\$APP)"?$`,
        ).test(step.run?.trim() ?? '');
      const buildIndex = stepIndex(job, builds);
      assert.equal(
        getStep(job, builds).env?.[envName],
        required,
        `${name}'s build requires ${label}`,
      );

      const checkIndex = stepIndex(job, { name: `Check ${label} is bundled` });
      const outwardIndex = stepIndex(job, { name: firstOutward });
      assert.ok(
        buildIndex < checkIndex && checkIndex < outwardIndex,
        `${name} checks dist/v8 after building and before "${firstOutward}"`,
      );
      const check = getStep(job, { name: `Check ${label} is bundled` });
      assert.match(
        check.run,
        /^for file in index\.html sw\.js dist-info\.json; do$/m,
      );
      assert.ok(
        check.run.includes(`-f "apps/${app}/dist/v8/$file"`),
        `${name} checks apps/${app}/dist/v8`,
      );
    }
  });
}

/** The names of the steps whose environment carries `secrets.<credential>`. */
const stepsReading = (steps, credential) =>
  steps
    .filter((step) =>
      Object.values(step.env ?? {}).includes(`\${{ secrets.${credential} }}`),
    )
    .map((step) => step.name);

// The protocol review Worker spends money every time it is called, so what
// deploys it, and what can read its credentials, are pinned here.
test('the protocol review Worker deploys only from its own release lane', () => {
  const NAME = 'apps-release-protocol-review';
  const worker = ciJob(NAME);

  // Diff-driven: only the push that moves the Worker's version deploys it.
  assert.deepEqual(
    getStep(ciJob('apps-release-detect'), { id: 'protocol_review' }).env,
    {
      PKG_JSON: 'workers/protocol-review/package.json',
      PKG_NAME: '@codaco/protocol-review-worker',
      RELEASE_CHANNEL: 'stable',
    },
  );
  assert.equal(
    worker.if,
    "needs.apps-release-detect.outputs.protocol_review_released == 'true'",
  );

  // One deploy at a time whatever the version, never cancelled mid-deploy.
  assert.deepEqual(worker.concurrency, {
    'group': 'apps-release-@codaco/protocol-review-worker',
    'cancel-in-progress': false,
  });
  assert.deepEqual(worker.permissions, { contents: 'write' });

  // Its credentials are environment secrets, and no other job names them.
  assert.equal(worker.environment, 'protocol-review-worker');
  const CREDENTIALS = [
    'CLOUDFLARE_API_TOKEN',
    'CLOUDFLARE_ACCOUNT_ID',
    'ANTHROPIC_API_KEY',
    'OPENAI_API_KEY',
  ];
  for (const [name, other] of Object.entries(parsedWorkflow.jobs)) {
    if (name === NAME) continue;
    for (const credential of CREDENTIALS) {
      assert.ok(
        !JSON.stringify(raw(other)).includes(`secrets.${credential}`),
        `${name} must not read ${credential}`,
      );
    }
  }

  // No credential at job level: each reaches exactly the steps that use it.
  assert.equal(worker.env, undefined);
  const DEPLOY = 'Deploy the Worker to Cloudflare';
  const WRITE = "Write the Worker's secrets file";
  for (const [credential, reader] of [
    ['CLOUDFLARE_API_TOKEN', DEPLOY],
    ['CLOUDFLARE_ACCOUNT_ID', DEPLOY],
    ['ANTHROPIC_API_KEY', WRITE],
    ['OPENAI_API_KEY', WRITE],
  ]) {
    assert.deepEqual(stepsReading(worker.steps, credential), [reader]);
    assert.deepEqual(stepsReading(liveSteps(worker), credential), [reader]);
  }

  // Wrangler refuses to deploy a Worker without every secret it requires, so
  // each one the Worker declares is checked for and written to the file.
  const required = JSON.parse(
    readFileSync(
      new URL('../../workers/protocol-review/wrangler.jsonc', import.meta.url),
      'utf8',
    ).match(/"required":\s*(\[[^\]]*\])/)[1],
  );
  assert.deepEqual(required, ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY']);
  const credentialCheck = stepNamed(
    worker,
    'Check the deploy credentials are configured',
  );
  for (const secret of required) {
    assert.ok(CREDENTIALS.includes(secret), `${secret} is pinned above`);
    assert.equal(
      credentialCheck.env[`${secret}_SET`],
      `\${{ secrets.${secret} != '' }}`,
    );
    assert.ok(
      credentialCheck.run.includes(
        `[[ "$${secret}_SET" == "true" ]] || missing+=(${secret})`,
      ),
      `${secret} is named when it is missing`,
    );
    assert.ok(
      stepNamed(worker, WRITE).run.includes(`${secret}: process.env.${secret}`),
      `${secret} is written to the secrets file`,
    );
  }
  // And never interpolated into a script, where the shell would parse it.
  for (const step of raw(worker).steps) {
    assert.doesNotMatch(step.run ?? '', /\$\{\{\s*secrets\./, step.name);
  }

  const index = (name) => stepIndex(worker, { name });
  const guard = index('Skip if this version should not be deployed');
  const check = index('Check the deploy credentials are configured');
  const write = index(WRITE);
  const deploy = index(DEPLOY);
  const remove = index("Remove the Worker's secrets file");
  const answers = index('Check the deployed service answers');
  const tag = index('Tag the deployed version');

  // The guard needs tags and full history, and runs before anything else.
  assert.equal(stepIndex(worker, { uses: 'actions/checkout' }), 0);
  const checkout = getStep(worker, { uses: 'actions/checkout' });
  assert.equal(checkout.with['fetch-depth'], 0);
  assert.equal(checkout.with['fetch-tags'], true);
  assert.equal(checkout.with['persist-credentials'], false);
  assert.equal(guard, 1);
  assert.equal(
    worker.steps[guard].run,
    'bash .github/scripts/app-release-guard.sh',
  );
  assert.equal(
    worker.steps[guard].env.PKG_NAME,
    '@codaco/protocol-review-worker',
  );

  // Everything after the guard is skipped with it — except removing the
  // secrets file, which must happen whatever came before.
  for (const [position, step] of worker.steps.entries()) {
    if (position <= guard) continue;
    assert.equal(
      step.if,
      position === remove ? 'always()' : "steps.guard.outputs.skip != 'true'",
      `"${step.name ?? step.uses ?? step.run}" follows the guard`,
    );
  }

  assert.ok(check < write && write < deploy, 'credentials are checked first');
  assert.equal(
    remove,
    deploy + 1,
    'the secrets file is removed straight after the deploy',
  );
  assert.ok(
    deploy < answers && answers < tag,
    'the tag follows a deploy that answers',
  );

  // The key reaches Cloudflare with the deploy itself: Wrangler will not
  // create a Worker whose required secrets are missing.
  assert.equal(
    worker.steps[deploy]['working-directory'],
    'workers/protocol-review',
  );
  assert.match(
    worker.steps[deploy].run,
    /^pnpm exec wrangler deploy \\\n\s+--secrets-file "\$SECRETS_FILE"/m,
  );
  for (const position of [write, deploy, remove]) {
    assert.equal(
      worker.steps[position].env.SECRETS_FILE,
      '${{ runner.temp }}/protocol-review-secrets.json',
    );
  }
  assert.match(worker.steps[write].run, /^umask 077\n/);
  assert.equal(
    worker.steps[answers].run,
    'pnpm --filter=@codaco/protocol-review-worker check:deployment',
  );
  assert.equal(
    worker.steps[tag].env.TAG,
    '@codaco/protocol-review-worker@${{ needs.apps-release-detect.outputs.protocol_review_version }}',
  );

  // Wrangler bundles the Worker only when it deploys, so the same bundle is
  // built before merge, without credentials.
  assert.ok(
    runsLine(
      ciJob('quality-support'),
      'pnpm --filter=@codaco/protocol-review-worker bundle',
    ),
    'quality-support bundles the Worker',
  );
  const manifest = JSON.parse(
    readFileSync(
      new URL('../../workers/protocol-review/package.json', import.meta.url),
      'utf8',
    ),
  );
  assert.match(manifest.scripts.bundle, /^wrangler deploy --dry-run /);
  assert.equal(
    manifest.scripts['check:deployment'],
    'node scripts/check-deployment.mjs',
  );
});
