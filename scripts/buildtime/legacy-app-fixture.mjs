// Small stand-ins for an older major's sub-path build, for the legacy-app
// tests: the files of a /v8/ build in the layout the 8.x release lane packs
// (the dist root plus dist-info.json), and the tarball the lane would make of
// them.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const FIXTURE_VERSION = '8.5.0';

/**
 * @param {import('./legacy-app.ts').LegacyApp} app
 * @param {string} [sha256]
 * @returns {import('./legacy-app.ts').LegacyAppPin}
 */
export const fixturePin = (app, sha256 = 'a'.repeat(64)) => ({
  version: FIXTURE_VERSION,
  url: `https://github.com/complexdatacollective/network-canvas-monorepo/releases/download/%40codaco%2F${app.name}%40${FIXTURE_VERSION}/${app.tarballName}`,
  sha256,
  cachePrefix: app.cachePrefix,
});

/** `index.html` → `main`, `preview/index.html` → `preview`. */
const entryChunk = (htmlEntry) =>
  htmlEntry === 'index.html' ? 'main' : htmlEntry.split('/')[0];

/**
 * The files of a sub-path build of `app`, small enough to write in a test.
 * Override a file's content, or pass null to leave it out.
 *
 * @param {import('./legacy-app.ts').LegacyApp} app
 * @param {Record<string, string | null>} [overrides]
 * @returns {Record<string, string | null>}
 */
export const legacyDistFiles = (app, overrides = {}) => ({
  ...Object.fromEntries(
    app.htmlEntries.flatMap((htmlEntry) => [
      [
        htmlEntry,
        `<!doctype html><script type="module" src="/v8/assets/${entryChunk(htmlEntry)}-abc.js"></script>`,
      ],
      [
        `assets/${entryChunk(htmlEntry)}-abc.js`,
        `console.log("${app.label} ${entryChunk(htmlEntry)}");`,
      ],
    ]),
  ),
  'sw.js': `self.workbox.core.setCacheNameDetails({prefix:"${app.cachePrefix}${FIXTURE_VERSION}-turbo-0123456789abcdef"});`,
  'manifest.webmanifest': JSON.stringify({
    name: app.label,
    start_url: '/v8/',
    scope: '/v8/',
  }),
  'dist-info.json': JSON.stringify({
    tag: `@codaco/${app.name}@${FIXTURE_VERSION}`,
    version: FIXTURE_VERSION,
    commit: '0123456789abcdef0123456789abcdef01234567',
    base: '/v8/',
    cachePrefix: app.cachePrefix,
  }),
  ...overrides,
});

/**
 * @param {string} directory
 * @param {Record<string, string | null>} files
 */
export const writeFiles = (directory, files) => {
  for (const [file, content] of Object.entries(files)) {
    if (content === null) continue;
    const path = join(directory, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
};

/**
 * Pack `directory` as the release lane does; returns the tarball's sha256.
 *
 * @param {string} directory
 * @param {string} out
 * @param {string[]} [extraTarArgs]
 */
export const packTarball = (directory, out, extraTarArgs = []) => {
  const packed = spawnSync(
    'bash',
    [
      '-c',
      'set -euo pipefail; dir="$1"; out="$2"; shift 2; tar --sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner "$@" -C "$dir" -cf - . | gzip -n > "$out"',
      'pack',
      directory,
      out,
      ...extraTarArgs,
    ],
    { encoding: 'utf8' },
  );
  if (packed.status !== 0) throw new Error(packed.stderr);
  return createHash('sha256').update(readFileSync(out)).digest('hex');
};
