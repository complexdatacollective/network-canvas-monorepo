// Surface tests that only passed on retry ("flaky") so CI retries don't quietly
// hide accumulating flakiness. Reads Playwright's JSON report and, if any test
// is flaky, writes a note to the GitHub job summary (and stdout). Exits 0 always
// — this is reporting, never a gate.

import { appendFileSync, readFileSync } from 'node:fs';

const REPORT = 'packages/interview/e2e/test-results/results.json';

let report;
try {
  report = JSON.parse(readFileSync(REPORT, 'utf8'));
} catch {
  // No report (e.g. the suite crashed before writing one) — nothing to surface.
  process.exit(0);
}

const flaky = [];
const walk = (suite) => {
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests ?? []) {
      if (test.status === 'flaky') {
        flaky.push(`${spec.title} [${test.projectName ?? 'unknown'}]`);
      }
    }
  }
  for (const child of suite.suites ?? []) walk(child);
};
for (const suite of report.suites ?? []) walk(suite);

if (flaky.length === 0) process.exit(0);

const md = [
  '### ⚠️ Flaky tests (passed only on retry)',
  '',
  'The job is green, but these failed then passed on retry. The flake is real —',
  'keep it on the radar (see tagged tests / tracking issues).',
  '',
  ...flaky.map((f) => `- \`${f}\``),
  '',
].join('\n');

console.log(md);
if (process.env.GITHUB_STEP_SUMMARY) {
  try {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md}\n`);
  } catch {
    // Best-effort write; a failed summary append must never gate CI. The
    // console.log above already carries the same content into the step log.
  }
}
