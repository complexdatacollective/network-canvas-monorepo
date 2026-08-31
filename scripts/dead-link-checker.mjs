#!/usr/bin/env node

// SPDX-License-Identifier: MIT
// Adapted from @jthrilly/dead-link-checker v1.1.0, released under the MIT
// License by Joshua Melville: https://www.npmjs.com/package/@jthrilly/dead-link-checker

/**
 * Dead-link checker design
 *
 * The input URL is the root of a same-origin crawl. We parse HTML and enqueue
 * links recursively only while pages remain on that origin; external links are
 * still followed to their final destination and checked, but their pages do
 * not expand the crawl. Each normalized URL is checked once, while every page
 * that referred to it is retained for the report.
 *
 * Ordinary checks use Node's fetch implementation because it is substantially
 * faster and cheaper than opening a browser page for every URL. Redirects are
 * followed manually so redirect loops, missing or invalid Location headers,
 * excessive hops, and the actual final URL remain visible. Transient HTTP
 * responses and request failures are retried with bounded backoff (honouring
 * Retry-After); unused response bodies are cancelled so concurrent checks do
 * not exhaust fetch's connection pool. The caller may provide an explicit
 * User-Agent, but status semantics never change: any final status >= 400 is an
 * error, including 403.
 *
 * A small browser-verification path exists because some otherwise public sites
 * do not give Node the response that a person receives in a browser. Common
 * examples are JavaScript/CDN challenges that initially return 403 and servers
 * that omit an intermediate certificate trusted through the browser's issuer
 * cache. Only those two known mismatches -- a Node 403 or
 * UNABLE_TO_VERIFY_LEAF_SIGNATURE -- are rechecked in Chrome. Chrome is
 * launched lazily, shared by the whole crawl, and limited to four open pages.
 * It runs headed under Xvfb in CI because the affected challenge provider also
 * rejects automated headless Chrome. For a challenge response, the verifier
 * waits for JavaScript to cause a subsequent main-frame navigation.
 *
 * Browser verification is not status suppression. Its final response is
 * authoritative: a browser-confirmed 403 (or any other >= 400 response) still
 * fails the check, and a browser launch/navigation failure preserves the
 * original failure with the browser error attached. This differs deliberately
 * from the old package's external-redirect shortcut: stopping before the final
 * destination would make the run faster, but could report a genuinely dead
 * redirected link as healthy.
 *
 * Workers may finish out of order, so results and referrers are sorted before
 * output. Human-readable text, JSON artifacts, GitHub annotations, and the job
 * summary are all rendered from that same deterministic report.
 */
import { appendFile, writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

import { JSDOM } from 'jsdom';

const REPORT_SCHEMA_VERSION = 1;
const TRANSIENT_STATUSES = new Set([429, 502, 503, 504]);
const BROWSER_VERIFIABLE_REQUEST_ERRORS = new Set([
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
]);
const MAX_RETRY_DELAY_MS = 30_000;
const BASE_RETRY_DELAY_MS = 500;
const MAX_BROWSER_PAGES = 4;

// Keep annotations useful without flooding the Actions log. The JSON artifact
// and job summary remain complete when a crawl exceeds this limit.
export const MAX_GITHUB_ERROR_ANNOTATIONS = 50;

const DEFAULT_OPTIONS = {
  concurrent: 25,
  delay: 10,
  format: 'text',
  githubActions: false,
  maxRedirects: 10,
  reportPath: undefined,
  retries: 3,
  timeout: 15_000,
  userAgent: undefined,
  verbose: false,
};

const USAGE = `Usage: node scripts/dead-link-checker.mjs <URL> [options]

Options:
  -v                         Include every checked URL in text output
  --yes                      Deprecated compatibility option (no effect)
  --concurrent=<number>      Concurrent workers (default: 25)
  --delay=<milliseconds>     Delay between requests per worker (default: 10)
  --timeout=<milliseconds>   Per-request timeout (default: 15000)
  --retries=<number>         Retries after the first attempt (default: 3)
  --max-redirects=<number>   Maximum redirect hops (default: 10)
  --user-agent=<value>       User-Agent header sent with every request
  --format=text|json         Standard-output format (default: text)
  --report=<path>            Also write the versioned JSON report to a file
  --github-actions           Emit error annotations and a job summary
  --help                     Show this help`;

class UsageError extends Error {}

class WorkQueue {
  #items = [];
  #pending = 0;
  #waiters = [];

  enqueue(task) {
    this.#pending++;
    const waiter = this.#waiters.shift();
    if (waiter) {
      waiter(task);
      return;
    }
    this.#items.push(task);
  }

  next() {
    const task = this.#items.shift();
    if (task) return Promise.resolve(task);
    if (this.#pending === 0) return Promise.resolve(null);
    return new Promise((resolve) => this.#waiters.push(resolve));
  }

  complete() {
    this.#pending--;
    if (this.#pending !== 0 || this.#items.length !== 0) return;
    for (const waiter of this.#waiters.splice(0)) waiter(null);
  }
}

class BrowserVerifier {
  #activePages = 0;
  #resourcesPromise;
  #waiters = [];

  async #acquirePageSlot() {
    if (this.#activePages >= MAX_BROWSER_PAGES) {
      await new Promise((resolve) => this.#waiters.push(resolve));
    }
    this.#activePages++;
  }

  async #getResources() {
    this.#resourcesPromise ??= (async () => {
      const { chromium } = await import('playwright');
      const browser = await chromium.launch({
        args: ['--disable-blink-features=AutomationControlled'],
        channel: 'chrome',
        headless: false,
        ignoreDefaultArgs: ['--enable-automation'],
      });
      try {
        const context = await browser.newContext({ acceptDownloads: false });
        return { browser, context };
      } catch (error) {
        await browser.close();
        throw error;
      }
    })();
    return this.#resourcesPromise;
  }

  #releasePageSlot() {
    this.#activePages--;
    this.#waiters.shift()?.();
  }

  async close() {
    if (!this.#resourcesPromise) return;
    try {
      const { browser } = await this.#resourcesPromise;
      await browser.close();
    } catch {
      // A launch failure is already attached to each unresolved result.
    }
  }

  async verify(url, timeout, { captureHTML = false } = {}) {
    await this.#acquirePageSlot();
    let page;
    try {
      const { context } = await this.#getResources();
      page = await context.newPage();
      let navigation;
      page.on('response', (response) => {
        if (
          response.request().isNavigationRequest() &&
          response.frame() === page.mainFrame()
        ) {
          navigation = response;
        }
      });

      const initialResponse = await page.goto(url, {
        timeout,
        waitUntil: 'domcontentloaded',
      });
      if (!initialResponse) {
        throw new Error(`Browser navigation returned no response for ${url}`);
      }
      navigation ??= initialResponse;

      // A browser challenge initially responds with 403, executes JavaScript,
      // and then navigates the main frame again. A genuine forbidden page has
      // no follow-up navigation and remains 403 after the same timeout.
      if (navigation.status() === 403) {
        try {
          await page.waitForResponse(
            (response) =>
              response.request().isNavigationRequest() &&
              response.frame() === page.mainFrame() &&
              response.status() !== 403,
            { timeout },
          );
          await page.waitForLoadState('domcontentloaded', { timeout });
        } catch (error) {
          if (error?.name !== 'TimeoutError') throw error;
        }
      }

      const contentType = navigation.headers()['content-type'] ?? '';
      return {
        contentType,
        finalUrl: page.url(),
        html:
          captureHTML && contentType.includes('text/html')
            ? await page.content()
            : null,
        status: navigation.status(),
      };
    } finally {
      await page?.close().catch(() => {});
      this.#releasePageSlot();
    }
  }
}

function compareStrings(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function optionInteger(value, name, { min, max = Number.MAX_SAFE_INTEGER }) {
  if (!/^\d+$/.test(value)) {
    throw new UsageError(`--${name} must be an integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new UsageError(`--${name} must be between ${min} and ${max}`);
  }
  return parsed;
}

function setOptionOnce(seen, name) {
  if (seen.has(name)) {
    throw new UsageError(`--${name} may only be specified once`);
  }
  seen.add(name);
}

export function parseArguments(args) {
  const options = { ...DEFAULT_OPTIONS };
  const seen = new Set();
  let input;
  let help = false;

  for (const argument of args) {
    if (argument === '-v') {
      if (options.verbose)
        throw new UsageError('-v may only be specified once');
      options.verbose = true;
      continue;
    }
    if (argument === '--yes') continue;
    if (argument === '--github-actions') {
      setOptionOnce(seen, 'github-actions');
      options.githubActions = true;
      continue;
    }
    if (argument === '--help') {
      help = true;
      continue;
    }
    if (argument.startsWith('--')) {
      const separator = argument.indexOf('=');
      if (separator === -1) throw new UsageError(`Unknown option: ${argument}`);
      const name = argument.slice(2, separator);
      const value = argument.slice(separator + 1);
      setOptionOnce(seen, name);

      switch (name) {
        case 'concurrent':
          options.concurrent = optionInteger(value, name, { min: 1, max: 100 });
          break;
        case 'delay':
          options.delay = optionInteger(value, name, {
            min: 0,
            max: 60_000,
          });
          break;
        case 'format':
          if (!['json', 'text'].includes(value)) {
            throw new UsageError('--format must be text or json');
          }
          options.format = value;
          break;
        case 'max-redirects':
          options.maxRedirects = optionInteger(value, name, {
            min: 0,
            max: 50,
          });
          break;
        case 'report':
          if (!value) throw new UsageError('--report must not be empty');
          options.reportPath = value;
          break;
        case 'retries':
          options.retries = optionInteger(value, name, { min: 0, max: 10 });
          break;
        case 'timeout':
          options.timeout = optionInteger(value, name, {
            min: 1,
            max: 300_000,
          });
          break;
        case 'user-agent':
          if (!value.trim()) {
            throw new UsageError('--user-agent must not be empty');
          }
          options.userAgent = value;
          break;
        default:
          throw new UsageError(`Unknown option: --${name}`);
      }
      continue;
    }
    if (argument.startsWith('-')) {
      throw new UsageError(`Unknown option: ${argument}`);
    }
    if (input) throw new UsageError('Expected exactly one URL');
    input = argument;
  }

  if (help) return { help: true, options };
  if (!input) throw new UsageError('A URL is required');

  let inputURL;
  try {
    inputURL = new URL(input);
  } catch {
    throw new UsageError(`Invalid URL: ${input}`);
  }
  if (!['http:', 'https:'].includes(inputURL.protocol)) {
    throw new UsageError('The URL must use http or https');
  }
  inputURL.hash = '';

  return { help: false, inputURL: inputURL.href, options };
}

function deterministicJitter(url, attempt, range) {
  let hash = attempt;
  for (const character of url) {
    hash = (hash * 33 + character.codePointAt(0)) >>> 0;
  }
  return range === 0 ? 0 : hash % (range + 1);
}

function retryAfterMilliseconds(value, now = Date.now()) {
  if (value === null) return null;
  if (/^\d+(?:\.\d+)?$/.test(value.trim())) {
    return Math.max(0, Number(value) * 1_000);
  }
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}

export function retryDelayMilliseconds({ attempt, retryAfter, url }) {
  const requestedDelay = retryAfterMilliseconds(retryAfter);
  if (requestedDelay !== null) {
    return Math.min(MAX_RETRY_DELAY_MS, requestedDelay);
  }
  const backoff = BASE_RETRY_DELAY_MS * 2 ** (attempt - 1);
  const jitter = deterministicJitter(url, attempt, Math.floor(backoff / 5));
  return Math.min(MAX_RETRY_DELAY_MS, backoff + jitter);
}

async function releaseBody(response) {
  try {
    await response.body?.cancel();
  } catch {
    // The body was already consumed or absent.
  }
}

function errorDetail(error, timeout) {
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
    return `Request timed out after ${timeout}ms`;
  }
  const message = error instanceof Error ? error.message : String(error);
  const cause = error?.cause?.code ?? error?.cause?.message;
  return cause ? `${message} (${cause})` : message;
}

async function fetchWithRetry(url, options) {
  let lastError;
  for (let attempt = 1; attempt <= options.retries + 1; attempt++) {
    try {
      const response = await fetch(url, {
        headers: options.userAgent
          ? { 'user-agent': options.userAgent }
          : undefined,
        redirect: 'manual',
        signal: AbortSignal.timeout(options.timeout),
      });
      if (
        TRANSIENT_STATUSES.has(response.status) &&
        attempt <= options.retries
      ) {
        const delay = retryDelayMilliseconds({
          attempt,
          retryAfter: response.headers.get('retry-after'),
          url,
        });
        await releaseBody(response);
        await sleep(delay);
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt <= options.retries) {
        await sleep(retryDelayMilliseconds({ attempt, retryAfter: null, url }));
      }
    }
  }
  throw lastError;
}

function normalizeURL(value, base) {
  const url = new URL(value, base);
  if (!['http:', 'https:'].includes(url.protocol)) return null;
  url.hash = '';
  return url.href;
}

async function fetchFollowingRedirects(url, options) {
  let currentURL = url;
  const seen = new Set([url]);
  const redirects = [];

  while (true) {
    const response = await fetchWithRetry(currentURL, options);
    if (response.status < 300 || response.status >= 400) {
      return { finalUrl: currentURL, redirects, response };
    }

    const location = response.headers.get('location');
    if (!location) {
      await releaseBody(response);
      return {
        error: 'Redirect response has no Location header',
        finalUrl: currentURL,
        redirects,
        status: response.status,
      };
    }

    const nextURL = normalizeURL(location, currentURL);
    await releaseBody(response);
    if (!nextURL) {
      return {
        error: `Redirect target is not an HTTP URL: ${location}`,
        finalUrl: currentURL,
        redirects,
        status: response.status,
      };
    }

    redirects.push({ from: currentURL, status: response.status, to: nextURL });
    if (seen.has(nextURL)) {
      return {
        error: `Redirect loop detected at ${nextURL}`,
        finalUrl: nextURL,
        redirects,
        status: response.status,
      };
    }
    if (redirects.length > options.maxRedirects) {
      return {
        error: `Exceeded ${options.maxRedirects} redirect hops`,
        finalUrl: nextURL,
        redirects,
        status: response.status,
      };
    }
    seen.add(nextURL);
    currentURL = nextURL;
  }
}

function extractLinks(html, pageURL) {
  const dom = new JSDOM(html, { url: pageURL });
  const links = new Set();
  for (const anchor of dom.window.document.querySelectorAll('a')) {
    const href = anchor.getAttribute('href')?.trim();
    if (!href || href.startsWith('#')) continue;
    try {
      const normalized = normalizeURL(href, dom.window.document.baseURI);
      if (normalized) links.add(normalized);
    } catch {
      // Ignore malformed URLs found in page content.
    }
  }
  return [...links].toSorted(compareStrings);
}

function failureResult(record, details, kind) {
  return {
    error: details.error,
    finalUrl: details.finalUrl,
    kind,
    ok: false,
    redirects: details.redirects,
    status: details.status ?? null,
    url: record.url,
  };
}

export async function crawl(
  inputURL,
  options,
  onProgress = () => {},
  browserVerifier = new BrowserVerifier(),
) {
  const startedAtMilliseconds = Date.now();
  const rootOrigin = new URL(inputURL).origin;
  const records = new Map();
  const results = [];
  const queue = new WorkQueue();

  const verifyInBrowser = async (record, fallback) => {
    let browserOutcome;
    try {
      browserOutcome = await browserVerifier.verify(
        record.url,
        options.timeout,
        {
          captureHTML: record.recursive,
        },
      );
    } catch (error) {
      results.push(
        failureResult(
          record,
          {
            ...fallback,
            error: `${fallback.error}; browser verification failed: ${errorDetail(error, options.timeout)}`,
          },
          fallback.kind,
        ),
      );
      onProgress(results.length, records.size);
      return;
    }

    if (browserOutcome.status >= 400) {
      results.push(
        failureResult(
          record,
          {
            error: `HTTP ${browserOutcome.status}`,
            finalUrl: browserOutcome.finalUrl,
            redirects: fallback.redirects,
            status: browserOutcome.status,
          },
          'http-error',
        ),
      );
      onProgress(results.length, records.size);
      return;
    }

    if (
      record.recursive &&
      new URL(browserOutcome.finalUrl).origin === rootOrigin &&
      browserOutcome.html
    ) {
      for (const link of extractLinks(
        browserOutcome.html,
        browserOutcome.finalUrl,
      )) {
        enqueue(link, browserOutcome.finalUrl);
      }
    }
    results.push({
      error: null,
      finalUrl: browserOutcome.finalUrl,
      kind: null,
      ok: true,
      redirects: fallback.redirects,
      status: browserOutcome.status,
      url: record.url,
    });
    onProgress(results.length, records.size);
  };

  const enqueue = (url, foundOn = null) => {
    const existing = records.get(url);
    if (existing) {
      if (foundOn) existing.foundOn.add(foundOn);
      return;
    }
    const record = {
      foundOn: new Set(foundOn ? [foundOn] : []),
      recursive: new URL(url).origin === rootOrigin,
      url,
    };
    records.set(url, record);
    queue.enqueue(async () => {
      let outcome;
      try {
        outcome = await fetchFollowingRedirects(record.url, options);
      } catch (error) {
        const failure = {
          error: errorDetail(error, options.timeout),
          finalUrl: record.url,
          kind: 'request-error',
          redirects: [],
          status: null,
        };
        if (BROWSER_VERIFIABLE_REQUEST_ERRORS.has(error?.cause?.code)) {
          await verifyInBrowser(record, failure);
        } else {
          results.push(failureResult(record, failure, failure.kind));
          onProgress(results.length, records.size);
        }
        return;
      }

      if (outcome.error) {
        results.push(failureResult(record, outcome, 'redirect-error'));
        onProgress(results.length, records.size);
        return;
      }

      const { finalUrl, redirects, response } = outcome;
      if (response.status === 403) {
        await releaseBody(response);
        await verifyInBrowser(record, {
          error: 'HTTP 403',
          finalUrl,
          kind: 'http-error',
          redirects,
          status: 403,
        });
        return;
      }

      if (response.status >= 400) {
        await releaseBody(response);
        results.push(
          failureResult(
            record,
            {
              error: `HTTP ${response.status}`,
              finalUrl,
              redirects,
              status: response.status,
            },
            'http-error',
          ),
        );
        onProgress(results.length, records.size);
        return;
      }

      try {
        const contentType = response.headers.get('content-type') || '';
        if (
          record.recursive &&
          new URL(finalUrl).origin === rootOrigin &&
          contentType.includes('text/html')
        ) {
          const html = await response.text();
          for (const link of extractLinks(html, finalUrl))
            enqueue(link, finalUrl);
        } else {
          await releaseBody(response);
        }
      } catch (error) {
        await releaseBody(response);
        results.push(
          failureResult(
            record,
            {
              error: errorDetail(error, options.timeout),
              finalUrl,
              redirects,
              status: null,
            },
            'request-error',
          ),
        );
        onProgress(results.length, records.size);
        return;
      }

      results.push({
        error: null,
        finalUrl,
        kind: null,
        ok: true,
        redirects,
        status: response.status,
        url: record.url,
      });
      onProgress(results.length, records.size);
    });
  };

  enqueue(inputURL);
  const workers = Array.from({ length: options.concurrent }, async () => {
    while (true) {
      const task = await queue.next();
      if (!task) return;
      try {
        await task();
      } finally {
        queue.complete();
      }
      if (options.delay > 0) await sleep(options.delay);
    }
  });
  try {
    await Promise.all(workers);
  } finally {
    await browserVerifier.close();
  }

  const normalizedResults = results
    .map((result) => ({
      ...result,
      foundOn: [...records.get(result.url).foundOn].toSorted(compareStrings),
    }))
    .toSorted((left, right) => compareStrings(left.url, right.url));
  const failures = normalizedResults.filter((result) => !result.ok);

  return {
    durationMs: Date.now() - startedAtMilliseconds,
    failures,
    results: normalizedResults,
    schemaVersion: REPORT_SCHEMA_VERSION,
    startedAt: new Date(startedAtMilliseconds).toISOString(),
    summary: {
      checked: normalizedResults.length,
      discovered: records.size,
      failed: failures.length,
      passed: normalizedResults.length - failures.length,
    },
    target: inputURL,
  };
}

function statusDescription(result) {
  if (result.kind === 'http-error') return `HTTP ${result.status}`;
  return result.status === null
    ? result.error
    : `${result.status} (${result.error})`;
}

function paint(value, code, enabled) {
  return enabled ? `\x1b[${code}m${value}\x1b[0m` : value;
}

export function formatTextReport(
  report,
  { color = false, verbose = false } = {},
) {
  const lines = [
    `Dead-link check: ${report.target}`,
    `Discovered: ${report.summary.discovered} | Checked: ${report.summary.checked} | Passed: ${report.summary.passed} | Failed: ${report.summary.failed}`,
  ];

  if (verbose) {
    lines.push('', 'Checked URLs:');
    for (const result of report.results) {
      lines.push(
        `- ${result.url} (${result.ok ? result.status : statusDescription(result)})`,
      );
    }
  }

  if (report.failures.length === 0) {
    lines.push('', paint('✅ No dead links found.', '32', color));
    return `${lines.join('\n')}\n`;
  }

  lines.push(
    '',
    paint(`❌ Failed URLs (${report.failures.length}):`, '31', color),
  );
  for (const failure of report.failures) {
    lines.push(`- ${failure.url}`);
    lines.push(`  Status: ${statusDescription(failure)}`);
    if (failure.finalUrl !== failure.url) {
      lines.push(`  Final URL: ${failure.finalUrl}`);
    }
    if (failure.foundOn.length > 0) {
      lines.push('  Found on:');
      for (const source of failure.foundOn) lines.push(`    - ${source}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function githubData(value) {
  return String(value)
    .replaceAll('%', '%25')
    .replaceAll('\r', '%0D')
    .replaceAll('\n', '%0A');
}

function githubProperty(value) {
  return githubData(value).replaceAll(':', '%3A').replaceAll(',', '%2C');
}

export function formatGitHubAnnotation(failure) {
  const titleByKind = {
    'http-error': `Dead link returned HTTP ${failure.status}`,
    'redirect-error': 'Dead link redirect failed',
    'request-error': 'Dead link request failed',
  };
  const title = githubProperty(titleByKind[failure.kind]);
  const foundOn =
    failure.foundOn.length === 0
      ? ''
      : `\nFound on:\n${failure.foundOn.map((url) => `- ${url}`).join('\n')}`;
  const message = `${failure.url}\n${failure.error}${foundOn}`;
  return `::error title=${title}::${githubData(message)}`;
}

function markdownCell(value) {
  return String(value)
    .replaceAll('|', '\\|')
    .replaceAll('\r', '')
    .replaceAll('\n', '<br>');
}

export function formatGitHubSummary(report) {
  const lines = [
    '### Dead-link check',
    '',
    `Discovered **${report.summary.discovered}** URLs and checked **${report.summary.checked}**: **${report.summary.passed} passed**, **${report.summary.failed} failed**.`,
    '',
  ];
  if (report.failures.length === 0) {
    lines.push('✅ No dead links found.', '');
    return lines.join('\n');
  }
  lines.push('| Failed URL | Result | Found on |', '| --- | --- | --- |');
  for (const failure of report.failures) {
    lines.push(
      `| ${markdownCell(failure.url)} | ${markdownCell(statusDescription(failure))} | ${markdownCell(failure.foundOn.join('<br>'))} |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

async function publishGitHubReport(report, environment, stderr) {
  for (const failure of report.failures.slice(
    0,
    MAX_GITHUB_ERROR_ANNOTATIONS,
  )) {
    stderr.write(`${formatGitHubAnnotation(failure)}\n`);
  }
  const omitted = report.failures.length - MAX_GITHUB_ERROR_ANNOTATIONS;
  if (omitted > 0) {
    stderr.write(
      `::warning title=Additional dead links omitted from annotations::${omitted} additional failures remain available in the job summary and JSON report.\n`,
    );
  }
  if (environment.GITHUB_STEP_SUMMARY) {
    await appendFile(
      environment.GITHUB_STEP_SUMMARY,
      formatGitHubSummary(report),
      'utf8',
    );
  }
}

export async function run(
  args,
  {
    environment = process.env,
    stderr = process.stderr,
    stdout = process.stdout,
  } = {},
) {
  let parsed;
  try {
    parsed = parseArguments(args);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    stderr.write(`${error.message}\n\n${USAGE}\n`);
    return 2;
  }

  if (parsed.help) {
    stdout.write(`${USAGE}\n`);
    return 0;
  }

  const { inputURL, options } = parsed;
  const showProgress = options.format === 'text' && stdout.isTTY;
  if (showProgress) stdout.write(`Checking ${inputURL}\n`);
  const report = await crawl(inputURL, options, (checked, total) => {
    if (showProgress) stdout.write(`\rChecked ${checked}/${total} URLs`);
  });
  if (showProgress) stdout.write(`\r${' '.repeat(80)}\r`);

  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (options.reportPath) await writeFile(options.reportPath, json, 'utf8');
  if (options.githubActions) {
    await publishGitHubReport(report, environment, stderr);
  }

  if (options.format === 'json') {
    stdout.write(json);
  } else {
    const color = stdout.isTTY && !('NO_COLOR' in environment);
    stdout.write(formatTextReport(report, { color, verbose: options.verbose }));
  }
  return report.failures.length === 0 ? 0 : 1;
}

async function main() {
  try {
    process.exitCode = await run(process.argv.slice(2));
  } catch (error) {
    const detail =
      error instanceof Error ? (error.stack ?? error.message) : String(error);
    process.stderr.write(`Dead-link checker failed: ${detail}\n`);
    process.exitCode = 2;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
