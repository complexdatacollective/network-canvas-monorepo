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
 * launched lazily and shared by the whole crawl, but every checked link gets a
 * fresh browser context so cookies, storage, cache state, and service workers
 * cannot make later results depend on crawl order. At most four contexts are
 * open at once; popups are closed immediately so they cannot bypass that
 * limit. Chrome runs headed under Xvfb in CI because the affected challenge
 * provider also rejects automated headless Chrome. After either kind of Node
 * mismatch, the verifier waits for the browser document to reach a terminal
 * main-frame response, finish loading, and remain navigation-quiet for a short
 * bounded interval. Both navigation starts and responses are tracked, and
 * starts remain explicitly outstanding until their response arrives, so a
 * request that stalls before response headers cannot look quiet. Incomplete
 * redirects and document loads remain verification failures, and the entire
 * sequence shares one request deadline so reload loops cannot retain a worker
 * indefinitely. Browser-only HTTP redirects obey the same maximum-hop rule as
 * Node redirects.
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
const BROWSER_NAVIGATION_SETTLE_MS = 500;

function isTerminalNavigation(response) {
  return response.status() < 300 || response.status() >= 400;
}

function browserRedirects(mainFrameResponses) {
  const redirects = [];
  for (let index = 0; index < mainFrameResponses.length - 1; index++) {
    const response = mainFrameResponses[index];
    if (response.status() < 300 || response.status() >= 400) continue;
    redirects.push({
      from: response.url(),
      status: response.status(),
      to: mainFrameResponses[index + 1].url(),
    });
  }
  return redirects;
}

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

export class PageSlotSemaphore {
  #available;
  #limit;
  #waiters = [];

  constructor(limit) {
    if (!Number.isSafeInteger(limit) || limit < 1) {
      throw new RangeError('Page slot limit must be a positive integer');
    }
    this.#available = limit;
    this.#limit = limit;
  }

  async acquire() {
    if (this.#available > 0) {
      this.#available--;
      return;
    }
    await new Promise((resolve) => this.#waiters.push(resolve));
  }

  release() {
    const waiter = this.#waiters.shift();
    if (waiter) {
      // Keep the permit unavailable while transferring it directly. A later
      // caller therefore cannot overtake the queued verifier before its
      // promise continuation runs.
      waiter();
      return;
    }
    if (this.#available >= this.#limit) {
      throw new Error('Cannot release an unacquired page slot');
    }
    this.#available++;
  }
}

async function loadPlaywrightChromium() {
  const { chromium } = await import('playwright');
  return chromium;
}

export class BrowserVerifier {
  #loadChromium;
  #pageSlots = new PageSlotSemaphore(MAX_BROWSER_PAGES);
  #resourcesPromise;
  #userAgent;

  constructor({ loadChromium = loadPlaywrightChromium, userAgent } = {}) {
    this.#loadChromium = loadChromium;
    this.#userAgent = userAgent;
  }

  async #getResources() {
    this.#resourcesPromise ??= (async () => {
      const chromium = await this.#loadChromium();
      const browser = await chromium.launch({
        args: ['--disable-blink-features=AutomationControlled'],
        channel: 'chrome',
        headless: false,
        ignoreDefaultArgs: ['--enable-automation'],
      });
      return { browser };
    })();
    return this.#resourcesPromise;
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
    await this.#pageSlots.acquire();
    let context;
    let page;
    const spawnedPages = new Set();
    try {
      const { browser } = await this.#getResources();
      context = await browser.newContext({
        acceptDownloads: false,
        ...(this.#userAgent ? { userAgent: this.#userAgent } : {}),
      });
      page = await context.newPage();
      const mainFrameRequests = [];
      const mainFrameResponses = [];
      const outstandingMainFrameRequests = new Set();
      page.on('popup', (popup) => {
        spawnedPages.add(popup);
        void popup.close().catch(() => {});
      });
      page.on('response', (response) => {
        if (
          response.request().isNavigationRequest() &&
          response.frame() === page.mainFrame()
        ) {
          mainFrameResponses.push(response);
          outstandingMainFrameRequests.delete(response.request());
        }
      });
      page.on('request', (request) => {
        if (
          request.isNavigationRequest() &&
          request.frame() === page.mainFrame()
        ) {
          mainFrameRequests.push(request);
          outstandingMainFrameRequests.add(request);
        }
      });
      const verificationDeadline = Date.now() + timeout;
      const remainingTimeout = () => {
        const remaining = verificationDeadline - Date.now();
        if (remaining > 0) return remaining;
        const error = new Error(
          `Browser verification timed out after ${timeout}ms`,
        );
        error.name = 'TimeoutError';
        throw error;
      };

      const initialResponse = await page.goto(url, {
        timeout: remainingTimeout(),
        waitUntil: 'domcontentloaded',
      });
      if (!initialResponse) {
        throw new Error(`Browser navigation returned no response for ${url}`);
      }
      let navigation = initialResponse;

      const initialResponseIndex = mainFrameResponses.indexOf(initialResponse);
      const initialRequestIndex = mainFrameRequests.indexOf(
        initialResponse.request(),
      );
      const followupStart =
        initialResponseIndex === -1
          ? mainFrameResponses.length
          : initialResponseIndex + 1;
      const followupRequestStart =
        initialRequestIndex === -1
          ? mainFrameRequests.length
          : initialRequestIndex + 1;
      const followupResponses = () => mainFrameResponses.slice(followupStart);
      const terminalResponseAfter = (start) =>
        mainFrameResponses.slice(start).findLast(isTerminalNavigation);
      const waitForTerminalResponse = async (
        start,
        {
          allowNoFollowup = false,
          requestStart = mainFrameRequests.length,
        } = {},
      ) => {
        let terminalResponse = terminalResponseAfter(start);
        if (terminalResponse) return terminalResponse;
        try {
          terminalResponse = await page.waitForResponse(
            (response) =>
              response.request().isNavigationRequest() &&
              response.frame() === page.mainFrame() &&
              isTerminalNavigation(response),
            { timeout: remainingTimeout() },
          );
        } catch (error) {
          if (error?.name !== 'TimeoutError') throw error;

          // Recheck responses captured by the always-on listener in case a
          // terminal response arrived at the wait boundary. A timeout with
          // no follow-up means this was a genuine 403. Once any redirect or
          // navigation starts, however, failing to reach a terminal response
          // is a verification failure rather than a successful 3xx result.
          terminalResponse = terminalResponseAfter(start);
          if (
            !terminalResponse &&
            (!allowNoFollowup ||
              mainFrameResponses.length > start ||
              mainFrameRequests.length > requestStart)
          ) {
            throw error;
          }
        }
        return terminalResponseAfter(start) ?? terminalResponse;
      };

      // A browser challenge initially responds with 403, executes JavaScript,
      // and then navigates the main frame again. A genuine forbidden page has
      // no follow-up navigation and remains 403 after the same timeout.
      let terminalResponse;
      if (navigation.status() === 403) {
        terminalResponse = await waitForTerminalResponse(followupStart, {
          allowNoFollowup: true,
          requestStart: followupRequestStart,
        });
      } else if (isTerminalNavigation(navigation)) {
        // TLS recovery can arrive at an apparently successful document that
        // schedules a client-side navigation after DOMContentLoaded. Give it
        // the same bounded settling treatment as a recovered 403 challenge.
        terminalResponse = navigation;
      }

      while (terminalResponse) {
        navigation = terminalResponse;
        // A terminal status is not enough for recursive pages: page.content()
        // must represent the completed document or links after a stalled
        // parser-blocking resource could silently disappear from the crawl.
        await page.waitForLoadState('domcontentloaded', {
          timeout: remainingTimeout(),
        });

        // A parser-blocking interstitial can navigate again before its own
        // DOMContentLoaded. The load-state wait follows the new document, so
        // bind status and headers to the last terminal main-frame response
        // observed by then rather than the interstitial that began the wait.
        navigation =
          followupResponses().findLast(isTerminalNavigation) ?? navigation;

        const latestResponse = followupResponses().at(-1);
        if (latestResponse && !isTerminalNavigation(latestResponse)) {
          terminalResponse = await waitForTerminalResponse(
            mainFrameResponses.length,
          );
          continue;
        }

        // DOMContentLoaded handlers and short timers may schedule one more
        // navigation. Require a bounded quiet interval, then repeat the
        // terminal-response and document-load checks for any new navigation.
        const settleRequestStart = mainFrameRequests.length;
        const settleStart = mainFrameResponses.length;
        await page.waitForTimeout(
          Math.min(BROWSER_NAVIGATION_SETTLE_MS, remainingTimeout()),
        );
        remainingTimeout();
        if (
          mainFrameResponses.length === settleStart &&
          mainFrameRequests.length === settleRequestStart &&
          outstandingMainFrameRequests.size === 0
        ) {
          break;
        }
        terminalResponse = await waitForTerminalResponse(settleStart);
      }

      const contentType = navigation.headers()['content-type'] ?? '';
      return {
        contentType,
        finalUrl: page.url(),
        html:
          captureHTML && contentType.includes('text/html')
            ? await page.content()
            : null,
        redirects: browserRedirects(mainFrameResponses),
        status: navigation.status(),
      };
    } finally {
      await page?.close().catch(() => {});
      await Promise.allSettled([...spawnedPages].map((popup) => popup.close()));
      if (context?.close) await context.close().catch(() => {});
      this.#pageSlots.release();
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
  browserVerifier,
) {
  const startedAtMilliseconds = Date.now();
  const verifier =
    browserVerifier ?? new BrowserVerifier({ userAgent: options.userAgent });
  const rootOrigin = new URL(inputURL).origin;
  const records = new Map();
  const results = [];
  const queue = new WorkQueue();

  const verifyInBrowser = async (record, fallback) => {
    let browserOutcome;
    try {
      browserOutcome = await verifier.verify(record.url, options.timeout, {
        captureHTML: record.recursive,
      });
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

    if (browserOutcome.redirects.length > options.maxRedirects) {
      const redirects = browserOutcome.redirects.slice(
        0,
        options.maxRedirects + 1,
      );
      const exceededRedirect = redirects.at(-1);
      results.push(
        failureResult(
          record,
          {
            error: `Exceeded ${options.maxRedirects} redirect hops`,
            finalUrl: exceededRedirect.to,
            redirects,
            status: exceededRedirect.status,
          },
          'redirect-error',
        ),
      );
      onProgress(results.length, records.size);
      return;
    }

    if (browserOutcome.status >= 300 && browserOutcome.status < 400) {
      results.push(
        failureResult(
          record,
          {
            error: `Browser navigation stopped at HTTP ${browserOutcome.status}`,
            finalUrl: browserOutcome.finalUrl,
            redirects: browserOutcome.redirects,
            status: browserOutcome.status,
          },
          'redirect-error',
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
            redirects: browserOutcome.redirects,
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
      redirects: browserOutcome.redirects,
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
    await verifier.close();
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
