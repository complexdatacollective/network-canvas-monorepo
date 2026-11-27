import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const ANSI_ESCAPE_PATTERN =
  // oxlint-disable-next-line no-control-regex -- Chromatic logs contain ANSI styling.
  /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[\dA-PR-TZcf-nq-uy=><~]|(?:[\dA-PR-TZcf-nq-uy=><~](?:;[-a-zA-Z\d/#&.:=?%@~_]+)*))\u0007)|(?:(?:\d{1,4}(?:[;:]\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g;
const SNAPSHOT_COUNTS_PATTERN =
  /\b(?:Captured|Capturing)\s+([\d,]+)\s+snapshots?(?:\s+and\s+(?:skipped|skipping)\s+([\d,]+)\s+snapshots?|,\s+(?:copied|copying)\s+([\d,]+)\s+TurboSnaps?)\.?/i;
const BYPASSED_SNAPSHOTS_PATTERN =
  /\bBypassed\s+([\d,]+)\s+snapshots?\s+because no frontend files were changed\.?/i;
const TURBOSNAP_DISABLED_PATTERN =
  /\bTurboSnap disabled(?: due to ([^\r\n]+))?/i;
const FULL_BUILD_REASON_PATTERN =
  /\bA full build is required because ([^\r\n]+?)(?:\.|$)/i;
const FILE_CHANGE_PATTERN = /\bFound a (.+ change in .+)$/i;

/**
 * States in which Chromatic published the Storybook without comparing it
 * with its baselines. The CLI still exits 0 for them, so a review run that
 * ends in one of them would otherwise read as a pass.
 */
const UNTESTED_STATES = new Set([
  'quota-limited',
  'payment-limited',
  'limited',
  'ui-tests-disabled',
]);

function cleanLog(log) {
  return log
    .replace(ANSI_ESCAPE_PATTERN, '')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseCount(value) {
  if (typeof value !== 'string') return null;
  const count = Number(value.replaceAll(',', ''));
  return Number.isSafeInteger(count) ? count : null;
}

function findSnapshotCounts(log) {
  const counts = log.match(SNAPSHOT_COUNTS_PATTERN);
  if (counts) {
    return {
      captured: parseCount(counts[1]),
      inherited: parseCount(counts[2] ?? counts[3]),
    };
  }

  const bypassed = log.match(BYPASSED_SNAPSHOTS_PATTERN);
  return bypassed ? { captured: 0, inherited: parseCount(bypassed[1]) } : null;
}

function findBailout(lines) {
  const disabledIndex = lines.findIndex((line) =>
    TURBOSNAP_DISABLED_PATTERN.test(line),
  );
  const fullBuildIndex = lines.findIndex((line) =>
    FULL_BUILD_REASON_PATTERN.test(line),
  );

  if (disabledIndex === -1 && fullBuildIndex === -1) return null;

  const nearbyStart = Math.max(
    0,
    disabledIndex === -1 ? fullBuildIndex - 2 : disabledIndex,
  );
  const nearbyEnd = Math.min(
    lines.length,
    (fullBuildIndex === -1 ? disabledIndex : fullBuildIndex) + 2,
  );
  const fileChange = lines
    .slice(nearbyStart, nearbyEnd)
    .find((line) => FILE_CHANGE_PATTERN.test(line));

  if (fileChange) return fileChange.match(FILE_CHANGE_PATTERN)?.[1] ?? null;

  const fullBuildReason =
    fullBuildIndex === -1
      ? null
      : lines[fullBuildIndex].match(FULL_BUILD_REASON_PATTERN)?.[1];
  if (fullBuildReason) return fullBuildReason;

  const disabledReason =
    disabledIndex === -1
      ? null
      : lines[disabledIndex].match(TURBOSNAP_DISABLED_PATTERN)?.[1];
  return disabledReason ?? 'TurboSnap disabled';
}

function findState(log) {
  if (
    /\b(?:Billed snapshot limit|Snapshot quota) reached\b/i.test(log) ||
    /\bThis build is limited because your account\b/i.test(log)
  ) {
    return 'quota-limited';
  }
  if (/\bPayment required\b/i.test(log)) return 'payment-limited';
  if (/\bBuild limited\b/i.test(log)) return 'limited';
  if (/\bNo UI tests or UI review enabled\b/i.test(log)) {
    return 'ui-tests-disabled';
  }
  return 'reported';
}

export function parseChromaticLog(log) {
  if (typeof log !== 'string') {
    throw new TypeError('Chromatic log must be a string');
  }

  const lines = cleanLog(log);
  const clean = lines.join('\n');
  const counts = findSnapshotCounts(clean);
  const bailoutReason = findBailout(lines);
  const turboSnapEnabled = /\bTurboSnap enabled\b/i.test(clean);

  return {
    state: findState(clean),
    snapshotsCaptured: counts?.captured ?? null,
    snapshotsInherited: counts?.inherited ?? null,
    buildScope: bailoutReason
      ? 'full'
      : turboSnapEnabled || counts
        ? 'partial'
        : 'unavailable',
    bailoutReason,
  };
}

export function isUntested(result) {
  return UNTESTED_STATES.has(result.state);
}

function markdownCell(value) {
  return String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function displayedCount(value) {
  return value === null ? 'unavailable' : value.toLocaleString('en-US');
}

export function formatChromaticSummary(project, result) {
  const scope = result.bailoutReason
    ? `${result.buildScope}: ${result.bailoutReason}`
    : result.buildScope;
  const countsUnavailable =
    result.snapshotsCaptured === null || result.snapshotsInherited === null;

  return [
    '### Chromatic',
    '',
    '| Project | Status | Snapshots captured | TurboSnapped / inherited | Build scope |',
    '| --- | --- | ---: | ---: | --- |',
    `| ${markdownCell(project)} | ${result.state} | ${displayedCount(result.snapshotsCaptured)} | ${displayedCount(result.snapshotsInherited)} | ${markdownCell(scope)} |`,
    ...(countsUnavailable
      ? [
          '',
          `> ${markdownCell(project)}: Chromatic did not report snapshot counts.`,
        ]
      : []),
    ...(result.buildScope === 'full'
      ? [
          '',
          '> TurboSnap captured every story in this project. The reason is in the Build scope column.',
        ]
      : []),
    ...(isUntested(result)
      ? [
          '',
          `> ${markdownCell(project)}: Chromatic published the Storybook without comparing it with the baselines (${result.state}). This run does not count as a review.`,
        ]
      : []),
    '',
  ].join('\n');
}

function usageError(message) {
  throw new Error(
    `${message}\nUsage: node scripts/ci/chromatic-observability.mjs <project> <log-path>`,
  );
}

function main() {
  const [project, logPath, ...extraArguments] = process.argv.slice(2);
  if (!project || !logPath || extraArguments.length > 0) {
    usageError('Expected project and log path');
  }
  if (!process.env.GITHUB_STEP_SUMMARY) {
    usageError('GITHUB_STEP_SUMMARY is not set');
  }

  let log;
  try {
    log = readFileSync(logPath, 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    // The log is the only evidence that the build compared anything, so a
    // run without one cannot count as a review.
    process.stdout.write(
      `::error title=Chromatic log missing::${project} wrote no Chromatic log, so this run cannot show that the stories were compared.\n`,
    );
    process.exitCode = 1;
    return;
  }

  const result = parseChromaticLog(log);
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    formatChromaticSummary(project, result),
  );

  if (isUntested(result)) {
    process.stdout.write(
      `::error title=Chromatic did not test the stories::${project}: Chromatic published the Storybook without comparing it with the baselines (${result.state}). Check the account's snapshot quota and the project's UI Tests setting, then run the workflow again.\n`,
    );
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
