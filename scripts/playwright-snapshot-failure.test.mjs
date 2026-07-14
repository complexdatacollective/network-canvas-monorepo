import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  classifyPlaywrightSnapshotFailure,
  isSnapshotOnlyFailureReport,
} from './playwright-snapshot-failure.mjs';

const classifierPath = fileURLToPath(
  new URL('./playwright-snapshot-failure.mjs', import.meta.url),
);

function runClassifier(path) {
  return execFileSync(
    process.execPath,
    [classifierPath, ...(path ? [path] : [])],
    { encoding: 'utf8' },
  );
}

const snapshotError = (
  message = 'expect(page).toHaveScreenshot(expected) failed',
) => ({
  message,
});

const screenshotAttachments = (base = 'summary') =>
  ['expected', 'actual', 'diff'].map((kind) => ({
    name: `${base}-${kind}.png`,
    contentType: 'image/png',
    path: `/test-results/${base}-${kind}.png`,
  }));

const result = ({
  errors = [snapshotError()],
  attachments = screenshotAttachments(),
  status = 'failed',
} = {}) => ({
  status,
  error: errors[0],
  errors,
  attachments,
});

const unexpectedTest = (results = [result()]) => ({
  status: 'unexpected',
  results,
});

function report(tests, { errors = [], unexpected = tests.length } = {}) {
  return {
    suites: [
      {
        specs: [{ tests }],
        suites: [],
      },
    ],
    errors,
    stats: { unexpected },
  };
}

test('recognises a snapshot-only unexpected failure', () => {
  const snapshotResult = result({
    errors: [
      snapshotError(
        'expect(page).toHaveScreenshot(expected) failed\n\nCall log:\n  - Expect "toHaveScreenshot" with timeout 10000ms',
      ),
    ],
  });
  snapshotResult.attachments.push({
    name: 'trace',
    contentType: 'application/zip',
    path: '/test-results/trace.zip',
  });

  assert.equal(
    isSnapshotOnlyFailureReport(report([unexpectedTest([snapshotResult])])),
    true,
  );
});

test('recognises the Playwright screenshot comparison error wording', () => {
  const comparisonError = snapshotError(
    'Screenshot comparison failed: 120 pixels are different.',
  );

  assert.equal(
    isSnapshotOnlyFailureReport(
      report([unexpectedTest([result({ errors: [comparisonError] })])]),
    ),
    true,
  );
});

test('accepts multiple screenshot errors when each has a complete attachment group', () => {
  const errors = [snapshotError(), snapshotError()];
  const finalResult = result({
    errors,
    attachments: [
      ...screenshotAttachments('summary'),
      ...screenshotAttachments('codebook'),
    ],
  });
  const nestedReport = report([]);
  nestedReport.suites[0].suites.push({
    specs: [{ tests: [unexpectedTest([finalResult])] }],
  });
  nestedReport.stats.unexpected = 1;

  assert.equal(isSnapshotOnlyFailureReport(nestedReport), true);
});

test('uses only the final retry result', () => {
  const functionalFailure = result({
    errors: [{ message: 'Expected locator to be visible' }],
    attachments: [],
  });

  assert.equal(
    isSnapshotOnlyFailureReport(
      report([unexpectedTest([functionalFailure, result()])]),
    ),
    true,
  );
  assert.equal(
    isSnapshotOnlyFailureReport(
      report([unexpectedTest([result(), functionalFailure])]),
    ),
    false,
  );
});

test('rejects reports without unexpected tests or with inconsistent stats', () => {
  assert.equal(
    isSnapshotOnlyFailureReport(report([], { unexpected: 0 })),
    false,
  );
  assert.equal(
    isSnapshotOnlyFailureReport(report([unexpectedTest()], { unexpected: 2 })),
    false,
  );
  assert.equal(
    isSnapshotOnlyFailureReport({
      ...report([unexpectedTest()]),
      suites: [{ specs: [{ tests: [unexpectedTest(), null] }] }],
    }),
    false,
  );
});

test('rejects global and functional errors', () => {
  assert.equal(
    isSnapshotOnlyFailureReport(
      report([unexpectedTest()], {
        errors: [{ message: 'Worker process exited unexpectedly' }],
      }),
    ),
    false,
  );

  const mixedErrors = [
    snapshotError(),
    { message: 'Expected locator to be visible' },
  ];
  assert.equal(
    isSnapshotOnlyFailureReport(
      report([
        unexpectedTest([
          result({
            errors: mixedErrors,
            attachments: [
              ...screenshotAttachments('summary'),
              ...screenshotAttachments('codebook'),
            ],
          }),
        ]),
      ]),
    ),
    false,
  );
});

test('rejects timeout failures, including screenshot matcher timeouts', () => {
  assert.equal(
    isSnapshotOnlyFailureReport(
      report([unexpectedTest([result({ status: 'timedOut' })])]),
    ),
    false,
  );

  assert.equal(
    isSnapshotOnlyFailureReport(
      report([
        unexpectedTest([
          result({
            errors: [
              snapshotError(
                'expect(page).toHaveScreenshot(expected) failed\n\nTimeout: 5000ms',
              ),
            ],
          }),
        ]),
      ]),
    ),
    false,
  );
});

test('requires expected, actual, and diff PNG attachments for every error', () => {
  assert.equal(
    isSnapshotOnlyFailureReport(
      report([
        unexpectedTest([
          result({ attachments: screenshotAttachments().slice(0, 2) }),
        ]),
      ]),
    ),
    false,
  );

  const nonPngDiff = screenshotAttachments();
  nonPngDiff[2] = {
    name: 'summary-diff.png',
    contentType: 'text/plain',
    path: '/test-results/summary-diff.png',
  };
  assert.equal(
    isSnapshotOnlyFailureReport(
      report([unexpectedTest([result({ attachments: nonPngDiff })])]),
    ),
    false,
  );
});

test('missing and invalid reports classify as false', (context) => {
  const directory = mkdtempSync(join(tmpdir(), 'playwright-report-test-'));
  const invalidPath = join(directory, 'invalid.json');
  writeFileSync(invalidPath, '{invalid json');
  context.after(() => rmSync(directory, { force: true, recursive: true }));

  assert.equal(classifyPlaywrightSnapshotFailure(), false);
  assert.equal(
    classifyPlaywrightSnapshotFailure(`${invalidPath}.missing`),
    false,
  );
  assert.equal(classifyPlaywrightSnapshotFailure(invalidPath), false);
});

test('CLI prints only true or false and exits successfully', (context) => {
  const directory = mkdtempSync(join(tmpdir(), 'playwright-report-cli-test-'));
  const validPath = join(directory, 'valid.json');
  const invalidPath = `${validPath}.missing`;
  writeFileSync(validPath, JSON.stringify(report([unexpectedTest()])));
  context.after(() => rmSync(directory, { force: true, recursive: true }));

  assert.equal(runClassifier(validPath), 'true\n');
  assert.equal(runClassifier(invalidPath), 'false\n');
  assert.equal(runClassifier(), 'false\n');
});
