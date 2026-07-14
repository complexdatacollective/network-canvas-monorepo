import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SCREENSHOT_ERROR_PATTERN =
  /(?:\btoHaveScreenshot\s*\(|Screenshot comparison failed)/i;
const TIMEOUT_ERROR_PATTERN =
  /(?:^|\n)\s*(?:Timeout(?:Error)?\b|Test timeout\b)|\btimed out\b/i;
const SCREENSHOT_ATTACHMENT_PATTERN =
  /^(?<base>.+)-(?<kind>expected|actual|diff)\.png$/i;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isScreenshotComparisonError(error) {
  if (!isRecord(error) || typeof error.message !== 'string') return false;

  return (
    SCREENSHOT_ERROR_PATTERN.test(error.message) &&
    !TIMEOUT_ERROR_PATTERN.test(error.message)
  );
}

function completeScreenshotAttachmentCount(attachments) {
  if (!Array.isArray(attachments)) return 0;

  const groups = new Map();
  for (const attachment of attachments) {
    if (
      !isRecord(attachment) ||
      attachment.contentType !== 'image/png' ||
      typeof attachment.name !== 'string' ||
      typeof attachment.path !== 'string' ||
      !attachment.path.toLowerCase().endsWith('.png')
    ) {
      continue;
    }

    const match = attachment.name.match(SCREENSHOT_ATTACHMENT_PATTERN);
    if (!match?.groups) continue;

    const base = match.groups.base.toLowerCase();
    const kind = match.groups.kind.toLowerCase();
    const group = groups.get(base) ?? new Set();
    group.add(kind);
    groups.set(base, group);
  }

  return [...groups.values()].filter(
    (group) =>
      group.has('expected') && group.has('actual') && group.has('diff'),
  ).length;
}

function collectTests(suites) {
  if (!Array.isArray(suites)) return null;

  const tests = [];
  for (const suite of suites) {
    if (!isRecord(suite) || !Array.isArray(suite.specs)) return null;

    for (const spec of suite.specs) {
      if (!isRecord(spec) || !Array.isArray(spec.tests)) return null;
      if (
        !spec.tests.every(
          (test) =>
            isRecord(test) &&
            typeof test.status === 'string' &&
            Array.isArray(test.results),
        )
      ) {
        return null;
      }
      tests.push(...spec.tests);
    }

    if (suite.suites !== undefined) {
      const childTests = collectTests(suite.suites);
      if (!childTests) return null;
      tests.push(...childTests);
    }
  }

  return tests;
}

function isSnapshotOnlyUnexpectedTest(test) {
  if (!isRecord(test) || !Array.isArray(test.results) || !test.results.length) {
    return false;
  }

  const finalResult = test.results.at(-1);
  if (
    !isRecord(finalResult) ||
    finalResult.status !== 'failed' ||
    !Array.isArray(finalResult.errors) ||
    !finalResult.errors.length ||
    !finalResult.errors.every(isScreenshotComparisonError)
  ) {
    return false;
  }

  if (
    finalResult.error !== undefined &&
    !isScreenshotComparisonError(finalResult.error)
  ) {
    return false;
  }

  return (
    completeScreenshotAttachmentCount(finalResult.attachments) >=
    finalResult.errors.length
  );
}

export function isSnapshotOnlyFailureReport(report) {
  if (
    !isRecord(report) ||
    !isRecord(report.stats) ||
    !Number.isSafeInteger(report.stats.unexpected) ||
    report.stats.unexpected <= 0 ||
    !Array.isArray(report.errors) ||
    report.errors.length > 0
  ) {
    return false;
  }

  const tests = collectTests(report.suites);
  if (!tests) return false;

  const unexpectedTests = tests.filter(
    (test) => isRecord(test) && test.status === 'unexpected',
  );

  return (
    unexpectedTests.length === report.stats.unexpected &&
    unexpectedTests.every(isSnapshotOnlyUnexpectedTest)
  );
}

export function classifyPlaywrightSnapshotFailure(reportPath) {
  if (!reportPath) return false;

  try {
    const report = JSON.parse(readFileSync(reportPath, 'utf8'));
    return isSnapshotOnlyFailureReport(report);
  } catch {
    return false;
  }
}

function main() {
  process.stdout.write(
    `${classifyPlaywrightSnapshotFailure(process.argv[2])}\n`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
