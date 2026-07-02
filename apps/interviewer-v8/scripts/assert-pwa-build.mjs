#!/usr/bin/env node
// Post-build assertion: a production PWA build must emit the SW + manifest +
// icons, and every critical chunk (mapbox-gl, the interview engine, the entry)
// must be precached — a chunk over the precache limit silently drops from the
// SW manifest and breaks the offline boot.
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

const swPath = path.join(dist, 'sw.js');
let sw;
try {
  sw = readFileSync(swPath, 'utf8');
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

// generateSW inlines the precache manifest as `self.__WB_MANIFEST` replaced with
// an array literal of { url, revision } entries. Every emitted .js asset chunk
// must appear there — if workbox skipped one for size, it won't.
const precached = new Set(
  [...sw.matchAll(/["']([^"']+\.js)["']/g)].map((m) =>
    m[1].replace(/^\/+/, ''),
  ),
);

const assetsDir = path.join(dist, 'assets');
let jsAssets = [];
try {
  jsAssets = (await readdir(assetsDir)).filter((f) => f.endsWith('.js'));
} catch {
  fail('missing dist/assets');
}

const critical = jsAssets.filter(
  (f) =>
    f.startsWith('mapbox-gl') ||
    f.startsWith('interview-engine') ||
    f.startsWith('main') ||
    f.startsWith('index'),
);
if (critical.length === 0) {
  fail('no critical chunks (mapbox-gl / interview-engine / entry) found');
}

const excluded = critical.filter((f) => !precached.has(`assets/${f}`));
if (excluded.length > 0) {
  fail(`critical chunk(s) excluded from precache: ${excluded.join(', ')}`);
}

console.log(
  `PWA build ok: sw.js + manifest + icons emitted; ${critical.length} critical chunk(s) precached`,
);
