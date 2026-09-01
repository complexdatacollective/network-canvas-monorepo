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
 * Requests use only Node's fetch implementation. CI supplies a browser-shaped
 * User-Agent, but there is no browser launch or second networking stack.
 * Redirects are followed manually so redirect loops, missing or invalid
 * Location headers, excessive hops, and the actual final URL remain visible.
 * Transient responses and request failures are retried with bounded backoff
 * (honouring Retry-After), and unused response bodies are cancelled so the
 * connection pool stays healthy. One worker is used by default. Serializing
 * requests prevents a cluster of links on one publisher from looking like a
 * bot burst and keeps the two Netlify previews responsive during a recursive
 * crawl.
 *
 * TLS validation remains enabled for every fetch. Browsers can repair a
 * server's incomplete certificate chain by retrieving a missing intermediate
 * issuer, while Node fetch intentionally does not perform that AIA lookup.
 * One linked publisher currently serves a leaf certificate without its public
 * GEANT TLS RSA 1 intermediate, so that issuer certificate is bundled here.
 * Before installing it into Node's default CA set, the checker requires the
 * pinned fingerprint, a current CA validity period, and a valid signature from
 * a current root that Node already trusts. This completes the omitted chain;
 * Node fetch still validates the leaf signature, hostname, dates, and every
 * other TLS property. TLS errors are never converted into successful checks.
 *
 * Status semantics are strict: any final status >= 400 is an error, including
 * 403. There is exactly one redirect-specific exception. Cloudflare identifies
 * an interstitial challenge with the response header
 * `cf-mitigated: challenge`; `server: cloudflare`, a hostname, a 403 alone,
 * or challenge-looking HTML is not sufficient. If and only if that header is
 * encountered after at least one HTTP redirect, the link is accepted using
 * the chain's initial redirect response. The recorded status and destination
 * are therefore that first redirect's status and Location, and the later
 * challenge response is discarded without parsing its body or following it
 * further. A challenge returned directly, or an ordinary 403 behind a
 * redirect, still fails.
 *
 * This exception reflects what the checker can establish without pretending to
 * solve Cloudflare's browser-attestation flow: the source URL produced a valid
 * redirect, while the automated client was explicitly challenged at the
 * destination. Accepting only that initial redirect avoids treating the
 * challenge as a dead target without weakening status handling for any other
 * response.
 *
 * Workers may finish out of order, so results and referrers are sorted before
 * output. Human-readable text, JSON artifacts, GitHub annotations, and the job
 * summary are all rendered from that same deterministic report.
 */
import { X509Certificate } from 'node:crypto';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { getCACertificates, setDefaultCACertificates } from 'node:tls';
import { pathToFileURL } from 'node:url';

import { JSDOM } from 'jsdom';

const REPORT_SCHEMA_VERSION = 1;
const TRANSIENT_STATUSES = new Set([429, 502, 503, 504]);
const MAX_RETRY_DELAY_MS = 30_000;
const BASE_RETRY_DELAY_MS = 500;
// The publisher's leaf certificate names this public HARICA issuer at
// http://crt.harica.gr/HARICA-GEANT-TLS-R1.cer in its AIA extension.
const BUNDLED_INTERMEDIATE_CA = {
  expectedFingerprint:
    '5B:67:8D:C4:40:95:A5:28:95:B6:3B:31:F2:72:27:F4:B3:6C:3E:34:74:91:BF:2B:FA:69:18:37:A5:FB:8C:79',
  path: new URL('./certificates/HARICA-GEANT-TLS-RSA-1.crt', import.meta.url),
};

function certificateIsCurrent(certificate, now) {
  return (
    certificate.validFromDate.getTime() <= now &&
    now <= certificate.validToDate.getTime()
  );
}

export function validateIntermediateCA(
  value,
  {
    expectedFingerprint,
    now = Date.now(),
    trustedCAs = getCACertificates('default'),
  } = {},
) {
  const certificate = new X509Certificate(value);
  if (!certificate.ca) {
    throw new Error('The bundled intermediate certificate is not a CA');
  }
  if (!certificateIsCurrent(certificate, now)) {
    throw new Error('The bundled intermediate CA certificate is not current');
  }
  if (
    expectedFingerprint &&
    certificate.fingerprint256 !== expectedFingerprint
  ) {
    throw new Error(
      `The bundled intermediate CA fingerprint is ${certificate.fingerprint256}, expected ${expectedFingerprint}`,
    );
  }

  const trustedIssuer = trustedCAs
    .map((trustedCA) => new X509Certificate(trustedCA))
    .find(
      (trustedCA) =>
        trustedCA.ca &&
        certificateIsCurrent(trustedCA, now) &&
        certificate.checkIssued(trustedCA) &&
        certificate.verify(trustedCA.publicKey),
    );
  if (!trustedIssuer) {
    throw new Error(
      'The bundled intermediate CA is not signed by a current trusted root',
    );
  }
  return certificate.toString();
}

let bundledIntermediateCAInstallation;

function installBundledIntermediateCA() {
  bundledIntermediateCAInstallation ??= (async () => {
    const trustedCAs = getCACertificates('default');
    const value = await readFile(BUNDLED_INTERMEDIATE_CA.path, 'utf8');
    const certificate = validateIntermediateCA(value, {
      expectedFingerprint: BUNDLED_INTERMEDIATE_CA.expectedFingerprint,
      trustedCAs,
    });
    setDefaultCACertificates([...trustedCAs, certificate]);
  })();
  return bundledIntermediateCAInstallation;
}

function isHTMLContentType(contentType) {
  return /^\s*text\/html(?:\s*;|$)/i.test(contentType);
}

function isCloudflareChallenge(response) {
  return (
    response.headers.get('cf-mitigated')?.trim().toLowerCase() === 'challenge'
  );
}
// Keep annotations useful without flooding the Actions log. The JSON artifact
// and job summary remain complete when a crawl exceeds this limit.
export const MAX_GITHUB_ERROR_ANNOTATIONS = 50;

const DEFAULT_OPTIONS = {
  concurrent: 1,
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
  --concurrent=<number>      Concurrent workers (default: 1)
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
        !isCloudflareChallenge(response) &&
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
      if (redirects.length > 0 && isCloudflareChallenge(response)) {
        await releaseBody(response);
        const initialRedirect = redirects[0];
        return {
          acceptedCloudflareChallenge: true,
          finalUrl: initialRedirect.to,
          redirects: [initialRedirect],
          status: initialRedirect.status,
        };
      }
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

export async function crawl(inputURL, options, onProgress = () => {}) {
  const startedAtMilliseconds = Date.now();
  const rootOrigin = new URL(inputURL).origin;
  const records = new Map();
  const results = [];
  const queue = new WorkQueue();

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
        results.push(failureResult(record, failure, failure.kind));
        onProgress(results.length, records.size);
        return;
      }

      if (outcome.error) {
        results.push(failureResult(record, outcome, 'redirect-error'));
        onProgress(results.length, records.size);
        return;
      }

      if (outcome.acceptedCloudflareChallenge) {
        results.push({
          error: null,
          finalUrl: outcome.finalUrl,
          kind: null,
          ok: true,
          redirects: outcome.redirects,
          status: outcome.status,
          url: record.url,
        });
        onProgress(results.length, records.size);
        return;
      }

      const { finalUrl, redirects, response } = outcome;
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
          isHTMLContentType(contentType)
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
  await Promise.all(workers);

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

  await installBundledIntermediateCA();
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
