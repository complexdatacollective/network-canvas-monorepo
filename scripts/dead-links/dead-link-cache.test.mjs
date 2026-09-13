import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { test } from 'vitest';

import {
  CACHE_SCHEMA_VERSION,
  DEFAULT_CACHE_TTL_SECONDS,
  hostMatches,
  LinkCheckCache,
} from './dead-link-cache.mjs';

const ROOT = 'https://deploy-preview-1843--documentation-dev.netlify.app/';

function success(url, { status = 200 } = {}) {
  return { finalUrl: url, ok: true, redirects: [], status };
}

test('a subdomain matches its parent but a lookalike registration does not', () => {
  assert.ok(
    hostMatches('documentation.networkcanvas.com', 'networkcanvas.com'),
  );
  assert.ok(hostMatches('networkcanvas.com', 'networkcanvas.com'));
  assert.ok(hostMatches('NetworkCanvas.COM.', 'networkcanvas.com'));
  assert.ok(!hostMatches('notnetworkcanvas.com', 'networkcanvas.com'));
  assert.ok(!hostMatches('networkcanvas.com.evil.test', 'networkcanvas.com'));
});

test('our own content is never served from cache', () => {
  const cache = new LinkCheckCache({ rootURL: ROOT });

  // The crawl root is a per-PR Netlify preview, not a production hostname, so
  // it has to be internal by virtue of being the root — a release PR exists to
  // change these pages.
  const preview = `${ROOT}en/get-started`;
  cache.set(preview, success(preview));
  assert.equal(cache.get(preview), null);

  for (const url of [
    'https://documentation.networkcanvas.com/en',
    'https://networkcanvas.com/en-US/',
    'https://architect.networkcanvas.dev/',
    'https://networkcanvas.studio/',
  ]) {
    cache.set(url, success(url));
    assert.equal(cache.get(url), null, url);
  }

  const external = 'https://zenodo.org/records/11397610';
  cache.set(external, success(external));
  assert.equal(cache.get(external)?.ok, true);
  assert.equal(cache.get(external)?.cached, true);
});

test('a failure is never cached, so it cannot outlive the link being fixed', () => {
  const cache = new LinkCheckCache({ rootURL: ROOT });
  const url = 'https://example.test/gone';
  cache.set(url, { finalUrl: url, ok: false, redirects: [], status: 404 });
  assert.equal(cache.get(url), null);
  assert.equal(cache.stats.stored, 0);
});

test('an entry expires exactly at the TTL, whichever store it came from', () => {
  let now = Date.parse('2026-09-11T00:00:00.000Z');
  const cache = new LinkCheckCache({
    now: () => now,
    rootURL: ROOT,
    ttlSeconds: 60,
  });
  const url = 'https://example.test/paper';
  cache.set(url, success(url));

  now += 59_000;
  assert.ok(cache.get(url), 'still fresh one second before expiry');
  now += 2_000;
  assert.equal(cache.get(url), null, 'expired one second after');

  // Expired entries are pruned on serialize rather than accumulating.
  assert.deepEqual(cache.serialize().entries, {});
});

test('an entry written by a clock ahead of ours is not trusted indefinitely', () => {
  const now = Date.parse('2026-09-11T00:00:00.000Z');
  const cache = new LinkCheckCache({ now: () => now, rootURL: ROOT });
  cache.load({
    entries: {
      'https://example.test/future': {
        checkedAt: new Date(now + 10 * 24 * 60 * 60 * 1000).toISOString(),
        finalUrl: 'https://example.test/future',
        redirects: [],
        status: 200,
      },
    },
    schemaVersion: CACHE_SCHEMA_VERSION,
  });
  assert.equal(cache.get('https://example.test/future'), null);
});

test('an unreadable or foreign cache degrades into a slow run, not a wrong one', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dead-link-cache-'));
  try {
    const cache = new LinkCheckCache({ rootURL: ROOT });
    const url = 'https://example.test/paper';
    cache.set(url, success(url));

    assert.equal(await cache.readFrom(join(directory, 'absent.json')), false);
    assert.equal(cache.get(url), null, 'a missing file clears what was held');

    const corrupt = join(directory, 'corrupt.json');
    await writeFile(corrupt, '{"entries": {');
    assert.equal(await cache.readFrom(corrupt), false);

    const foreign = join(directory, 'foreign.json');
    await writeFile(
      foreign,
      JSON.stringify({
        entries: {
          [url]: { checkedAt: new Date().toISOString(), status: 200 },
        },
        schemaVersion: CACHE_SCHEMA_VERSION + 1,
      }),
    );
    assert.equal(await cache.readFrom(foreign), false);
    assert.equal(cache.get(url), null);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test('an entry no writer could have produced is refused', () => {
  const cache = new LinkCheckCache({ rootURL: ROOT });
  const checkedAt = new Date().toISOString();
  cache.load({
    entries: {
      // `set` stores successes only, so a stored error means the file was
      // written by something that is not this module. Admitting it is the one
      // way a stale store degrades into a wrong answer rather than a slow one.
      'https://example.test/forbidden': {
        checkedAt,
        finalUrl: 'https://example.test/forbidden',
        redirects: [],
        status: 403,
      },
      'https://example.test/junk-redirect': {
        checkedAt,
        finalUrl: 'https://example.test/junk-redirect',
        redirects: [{ junk: true }],
        status: 200,
      },
    },
    schemaVersion: CACHE_SCHEMA_VERSION,
  });
  assert.equal(cache.get('https://example.test/forbidden'), null);
  assert.equal(cache.get('https://example.test/junk-redirect'), null);
});

test('load refuses our own content even before get re-checks it', () => {
  // `get` filters internal URLs too, so this is defence in depth — but a
  // cache file that carries our own pages is a file to distrust, and the
  // filter is worth an oracle of its own rather than resting on the later one.
  const cache = new LinkCheckCache({ rootURL: ROOT });
  cache.load({
    entries: {
      'https://documentation.networkcanvas.com/en': {
        checkedAt: new Date().toISOString(),
        finalUrl: 'https://documentation.networkcanvas.com/en',
        redirects: [],
        status: 200,
      },
    },
    schemaVersion: CACHE_SCHEMA_VERSION,
  });
  assert.deepEqual(cache.serialize().entries, {});
});

test('a malformed entry is dropped rather than returned as a result', () => {
  const cache = new LinkCheckCache({ rootURL: ROOT });
  const checkedAt = new Date().toISOString();
  cache.load({
    entries: {
      'https://example.test/no-redirects': {
        checkedAt,
        finalUrl: 'https://example.test/no-redirects',
        status: 200,
      },
      'https://example.test/no-status': {
        checkedAt,
        finalUrl: 'https://example.test/no-status',
        redirects: [],
      },
      'https://example.test/valid': {
        checkedAt,
        finalUrl: 'https://example.test/valid',
        redirects: [],
        status: 200,
      },
    },
    schemaVersion: CACHE_SCHEMA_VERSION,
  });
  assert.equal(cache.get('https://example.test/no-redirects'), null);
  assert.equal(cache.get('https://example.test/no-status'), null);
  assert.ok(cache.get('https://example.test/valid'));
});

test('a round trip through a file preserves entries and sorts them', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dead-link-cache-'));
  const path = join(directory, 'cache.json');
  try {
    const cache = new LinkCheckCache({ rootURL: ROOT });
    for (const url of [
      'https://zebra.test/',
      'https://apple.test/',
      'https://middle.test/',
    ]) {
      cache.set(url, success(url));
    }
    await cache.writeTo(path);

    const contents = await readFile(path, 'utf8');
    assert.deepEqual(Object.keys(JSON.parse(contents).entries), [
      'https://apple.test/',
      'https://middle.test/',
      'https://zebra.test/',
    ]);

    const restored = new LinkCheckCache({ rootURL: ROOT });
    assert.equal(await restored.readFrom(path), true);
    assert.equal(restored.get('https://middle.test/')?.status, 200);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test('the default lifetime is a week', () => {
  assert.equal(DEFAULT_CACHE_TTL_SECONDS, 7 * 24 * 60 * 60);
});
