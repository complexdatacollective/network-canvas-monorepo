#!/usr/bin/env node
// Post-build assertion: a production PWA build must emit the SW + manifest +
// icons, and every emitted JS chunk must be precached. A chunk over the workbox
// `maximumFileSizeToCacheInBytes` limit silently drops from the SW precache
// manifest and 404s offline, breaking the offline boot. Architect precaches all
// JS (no `globIgnores`), so any excluded chunk is a real regression. (Sibling of
// apps/interviewer/scripts/assert-pwa-build.mjs, which instead checks named
// critical chunks because it intentionally excludes its dev-protocol chunk.)
import { readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const dist = path.join(appRoot, 'dist');

const fail = (msg) => {
  console.error(`PWA build assertion failed: ${msg}`);
  process.exit(1);
};

let sw;
try {
  sw = readFileSync(path.join(dist, 'sw.js'), 'utf8');
} catch {
  fail('missing dist/sw.js');
}

for (const f of [
  'manifest.webmanifest',
  'pwa-192x192.png',
  'pwa-512x512.png',
]) {
  try {
    readFileSync(path.join(dist, f));
  } catch {
    fail(`missing dist/${f}`);
  }
}

// generateSW inlines the precache manifest as an array of { url, revision }
// entries; collect every precached .js url.
const precached = new Set(
  [...sw.matchAll(/["']([^"']+\.js)["']/g)].map((m) =>
    m[1].replace(/^\/+/, ''),
  ),
);

let jsAssets = [];
try {
  jsAssets = (await readdir(path.join(dist, 'assets')))
    .filter((f) => f.endsWith('.js'))
    .map((f) => `assets/${f}`);
} catch {
  fail('missing dist/assets');
}
if (jsAssets.length === 0) fail('no JS chunks emitted to dist/assets');

// The entry module (referenced by index.html) boots the app; it must be
// precached for an offline start. Derive it rather than hardcode the hash.
const html = readFileSync(path.join(dist, 'index.html'), 'utf8');
const entry = (html.match(/assets\/[^"']+\.js/) || [])[0];
if (!entry) fail('no entry chunk referenced in dist/index.html');
if (!precached.has(entry)) fail(`entry chunk excluded from precache: ${entry}`);

// No globIgnores means every emitted chunk should be precached; an excluded one
// exceeded the size limit and would 404 offline.
const excluded = jsAssets.filter((u) => !precached.has(u));
if (excluded.length > 0) {
  fail(
    `JS chunk(s) excluded from precache (over the size limit?): ${excluded.join(', ')}`,
  );
}

console.log(
  `PWA build ok: sw.js + manifest + icons emitted; entry ${entry} + all ${jsAssets.length} JS chunks precached`,
);
