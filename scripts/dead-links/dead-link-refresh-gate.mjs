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
  if (!Array.isArray(report.failures)) {
    throw new Error(`${path} is not a dead-link report`);
  }
  // A crawl that checked nothing is not a clean run, it is a run that did not
  // happen — a browser that never launched, a site that served no links. The
  // whole point of this gate is that it cannot be satisfied by a non-event, so
  // it insists on evidence that links were actually visited.
  if (
    !Number.isInteger(report.summary?.checked) ||
    report.summary.checked < 1
  ) {
    throw new Error(`${path} reports no checked links`);
  }
  if (!Number.isInteger(report.summary?.failed)) {
    throw new Error(`${path} reports no failure count`);
  }
  if (!Number.isInteger(report.refusals?.count)) {
    throw new Error(`${path} reports no refusal count`);
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
    // Count both the tally and the listed failures. They agree on any report
    // this repo writes; taking the larger means a disagreement fails the run
    // rather than letting the smaller number decide, which is the direction a
    // gate should err in.
    dead += Math.max(failed, report.failures.length);
    const { count, links, stale } = report.refusals;
    process.stdout.write(
      `${report.target}: ${checked} checked, ${failed} dead, ${count} refused, ${report.cache?.hits ?? 0} from cache\n`,
    );
    // Refusals here are the listed ones; an unlisted refusal is already a
    // failure in `failures`, so there is nothing to gate on — only to show.
    for (const refusal of links) {
      process.stdout.write(
        `  refused ${refusal.status} ${refusal.url} -> ${refusal.finalUrl}\n`,
      );
    }
    for (const url of stale ?? []) {
      process.stdout.write(
        `  no longer refused, prunable from the list: ${url}\n`,
      );
    }
    for (const failure of report.failures) {
      process.stdout.write(
        `::error title=Dead link::${failure.url} (${failure.error}) found on ${failure.foundOn.join(', ')}\n`,
      );
    }
  }
  if (dead > 0) {
    process.stderr.write(`\n${dead} dead link(s) across the public sites.\n`);
  }
  if (dead > 0) process.exitCode = 1;
}
