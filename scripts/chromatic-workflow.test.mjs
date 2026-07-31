import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(
  new URL('../.github/workflows/chromatic.yml', import.meta.url),
  'utf8',
);

const packages = {
  'fresco-ui': JSON.parse(
    readFileSync(
      new URL('../packages/fresco-ui/package.json', import.meta.url),
      'utf8',
    ),
  ),
  'interview': JSON.parse(
    readFileSync(
      new URL('../packages/interview/package.json', import.meta.url),
      'utf8',
    ),
  ),
  'interviewer': JSON.parse(
    readFileSync(
      new URL('../apps/interviewer/package.json', import.meta.url),
      'utf8',
    ),
  ),
};

function job(name) {
  return workflow.match(
    new RegExp(
      `^ {2}${name}:\\n(?<body>[\\s\\S]*?)(?=^ {2}\\S|$(?![\\s\\S]))`,
      'm',
    ),
  )?.groups?.body;
}

function untraced(script) {
  return [...script.matchAll(/--untraced '([^']+)'/g)].map((match) => match[1]);
}

test('all required UI Test contexts are emitted for PR and merge queue SHAs', () => {
  assert.match(workflow, /^  pull_request:$/m);
  assert.match(workflow, /^  merge_group:$/m);
  assert.match(workflow, /^  workflow_run:$/m);
  assert.doesNotMatch(workflow, /pull_request_target/);
  assert.match(workflow, /- CI and Release/);
  assert.match(workflow, /branches:\n\s+- 'changeset-release\/\*\*'/);

  const statuses = job('required-statuses');
  assert.ok(statuses, 'required-statuses job exists');
  assert.match(statuses, /github\.event_name == 'merge_group'/);
  assert.match(statuses, /github\.actor != 'dependabot\[bot\]'/);
  assert.match(statuses, /github\.event_name == 'workflow_run'/);
  assert.match(statuses, /workflow_run\.actor\.login == 'dependabot\[bot\]'/);
  assert.match(
    statuses,
    /workflow_run\.head_repository\.full_name != github\.repository/,
  );
  assert.match(
    statuses,
    /!startsWith\(github\.event\.pull_request\.head\.ref, 'changeset-release\/'\)/,
  );
  assert.match(
    statuses,
    /CHROMATIC_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.event\.merge_group\.head_sha \|\| github\.event\.workflow_run\.head_sha \|\| github\.sha \}\}/,
  );
  assert.match(statuses, /refs\/pull\/\$PR_NUMBER\/head/);
  for (const packageName of [
    '@codaco/fresco-ui',
    '@codaco/interview',
    '@codaco/interviewer',
  ]) {
    assert.match(statuses, new RegExp(`run_skip [^\\n]+ ${packageName}`));
  }
  assert.match(statuses, /--skip --skip-update-check --no-interactive/);
});

test('release runs serialize by ref and cancel superseded work', () => {
  const concurrency = workflow.match(
    /^concurrency:\n(?<body>[\s\S]*?)\n\njobs:/m,
  )?.groups?.body;
  assert.ok(concurrency, 'top-level concurrency exists');
  assert.match(concurrency, /github\.event_name/);
  assert.match(concurrency, /github\.ref_name/);
  assert.match(concurrency, /cancel-in-progress: true/);
});

test('Chromatic diagnostic logs are retained briefly without changing status semantics', () => {
  assert.match(
    workflow,
    /actions\/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a/,
  );
  assert.equal(workflow.match(/retention-days: 7/g)?.length, 5);
  assert.equal(workflow.match(/if-no-files-found: ignore/g)?.length, 5);
});

test('release selection uses the fail-closed lockfile-aware detector', () => {
  const detect = job('detect');
  assert.ok(detect, 'detect job exists');
  assert.match(detect, /scripts\/chromatic-affected\.mjs/);
  assert.match(detect, /--base "\$BEFORE_SHA"/);
  assert.match(detect, /--release-ref "\$GITHUB_REF_NAME"/);
  assert.match(detect, /--main "origin\/\$DEFAULT_BRANCH"/);
  assert.doesNotMatch(detect, /git merge-base/);
  assert.match(detect, /GITHUB_STEP_SUMMARY/);
});

test('unaffected release projects call Chromatic skip from one setup job', () => {
  const skipped = job('skip-unaffected');
  assert.ok(skipped, 'skip-unaffected job exists');
  assert.match(skipped, /ignore-scripts: true/);
  assert.match(skipped, /--skip --skip-update-check --no-interactive/);
  assert.match(skipped, /run_skip fresco-ui @codaco\/fresco-ui/);
  assert.match(skipped, /run_skip interview @codaco\/interview/);
  assert.match(skipped, /run_skip interviewer @codaco\/interviewer/);

  for (const [jobName, output] of [
    ['fresco-ui', 'fresco_ui'],
    ['interview', 'interview'],
    ['interviewer', 'interviewer'],
  ]) {
    const body = job(jobName);
    assert.ok(body, `${jobName} job exists`);
    assert.match(
      body,
      new RegExp(`needs\\.detect\\.outputs\\.${output} == 'true'`),
    );
    assert.match(body, /Verify TurboSnap metadata/);
    assert.match(body, /chromatic-observability\.mjs/);
    assert.doesNotMatch(body, /--skip /);
  }
});

test('affected release projects pass runtime options through pnpm', () => {
  for (const [jobName, packageName] of [
    ['fresco-ui', '@codaco/fresco-ui'],
    ['interview', '@codaco/interview'],
    ['interviewer', '@codaco/interviewer'],
  ]) {
    const body = job(jobName);
    assert.ok(body, `${jobName} job exists`);
    assert.match(
      body,
      new RegExp(
        `pnpm --filter ${packageName.replace('/', '\\/')} chromatic \\\\\\n\\s+--skip-update-check --no-interactive \\\\\\n\\s+--log-file="\\$RUNNER_TEMP/chromatic-${jobName}\\.log"`,
      ),
    );
    assert.doesNotMatch(body, /pnpm --filter [^\n]+ chromatic -- \\/);
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
