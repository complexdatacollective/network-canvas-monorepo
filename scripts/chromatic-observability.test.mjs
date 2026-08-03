import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  formatChromaticSummary,
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

test('uses skipped mode even when no optional Chromatic metrics exist', () => {
  assert.deepEqual(parseChromaticLog('', { mode: 'skipped' }), {
    state: 'skipped',
    snapshotsCaptured: null,
    snapshotsInherited: null,
    buildScope: 'skipped',
    bailoutReason: null,
  });
});

test('formats unavailable metrics and escapes Markdown cells', () => {
  const summary = formatChromaticSummary('Interview | Storybook', 'affected', {
    state: 'quota-limited',
    snapshotsCaptured: null,
    snapshotsInherited: null,
    buildScope: 'full',
    bailoutReason: 'config | static file',
  });

  assert.match(summary, /Interview \\| Storybook/);
  assert.match(summary, /unavailable \| unavailable/);
  assert.match(summary, /full: config \\| static file/);
  assert.match(summary, /did not report optional snapshot counts/);
  assert.match(summary, /Target: fewer than 10% of affected builds/);
});

test('CLI appends a summary and succeeds when optional metrics are unavailable', () => {
  const directory = mkdtempSync(join(tmpdir(), 'chromatic-observability-'));
  const logPath = join(directory, 'chromatic.log');
  const summaryPath = join(directory, 'summary.md');
  writeFileSync(logPath, 'Published your Storybook\n');
  writeFileSync(summaryPath, '# Existing summary\n');

  try {
    execFileSync(
      process.execPath,
      [scriptPath, 'Interviewer', logPath, 'affected'],
      {
        env: { ...process.env, GITHUB_STEP_SUMMARY: summaryPath },
      },
    );

    const summary = readFileSync(summaryPath, 'utf8');
    assert.match(summary, /^# Existing summary/m);
    assert.match(summary, /\| Interviewer \| affected \| reported \|/);
    assert.match(summary, /unavailable/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('CLI fails for invalid invocation', () => {
  const invocation = spawnSync(process.execPath, [scriptPath], {
    encoding: 'utf8',
  });
  assert.notEqual(invocation.status, 0);
  assert.match(invocation.stderr, /Usage:/);
});

test('CLI warns without failing when the optional log file is absent', () => {
  const directory = mkdtempSync(join(tmpdir(), 'chromatic-observability-'));
  const summaryPath = join(directory, 'summary.md');
  writeFileSync(summaryPath, '# Existing summary\n');

  try {
    const missingFile = spawnSync(
      process.execPath,
      [scriptPath, 'Interview', join(directory, 'missing.log'), 'affected'],
      {
        encoding: 'utf8',
        env: { ...process.env, GITHUB_STEP_SUMMARY: summaryPath },
      },
    );
    assert.equal(missingFile.status, 0);
    assert.match(
      missingFile.stdout,
      /::warning title=Chromatic diagnostics unavailable::/,
    );

    const summary = readFileSync(summaryPath, 'utf8');
    assert.match(summary, /^# Existing summary/m);
    assert.match(
      summary,
      /\| Interview \| affected \| diagnostics-unavailable \|/,
    );
    assert.match(summary, /unavailable/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
