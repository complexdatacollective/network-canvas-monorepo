#!/usr/bin/env node

/**
 * Fails the weekly cache refresh when either public site has a dead link.
 *
 * The crawl steps run with `continue-on-error` so one site's failure cannot
 * skip the other's crawl or the cache save. That makes the run green by
 * default, so this gate is what actually reports the verdict — and it insists
 * on finding both reports, because a crawl that died before writing one is a
 * failure the run must not swallow.
 */
import { readFile } from 'node:fs/promises';

async function readReport(path) {
  let report;
  try {
    report = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new Error(`Could not read the dead-link report at ${path}`, {
      cause: error,
    });
  }
  if (!Array.isArray(report.failures) || !report.summary) {
    throw new Error(`${path} is not a dead-link report`);
  }
  return report;
}

const paths = process.argv.slice(2);
if (paths.length === 0) {
  process.stderr.write('Usage: dead-link-refresh-gate.mjs <report>...\n');
  process.exitCode = 2;
} else {
  let dead = 0;
  for (const path of paths) {
    const report = await readReport(path);
    const { checked, failed } = report.summary;
    dead += failed;
    process.stdout.write(
      `${report.target}: ${checked} checked, ${failed} dead, ${report.cache.hits} from cache\n`,
    );
    for (const failure of report.failures) {
      process.stdout.write(
        `::error title=Dead link::${failure.url} (${failure.error}) found on ${failure.foundOn.join(', ')}\n`,
      );
    }
  }
  if (dead > 0) {
    process.stderr.write(`\n${dead} dead link(s) across the public sites.\n`);
    process.exitCode = 1;
  }
}
