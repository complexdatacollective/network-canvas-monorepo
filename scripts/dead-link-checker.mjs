#!/usr/bin/env node

// SPDX-License-Identifier: MIT
// Adapted from @jthrilly/dead-link-checker v1.1.0, released under the MIT
// License by Joshua Melville: https://www.npmjs.com/package/@jthrilly/dead-link-checker

/**
 * Dead-link checker design
 *
 * The input URL is the root of a same-origin crawl. We parse the rendered DOM
 * and enqueue links recursively only while pages remain on that origin;
 * external links are still followed to their final destination and checked, but
 * their pages do not expand the crawl. Each normalized URL is checked once,
 * while every page that referred to it is retained for the report.
 *
 * Every link is checked by navigating a real Chrome to it. There is no HTTP
 * client path and no fallback. The reason is that a growing number of
 * publishers answer a non-browser client differently from a person: Zenodo's
 * WAF rejects a Chrome-shaped User-Agent that is not actually Chrome, an Azure
 * Application Gateway rejects anything that is not browser-shaped, and
 * Cloudflare's challenge rejects automated headless Chrome. A checker built on
 * `fetch` can only guess which disguise each host wants, and every guess is
 * both a maintenance burden and a way to report a live link as dead. Asking the
 * browser answers the question the reader actually cares about: does this link
 * work for a person who clicks it? Chrome runs headed under Xvfb in CI because
 * challenge providers reject headless Chrome regardless of its User-Agent.
 *
 * Because a browser navigation is far more expensive than a request, results
 * for external links are cached for a week — see `dead-link-cache.mjs` for why
 * that is safe and what is deliberately never cached.
 *
 * Status semantics are strict, and there is no exception of any kind: a link is
 * reported live only when the browser actually reached a non-error terminal
 * response for it, and any final status >= 400 is an error, including 403.
 * Nothing manufactures a success from a response the run could not resolve.
 *
 * That is a deliberate reversal of an earlier attempt here, and the reason is
 * worth keeping. A WAF interstitial is a verdict about the client rather than
 * the link, which makes it tempting to accept the link anyway — but every
 * marker that might identify one is either absent or forgeable. Cloudflare
 * announces some interstitials with `cf-mitigated: challenge` and others not at
 * all; its attestation script `/cdn-cgi/challenge-platform/` is served just as
 * readily on a permanent "you have been blocked" 403 and on ordinary 200 pages,
 * so matching it accepts exactly the blocks it must not; and a challenge drives
 * navigations of its own, so "a redirect preceded it" stops meaning the source
 * redirected. Headed Chrome is deployed precisely because it resolves
 * challenges: when it still cannot, the run genuinely does not know whether the
 * link is alive, and "I don't know" must not be recorded as "alive" — least of
 * all into a cache that every release pull request reads for a week.
 *
 * Chrome is launched lazily and shared by the whole crawl, but every checked
 * link gets a fresh browser context so cookies, storage, cache state, and
 * service workers cannot make later results depend on crawl order. Popups are
 * closed immediately so they cannot bypass the page-slot limit. Redirects are
 * observed from main-frame responses so redirect loops, excessive hops, and the
 * actual final URL remain visible, and browser redirects obey the same
 * maximum-hop rule the HTTP client used to apply.
 *
 * After a navigation, the verifier waits for the browser document to reach a
 * terminal main-frame response, commit that navigation, finish loading, and
 * remain navigation-quiet for a short bounded interval. Binding the load wait
 * to a commit after the selected response prevents the preceding document's
 * DOMContentLoaded state from satisfying it. The initial response and every
 * follow-up are correlated with the latest main-frame commit, so a
 * response-free navigation cannot borrow an abandoned HTTP status. Chrome's
 * document events distinguish a same-document History API change, which keeps
 * the matched representation, from a BFCache document restore, which must not
 * borrow the newer document's response. Both navigation starts and responses
 * are tracked, and starts remain explicitly outstanding until their response or
 * failure event arrives, so a request that stalls before response headers
 * cannot look quiet. Superseded/aborted requests are retired; another
 * navigation failure remains an error unless a later terminal document replaces
 * it. Incomplete redirects and document loads remain verification failures, and
 * the entire sequence — including the page-slot wait, Chrome launch, and
 * context/page creation — shares one request deadline so setup stalls and
 * reload loops cannot retain a worker.
 *
 * A browser 304 is a completed cache revalidation, not a redirect; its prior
 * same-URL representation supplies the effective status and content type so
 * cached errors remain errors and cached HTML remains crawlable. Navigations
 * that become downloads or return 204/205 without a document are the exceptions
 * to requiring a document load: Playwright rejects `goto` in those cases, so the
 * captured HTTP response verifies the non-HTML target without saving a file or
 * inventing a document. This matters more here than it did when only blocked
 * links opened a browser — a documentation site links to plenty of PDFs and
 * CSVs, and each one takes that path.
 *
 * Transient responses and verification failures are retried with bounded
 * backoff (honouring Retry-After).
 *
 * Workers may finish out of order, so results and referrers are sorted before
 * output. Human-readable text, JSON artifacts, GitHub annotations, and the job
 * summary are all rendered from that same deterministic report.
 */
import { appendFile, writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

import { JSDOM } from 'jsdom';

import {
  compareStrings,
  DEFAULT_CACHE_TTL_SECONDS,
  DEFAULT_INTERNAL_HOSTS,
  LinkCheckCache,
} from './dead-link-cache.mjs';

const REPORT_SCHEMA_VERSION = 1;
const TRANSIENT_STATUSES = new Set([429, 502, 503, 504]);
const MAX_RETRY_DELAY_MS = 30_000;
const BASE_RETRY_DELAY_MS = 500;
const BROWSER_NAVIGATION_SETTLE_MS = 500;
const BROWSER_NO_DOCUMENT_STATUSES = new Set([204, 205]);
function isBrowserRedirectStatus(status) {
  return status >= 300 && status < 400 && status !== 304;
}

function isTerminalNavigation(response) {
  return !isBrowserRedirectStatus(response.status());
}

function browserRedirects(mainFrameResponses) {
  const redirects = [];
  for (let index = 0; index < mainFrameResponses.length - 1; index++) {
    const response = mainFrameResponses[index];
    if (!isBrowserRedirectStatus(response.status())) continue;
    redirects.push({
      from: response.url(),
      status: response.status(),
      to: mainFrameResponses[index + 1].url(),
    });
  }
  return redirects;
}

function isNonDocumentNavigation(response) {
  const contentDisposition = response.headers()['content-disposition'] ?? '';
  return (
    BROWSER_NO_DOCUMENT_STATUSES.has(response.status()) ||
    /^\s*attachment(?:\s*;|$)/i.test(contentDisposition)
  );
}

function isHTMLContentType(contentType) {
  return /^\s*text\/html(?:\s*;|$)/i.test(contentType);
}

function nonDocumentOutcome(response, mainFrameResponses) {
  return {
    contentType: response.headers()['content-type'] ?? '',
    finalUrl: response.url(),
    html: null,
    redirects: browserRedirects(mainFrameResponses),
    retryAfter: response.headers()['retry-after'] ?? null,
    status: response.status(),
  };
}

function comparableBrowserURL(value) {
  try {
    const url = new URL(value);
    url.hash = '';
    return url.href;
  } catch {
    return value;
  }
}

function cachedRepresentationResponse(response, mainFrameResponses) {
  if (response.status() !== 304) return null;
  const responseIndex = mainFrameResponses.lastIndexOf(response);
  const responseURL = comparableBrowserURL(response.url());
  return mainFrameResponses
    .slice(0, responseIndex)
    .findLast(
      (candidate) =>
        isTerminalNavigation(candidate) &&
        candidate.status() !== 304 &&
        comparableBrowserURL(candidate.url()) === responseURL,
    );
}

function effectiveContentType(response, mainFrameResponses) {
  const directContentType = response.headers()['content-type'] ?? '';
  if (directContentType || response.status() !== 304) {
    return directContentType;
  }

  return (
    cachedRepresentationResponse(response, mainFrameResponses)?.headers()[
      'content-type'
    ] ?? ''
  );
}

function effectiveStatus(response, mainFrameResponses) {
  return (
    cachedRepresentationResponse(response, mainFrameResponses)?.status() ??
    response.status()
  );
}

// Keep annotations useful without flooding the Actions log. The JSON artifact
// and job summary remain complete when a crawl exceeds this limit.
export const MAX_GITHUB_ERROR_ANNOTATIONS = 50;

const DEFAULT_OPTIONS = {
  cachePath: undefined,
  cacheTtlSeconds: DEFAULT_CACHE_TTL_SECONDS,
  // Each worker holds one browser context, so this is also the number of Chrome
  // pages open at once. Four keeps a two-core runner busy without thrashing.
  concurrent: 4,
  delay: 10,
  format: 'text',
  githubActions: false,
  headless: false,
  internalHosts: DEFAULT_INTERNAL_HOSTS,
  maxRedirects: 10,
  reportPath: undefined,
  retries: 3,
  timeout: 30_000,
  verbose: false,
};

const USAGE = `Usage: node scripts/dead-link-checker.mjs <URL> [options]

Every link is checked by navigating Chrome to it. Run under a display server
(xvfb-run --auto-servernum on CI) unless --headless is given.

Options:
  -v                         Include every checked URL in text output
  --yes                      Deprecated compatibility option (no effect)
  --concurrent=<number>      Concurrent browser pages (default: 4)
  --delay=<milliseconds>     Delay between checks per worker (default: 10)
  --timeout=<milliseconds>   Per-link verification timeout (default: 30000)
  --retries=<number>         Retries after the first attempt (default: 3)
  --max-redirects=<number>   Maximum redirect hops (default: 10)
  --headless                 Launch Chrome headless (challenge providers
                             reject headless Chrome; for local use only)
  --cache=<path>             Read and write the external-link result cache
  --cache-ttl=<seconds>      Cached result lifetime (default: 604800)
  --internal-hosts=<list>    Comma-separated hosts never served from cache
                             (default: ${DEFAULT_INTERNAL_HOSTS.join(',')})
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

  async acquire(timeout, timeoutError) {
    if (this.#available > 0) {
      this.#available--;
      return;
    }
    await new Promise((resolve, reject) => {
      let timer;
      const waiter = {
        grant: () => {
          globalThis.clearTimeout(timer);
          resolve();
        },
      };
      this.#waiters.push(waiter);
      if (timeout !== undefined) {
        timer = globalThis.setTimeout(() => {
          const index = this.#waiters.indexOf(waiter);
          if (index !== -1) this.#waiters.splice(index, 1);
          reject(
            timeoutError?.() ??
              Object.assign(
                new Error(`Browser page slot timed out after ${timeout}ms`),
                { name: 'TimeoutError' },
              ),
          );
        }, timeout);
      }
    });
  }

  release() {
    const waiter = this.#waiters.shift();
    if (waiter) {
      // Keep the permit unavailable while transferring it directly. A later
      // caller therefore cannot overtake the queued verifier before its
      // promise continuation runs.
      waiter.grant();
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
  #headless;
  #loadChromium;
  #pageSlots;
  #resourcesPromise;

  constructor({
    headless = false,
    loadChromium = loadPlaywrightChromium,
    pageLimit = 4,
  } = {}) {
    this.#headless = headless;
    this.#loadChromium = loadChromium;
    this.#pageSlots = new PageSlotSemaphore(pageLimit);
  }

  async #getResources(timeout) {
    this.#resourcesPromise ??= (async () => {
      const chromium = await this.#loadChromium();
      const browser = await chromium.launch({
        args: ['--disable-blink-features=AutomationControlled'],
        channel: 'chrome',
        headless: this.#headless,
        ignoreDefaultArgs: ['--enable-automation'],
        timeout,
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
    const verificationDeadline = Date.now() + timeout;
    const browserTimeoutError = () => {
      const error = new Error(
        `Browser verification timed out after ${timeout}ms`,
      );
      error.name = 'TimeoutError';
      return error;
    };
    const remainingTimeout = () => {
      const remaining = verificationDeadline - Date.now();
      if (remaining > 0) return remaining;
      throw browserTimeoutError();
    };
    const withDeadline = async (operation) => {
      let timer;
      try {
        return await Promise.race([
          operation,
          new Promise((_, reject) => {
            timer = globalThis.setTimeout(
              () => reject(browserTimeoutError()),
              remainingTimeout(),
            );
          }),
        ]);
      } finally {
        globalThis.clearTimeout(timer);
      }
    };

    await this.#pageSlots.acquire(remainingTimeout(), browserTimeoutError);
    let context;
    let page;
    let cdpSession;
    const spawnedPages = new Set();
    try {
      const { browser } = await withDeadline(
        this.#getResources(remainingTimeout()),
      );
      // No User-Agent override. Chrome's own identity is the point: a
      // browser-shaped string sent by something that is not that browser is
      // exactly what publishers fingerprint against, and is what made the
      // Zenodo citations look dead.
      const contextPromise = browser.newContext({ acceptDownloads: false });
      try {
        context = await withDeadline(contextPromise);
      } catch (error) {
        void contextPromise
          .then((lateContext) => lateContext.close())
          .catch(() => {});
        throw error;
      }
      page = await withDeadline(context.newPage());
      const mainFrameRequests = [];
      const mainFrameResponses = [];
      const outstandingMainFrameRequests = new Set();
      const responseCommitBaselines = new WeakMap();
      const mainFrameCommits = [];
      const downloadResponses = new WeakSet();
      const lifecycleWaiters = new Set();
      let lifecycleVersion = 0;
      let mainFrameCommitCount = 0;
      let committedResponseCount = 0;
      let unrecoveredNavigationFailure = '';
      const notifyLifecycleChange = () => {
        lifecycleVersion++;
        for (const wake of lifecycleWaiters) wake();
      };
      page.on('popup', (popup) => {
        spawnedPages.add(popup);
        void popup.close().catch(() => {});
      });
      page.on('download', (download) => {
        const downloadURL = comparableBrowserURL(download.url());
        const downloadResponse = mainFrameResponses
          .slice(committedResponseCount)
          .findLast(
            (response) =>
              response.url &&
              comparableBrowserURL(response.url()) === downloadURL,
          );
        if (downloadResponse) downloadResponses.add(downloadResponse);
        notifyLifecycleChange();
        if (download.cancel) void download.cancel().catch(() => {});
      });
      page.on('response', (response) => {
        if (
          response.request().isNavigationRequest() &&
          response.frame() === page.mainFrame()
        ) {
          responseCommitBaselines.set(response, mainFrameCommitCount);
          mainFrameResponses.push(response);
          outstandingMainFrameRequests.delete(response.request());
          if (isTerminalNavigation(response)) {
            unrecoveredNavigationFailure = '';
          }
          notifyLifecycleChange();
        }
      });
      const recordMainFrameCommit = (value, documentKind) => {
        const commitURL = comparableBrowserURL(value);
        let kind = documentKind;
        if (documentKind === 'document') {
          const pendingResponses = mainFrameResponses.slice(
            committedResponseCount,
          );
          const matchingResponseIndex = pendingResponses.findLastIndex(
            (response) =>
              response.url &&
              comparableBrowserURL(response.url()) === commitURL,
          );
          kind = matchingResponseIndex === -1 ? 'unmatched' : 'document';
          if (matchingResponseIndex !== -1) {
            committedResponseCount += matchingResponseIndex + 1;
          }
        }
        mainFrameCommitCount++;
        mainFrameCommits.push({ kind, url: commitURL });
        notifyLifecycleChange();
      };

      if (context.newCDPSession) {
        cdpSession = await withDeadline(context.newCDPSession(page));
        await withDeadline(cdpSession.send('Page.enable'));
        const { frameTree } = await withDeadline(
          cdpSession.send('Page.getFrameTree'),
        );
        let mainFrameId = frameTree.frame.id;
        cdpSession.on('Page.frameNavigated', ({ frame }) => {
          if (frame.id !== mainFrameId && frame.parentId) return;
          if (!frame.parentId) mainFrameId = frame.id;
          recordMainFrameCommit(frame.url, 'document');
        });
        cdpSession.on(
          'Page.navigatedWithinDocument',
          ({ frameId, url: navigatedURL }) => {
            if (frameId !== mainFrameId) return;
            recordMainFrameCommit(navigatedURL, 'same-document');
          },
        );
      }
      page.on('framenavigated', (frame) => {
        if (cdpSession || frame !== page.mainFrame()) return;
        const pendingResponseCount =
          mainFrameResponses.length - committedResponseCount;
        recordMainFrameCommit(
          frame.url?.() ?? page.url(),
          pendingResponseCount === 0 ? 'same-document' : 'document',
        );
      });
      page.on('request', (request) => {
        if (
          request.isNavigationRequest() &&
          request.frame() === page.mainFrame()
        ) {
          mainFrameRequests.push(request);
          outstandingMainFrameRequests.add(request);
          notifyLifecycleChange();
        }
      });
      page.on('requestfailed', (request) => {
        if (
          request.isNavigationRequest() &&
          request.frame() === page.mainFrame()
        ) {
          outstandingMainFrameRequests.delete(request);
          const errorText = String(
            request.failure()?.errorText ?? 'unknown error',
          );
          if (!errorText.includes('ERR_ABORTED')) {
            unrecoveredNavigationFailure = errorText;
          }
          notifyLifecycleChange();
        }
      });
      const waitForLifecycleChange = async (version) => {
        if (lifecycleVersion !== version) return;
        await new Promise((resolve, reject) => {
          let timer;
          const wake = () => {
            lifecycleWaiters.delete(wake);
            globalThis.clearTimeout(timer);
            resolve();
          };
          timer = globalThis.setTimeout(() => {
            lifecycleWaiters.delete(wake);
            reject(browserTimeoutError());
          }, remainingTimeout());
          lifecycleWaiters.add(wake);
          if (lifecycleVersion !== version) wake();
        });
      };

      let initialResponse;
      try {
        initialResponse = await page.goto(url, {
          timeout: remainingTimeout(),
          waitUntil: 'domcontentloaded',
        });
      } catch (error) {
        const nonDocumentResponse = mainFrameResponses.at(-1);
        const isDownload =
          error instanceof Error &&
          error.message.includes('Download is starting');
        if (
          nonDocumentResponse &&
          (isDownload ||
            BROWSER_NO_DOCUMENT_STATUSES.has(nonDocumentResponse.status()))
        ) {
          return nonDocumentOutcome(nonDocumentResponse, mainFrameResponses);
        }

        const observedInitialResponse = mainFrameResponses.at(0);
        const observedInitialRequestIndex = observedInitialResponse
          ? mainFrameRequests.indexOf(observedInitialResponse.request())
          : -1;
        const hasSupersedingNavigation =
          observedInitialResponse &&
          (mainFrameResponses.length > 1 ||
            mainFrameRequests.length > observedInitialRequestIndex + 1);
        if (!hasSupersedingNavigation) throw error;
        initialResponse = observedInitialResponse;
      }
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
          if (!terminalResponse && unrecoveredNavigationFailure) {
            throw new Error(
              `Browser navigation failed: ${unrecoveredNavigationFailure}`,
              { cause: error },
            );
          }
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
      const settleNonDocumentResponse = async () => {
        while (true) {
          const settleCommitStart = mainFrameCommitCount;
          const settleRequestStart = mainFrameRequests.length;
          const settleStart = mainFrameResponses.length;
          await page.waitForTimeout(
            Math.min(BROWSER_NAVIGATION_SETTLE_MS, remainingTimeout()),
          );
          remainingTimeout();
          if (unrecoveredNavigationFailure) {
            throw new Error(
              `Browser navigation failed: ${unrecoveredNavigationFailure}`,
            );
          }

          const laterTerminalResponse = terminalResponseAfter(settleStart);
          if (laterTerminalResponse) return laterTerminalResponse;
          const requestsAreQuiet =
            mainFrameRequests.length === settleRequestStart;
          const responsesAreQuiet = mainFrameResponses.length === settleStart;
          const laterCommits = mainFrameCommits.slice(settleCommitStart);
          const invalidCommit = laterCommits.find(
            (commit) =>
              commit.kind !== 'same-document' ||
              !/^https?:\/\//i.test(commit.url),
          );
          if (invalidCommit) {
            throw new Error(
              `Browser navigation committed without an HTTP response: ${invalidCommit.url}`,
            );
          }
          if (
            requestsAreQuiet &&
            responsesAreQuiet &&
            laterCommits.length === 0 &&
            outstandingMainFrameRequests.size === 0
          ) {
            return null;
          }
          if (
            !requestsAreQuiet ||
            !responsesAreQuiet ||
            outstandingMainFrameRequests.size > 0
          ) {
            return waitForTerminalResponse(settleStart);
          }
        }
      };
      const resolveResponseLifecycle = async (response) => {
        // page.goto already waited for the initial document's DOMContentLoaded.
        // Playwright Page always exposes waitForEvent; the guard keeps injected
        // unit-test doubles that model only response behavior lightweight.
        if (!page.waitForEvent) {
          return {
            kind: downloadResponses.has(response) ? 'download' : 'document',
          };
        }
        const responseURL = comparableBrowserURL(response.url());
        const commitBaseline =
          responseCommitBaselines.get(response) ?? mainFrameCommitCount;

        while (true) {
          const responseIndex = mainFrameResponses.lastIndexOf(response);
          const laterTerminalResponse = mainFrameResponses
            .slice(responseIndex + 1)
            .findLast(isTerminalNavigation);
          if (laterTerminalResponse) {
            return { kind: 'superseded', response: laterTerminalResponse };
          }
          if (downloadResponses.has(response)) return { kind: 'download' };
          if (unrecoveredNavigationFailure) {
            throw new Error(
              `Browser navigation failed: ${unrecoveredNavigationFailure}`,
            );
          }

          const commits = mainFrameCommits.slice(commitBaseline);
          let responseCommitted = false;
          for (const commit of commits) {
            if (commit.kind === 'document' && commit.url === responseURL) {
              responseCommitted = true;
              continue;
            }
            if (
              responseCommitted &&
              commit.kind === 'same-document' &&
              /^https?:\/\//i.test(commit.url)
            ) {
              continue;
            }
            throw new Error(
              `Browser response ${responseURL} was superseded before commit by ${commit.url}`,
            );
          }
          if (responseCommitted) return { kind: 'document' };

          const version = lifecycleVersion;
          await waitForLifecycleChange(version);
        }
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
      } else {
        terminalResponse = await waitForTerminalResponse(followupStart, {
          requestStart: followupRequestStart,
        });
      }

      while (terminalResponse) {
        if (isNonDocumentNavigation(terminalResponse)) {
          const laterResponse = await settleNonDocumentResponse();
          if (laterResponse) {
            terminalResponse = laterResponse;
            continue;
          }
          return nonDocumentOutcome(terminalResponse, mainFrameResponses);
        }
        const lifecycle = await resolveResponseLifecycle(terminalResponse);
        if (lifecycle.kind === 'download') {
          const laterResponse = await settleNonDocumentResponse();
          if (laterResponse) {
            terminalResponse = laterResponse;
            continue;
          }
          return nonDocumentOutcome(terminalResponse, mainFrameResponses);
        }
        if (lifecycle.kind === 'superseded') {
          terminalResponse = lifecycle.response;
          continue;
        }
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
        const loadedNavigation =
          followupResponses().findLast(isTerminalNavigation);
        if (loadedNavigation && loadedNavigation !== terminalResponse) {
          terminalResponse = loadedNavigation;
          continue;
        }
        navigation = loadedNavigation ?? navigation;

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
        const settleCommitStart = mainFrameCommitCount;
        const settleRequestStart = mainFrameRequests.length;
        const settleStart = mainFrameResponses.length;
        await page.waitForTimeout(
          Math.min(BROWSER_NAVIGATION_SETTLE_MS, remainingTimeout()),
        );
        remainingTimeout();
        if (unrecoveredNavigationFailure) {
          throw new Error(
            `Browser navigation failed: ${unrecoveredNavigationFailure}`,
          );
        }
        const responsesAreQuiet = mainFrameResponses.length === settleStart;
        const requestsAreQuiet =
          mainFrameRequests.length === settleRequestStart;
        const commitsAreQuiet = mainFrameCommitCount === settleCommitStart;
        if (
          responsesAreQuiet &&
          requestsAreQuiet &&
          outstandingMainFrameRequests.size === 0 &&
          !commitsAreQuiet
        ) {
          const finalUrl = page.url();
          if (!/^https?:\/\//i.test(finalUrl)) {
            throw new Error(
              `Browser navigation committed without an HTTP response: ${finalUrl}`,
            );
          }
          terminalResponse = navigation;
          continue;
        }
        if (
          responsesAreQuiet &&
          requestsAreQuiet &&
          commitsAreQuiet &&
          outstandingMainFrameRequests.size === 0
        ) {
          break;
        }
        terminalResponse = await waitForTerminalResponse(settleStart);
      }

      const contentType = effectiveContentType(navigation, mainFrameResponses);
      return {
        contentType,
        finalUrl: page.url(),
        html:
          captureHTML && isHTMLContentType(contentType)
            ? await page.content()
            : null,
        redirects: browserRedirects(mainFrameResponses),
        retryAfter: navigation.headers()['retry-after'] ?? null,
        status: effectiveStatus(navigation, mainFrameResponses),
      };
    } finally {
      await page?.close().catch(() => {});
      await Promise.allSettled([...spawnedPages].map((popup) => popup.close()));
      if (cdpSession?.detach) await cdpSession.detach().catch(() => {});
      if (context?.close) await context.close().catch(() => {});
      this.#pageSlots.release();
    }
  }
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
    if (argument === '--headless') {
      setOptionOnce(seen, 'headless');
      options.headless = true;
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
        case 'cache':
          if (!value) throw new UsageError('--cache must not be empty');
          options.cachePath = value;
          break;
        case 'cache-ttl':
          options.cacheTtlSeconds = optionInteger(value, name, {
            max: 365 * 24 * 60 * 60,
            min: 0,
          });
          break;
        case 'internal-hosts': {
          const hosts = value
            .split(',')
            .map((host) => host.trim())
            .filter(Boolean);
          if (hosts.length === 0) {
            throw new UsageError(
              '--internal-hosts must list at least one host',
            );
          }
          options.internalHosts = hosts;
          break;
        }
        case 'concurrent':
          // Each worker holds a browser context open, so this is a count of
          // live Chrome pages rather than in-flight requests. The old
          // hundred-request ceiling would thrash any runner.
          options.concurrent = optionInteger(value, name, { max: 16, min: 1 });
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

function errorDetail(error, timeout) {
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
    return `Verification timed out after ${timeout}ms`;
  }
  const message = error instanceof Error ? error.message : String(error);
  const cause = error?.cause?.code ?? error?.cause?.message;
  return cause ? `${message} (${cause})` : message;
}

function normalizeURL(value, base) {
  const url = new URL(value, base);
  if (!['http:', 'https:'].includes(url.protocol)) return null;
  url.hash = '';
  return url.href;
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
    cached: false,
    error: details.error,
    finalUrl: details.finalUrl,
    kind,
    ok: false,
    redirects: details.redirects,
    status: details.status ?? null,
    url: record.url,
  };
}

/**
 * Navigates to one link, retrying transient responses and verification
 * failures with bounded backoff. Returns the verifier outcome, or throws the
 * last error when every attempt failed.
 */
async function verifyWithRetry(url, options, verifier, captureHTML) {
  // A transient status is cheap to retry: the page loaded and answered. A
  // verification failure is not — it usually means the navigation never
  // settled, so each attempt can cost the whole timeout, and the causes that
  // repeat (an unreachable host, a reload loop) repeat on every attempt. One
  // retry covers the genuinely intermittent case without letting a handful of
  // bad links dominate the crawl.
  const verificationAttempts = Math.min(options.retries, 1);
  let lastError;
  for (let attempt = 1; attempt <= options.retries + 1; attempt++) {
    let outcome;
    try {
      outcome = await verifier.verify(url, options.timeout, { captureHTML });
    } catch (error) {
      lastError = error;
      if (attempt > verificationAttempts) break;
      await sleep(retryDelayMilliseconds({ attempt, retryAfter: null, url }));
      continue;
    }

    if (!TRANSIENT_STATUSES.has(outcome.status) || attempt > options.retries) {
      return outcome;
    }
    await sleep(
      retryDelayMilliseconds({
        attempt,
        retryAfter: outcome.retryAfter ?? null,
        url,
      }),
    );
  }
  throw lastError;
}

export async function crawl(
  inputURL,
  options,
  onProgress = () => {},
  { cache: injectedCache, verifier: injectedVerifier } = {},
) {
  const startedAtMilliseconds = Date.now();
  const cache =
    injectedCache ??
    new LinkCheckCache({
      internalHosts: options.internalHosts,
      rootURL: inputURL,
      ttlSeconds: options.cacheTtlSeconds,
    });
  const verifier =
    injectedVerifier ??
    new BrowserVerifier({
      headless: options.headless,
      pageLimit: options.concurrent,
    });
  const rootOrigin = new URL(inputURL).origin;
  const records = new Map();
  const results = [];
  const queue = new WorkQueue();

  const checkLink = async (record) => {
    const cached = cache.get(record.url);
    if (cached) {
      results.push(cached);
      onProgress(results.length, records.size);
      return;
    }

    let outcome;
    try {
      outcome = await verifyWithRetry(
        record.url,
        options,
        verifier,
        record.recursive,
      );
    } catch (error) {
      results.push(
        failureResult(
          record,
          {
            error: `Browser verification failed: ${errorDetail(error, options.timeout)}`,
            finalUrl: record.url,
            redirects: [],
            status: null,
          },
          'request-error',
        ),
      );
      onProgress(results.length, records.size);
      return;
    }

    if (outcome.redirects.length > options.maxRedirects) {
      const redirects = outcome.redirects.slice(0, options.maxRedirects + 1);
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

    // Chrome follows redirects itself, so a redirect status here means the
    // chain stopped without producing a document — a missing or unusable
    // Location, not a link that merely moved.
    if (isBrowserRedirectStatus(outcome.status)) {
      results.push(
        failureResult(
          record,
          {
            error: `Browser navigation stopped at HTTP ${outcome.status}`,
            finalUrl: outcome.finalUrl,
            redirects: outcome.redirects,
            status: outcome.status,
          },
          'redirect-error',
        ),
      );
      onProgress(results.length, records.size);
      return;
    }

    if (outcome.status >= 400) {
      results.push(
        failureResult(
          record,
          {
            error: `HTTP ${outcome.status}`,
            finalUrl: outcome.finalUrl,
            redirects: outcome.redirects,
            status: outcome.status,
          },
          'http-error',
        ),
      );
      onProgress(results.length, records.size);
      return;
    }

    if (
      record.recursive &&
      new URL(outcome.finalUrl).origin === rootOrigin &&
      outcome.html
    ) {
      for (const link of extractLinks(outcome.html, outcome.finalUrl)) {
        enqueue(link, outcome.finalUrl);
      }
    }

    const result = {
      cached: false,
      error: null,
      finalUrl: outcome.finalUrl,
      kind: null,
      ok: true,
      redirects: outcome.redirects,
      status: outcome.status,
      url: record.url,
    };
    cache.set(record.url, result);
    results.push(result);
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
    queue.enqueue(() => checkLink(record));
  };

  enqueue(inputURL);
  try {
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
    await Promise.all(workers);
  } finally {
    if (!injectedVerifier) await verifier.close();
  }

  const normalizedResults = results
    .map((result) => ({
      ...result,
      foundOn: [...records.get(result.url).foundOn].toSorted(compareStrings),
    }))
    .toSorted((left, right) => compareStrings(left.url, right.url));
  const failures = normalizedResults.filter((result) => !result.ok);

  return {
    cache: {
      hits: cache.stats.hits,
      internalHosts: cache.internalHosts,
      stored: cache.stats.stored,
      ttlSeconds: options.cacheTtlSeconds,
    },
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
    `Browsed: ${report.summary.checked - report.cache.hits} | From cache: ${report.cache.hits}`,
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
  const cache = new LinkCheckCache({
    internalHosts: options.internalHosts,
    rootURL: inputURL,
    ttlSeconds: options.cacheTtlSeconds,
  });
  if (options.cachePath) await cache.readFrom(options.cachePath);

  const showProgress = options.format === 'text' && stdout.isTTY;
  if (showProgress) stdout.write(`Checking ${inputURL}\n`);
  const report = await crawl(
    inputURL,
    options,
    (checked, total) => {
      if (showProgress) stdout.write(`\rChecked ${checked}/${total} URLs`);
    },
    { cache },
  );
  if (showProgress) stdout.write(`\r${' '.repeat(80)}\r`);

  // Write the cache even when links failed. Only successes were stored, so the
  // file cannot carry a failure forward, and refusing to save would mean one
  // dead third-party link stopped the cache refreshing indefinitely.
  if (options.cachePath) await cache.writeTo(options.cachePath);

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
