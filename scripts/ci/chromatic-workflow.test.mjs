import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { test } from 'vitest';

import {
  findSteps,
  getJob,
  getStep,
  liveSteps,
  needsOf,
  readWorkflow,
  stepIndex,
} from './workflow-model.mjs';

const workflow = readWorkflow('chromatic.yml');
const job = (name) => getJob(workflow, name);
// Folded `>-` conditions arrive with their line breaks turned into spaces;
// compare them with runs of whitespace collapsed.
const flat = (text) => text.replace(/\s+/g, ' ').trim();

const PUSH_TO_DEFAULT =
  "(github.event_name == 'push' && github.ref_name == github.event.repository.default_branch)";
const SNAPSHOT_JOBS = [
  ['fresco-ui', '@codaco/fresco-ui', 'fresco_ui'],
  ['interview', '@codaco/interview', 'interview'],
  ['interviewer', '@codaco/interviewer', 'interviewer'],
];

const packages = {
  'fresco-ui': JSON.parse(
    readFileSync(
      new URL('../../packages/fresco-ui/package.json', import.meta.url),
      'utf8',
    ),
  ),
  'interview': JSON.parse(
    readFileSync(
      new URL('../../packages/interview/package.json', import.meta.url),
      'utf8',
    ),
  ),
  'interviewer': JSON.parse(
    readFileSync(
      new URL('../../apps/interviewer/package.json', import.meta.url),
      'utf8',
    ),
  ),
};

function untraced(script) {
  return [...script.matchAll(/--untraced '([^']+)'/g)].map((match) => match[1]);
}

const runChromatic = (name) => getStep(job(name), { name: 'Run Chromatic' });

test('all UI Test contexts are emitted for PR SHAs without merge-queue work', () => {
  assert.deepEqual(workflow.on.pull_request, { branches: ['main'] });
  assert.equal('merge_group' in workflow.on, false);
  assert.equal('pull_request_target' in workflow.on, false);
  assert.deepEqual(workflow.on.workflow_run, {
    workflows: ['CI and Release'],
    types: ['completed'],
  });
  assert.deepEqual(workflow.on.push.branches, ['main', 'changeset-release/**']);

  const statuses = job('required-statuses');
  const condition = flat(statuses.if);
  assert.doesNotMatch(JSON.stringify(statuses), /merge_group/);
  assert.ok(condition.includes("github.actor != 'dependabot[bot]'"));
  assert.ok(condition.includes("github.event_name == 'workflow_run'"));
  assert.ok(
    condition.includes(
      "github.event.workflow_run.actor.login == 'dependabot[bot]'",
    ),
  );
  assert.ok(
    condition.includes(
      "github.event.workflow_run.pull_requests[0].base.ref == 'main'",
    ),
  );
  assert.ok(
    condition.includes(
      'github.event.workflow_run.head_repository.full_name != github.repository',
    ),
  );
  assert.ok(
    condition.includes(
      "!startsWith(github.event.pull_request.head.ref, 'changeset-release/')",
    ),
  );

  const verifyHead = getStep(statuses, { id: 'verify-head' });
  assert.equal(verifyHead.if, "github.event_name == 'workflow_run'");
  assert.ok(
    verifyHead.run.includes(
      'git fetch --no-tags --depth=1 origin "refs/pull/$PR_NUMBER/head"',
    ),
  );

  const publish = getStep(statuses, {
    name: 'Publish passing UI Test statuses without snapshots',
  });
  assert.ok(
    stepIndex(statuses, { id: 'verify-head' }) <
      statuses.steps.indexOf(publish),
  );
  assert.equal(
    publish.env.CHROMATIC_SHA,
    '${{ github.event.pull_request.head.sha || github.event.workflow_run.head_sha || github.sha }}',
  );
  assert.ok(
    publish.run.includes('--skip --skip-update-check --no-interactive'),
  );
  for (const [project, packageName] of SNAPSHOT_JOBS) {
    assert.match(
      publish.run,
      new RegExp(`^run_skip ${project} ${packageName} `, 'm'),
    );
  }
});

test('release runs serialize by ref while main builds are commit-scoped', () => {
  const { concurrency } = workflow;
  assert.ok(concurrency, 'top-level concurrency exists');
  assert.match(concurrency.group, /github\.event_name/);
  assert.match(concurrency.group, /github\.ref_name/);
  assert.ok(
    concurrency.group.includes(
      'github.ref_name == github.event.repository.default_branch && github.sha',
    ),
  );
  assert.equal(concurrency['cancel-in-progress'], true);
});

test('Chromatic diagnostic logs are retained briefly without changing status semantics', () => {
  const uploads = Object.keys(workflow.jobs).flatMap((name) =>
    findSteps(job(name), { uses: 'actions/upload-artifact' }),
  );
  assert.equal(uploads.length, 5);
  for (const upload of uploads) {
    assert.match(upload.uses, /^actions\/upload-artifact@[a-f0-9]{40}$/);
    assert.equal(upload.if, 'always()');
    assert.equal(upload.with['retention-days'], 7);
    assert.equal(upload.with['if-no-files-found'], 'ignore');
  }
});

test('release selection uses the fail-closed lockfile-aware detector', () => {
  const detect = job('detect');
  const affected = getStep(detect, { id: 'affected' });
  assert.equal(
    detect.outputs.fresco_ui,
    '${{ steps.affected.outputs.fresco_ui }}',
  );
  assert.ok(affected.run.includes('node scripts/ci/chromatic-affected.mjs'));
  assert.ok(affected.run.includes('--base "$BEFORE_SHA"'));
  assert.ok(affected.run.includes('--release-ref "$GITHUB_REF_NAME"'));
  assert.ok(affected.run.includes('--main "origin/$DEFAULT_BRANCH"'));
  assert.equal(affected.env.BEFORE_SHA, '${{ github.event.before }}');
  assert.doesNotMatch(JSON.stringify(detect), /git merge-base/);
  assert.ok(affected.run.includes('} >> "$GITHUB_STEP_SUMMARY"'));
});

test('default-branch pushes replace release-branch skip builds with real builds', () => {
  const detect = job('detect');
  assert.ok(
    flat(detect.if).includes(
      "(github.ref_name == github.event.repository.default_branch || github.actor != 'dependabot[bot]')",
    ),
  );
  const affected = getStep(detect, { id: 'affected' });
  assert.ok(
    affected.run.includes(
      'if [[ "$GITHUB_EVENT_NAME" == "push" && "$GITHUB_REF_NAME" == "$DEFAULT_BRANCH" ]]; then\n  selection=',
    ),
  );
  assert.ok(
    affected.run.includes('default branch needs a complete target build'),
  );

  const skipped = job('skip-unaffected');
  assert.ok(flat(skipped.if).includes(`!${PUSH_TO_DEFAULT}`));

  for (const [jobName, packageName, output] of SNAPSHOT_JOBS) {
    const body = job(jobName);
    assert.equal(
      flat(body.if),
      `${PUSH_TO_DEFAULT} || needs.detect.outputs.${output} == 'true'`,
    );
    const build = getStep(body, { name: 'Build Storybook' });
    assert.equal(
      build.run,
      `pnpm exec turbo run build-storybook --filter=${packageName}`,
    );
    const run = runChromatic(jobName);
    assert.ok(body.steps.indexOf(build) < body.steps.indexOf(run));
    assert.equal(
      run.env.DEFAULT_BRANCH,
      '${{ github.event.repository.default_branch }}',
    );
    assert.ok(
      run.run.includes(
        'if [[ "$GITHUB_EVENT_NAME" == "push" && "$GITHUB_REF_NAME" == "$DEFAULT_BRANCH" ]]; then\n  chromatic_args+=(--force-rebuild)\nfi',
      ),
    );
    assert.doesNotMatch(JSON.stringify(body), /--skip /);
  }
});

test('unaffected release projects call Chromatic skip from one setup job', () => {
  const skipped = job('skip-unaffected');
  assert.deepEqual(needsOf(skipped), ['detect']);
  const setup = getStep(skipped, { uses: './.github/actions/turbo-ci-setup' });
  assert.equal(setup.with['ignore-scripts'], true);
  const publish = getStep(skipped, {
    name: 'Publish unaffected UI Test statuses without snapshots',
  });
  assert.ok(skipped.steps.indexOf(setup) < skipped.steps.indexOf(publish));
  assert.ok(
    publish.run.includes('--skip --skip-update-check --no-interactive'),
  );
  for (const [project, packageName, output] of SNAPSHOT_JOBS) {
    assert.match(
      publish.run,
      new RegExp(`^ *run_skip ${project} ${packageName} `, 'm'),
    );
    const affectedVariable = `${output.toUpperCase()}_AFFECTED`;
    assert.equal(
      publish.env[affectedVariable],
      `\${{ needs.detect.outputs.${output} }}`,
    );
    assert.ok(
      publish.run.includes(`if [[ "$${affectedVariable}" != "true" ]]; then`),
    );
  }

  for (const [jobName, , output] of SNAPSHOT_JOBS) {
    const body = job(jobName);
    assert.deepEqual(needsOf(body), ['detect']);
    assert.ok(
      flat(body.if).endsWith(`needs.detect.outputs.${output} == 'true'`),
    );
    const directory =
      jobName === 'interviewer' ? 'apps/interviewer' : `packages/${jobName}`;
    const verify = getStep(body, { name: 'Verify TurboSnap metadata' });
    assert.equal(
      verify.run,
      `test -s ${directory}/storybook-static/preview-stats.json`,
    );
    assert.ok(
      stepIndex(body, { name: 'Build Storybook' }) < body.steps.indexOf(verify),
    );
    assert.ok(
      body.steps.indexOf(verify) < body.steps.indexOf(runChromatic(jobName)),
    );
    const summary = getStep(body, { name: 'Summarize Chromatic build' });
    assert.equal(summary.if, 'always()');
    assert.ok(
      summary.run.includes('node scripts/ci/chromatic-observability.mjs'),
    );
    assert.ok(summary.run.includes(jobName));
    assert.doesNotMatch(JSON.stringify(liveSteps(body)), /--skip /);
  }
});

test('affected release projects pass runtime options through pnpm', () => {
  for (const [jobName, packageName] of SNAPSHOT_JOBS) {
    const { run } = runChromatic(jobName);
    assert.ok(
      run.includes(
        `pnpm --filter ${packageName} chromatic \\\n  "\${chromatic_args[@]}" \\\n  --log-file="$RUNNER_TEMP/chromatic-${jobName}.log"`,
      ),
    );
    assert.doesNotMatch(run, /pnpm --filter [^\n]+ chromatic -- \\/);
  }
});

test('Chromatic waits for rendering but leaves visual acceptance to UI Tests', () => {
  for (const [project, manifest] of Object.entries(packages)) {
    const script = manifest.scripts.chromatic;
    assert.match(script, /--only-changed/);
    assert.match(script, /--exit-zero-on-changes/);
    assert.match(script, /--storybook-base-dir=/);
    assert.match(script, /--storybook-config-dir=\.storybook/);
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
