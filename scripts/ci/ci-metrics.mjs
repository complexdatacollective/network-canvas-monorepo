#!/usr/bin/env node
// Re-measures CI latency from the GitHub Actions API.
//
// A batch of CI latency fixes (Playwright cache warming, a cache janitor,
// Turborepo seed resilience, splitting the Studio server suite out of
// `test`, sharding the Architect E2E suite) was justified by ad-hoc queries
// against this API. Without a committed script nobody can tell whether those
// changes worked, or notice the pipeline drifting back afterwards — this is
// that script. Run it with no args for the last 7 days, or see --help.
//
// No dependencies beyond Node builtins: prefers `fetch` with a
// GITHUB_TOKEN/GH_TOKEN, and falls back to shelling out to `gh api` (which
// carries its own `gh auth` session) when neither is set.
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const DEFAULT_REPO = 'complexdatacollective/network-canvas-monorepo';
const WORKFLOW_NAME = 'CI and Release';
const CACHE_CEILING_BYTES = 10 * 1024 ** 3;

// These are the jobs that merely wait on everything else and report a
// combined verdict — `quality` is the required status check, `e2e-report`
// publishes the E2E status comment, `carry-forward-statuses` reruns
// skipped-but-required checks on push, `e2e-queue-watchdog` times out a
// stuck E2E queue. Each finishes in seconds once its dependencies do, so
// counting them as "the job that gated the run" (measurement 2) would
// report a fixed handful of seconds-long aggregators instead of the actual
// bottleneck a future reader is trying to find.
const AGGREGATOR_JOB_NAMES = new Set([
  'quality',
  'e2e-report',
  'carry-forward-statuses',
  'e2e-queue-watchdog',
]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @typedef {Object} WorkflowRun
 * @property {number} id
 * @property {string} event
 * @property {string} status
 * @property {string|null} conclusion
 * @property {string|null} run_started_at
 * @property {string} created_at
 * @property {string} updated_at
 * @property {string} head_branch
 */

/**
 * @typedef {Object} WorkflowJob
 * @property {number} id
 * @property {number} run_id
 * @property {string} name
 * @property {string} status
 * @property {string|null} conclusion
 * @property {string|null} started_at
 * @property {string|null} completed_at
 */

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

function printHelp() {
  console.log(`Usage: node scripts/ci-metrics.mjs [--days N] [--repo owner/name] [--json]

  --days N        Measurement window, in days ending now. Default: 7.
  --repo o/name   Repository to query. Default: ${DEFAULT_REPO}.
  --json          Print machine-readable JSON instead of a text report.

Auth: reads GITHUB_TOKEN or GH_TOKEN if set; otherwise shells out to
\`gh api\` (requires \`gh auth login\`).`);
}

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
  const args = { days: 7, repo: DEFAULT_REPO, json: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--days') {
      args.days = Number(argv[(i += 1)]);
    } else if (arg === '--repo') {
      args.repo = argv[(i += 1)];
    } else if (arg === '--json') {
      args.json = true;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg} (see --help)`);
    }
  }
  if (!Number.isFinite(args.days) || args.days <= 0) {
    throw new Error('--days must be a positive number');
  }
  return args;
}

// ---------------------------------------------------------------------------
// GitHub API transport: fetch with a token, or `gh api` as a fallback.
// Both paths expose the same { get(path) -> Promise<json> } shape and share
// rate-limit backoff, so everything above this layer is transport-agnostic.
// ---------------------------------------------------------------------------

/**
 * @param {string|null} token
 */
function createGitHubClient(token) {
  // Shared across every request this client makes (including the concurrent
  // ones from mapPool) so a burst of calls backs off together instead of
  // each one discovering the limit independently.
  let remaining = Infinity;
  let resetAtMs = 0;

  /** @param {{ get: (name: string) => string | null }} headers */
  function recordHeaders(headers) {
    const rem = headers.get('x-ratelimit-remaining');
    const reset = headers.get('x-ratelimit-reset');
    if (rem !== null) remaining = Number(rem);
    if (reset !== null) resetAtMs = Number(reset) * 1000;
  }

  async function throttleIfNeeded() {
    if (remaining > 2 || Date.now() >= resetAtMs) return;
    const waitMs = resetAtMs - Date.now() + 1000;
    process.stderr.write(
      `[ci-metrics] rate limit nearly exhausted (${remaining} left); sleeping ${Math.ceil(waitMs / 1000)}s until reset\n`,
    );
    await sleep(waitMs);
  }

  /** @param {string} apiPath */
  async function getViaFetch(apiPath) {
    await throttleIfNeeded();
    const res = await fetch(`https://api.github.com${apiPath}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'network-canvas-ci-metrics',
      },
    });
    recordHeaders(res.headers);
    if (res.status === 403 && res.headers.get('retry-after')) {
      await sleep(Number(res.headers.get('retry-after')) * 1000);
      return getViaFetch(apiPath);
    }
    if (!res.ok) {
      throw new Error(
        `GitHub API ${apiPath} failed: ${res.status} ${res.statusText}\n${await res.text()}`,
      );
    }
    return res.json();
  }

  /** @param {string} apiPath */
  async function getViaGhCli(apiPath) {
    await throttleIfNeeded();
    // `-i` prints the response headers ahead of the JSON body so we can read
    // rate-limit state the same way the fetch path does; without it `gh`
    // hands back only the body and this client would fly blind into 403s.
    const { stdout } = await execFileAsync('gh', ['api', '-i', apiPath], {
      maxBuffer: 1024 * 1024 * 128,
    });
    const splitAt =
      stdout.indexOf('\r\n\r\n') !== -1
        ? [stdout.indexOf('\r\n\r\n'), 4]
        : [stdout.indexOf('\n\n'), 2];
    const [sepIndex, sepLen] = splitAt;
    const headerBlock = stdout.slice(0, sepIndex);
    const bodyBlock = stdout.slice(sepIndex + sepLen);

    const headerMap = new Map();
    for (const line of headerBlock.split(/\r?\n/).slice(1)) {
      const match = /^([^:]+):\s?(.*)$/.exec(line);
      if (match) headerMap.set(match[1].toLowerCase(), match[2]);
    }
    recordHeaders({ get: (name) => headerMap.get(name) ?? null });

    const statusMatch = /^HTTP\/[\d.]+\s+(\d+)/.exec(
      headerBlock.split(/\r?\n/)[0] ?? '',
    );
    const status = statusMatch ? Number(statusMatch[1]) : 0;
    if (status === 403 && headerMap.get('retry-after')) {
      await sleep(Number(headerMap.get('retry-after')) * 1000);
      return getViaGhCli(apiPath);
    }
    if (status >= 400) {
      throw new Error(`gh api ${apiPath} failed: ${status}\n${bodyBlock}`);
    }
    return JSON.parse(bodyBlock);
  }

  return { get: token ? getViaFetch : getViaGhCli };
}

// ---------------------------------------------------------------------------
// Run fetching: the 1000-result pagination cap and the reconciliation that
// guards against it.
// ---------------------------------------------------------------------------

/** @param {Date} date */
function toGitHubTimestamp(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * `created` accepts an inclusive `start..end` range. Callers here work with
 * half-open [start, end) JS ranges (so adjacent buckets never overlap), so
 * this trims one second off the end to convert.
 * @param {Date} startInclusive
 * @param {Date} endExclusive
 */
function formatCreatedRange(startInclusive, endExclusive) {
  const inclusiveEnd = new Date(endExclusive.getTime() - 1000);
  return `${toGitHubTimestamp(startInclusive)}..${toGitHubTimestamp(inclusiveEnd)}`;
}

/**
 * Splits [start, end) into UTC calendar-day buckets, clipped to the window's
 * actual start/end. One bucket per day both gives us the per-day breakdown
 * measurement 1 needs and keeps each bucket's `created` query small enough
 * that it rarely needs the overflow handling in fetchRunsInRange below.
 * @param {Date} start
 * @param {Date} end
 */
function enumerateDayRanges(start, end) {
  const ranges = [];
  let cursor = start;
  while (cursor < end) {
    const nextMidnightUtc = new Date(
      Date.UTC(
        cursor.getUTCFullYear(),
        cursor.getUTCMonth(),
        cursor.getUTCDate() + 1,
      ),
    );
    const rangeEnd = nextMidnightUtc < end ? nextMidnightUtc : end;
    ranges.push({
      start: cursor,
      end: rangeEnd,
      day: cursor.toISOString().slice(0, 10),
    });
    cursor = rangeEnd;
  }
  return ranges;
}

/**
 * @param {{ event?: string, branch?: string }} filter
 * @param {{ createdRange: string, page: number, perPage: number }} paging
 */
function buildRunsQuery(filter, paging) {
  const params = new URLSearchParams();
  if (filter.event) params.set('event', filter.event);
  if (filter.branch) params.set('branch', filter.branch);
  params.set('created', paging.createdRange);
  params.set('per_page', String(paging.perPage));
  params.set('page', String(paging.page));
  return params.toString();
}

/**
 * Fetches every run in [start, end) for a given event/branch filter.
 *
 * `GET /actions/workflows/{id}/runs` reports an accurate `total_count` no
 * matter what, but silently refuses to paginate past 1000 results — asking
 * for page 11 of a 1500-result query returns an empty page, not an error, so
 * a naive "page until empty" loop looks correct and quietly drops results.
 * This repo produces roughly 5,500 Actions runs a week across all
 * workflows, so a query spanning more than a couple of days can plausibly
 * cross that cap even scoped to one workflow and one event. The fix: probe
 * total_count first, and if a range would need more than 1000 results,
 * bisect the time range instead of paginating past the cap. Every leaf
 * range's fetched count is checked against its own total_count, so a future
 * cap increase or an API regression fails loudly here rather than silently
 * truncating.
 * @param {ReturnType<typeof createGitHubClient>} client
 * @param {string} owner
 * @param {string} repo
 * @param {number} workflowId
 * @param {{ event?: string, branch?: string }} filter
 * @param {Date} start
 * @param {Date} end
 * @returns {Promise<WorkflowRun[]>}
 */
async function fetchRunsInRange(
  client,
  owner,
  repo,
  workflowId,
  filter,
  start,
  end,
) {
  if (start >= end) return [];
  const createdRange = formatCreatedRange(start, end);
  const firstPage = await client.get(
    `/repos/${owner}/${repo}/actions/workflows/${workflowId}/runs?${buildRunsQuery(filter, { createdRange, page: 1, perPage: 100 })}`,
  );
  const totalCount = firstPage.total_count;
  if (totalCount === 0) return [];

  if (totalCount > 1000) {
    const midpoint = new Date((start.getTime() + end.getTime()) / 2);
    if (
      midpoint.getTime() <= start.getTime() ||
      midpoint.getTime() >= end.getTime()
    ) {
      // Sub-second range that still reports >1000 runs cannot happen at
      // GitHub's actual timestamp granularity; fail loudly rather than spin.
      throw new Error(
        `Cannot bisect ${createdRange} any further — it still reports ${totalCount} runs`,
      );
    }
    const [left, right] = await Promise.all([
      fetchRunsInRange(
        client,
        owner,
        repo,
        workflowId,
        filter,
        start,
        midpoint,
      ),
      fetchRunsInRange(client, owner, repo, workflowId, filter, midpoint, end),
    ]);
    return [...left, ...right];
  }

  const runs = [...firstPage.workflow_runs];
  const pageCount = Math.ceil(totalCount / 100);
  for (let page = 2; page <= pageCount; page += 1) {
    const data = await client.get(
      `/repos/${owner}/${repo}/actions/workflows/${workflowId}/runs?${buildRunsQuery(filter, { createdRange, page, perPage: 100 })}`,
    );
    runs.push(...data.workflow_runs);
  }
  if (runs.length !== totalCount) {
    throw new Error(
      `Pagination mismatch for ${createdRange}: fetched ${runs.length} runs but total_count was ${totalCount}`,
    );
  }
  return runs;
}

/**
 * Fetches every run for a filter across the whole [start, end) window, one
 * day-bucket at a time, then reconciles the sum against a single
 * whole-window total_count. Per-bucket reconciliation (in fetchRunsInRange)
 * catches an overflowing bucket; this second check catches a day-boundary
 * bug — an off-by-one in enumerateDayRanges double-counting or dropping the
 * boundary second — that per-bucket checks alone would not.
 * @param {ReturnType<typeof createGitHubClient>} client
 * @param {string} owner
 * @param {string} repo
 * @param {number} workflowId
 * @param {{ event?: string, branch?: string }} filter
 * @param {Date} start
 * @param {Date} end
 */
async function fetchRunsForWindow(
  client,
  owner,
  repo,
  workflowId,
  filter,
  start,
  end,
) {
  const dayRanges = enumerateDayRanges(start, end);
  const perDay = await Promise.all(
    dayRanges.map((range) =>
      fetchRunsInRange(
        client,
        owner,
        repo,
        workflowId,
        filter,
        range.start,
        range.end,
      ),
    ),
  );
  const runs = perDay.flat();

  const whole = await client.get(
    `/repos/${owner}/${repo}/actions/workflows/${workflowId}/runs?${buildRunsQuery(filter, { createdRange: formatCreatedRange(start, end), page: 1, perPage: 1 })}`,
  );
  if (whole.total_count !== runs.length) {
    throw new Error(
      `Reconciliation failed for event=${filter.event ?? 'all'}: collected ${runs.length} runs across ${dayRanges.length} day-bucket(s), but the whole-window total_count is ${whole.total_count}`,
    );
  }

  return {
    runs,
    byDay: dayRanges.map((range, i) => ({
      day: range.day,
      count: perDay[i].length,
    })),
  };
}

/**
 * @param {ReturnType<typeof createGitHubClient>} client
 * @param {string} owner
 * @param {string} repo
 */
async function resolveWorkflowId(client, owner, repo) {
  let page = 1;
  while (true) {
    const data = await client.get(
      `/repos/${owner}/${repo}/actions/workflows?per_page=100&page=${page}`,
    );
    const match = data.workflows.find((w) => w.name === WORKFLOW_NAME);
    if (match) return match.id;
    if (data.workflows.length < 100) break;
    page += 1;
  }
  throw new Error(
    `No workflow named "${WORKFLOW_NAME}" found in ${owner}/${repo}`,
  );
}

// ---------------------------------------------------------------------------
// Job fetching, with an on-disk cache for completed runs.
// ---------------------------------------------------------------------------

/**
 * Bounded concurrent map. Job-level data needs one API call per run, and
 * this repo can have thousands of runs in a week-long window, so fetching
 * serially or fully in parallel are both wrong (too slow, or an instant
 * secondary rate limit); a small worker pool keeps steady throughput.
 * @template T, R
 * @param {T[]} items
 * @param {(item: T) => Promise<R>} worker
 * @param {number} concurrency
 * @returns {Promise<R[]>}
 */
async function mapPool(items, worker, concurrency) {
  const results = Array.from({ length: items.length });
  let nextIndex = 0;
  async function runWorker() {
    while (true) {
      const current = nextIndex;
      nextIndex += 1;
      if (current >= items.length) return;
      results[current] = await worker(items[current]);
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.max(1, Math.min(concurrency, items.length)) },
      runWorker,
    ),
  );
  return results;
}

/**
 * Job lists for a *completed* run never change, so they are cached on disk
 * keyed by run id and read back on a re-run instead of refetched. The cache
 * lives under the OS temp dir rather than inside the repo: that keeps it out
 * of git without this script needing to own a .gitignore entry, and it
 * persists across invocations the same way a repo-local cache dir would.
 * @param {ReturnType<typeof createGitHubClient>} client
 * @param {string} cacheDir
 * @param {string} owner
 * @param {string} repo
 * @param {WorkflowRun} run
 * @returns {Promise<WorkflowJob[]>}
 */
async function fetchJobsForRun(client, cacheDir, owner, repo, run) {
  const cachePath = path.join(cacheDir, `${run.id}.json`);
  if (run.status === 'completed') {
    try {
      return JSON.parse(await readFile(cachePath, 'utf8'));
    } catch {
      // Not cached yet — fall through and fetch.
    }
  }

  const jobs = [];
  let page = 1;
  while (true) {
    const data = await client.get(
      `/repos/${owner}/${repo}/actions/runs/${run.id}/jobs?per_page=100&page=${page}`,
    );
    jobs.push(...data.jobs);
    if (data.jobs.length < 100) break;
    page += 1;
  }

  if (run.status === 'completed') {
    await mkdir(cacheDir, { recursive: true });
    await writeFile(cachePath, JSON.stringify(jobs));
  }
  return jobs;
}

// ---------------------------------------------------------------------------
// Cache inventory (measurement 4 — independent of run/job fetching above).
// ---------------------------------------------------------------------------

/**
 * @param {ReturnType<typeof createGitHubClient>} client
 * @param {string} owner
 * @param {string} repo
 */
async function fetchAllCaches(client, owner, repo) {
  const caches = [];
  let page = 1;
  while (true) {
    const data = await client.get(
      `/repos/${owner}/${repo}/actions/caches?per_page=100&page=${page}`,
    );
    caches.push(...data.actions_caches);
    if (data.actions_caches.length < 100) break;
    page += 1;
  }
  return caches;
}

/** @param {string} key */
function categorizeCacheKey(key) {
  if (key.startsWith('turbogha')) return 'turbo';
  if (/codeql/i.test(key)) return 'codeql';
  if (/playwright/i.test(key)) return 'playwright';
  if (key.startsWith('node-cache')) return 'pnpm';
  return 'other';
}

// ---------------------------------------------------------------------------
// Stats helpers
// ---------------------------------------------------------------------------

/** @param {number[]} values */
function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Nearest-rank percentile.
 * @param {number[]} values
 * @param {number} p
 */
function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.min(Math.max(rank, 0), sorted.length - 1)];
}

/** @param {number[]} values */
function max(values) {
  return values.length === 0 ? null : Math.max(...values);
}

// ---------------------------------------------------------------------------
// Job-name normalization: matrix instances report as e.g. "test (unit)" —
// collapse to the base job name so "test" is one bucket, not one per shard.
// ---------------------------------------------------------------------------

/** @param {string} name */
function baseJobName(name) {
  return name.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

// ---------------------------------------------------------------------------
// Measurement 1: gate latency (quality job, pull_request runs)
// ---------------------------------------------------------------------------

/**
 * @param {{ day: string, seconds: number, red: boolean }[]} entries
 */
function summarizeLatency(entries) {
  const seconds = entries.map((e) => e.seconds);
  const redCount = entries.filter((e) => e.red).length;
  return {
    count: entries.length,
    medianSeconds: median(seconds),
    p90Seconds: percentile(seconds, 90),
    maxSeconds: max(seconds),
    redRate: entries.length ? redCount / entries.length : null,
  };
}

/**
 * @param {WorkflowRun[]} prRuns
 * @param {Map<number, WorkflowJob[]>} jobsByRunId
 */
function computeGateLatency(prRuns, jobsByRunId) {
  const entries = [];
  for (const run of prRuns) {
    if (!run.run_started_at) continue;
    const qualityJob = (jobsByRunId.get(run.id) ?? []).find(
      (j) => baseJobName(j.name) === 'quality',
    );
    if (!qualityJob?.completed_at) continue;
    const seconds =
      (new Date(qualityJob.completed_at).getTime() -
        new Date(run.run_started_at).getTime()) /
      1000;
    if (!Number.isFinite(seconds) || seconds < 0) continue;
    entries.push({
      day: run.run_started_at.slice(0, 10),
      seconds,
      red: qualityJob.conclusion === 'failure',
    });
  }

  const byDayMap = new Map();
  for (const entry of entries) {
    if (!byDayMap.has(entry.day)) byDayMap.set(entry.day, []);
    byDayMap.get(entry.day).push(entry);
  }
  const byDay = [...byDayMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, dayEntries]) => ({ day, ...summarizeLatency(dayEntries) }));

  return {
    totalPrRuns: prRuns.length,
    consideredRuns: entries.length,
    overall: summarizeLatency(entries),
    byDay,
  };
}

// ---------------------------------------------------------------------------
// Measurement 2: the job that actually gated each run
// ---------------------------------------------------------------------------

/**
 * @param {WorkflowRun[]} prRuns
 * @param {Map<number, WorkflowJob[]>} jobsByRunId
 */
function computeGatingJob(prRuns, jobsByRunId) {
  const gatingByRun = [];
  for (const run of prRuns) {
    const jobs = (jobsByRunId.get(run.id) ?? []).filter(
      (j) =>
        j.conclusion &&
        j.conclusion !== 'skipped' &&
        j.started_at &&
        j.completed_at,
    );

    // A matrix job (e.g. "test (unit)", "test (integration)") is only done
    // once its slowest instance is, so collapse to the latest completed_at
    // per base name before asking which job finished last.
    const latestByBaseName = new Map();
    for (const job of jobs) {
      const base = baseJobName(job.name);
      if (AGGREGATOR_JOB_NAMES.has(base)) continue;
      const completedAt = new Date(job.completed_at).getTime();
      const prev = latestByBaseName.get(base);
      if (prev === undefined || completedAt > prev)
        latestByBaseName.set(base, completedAt);
    }
    if (latestByBaseName.size === 0) continue;

    const ranked = [...latestByBaseName.entries()].sort((a, b) => b[1] - a[1]);
    const [winnerName, winnerTime] = ranked[0];
    const marginSeconds =
      ranked.length > 1 ? (winnerTime - ranked[1][1]) / 1000 : null;
    gatingByRun.push({ job: winnerName, marginSeconds });
  }

  const totalRuns = gatingByRun.length;
  const byJob = new Map();
  for (const entry of gatingByRun) {
    if (!byJob.has(entry.job)) byJob.set(entry.job, []);
    byJob.get(entry.job).push(entry.marginSeconds);
  }

  const table = [...byJob.entries()]
    .map(([job, margins]) => {
      const validMargins = margins.filter((m) => m !== null);
      return {
        job,
        runs: margins.length,
        share: totalRuns ? margins.length / totalRuns : null,
        medianMarginSeconds: median(validMargins),
      };
    })
    .sort((a, b) => b.runs - a.runs);

  return { totalPrRuns: prRuns.length, consideredRuns: totalRuns, table };
}

// ---------------------------------------------------------------------------
// Measurement 3: per-job durations
// ---------------------------------------------------------------------------

/**
 * @param {WorkflowRun[]} allRuns
 * @param {Map<number, WorkflowJob[]>} jobsByRunId
 */
function computeJobDurations(allRuns, jobsByRunId) {
  const byBaseName = new Map();
  for (const run of allRuns) {
    for (const job of jobsByRunId.get(run.id) ?? []) {
      const base = baseJobName(job.name);
      if (!byBaseName.has(base)) {
        byBaseName.set(base, { durations: [], failures: 0, cancelled: 0 });
      }
      const bucket = byBaseName.get(base);
      if (job.conclusion === 'failure') bucket.failures += 1;
      if (job.conclusion === 'cancelled') bucket.cancelled += 1;

      // Skipped jobs sometimes carry a started_at/completed_at pair copied
      // from the run rather than real execution, which can go backwards —
      // exclude those instead of clamping to zero, which would understate
      // nothing-happened-here as a real (fast) run.
      if (
        job.conclusion === 'skipped' ||
        !job.started_at ||
        !job.completed_at
      ) {
        continue;
      }
      const seconds =
        (new Date(job.completed_at).getTime() -
          new Date(job.started_at).getTime()) /
        1000;
      if (!Number.isFinite(seconds) || seconds < 0) continue;
      bucket.durations.push(seconds);
    }
  }

  return [...byBaseName.entries()]
    .map(([job, bucket]) => ({
      job,
      count: bucket.durations.length,
      medianSeconds: median(bucket.durations),
      p90Seconds: percentile(bucket.durations, 90),
      maxSeconds: max(bucket.durations),
      runnerHours: bucket.durations.reduce((sum, s) => sum + s, 0) / 3600,
      failures: bucket.failures,
      cancelled: bucket.cancelled,
    }))
    .sort((a, b) => b.runnerHours - a.runnerHours);
}

// ---------------------------------------------------------------------------
// Measurement 4: cache composition
// ---------------------------------------------------------------------------

/**
 * @param {Array<{ key: string, ref: string, size_in_bytes: number }>} caches
 */
function computeCacheComposition(caches) {
  const byCategory = new Map();
  const byScope = new Map();
  const mainByCategory = new Map();

  for (const cache of caches) {
    const category = categorizeCacheKey(cache.key);
    byCategory.set(
      category,
      (byCategory.get(category) ?? 0) + cache.size_in_bytes,
    );

    const scope = cache.ref === 'refs/heads/main' ? 'main' : 'pr';
    byScope.set(scope, (byScope.get(scope) ?? 0) + cache.size_in_bytes);

    if (scope === 'main') {
      mainByCategory.set(
        category,
        (mainByCategory.get(category) ?? 0) + cache.size_in_bytes,
      );
    }
  }

  const totalBytes = caches.reduce((sum, c) => sum + c.size_in_bytes, 0);
  return {
    entryCount: caches.length,
    totalBytes,
    ceilingBytes: CACHE_CEILING_BYTES,
    utilization: totalBytes / CACHE_CEILING_BYTES,
    byCategory: Object.fromEntries(byCategory),
    byScope: Object.fromEntries(byScope),
    mainScopedTotalBytes: byScope.get('main') ?? 0,
    mainScopedByCategory: Object.fromEntries(mainByCategory),
  };
}

// ---------------------------------------------------------------------------
// Measurement 5: seed health
// ---------------------------------------------------------------------------

/**
 * @param {WorkflowRun[]} pushMainRuns
 * @param {Map<number, WorkflowJob[]>} jobsByRunId
 */
function computeSeedHealth(pushMainRuns, jobsByRunId) {
  const entries = [];
  for (const run of pushMainRuns) {
    const seedJob = (jobsByRunId.get(run.id) ?? []).find(
      (j) => baseJobName(j.name) === 'seed-turbo-cache',
    );
    if (!seedJob?.conclusion || seedJob.conclusion === 'skipped') continue;
    entries.push({
      startedAt: seedJob.started_at,
      completedAt: seedJob.completed_at,
      conclusion: seedJob.conclusion,
    });
  }
  entries.sort(
    (a, b) =>
      new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime(),
  );

  const durations = entries
    .filter((e) => e.startedAt && e.completedAt)
    .map(
      (e) =>
        (new Date(e.completedAt).getTime() - new Date(e.startedAt).getTime()) /
        1000,
    )
    .filter((s) => Number.isFinite(s) && s >= 0);

  const successCount = entries.filter((e) => e.conclusion === 'success').length;
  const failureCount = entries.filter((e) => e.conclusion === 'failure').length;

  // After each failed seed, main's Turborepo cache stays whatever it was
  // before that push until a later push seeds it successfully — walk
  // forward from each failure to the next success to measure that gap. A
  // failure with no later success in the window is still unresolved as of
  // `end`; it cannot contribute a gap, so it is counted separately instead
  // of silently dropped (which would understate how long main went unseeded).
  const gapsHours = [];
  let unresolvedFailures = 0;
  for (let i = 0; i < entries.length; i += 1) {
    if (entries[i].conclusion !== 'failure') continue;
    const next = entries.slice(i + 1).find((e) => e.conclusion === 'success');
    if (!next) {
      unresolvedFailures += 1;
      continue;
    }
    gapsHours.push(
      (new Date(next.completedAt).getTime() -
        new Date(entries[i].completedAt).getTime()) /
        (1000 * 60 * 60),
    );
  }

  return {
    totalRuns: entries.length,
    successCount,
    failureCount,
    failureRate: entries.length ? failureCount / entries.length : null,
    medianDurationSeconds: median(durations),
    unresolvedFailures,
    gapHours: {
      count: gapsHours.length,
      medianHours: median(gapsHours),
      maxHours: max(gapsHours),
    },
  };
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

/** @param {number|null} seconds */
function fmtMinutes(seconds) {
  return seconds === null ? 'n/a' : `${(seconds / 60).toFixed(1)}m`;
}
/** @param {number|null} fraction */
function fmtPercent(fraction) {
  return fraction === null ? 'n/a' : `${(fraction * 100).toFixed(0)}%`;
}
/** @param {number} bytes */
function fmtGB(bytes) {
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}
/** @param {number|null} hours */
function fmtHours(hours) {
  return hours === null ? 'n/a' : `${hours.toFixed(1)}h`;
}

/** @param {ReturnType<typeof buildReport>} report */
function renderText(report) {
  const { meta } = report;
  console.log(`CI metrics for ${meta.repo}`);
  console.log(
    `Window: ${meta.windowStart} .. ${meta.windowEnd} (${meta.days} day(s))\n`,
  );

  console.log('1. Gate latency (quality job, pull_request runs)');
  const gl = report.gateLatency;
  console.log(
    `   overall: n=${gl.overall.count}/${gl.totalPrRuns} median=${fmtMinutes(gl.overall.medianSeconds)} p90=${fmtMinutes(gl.overall.p90Seconds)} max=${fmtMinutes(gl.overall.maxSeconds)} red=${fmtPercent(gl.overall.redRate)}`,
  );
  for (const day of gl.byDay) {
    console.log(
      `   ${day.day}: n=${day.count} median=${fmtMinutes(day.medianSeconds)} p90=${fmtMinutes(day.p90Seconds)} max=${fmtMinutes(day.maxSeconds)} red=${fmtPercent(day.redRate)}`,
    );
  }

  console.log(
    '\n2. Job that actually gated each run (excludes quality, e2e-report, carry-forward-statuses, e2e-queue-watchdog)',
  );
  console.log(
    `   considered ${report.gatingJob.consideredRuns}/${report.gatingJob.totalPrRuns} PR runs`,
  );
  for (const row of report.gatingJob.table) {
    console.log(
      `   ${row.job.padEnd(28)} ${fmtPercent(row.share).padStart(4)} of runs (${row.runs})  median margin ${fmtMinutes(row.medianMarginSeconds)}`,
    );
  }

  console.log(
    '\n3. Per-job durations (CI and Release, matrix instances collapsed)',
  );
  for (const row of report.jobDurations) {
    console.log(
      `   ${row.job.padEnd(28)} n=${String(row.count).padStart(5)} median=${fmtMinutes(row.medianSeconds).padStart(7)} p90=${fmtMinutes(row.p90Seconds).padStart(7)} max=${fmtMinutes(row.maxSeconds).padStart(7)} runner-hours=${row.runnerHours.toFixed(1).padStart(6)} failures=${row.failures} cancelled=${row.cancelled}`,
    );
  }

  console.log('\n4. Cache composition');
  const cc = report.cacheComposition;
  console.log(
    `   total: ${fmtGB(cc.totalBytes)} of ${fmtGB(cc.ceilingBytes)} ceiling (${fmtPercent(cc.utilization)}), ${cc.entryCount} entries`,
  );
  console.log('   by category (all scopes):');
  for (const [category, bytes] of Object.entries(cc.byCategory)) {
    console.log(`     ${category.padEnd(12)} ${fmtGB(bytes)}`);
  }
  console.log('   by scope:');
  for (const [scope, bytes] of Object.entries(cc.byScope)) {
    console.log(`     ${scope.padEnd(12)} ${fmtGB(bytes)}`);
  }
  console.log(
    `   main-scoped total: ${fmtGB(cc.mainScopedTotalBytes)} (only this slice every PR can read from)`,
  );
  console.log('   main-scoped by category:');
  for (const [category, bytes] of Object.entries(cc.mainScopedByCategory)) {
    console.log(`     ${category.padEnd(12)} ${fmtGB(bytes)}`);
  }

  console.log('\n5. Seed health (seed-turbo-cache, push to main)');
  const sh = report.seedHealth;
  console.log(
    `   n=${sh.totalRuns} success=${sh.successCount} failure=${sh.failureCount} rate=${fmtPercent(sh.failureRate)} median duration=${fmtMinutes(sh.medianDurationSeconds)}`,
  );
  console.log(
    `   unseeded gap after failure: n=${sh.gapHours.count} median=${fmtHours(sh.gapHours.medianHours)} max=${fmtHours(sh.gapHours.maxHours)}${sh.unresolvedFailures ? ` (${sh.unresolvedFailures} failure(s) still unresolved at window end)` : ''}`,
  );
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

/**
 * @param {ReturnType<typeof createGitHubClient>} client
 * @param {string} owner
 * @param {string} repo
 * @param {number} workflowId
 * @param {Date} start
 * @param {Date} end
 */
async function buildReport(
  client,
  owner,
  repo,
  workflowId,
  start,
  end,
  repoArg,
  days,
) {
  const [prResult, pushResult, mergeGroupResult] = await Promise.all([
    fetchRunsForWindow(
      client,
      owner,
      repo,
      workflowId,
      { event: 'pull_request' },
      start,
      end,
    ),
    fetchRunsForWindow(
      client,
      owner,
      repo,
      workflowId,
      { event: 'push', branch: 'main' },
      start,
      end,
    ),
    fetchRunsForWindow(
      client,
      owner,
      repo,
      workflowId,
      { event: 'merge_group' },
      start,
      end,
    ),
  ]);

  // `test` (measurement 3) also covers push/merge_group runs since jobs
  // belonging to the CI and Release workflow are not scoped to any one
  // event, unlike measurements 1/2 (pull_request only, per the quality
  // gate) and 5 (push-to-main only, where seed-turbo-cache actually runs).
  const allRuns = [
    ...prResult.runs,
    ...pushResult.runs,
    ...mergeGroupResult.runs,
  ];

  const cacheDir = path.join(
    os.tmpdir(),
    'network-canvas-ci-metrics-cache',
    `${owner}-${repo}`,
    'jobs',
  );
  const jobLists = await mapPool(
    allRuns,
    (run) => fetchJobsForRun(client, cacheDir, owner, repo, run),
    10,
  );
  const jobsByRunId = new Map(allRuns.map((run, i) => [run.id, jobLists[i]]));

  const caches = await fetchAllCaches(client, owner, repo);

  return {
    meta: {
      repo: repoArg,
      days,
      windowStart: start.toISOString(),
      windowEnd: end.toISOString(),
      generatedAt: new Date().toISOString(),
    },
    gateLatency: computeGateLatency(prResult.runs, jobsByRunId),
    gatingJob: computeGatingJob(prResult.runs, jobsByRunId),
    jobDurations: computeJobDurations(allRuns, jobsByRunId),
    cacheComposition: computeCacheComposition(caches),
    seedHealth: computeSeedHealth(pushResult.runs, jobsByRunId),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const [owner, repo] = args.repo.split('/');
  if (!owner || !repo) {
    throw new Error(`--repo must be "owner/name", got "${args.repo}"`);
  }

  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || null;
  const client = createGitHubClient(token);

  const end = new Date();
  const start = new Date(end.getTime() - args.days * 24 * 60 * 60 * 1000);

  const workflowId = await resolveWorkflowId(client, owner, repo);
  const report = await buildReport(
    client,
    owner,
    repo,
    workflowId,
    start,
    end,
    args.repo,
    args.days,
  );

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    renderText(report);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(
      `[ci-metrics] ${error instanceof Error ? error.stack : error}`,
    );
    process.exitCode = 1;
  });
}
