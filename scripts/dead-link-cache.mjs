/**
 * Dead-link result cache
 *
 * Checking every discovered link in a real browser is accurate but slow, and
 * third-party links rarely change between one release PR and the next. This
 * cache therefore remembers successful checks of EXTERNAL links for a bounded
 * period so a pull request only pays for links it actually introduces.
 *
 * Two rules keep a cache hit from ever hiding a broken link we are responsible
 * for:
 *
 * 1. Our own content is never cached. That means the crawl root's own origin —
 *    which on a pull request is the Netlify deploy preview, not a production
 *    hostname — as well as every Network Canvas domain. A release PR exists to
 *    change those pages, so a remembered verdict about them would be answering
 *    a question nobody asked.
 * 2. Only successes are cached. A remembered failure would fail an unrelated
 *    pull request on week-old evidence, and a link that came back to life would
 *    stay red until the entry expired. Failures are few, so re-checking them
 *    every run costs little and always reports the current truth.
 *
 * Expiry is carried in each entry as `checkedAt` rather than being delegated to
 * the storage layer, so a cache restored from anywhere expires on the same
 * schedule and a stale store degrades into a slower run rather than a wrong one.
 */
import { readFile, writeFile } from 'node:fs/promises';

export const CACHE_SCHEMA_VERSION = 1;
export const DEFAULT_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;

// Every environment of every Network Canvas property. Deploy previews are
// covered separately by the crawl root's own origin.
export const DEFAULT_INTERNAL_HOSTS = [
  'networkcanvas.com',
  'networkcanvas.dev',
  'networkcanvas.studio',
];

function normalizeHost(value) {
  return value.trim().toLowerCase().replace(/\.$/, '');
}

export function compareStrings(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/**
 * Matches a host exactly or as a subdomain, so `networkcanvas.com` covers
 * `documentation.networkcanvas.com` without also covering a lookalike
 * registration such as `notnetworkcanvas.com`.
 */
export function hostMatches(host, suffix) {
  const candidate = normalizeHost(host);
  const target = normalizeHost(suffix);
  return candidate === target || candidate.endsWith(`.${target}`);
}

export class LinkCheckCache {
  #entries = new Map();
  #hits = 0;
  #internalHosts;
  #now;
  #stores = 0;
  #ttlMilliseconds;

  constructor({
    internalHosts = DEFAULT_INTERNAL_HOSTS,
    now = () => Date.now(),
    rootURL,
    ttlSeconds = DEFAULT_CACHE_TTL_SECONDS,
  } = {}) {
    this.#internalHosts = [
      ...new Set(
        [...(rootURL ? [new URL(rootURL).hostname] : []), ...internalHosts].map(
          normalizeHost,
        ),
      ),
    ];
    this.#now = now;
    this.#ttlMilliseconds = ttlSeconds * 1_000;
  }

  get internalHosts() {
    return [...this.#internalHosts];
  }

  get stats() {
    return { hits: this.#hits, size: this.#entries.size, stored: this.#stores };
  }

  isInternal(url) {
    let hostname;
    try {
      ({ hostname } = new URL(url));
    } catch {
      return true;
    }
    return this.#internalHosts.some((host) => hostMatches(hostname, host));
  }

  #isFresh(entry) {
    const checkedAt = Date.parse(entry?.checkedAt ?? '');
    if (Number.isNaN(checkedAt)) return false;
    const age = this.#now() - checkedAt;
    // A negative age means the entry was written by a clock ahead of ours.
    // Treat it as unusable rather than trusting it indefinitely.
    return age >= 0 && age < this.#ttlMilliseconds;
  }

  /**
   * Returns a crawl result for `url`, or null when the link must be checked.
   */
  get(url) {
    if (this.isInternal(url)) return null;
    const entry = this.#entries.get(url);
    if (!entry || !this.#isFresh(entry)) return null;
    this.#hits++;
    return {
      cached: true,
      error: null,
      finalUrl: entry.finalUrl,
      kind: null,
      ok: true,
      redirects: entry.redirects,
      status: entry.status,
      url,
    };
  }

  set(url, result) {
    if (!result.ok || this.isInternal(url)) return;
    this.#stores++;
    this.#entries.set(url, {
      checkedAt: new Date(this.#now()).toISOString(),
      finalUrl: result.finalUrl,
      redirects: result.redirects ?? [],
      status: result.status,
    });
  }

  /**
   * Replaces the in-memory entries with the fresh ones from `value`. Unknown
   * schema versions are discarded rather than guessed at, which turns a format
   * change into one slow run instead of a wrong one.
   */
  load(value) {
    this.#entries.clear();
    if (value?.schemaVersion !== CACHE_SCHEMA_VERSION) return false;
    for (const [url, entry] of Object.entries(value.entries ?? {})) {
      if (this.isInternal(url) || !this.#isFresh(entry)) continue;
      if (typeof entry.finalUrl !== 'string') continue;
      if (!Number.isInteger(entry.status)) continue;
      if (!Array.isArray(entry.redirects)) continue;
      this.#entries.set(url, entry);
    }
    return true;
  }

  /**
   * Serializes the fresh entries, sorted so an unchanged cache produces an
   * unchanged file and expired entries are pruned rather than accumulating.
   */
  serialize() {
    const entries = {};
    for (const url of [...this.#entries.keys()].sort(compareStrings)) {
      const entry = this.#entries.get(url);
      if (this.#isFresh(entry)) entries[url] = entry;
    }
    return { entries, schemaVersion: CACHE_SCHEMA_VERSION };
  }

  /**
   * Replaces the cache with whatever `path` holds. Every outcome — a missing
   * file, a corrupt one, a foreign schema — leaves the cache empty rather than
   * holding whatever it had before, so the contents always describe one known
   * store and a bad read degrades into a slower run instead of a stale one.
   */
  async readFrom(path) {
    let contents;
    try {
      contents = await readFile(path, 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      return this.load(null);
    }
    try {
      return this.load(JSON.parse(contents));
    } catch {
      // A truncated or corrupt cache file is not worth failing a release over.
      return this.load(null);
    }
  }

  async writeTo(path) {
    await writeFile(path, `${JSON.stringify(this.serialize(), null, 2)}\n`);
  }
}
