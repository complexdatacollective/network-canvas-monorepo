import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { test } from 'vitest';

import {
  findSteps,
  getJob,
  getStep,
  needsOf,
  raw,
  readWorkflow,
  stepIndex,
} from './workflow-model.mjs';

const workflow = readWorkflow('chromatic.yml');
const ciWorkflow = readWorkflow('ci-and-release.yml');
const job = (name) => getJob(workflow, name);

const SNAPSHOT_JOBS = [
  ['fresco-ui', '@codaco/fresco-ui', 'packages/fresco-ui', 'FRESCO_UI'],
  ['interview', '@codaco/interview', 'packages/interview', 'INTERVIEW'],
  ['interviewer', '@codaco/interviewer', 'apps/interviewer', 'INTERVIEWER'],
];

const packages = Object.fromEntries(
  SNAPSHOT_JOBS.map(([jobName, , directory]) => [
    jobName,
    JSON.parse(
      readFileSync(
        new URL(`../../${directory}/package.json`, import.meta.url),
        'utf8',
      ),
    ),
  ]),
);

function untraced(script) {
  return [...script.matchAll(/--untraced '([^']+)'/g)].map((match) => match[1]);
}

const runChromatic = (name) => getStep(job(name), { name: 'Run Chromatic' });

test('Chromatic runs only when someone asks for it', () => {
  // No push, pull_request, merge_group or workflow_run trigger: nothing
  // captures snapshots unless a person dispatches the workflow.
  assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch']);
});

test('Chromatic refuses every branch but the Version Packages branch', () => {
  const guard = job('release-branch');
  const step = getStep(guard, {
    name: 'Refuse any branch but the Version Packages branch',
  });
  assert.equal(step.env.REF_NAME, '${{ github.ref_name }}');
  assert.match(
    step.run,
    /if \[\[ "\$REF_NAME" != 'changeset-release\/main' \]\]; then[\s\S]*exit 1/,
  );
  for (const [jobName] of SNAPSHOT_JOBS) {
    assert.deepEqual(needsOf(job(jobName)), ['release-branch']);
  }
});

test('a newer request for the branch supersedes an older one', () => {
  assert.equal(workflow.concurrency.group, 'chromatic-${{ github.ref_name }}');
  assert.equal(workflow.concurrency['cancel-in-progress'], true);
});

test('each project builds its Storybook with TurboSnap metadata before uploading it', () => {
  for (const [jobName, packageName, directory] of SNAPSHOT_JOBS) {
    const body = job(jobName);
    const checkout = getStep(body, { uses: 'actions/checkout' });
    // TurboSnap needs the full history to find the ancestor build's commit.
    assert.equal(checkout.with['fetch-depth'], 0);
    const build = getStep(body, { name: 'Build Storybook' });
    assert.equal(
      build.run,
      `pnpm exec turbo run build-storybook --filter=${packageName}`,
    );
    const verify = getStep(body, { name: 'Verify TurboSnap metadata' });
    assert.equal(
      verify.run,
      `test -s ${directory}/storybook-static/preview-stats.json`,
    );
    assert.ok(body.steps.indexOf(build) < body.steps.indexOf(verify));
    assert.ok(
      body.steps.indexOf(verify) < body.steps.indexOf(runChromatic(jobName)),
    );
  }
});

test('Chromatic records the release head and fails on changes nobody accepted', () => {
  for (const [jobName, packageName, , token] of SNAPSHOT_JOBS) {
    const run = runChromatic(jobName);
    assert.equal(
      run.env.CHROMATIC_PROJECT_TOKEN,
      `\${{ secrets.CHROMATIC_PROJECT_TOKEN_${token} }}`,
    );
    // The CLI ignores these unless all three are set.
    assert.equal(run.env.CHROMATIC_SHA, '${{ github.sha }}');
    assert.equal(run.env.CHROMATIC_BRANCH, '${{ github.ref_name }}');
    assert.equal(run.env.CHROMATIC_SLUG, '${{ github.repository }}');
    assert.ok(
      run.run.includes(
        `pnpm --filter ${packageName} chromatic \\\n  --skip-update-check --no-interactive \\\n  --log-file="$RUNNER_TEMP/chromatic-${jobName}.log" \\\n  --diagnostics-file="$RUNNER_TEMP/chromatic-${jobName}-diagnostics.json"`,
      ),
    );
    assert.doesNotMatch(
      JSON.stringify(raw(job(jobName))),
      /--skip |--force-rebuild|--exit-zero-on-changes|--auto-accept-changes/,
    );
  }
});

test('a build Chromatic did not compare fails the run', () => {
  for (const [jobName] of SNAPSHOT_JOBS) {
    const body = job(jobName);
    const confirm = getStep(body, {
      name: 'Confirm Chromatic tested the stories',
    });
    assert.equal(confirm.if, 'always()');
    assert.equal(
      confirm.run,
      `node scripts/ci/chromatic-observability.mjs ${jobName} "$RUNNER_TEMP/chromatic-${jobName}.log"`,
    );
    assert.equal(confirm['continue-on-error'], undefined);
    assert.ok(
      body.steps.indexOf(runChromatic(jobName)) < body.steps.indexOf(confirm),
    );
  }
});

test('Chromatic logs and diagnostics are kept for the review', () => {
  const uploads = Object.keys(workflow.jobs).flatMap((name) =>
    findSteps(job(name), { uses: 'actions/upload-artifact' }),
  );
  assert.equal(uploads.length, SNAPSHOT_JOBS.length);
  for (const upload of uploads) {
    assert.match(upload.uses, /^actions\/upload-artifact@[a-f0-9]{40}$/);
    assert.equal(upload.if, 'always()');
    assert.equal(upload.with['if-no-files-found'], 'ignore');
  }
});

test("a successful review re-runs the release PR's failed CI jobs", () => {
  const refresh = job('refresh-release-check');
  assert.deepEqual(
    needsOf(refresh).toSorted(),
    SNAPSHOT_JOBS.map(([jobName]) => jobName).toSorted(),
  );
  assert.equal(refresh.if, undefined, 'runs only when every project passed');
  assert.deepEqual(refresh.permissions, { actions: 'write' });
  const step = getStep(refresh, {
    name: "Re-run the release PR's failed CI jobs",
  });
  assert.equal(step.env.HEAD_SHA, '${{ github.sha }}');
  assert.match(
    step.run,
    /actions\/workflows\/ci-and-release\.yml\/runs\?event=pull_request&head_sha=\$\{HEAD_SHA\}/,
  );
  assert.match(step.run, /gh run rerun "\$run_id" --failed/);
  assert.equal(workflow.permissions.contents, 'read');
  assert.equal(workflow.permissions.actions, undefined);
});

test('the release PR check reads this workflow for its exact head', () => {
  const freshness = getJob(ciWorkflow, 'version-packages-freshness');
  const resolve = getStep(freshness, { id: 'head' });
  assert.match(resolve.run, /release_head=\$PR_HEAD_SHA/);
  assert.match(resolve.run, /release_head=\$vp_head/);
  assert.match(resolve.run, /echo "release_head=\$release_head"/);

  const review = getStep(freshness, {
    name: 'Refuse a release PR whose visual review has not passed',
  });
  assert.equal(review.if, "steps.head.outputs.release_pr == 'true'");
  assert.equal(
    review.env.RELEASE_HEAD,
    '${{ steps.head.outputs.release_head }}',
  );
  assert.equal(review.env.ENFORCEMENT, '${{ vars.CHROMATIC_RELEASE_REVIEW }}');
  assert.match(
    review.run,
    /actions\/workflows\/chromatic\.yml\/runs\?event=workflow_dispatch&branch=changeset-release\/main&head_sha=\$\{RELEASE_HEAD\}&status=success/,
  );
  assert.match(
    review.run,
    /if \[\[ "\$ENFORCEMENT" == 'required' \]\]; then\n\s+echo "::error[^\n]*\n\s+exit 1/,
  );
  // A failed API call must fail the job, never read as a missing review that
  // only warns.
  assert.doesNotMatch(raw(review).run, /\|\| true|2>\/dev\/null|set \+e/);
  assert.ok(
    stepIndex(freshness, { id: 'head' }) < freshness.steps.indexOf(review),
  );
});

test('Chromatic scripts use TurboSnap and leave acceptance to the review', () => {
  for (const [project, manifest] of Object.entries(packages)) {
    const script = manifest.scripts.chromatic;
    assert.match(script, /--only-changed/);
    assert.match(script, /--storybook-base-dir=/);
    assert.match(script, /--storybook-config-dir=\.storybook/);
    assert.doesNotMatch(script, /--exit-zero-on-changes/);
    assert.doesNotMatch(script, /--exit-once-uploaded/);
    assert.doesNotMatch(script, /--auto-accept-changes/);
    assert.ok(
      untraced(script).length > 0,
      `${project} has narrow untraced rules`,
    );
  }
});

test('untraced manifests are project-specific and exclude critical inputs', () => {
  const expected = {
    'fresco-ui': [
      'apps/architect/package.json',
      'apps/architect-classic/package.json',
      'apps/interviewer/package.json',
      'apps/interviewer-classic/package.json',
      'packages/interview/package.json',
      'packages/site-navigation-element/package.json',
    ],
    'interview': [
      'apps/architect/package.json',
      'apps/architect-classic/package.json',
      'apps/interviewer/package.json',
      'apps/interviewer-classic/package.json',
      'packages/site-navigation-element/package.json',
    ],
    'interviewer': [
      'apps/architect/package.json',
      'apps/architect-classic/package.json',
      'apps/interviewer-classic/package.json',
      'packages/site-navigation-element/package.json',
    ],
  };
  const critical = new Set([
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'packages/fresco-ui/package.json',
    'tooling/tailwind/package.json',
  ]);

  for (const [project, manifest] of Object.entries(packages)) {
    const paths = untraced(manifest.scripts.chromatic);
    assert.deepEqual(paths, expected[project]);
    assert.equal(
      paths.some((path) => critical.has(path)),
      false,
      `${project} keeps critical inputs traced`,
    );
  }
});
