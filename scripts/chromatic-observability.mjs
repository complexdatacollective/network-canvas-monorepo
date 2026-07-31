import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const ANSI_ESCAPE_PATTERN =
  // oxlint-disable-next-line no-control-regex -- Chromatic logs contain ANSI styling.
  /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[\dA-PR-TZcf-nq-uy=><~]|(?:[\dA-PR-TZcf-nq-uy=><~](?:;[-a-zA-Z\d/#&.:=?%@~_]+)*))\u0007)|(?:(?:\d{1,4}(?:[;:]\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g;
const SNAPSHOT_COUNTS_PATTERN =
  /\b(?:Captured|Capturing)\s+([\d,]+)\s+snapshots?\s+and\s+(?:skipped|skipping)\s+([\d,]+)\s+snapshots?\.?/i;
const TURBOSNAP_DISABLED_PATTERN =
  /\bTurboSnap disabled(?: due to ([^\r\n]+))?/i;
const FULL_BUILD_REASON_PATTERN =
  /\bA full build is required because ([^\r\n]+?)(?:\.|$)/i;
const FILE_CHANGE_PATTERN = /\bFound a (.+ change in .+)$/i;

function cleanLog(log) {
  return log
    .replace(ANSI_ESCAPE_PATTERN, '')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseCount(value) {
  const count = Number(value.replaceAll(',', ''));
  return Number.isSafeInteger(count) ? count : null;
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

function findState(log, mode) {
  if (
    mode === 'skipped' ||
    /\bSkipped build for commit [0-9a-f]+ due to --skip\b/i.test(log) ||
    /\bSkipping Chromatic build locally because --skip is enabled\b/i.test(log)
  ) {
    return 'skipped';
  }
  if (/\bSnapshot quota reached\b/i.test(log)) return 'quota-limited';
  if (/\bPayment required\b/i.test(log)) return 'payment-limited';
  if (/\bBuild limited\b/i.test(log)) return 'limited';
  return 'reported';
}

export function parseChromaticLog(log, { mode = 'affected' } = {}) {
  if (typeof log !== 'string') {
    throw new TypeError('Chromatic log must be a string');
  }
  if (!['affected', 'skipped'].includes(mode)) {
    throw new TypeError('Chromatic mode must be affected or skipped');
  }

  const lines = cleanLog(log);
  const clean = lines.join('\n');
  const counts = clean.match(SNAPSHOT_COUNTS_PATTERN);
  const bailoutReason = findBailout(lines);
  const turboSnapEnabled = /\bTurboSnap enabled\b/i.test(clean);

  return {
    state: findState(clean, mode),
    snapshotsCaptured: counts ? parseCount(counts[1]) : null,
    snapshotsInherited: counts ? parseCount(counts[2]) : null,
    buildScope:
      mode === 'skipped'
        ? 'skipped'
        : bailoutReason
          ? 'full'
          : turboSnapEnabled || counts
            ? 'partial'
            : 'unavailable',
    bailoutReason,
  };
}

function markdownCell(value) {
  return String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function displayedCount(value) {
  return value === null ? 'unavailable' : value.toLocaleString('en-US');
}

export function formatChromaticSummary(project, mode, result) {
  const scope = result.bailoutReason
    ? `${result.buildScope}: ${result.bailoutReason}`
    : result.buildScope;
  const countsUnavailable =
    result.snapshotsCaptured === null || result.snapshotsInherited === null;

  return [
    '### Chromatic observability',
    '',
    '| Project | Selection | Status | Snapshots captured | TurboSnapped / inherited | Build scope |',
    '| --- | --- | --- | ---: | ---: | --- |',
    `| ${markdownCell(project)} | ${mode} | ${result.state} | ${displayedCount(result.snapshotsCaptured)} | ${displayedCount(result.snapshotsInherited)} | ${markdownCell(scope)} |`,
    ...(countsUnavailable
      ? [
          '',
          `> ${markdownCell(project)}: Chromatic did not report optional snapshot counts; unavailable values are left explicit.`,
        ]
      : []),
    ...(result.buildScope === 'full'
      ? [
          '',
          '> TurboSnap full-build bailout detected. Target: fewer than 10% of affected builds.',
        ]
      : []),
    '',
  ].join('\n');
}

function usageError(message) {
  throw new Error(
    `${message}\nUsage: node scripts/chromatic-observability.mjs <project> <log-path> <affected|skipped>`,
  );
}

function main() {
  const [project, logPath, mode, ...extraArguments] = process.argv.slice(2);
  if (!project || !logPath || !mode || extraArguments.length > 0) {
    usageError('Expected project, log path, and mode');
  }
  if (!['affected', 'skipped'].includes(mode)) {
    usageError(`Invalid mode: ${mode}`);
  }
  if (!process.env.GITHUB_STEP_SUMMARY) {
    usageError('GITHUB_STEP_SUMMARY is not set');
  }

  const log = readFileSync(logPath, 'utf8');
  const result = parseChromaticLog(log, { mode });
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    formatChromaticSummary(project, mode, result),
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
