import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { test } from 'vitest';

import {
  formatChromaticSummary,
  isUntested,
  parseChromaticLog,
} from './chromatic-observability.mjs';

const scriptPath = fileURLToPath(
  new URL('./chromatic-observability.mjs', import.meta.url),
);

test('parses the Chromatic 18 TurboSnap count wording', () => {
  const result = parseChromaticLog(`
    ✔ TurboSnap enabled
    Capturing 12 snapshots, copying 517 TurboSnaps.
  `);

  assert.deepEqual(result, {
    state: 'reported',
    snapshotsCaptured: 12,
    snapshotsInherited: 517,
    buildScope: 'partial',
    bailoutReason: null,
  });
});

test('parses completed Chromatic 18 singular snapshot count wording', () => {
  const result = parseChromaticLog(`
    ✔ TurboSnap enabled
    Captured 1 snapshot, copied 1 TurboSnap.
  `);

  assert.equal(result.snapshotsCaptured, 1);
  assert.equal(result.snapshotsInherited, 1);
  assert.equal(result.buildScope, 'partial');
});

test('retains compatibility with Chromatic 17 snapshot count wording', () => {
  const result = parseChromaticLog(`
    ✔ TurboSnap enabled
    Captured 12 snapshots and skipped 517 snapshots.
  `);

  assert.equal(result.snapshotsCaptured, 12);
  assert.equal(result.snapshotsInherited, 517);
  assert.equal(result.buildScope, 'partial');
});

test('parses Chromatic 18 TurboSnap bypass counts', () => {
  const result = parseChromaticLog(`
    ✔ TurboSnap enabled
    Bypassed 529 snapshots because no frontend files were changed.
  `);

  assert.equal(result.snapshotsCaptured, 0);
  assert.equal(result.snapshotsInherited, 529);
  assert.equal(result.buildScope, 'partial');
});

test('ignores incomplete snapshot count lines without throwing', () => {
  const result = parseChromaticLog(`
    ✔ TurboSnap enabled
    Captured 12 snapshots.
  `);

  assert.equal(result.snapshotsCaptured, null);
  assert.equal(result.snapshotsInherited, null);
  assert.equal(result.buildScope, 'partial');
});

test('reports a full-build file-change reason and quota state from audited output', () => {
  const result = parseChromaticLog(`
    2026-07-30T16:39:12.3340238Z ⚠ TurboSnap disabled due to file change
    2026-07-30T16:39:12.3343193Z Found a Storybook config change in packages/fresco-ui/.storybook/main.ts
    2026-07-30T16:39:12.3346051Z A full build is required because this file cannot be linked to any specific stories.
    2026-07-30T16:39:12.3348421Z ℹ Read more at https://www.chromatic.com/docs/turbosnap#how-it-works
    2026-07-30T16:39:12.3351124Z ⚠ Snapshot quota reached
    2026-07-30T16:39:12.3353042Z This build is limited because your account is out of snapshots for the month.
  `);

  assert.deepEqual(result, {
    state: 'quota-limited',
    snapshotsCaptured: null,
    snapshotsInherited: null,
    buildScope: 'full',
    bailoutReason:
      'Storybook config change in packages/fresco-ui/.storybook/main.ts',
  });
  assert.equal(isUntested(result), true);
});

// Lines from fresco-ui build 3236 (CI run 45796485449, 26 Nov 2026), which
// the CLI and the workflow both reported as successful.
const BILLED_LIMIT_LOG = `
  09:58:31.891     → Found a change in apps/community-theme/package.json or one of its 13 siblings
  09:58:43.746 ⚠ Billed snapshot limit reached
               This build is limited because your account reached its billed snapshot limit for this billing period.
  09:58:43.747 ✔ Storybook published
               We found 105 components with 872 stories.
  09:58:43.748 Finalizing build
  09:58:43.748     → No tests run
  09:58:43.748 Test your stories
  09:58:43.748     → No UI tests or UI review enabled
`;

test('a build limited by the billed snapshot limit is untested', () => {
  const result = parseChromaticLog(BILLED_LIMIT_LOG);
  assert.equal(result.state, 'quota-limited');
  assert.equal(isUntested(result), true);
});

test('a project without UI Tests is untested', () => {
  const result = parseChromaticLog(`
    ✔ Storybook published
    → No UI tests or UI review enabled
  `);
  assert.equal(result.state, 'ui-tests-disabled');
  assert.equal(isUntested(result), true);
});

test('a build that compared its snapshots is tested', () => {
  for (const log of [
    'Capturing 12 snapshots, copying 517 TurboSnaps.',
    'Bypassed 529 snapshots because no frontend files were changed.',
  ]) {
    assert.equal(isUntested(parseChromaticLog(log)), false);
  }
});

test('reports other explicit TurboSnap bailout reasons without guessing', () => {
  const result = parseChromaticLog(`
    ⚠ TurboSnap disabled due to missing git history
    Could not retrieve changed files since baseline commit(s).
    We found 75 components with 529 stories.
  `);

  assert.equal(result.buildScope, 'full');
  assert.equal(result.bailoutReason, 'missing git history');
  assert.equal(result.snapshotsCaptured, null);
  assert.equal(result.snapshotsInherited, null);
});

test('does not treat unrelated story and upload counts as snapshot metrics', () => {
  const result = parseChromaticLog(`
    → Uploaded 3 files (204.95 kB), skipped 380 files
    We found 35 components with 88 stories.
    Published your Storybook
  `);

  assert.equal(result.snapshotsCaptured, null);
  assert.equal(result.snapshotsInherited, null);
  assert.equal(result.buildScope, 'unavailable');
});

test('formats unavailable metrics and escapes Markdown cells', () => {
  const summary = formatChromaticSummary('Interview | Storybook', {
    state: 'quota-limited',
    snapshotsCaptured: null,
    snapshotsInherited: null,
    buildScope: 'full',
    bailoutReason: 'config | static file',
  });

  assert.match(summary, /Interview \\| Storybook/);
  assert.match(summary, /unavailable \| unavailable/);
  assert.match(summary, /full: config \\| static file/);
  assert.match(summary, /did not report snapshot counts/);
  assert.match(summary, /captured every story in this project/);
  assert.match(summary, /does not count as a review/);
});

function runCli(log, project = 'Interviewer') {
  const directory = mkdtempSync(join(tmpdir(), 'chromatic-observability-'));
  const summaryPath = join(directory, 'summary.md');
  writeFileSync(summaryPath, '# Existing summary\n');
  const logPath = join(directory, 'chromatic.log');
  if (log !== null) writeFileSync(logPath, log);
  try {
    const invocation = spawnSync(
      process.execPath,
      [scriptPath, project, logPath],
      {
        encoding: 'utf8',
        env: { ...process.env, GITHUB_STEP_SUMMARY: summaryPath },
      },
    );
    return { invocation, summary: readFileSync(summaryPath, 'utf8') };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('CLI appends a summary and succeeds for a build that compared its snapshots', () => {
  const { invocation, summary } = runCli(
    'Capturing 12 snapshots, copying 517 TurboSnaps.\n',
  );
  assert.equal(invocation.status, 0, invocation.stderr);
  assert.match(summary, /^# Existing summary/m);
  assert.match(summary, /\| Interviewer \| reported \| 12 \| 517 \|/);
});

test('CLI fails a build that Chromatic did not test', () => {
  const { invocation, summary } = runCli(BILLED_LIMIT_LOG);
  assert.equal(invocation.status, 1);
  assert.match(
    invocation.stdout,
    /::error title=Chromatic did not test the stories::/,
  );
  assert.match(summary, /\| Interviewer \| quota-limited \|/);
});

test('CLI fails when the log is missing', () => {
  const { invocation, summary } = runCli(null, 'Interview');
  assert.equal(invocation.status, 1);
  assert.match(invocation.stdout, /::error title=Chromatic log missing::/);
  assert.equal(summary, '# Existing summary\n');
});

test('CLI fails for invalid invocation', () => {
  const invocation = spawnSync(process.execPath, [scriptPath], {
    encoding: 'utf8',
  });
  assert.notEqual(invocation.status, 0);
  assert.match(invocation.stderr, /Usage:/);
});
