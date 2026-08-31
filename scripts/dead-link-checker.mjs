#!/usr/bin/env node

// Adapted from @jthrilly/dead-link-checker v1.1.0, released under the MIT
// License by Joshua Melville: https://www.npmjs.com/package/@jthrilly/dead-link-checker
import readline from 'node:readline';
import { setTimeout } from 'node:timers/promises';
import { URL } from 'node:url';

import { JSDOM } from 'jsdom';

const deadLinks = [];
const visited = new Set();
const queuedLinks = new Set();
const checkedLinks = [];
let checked = 0;
let totalLinks = 0;
let isProcessing = true;
let requestUserAgent;

// Create a queue for processing links
const queue = [];

// Network-level fetch failures (connection resets, connect timeouts, transient
// CDN edge errors) are not real dead links — the same URL almost always
// succeeds on a retry. Retry the individual request instead of letting one
// flaky request out of hundreds fail the whole run.
const MAX_FETCH_ATTEMPTS = 4;
const RETRY_BACKOFF_MS = 500;

async function fetchWithRetry(url) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt++) {
    try {
      return await fetch(url, {
        headers: requestUserAgent
          ? { 'user-agent': requestUserAgent }
          : undefined,
        redirect: 'manual',
      });
    } catch (error) {
      lastError = error;
      if (attempt < MAX_FETCH_ATTEMPTS) {
        await setTimeout(RETRY_BACKOFF_MS * 2 ** (attempt - 1));
      }
    }
  }
  throw lastError;
}

// Release the connection for responses whose body we don't parse (images,
// redirects, non-HTML). Leaving bodies unconsumed keeps undici sockets
// allocated, which under high concurrency starves later requests and surfaces
// as spurious fetch failures.
async function releaseBody(response) {
  try {
    await response.body?.cancel();
  } catch {
    // body already consumed or absent
  }
}

// "fetch failed" alone is opaque; surface the underlying cause so a genuine
// persistent failure can be diagnosed.
function errorDetail(error) {
  const cause = error?.cause?.code ?? error?.cause?.message;
  return cause ? `${error.message} (${cause})` : error.message;
}

/**
 * Fetches and validates all links on a page.
 * @param {string} url - The URL of the page to check.
 * @param {string} origin - The origin of the initial page.
 */
async function checkLinks(url, origin) {
  if (visited.has(url)) return;
  visited.add(url);

  try {
    const response = await fetchWithRetry(url);
    checked++;
    updateStatus();

    checkedLinks.push({ url, status: response.status });

    if (response.status >= 400) {
      await releaseBody(response);
      deadLinks.push({ url, status: response.status });
      return;
    }

    if (response.status >= 300 && response.status < 400) {
      await releaseBody(response);
      const location = response.headers.get('location');
      if (!location) {
        deadLinks.push({
          url,
          status: response.status,
          error: 'Redirect with no Location header',
        });
        return;
      }
      const redirectURL = new URL(location, url).href;
      if (!queuedLinks.has(redirectURL)) {
        queue.push(() => checkLinks(redirectURL, origin));
        queuedLinks.add(redirectURL);
        totalLinks++;
      }
      return;
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      await releaseBody(response);
      return;
    }

    const html = await response.text();
    const dom = new JSDOM(html);

    const links = Array.from(dom.window.document.querySelectorAll('a')).reduce(
      (acc, link) => {
        try {
          const href = link.getAttribute('href')?.trim() || '';
          if (href && !href.startsWith('#')) {
            const resolvedURL = new URL(href.split('#')[0], url);
            if (
              resolvedURL.protocol !== 'http:' &&
              resolvedURL.protocol !== 'https:'
            ) {
              return acc;
            }

            const resolvedLink = resolvedURL.href;
            const normalizedLink = resolvedLink.endsWith('/')
              ? resolvedLink.slice(0, -1)
              : resolvedLink;
            acc.push(normalizedLink);
          }
        } catch {
          // Ignore invalid URLs
        }
        return acc;
      },
      [],
    );

    for (const link of links) {
      if (!queuedLinks.has(link)) {
        queuedLinks.add(link);

        const linkURL = new URL(link);
        if (linkURL.origin === origin) {
          // Internal link: Add to the queue for recursion
          queue.push(() => checkLinks(link, origin));
          totalLinks++;
        } else {
          // External link: Check only this link (no recursion)
          queue.push(async () => {
            try {
              const externalResponse = await fetchWithRetry(link);
              checked++;
              updateStatus();

              await releaseBody(externalResponse);
              checkedLinks.push({
                url: link,
                status: externalResponse.status,
              });

              if (externalResponse.status >= 400) {
                deadLinks.push({ url: link, status: externalResponse.status });
              }
            } catch (error) {
              deadLinks.push({
                url: link,
                status: 'FETCH_ERROR',
                error: errorDetail(error),
              });
            }
          });
          totalLinks++;
        }
      }
    }
  } catch (error) {
    checkedLinks.push({
      url,
      status: 'FETCH_ERROR',
      error: errorDetail(error),
    });
    deadLinks.push({
      url,
      status: 'FETCH_ERROR',
      error: errorDetail(error),
    });
  }
}

/**
 * Processes the queue with concurrent requests.
 * @param {number} concurrentRequests - Number of concurrent requests.
 * @param {number} delay - Delay between requests in milliseconds.
 */
async function processQueue(concurrentRequests, delay) {
  const workers = Array.from({ length: concurrentRequests }, async () => {
    while (queue.length > 0) {
      const task = queue.shift();
      if (task) await task();
      await setTimeout(delay); // Avoid overloading servers
    }
  });

  await Promise.all(workers);
  isProcessing = false;
}

/**
 * Updates the console status line.
 */
function updateStatus() {
  readline.cursorTo(process.stdout, 0);
  const loadingIndicator = isProcessing ? '⏳' : '';
  const statusText = `Checked: ${checked}/${totalLinks} links`;
  process.stdout.write(`${loadingIndicator} ${statusText}`);
}

/**
 * Prints a verbose summary of all checked links.
 */
function printVerboseSummary() {
  console.log('\nSummary of checked links:');
  for (const { url, status, error } of checkedLinks) {
    const statusText = error ? `FETCH_ERROR (${error})` : status.toString();
    console.log(`- ${url} (Status: ${statusText})`);
  }
}

function optionValue(args, name) {
  const prefix = `--${name}=`;
  return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

/**
 * Main function to initiate the link checking.
 */
async function main() {
  const args = process.argv.slice(2);
  const inputURL = args.find((arg) => !arg.startsWith('-'));
  const verbose = args.includes('-v');
  const concurrentRequests = Number.parseInt(
    optionValue(args, 'concurrent') || '25',
    10,
  );
  const delay = Number.parseInt(optionValue(args, 'delay') || '10', 10);
  requestUserAgent = optionValue(args, 'user-agent');

  if (!inputURL) {
    console.error(
      'Usage: node dead-link-checker.mjs <URL> [-v] [--concurrent=<number>] [--delay=<milliseconds>] [--user-agent=<value>]',
    );
    process.exit(1);
  }

  const { origin } = new URL(inputURL);
  console.log(`Starting to check links on: ${inputURL}\n`);
  queue.push(() => checkLinks(inputURL, origin));
  queuedLinks.add(inputURL);
  totalLinks++;

  updateStatus();
  await processQueue(concurrentRequests, delay);

  console.log('\n'); // Move to a new line after progress

  if (verbose) {
    printVerboseSummary();
  }

  if (deadLinks.length === 0) {
    console.log('\x1b[32m✅ No dead links found.\x1b[0m');
    process.exit(0);
  } else {
    console.error('\x1b[31m❌ Dead links found:\x1b[0m');
    for (const { url, status, error } of deadLinks) {
      console.error(
        `- ${url} (Status: ${status}${error ? `, Error: ${error}` : ''})`,
      );
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('An unexpected error occurred:', error);
  process.exit(1);
});
