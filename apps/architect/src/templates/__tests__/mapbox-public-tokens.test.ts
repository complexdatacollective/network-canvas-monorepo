import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

import JSZip from 'jszip';
import { beforeAll, describe, expect, it } from 'vitest';

import { TESTING_MAPBOX_TOKEN } from '../testingMapboxToken';

// Guards the repository against carrying any Mapbox access token other than
// the URL-restricted testing token. The account's previous default public
// token, embedded in these same fixtures, was scraped and abused for millions
// of raster-tile requests in August 2026; a study token for a Fresco
// deployment is unrestricted and would be worse. Tokens reach the repo
// through protocol fixtures — the source-editable protocols under
// packages/protocols, the zipped .netcanvas copies the e2e suites import, and
// the template constant itself — so those are the roots scanned here.
//
// It lives in Architect rather than packages/protocols because that package
// has no test runner, and Architect's unit project already hosts the other
// cross-package fixture guards (`testing-token.test.ts`,
// `src/__tests__/netcanvasFixtureSync.test.ts`) and owns the allowlisted
// constant.

// src/templates/__tests__ -> repo root
const repoRoot = resolve(import.meta.dirname, '../../../../..');

// Mapbox access tokens are `<prefix>.<base64url JSON>.<base64url signature>`
// with prefix `pk` (public), `sk` (secret) or `tk` (temporary). No word
// boundary on purpose: a token glued to other text must still be found.
const MAPBOX_TOKEN_PATTERN = '[pst]k\\.eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+';

// Media and font files cannot carry a token as text. Everything else under the
// scan roots is read as UTF-8 and searched; zipped protocols are opened and
// their protocol.json searched.
const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.mov',
  '.mp4',
  '.webm',
  '.mp3',
  '.wav',
  '.m4a',
  '.ogg',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.pdf',
]);
const ARCHIVE_EXTENSIONS = new Set(['.netcanvas', '.zip']);

// Fixtures deliberately named .netcanvas that are not zip archives at all.
// They are searched as plain text instead; any other .netcanvas that fails to
// open, or opens without a protocol.json, fails the test rather than being
// skipped — a skip is where a token would hide.
const KNOWN_NON_ARCHIVE_FIXTURES = new Set([
  'apps/interviewer/e2e/fixtures/malformed.netcanvas',
]);

const appE2eRoots = readdirSync(join(repoRoot, 'apps'), {
  withFileTypes: true,
})
  .filter(
    (entry) =>
      entry.isDirectory() &&
      existsSync(join(repoRoot, 'apps', entry.name, 'e2e')),
  )
  .map((entry) => `apps/${entry.name}/e2e`);

const scanRoots = [
  'packages/protocols',
  'apps/architect/src/templates',
  ...appE2eRoots,
];

// Tracked files only: an untracked scratch protocol on a contributor's disk
// is not a leak, and CI scans exactly what the commit contains.
const trackedFiles = execFileSync(
  'git',
  ['ls-files', '-z', '--', ...scanRoots],
  {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  },
)
  .split('\0')
  .filter((file) => file.length > 0);

const findTokens = (text: string): string[] =>
  Array.from(
    text.matchAll(new RegExp(MAPBOX_TOKEN_PATTERN, 'g')),
    (match) => match[0],
  );

const readArchivedProtocol = async (file: string): Promise<string> => {
  const zip = await JSZip.loadAsync(readFileSync(join(repoRoot, file)));
  const entry = zip.file('protocol.json');
  if (!entry) {
    throw new Error(
      `${file} is a zip archive with no protocol.json entry; nothing to scan means nothing is guarded`,
    );
  }
  return entry.async('string');
};

const scanFile = async (file: string): Promise<string[]> => {
  const extension = extname(file).toLowerCase();
  if (BINARY_EXTENSIONS.has(extension)) {
    return [];
  }
  if (
    ARCHIVE_EXTENSIONS.has(extension) &&
    !KNOWN_NON_ARCHIVE_FIXTURES.has(file)
  ) {
    return findTokens(await readArchivedProtocol(file));
  }
  return findTokens(readFileSync(join(repoRoot, file), 'utf8'));
};

// file -> every token literal found in it (with repeats)
let tokensByFile: Map<string, string[]>;

beforeAll(async () => {
  tokensByFile = new Map();
  for (const file of trackedFiles) {
    const tokens = await scanFile(file);
    if (tokens.length > 0) {
      tokensByFile.set(file, tokens);
    }
  }
});

describe('Mapbox tokens committed under the protocol fixtures', () => {
  // The scan is data-driven, so first prove its input is what it claims to be:
  // an enumeration that misses a root, or a `git ls-files` that returns
  // nothing, would otherwise pass every assertion below with nothing read.
  it('enumerates the source protocols, the app e2e suites and the zipped fixtures', () => {
    expect(scanRoots).toEqual(
      expect.arrayContaining(['apps/architect/e2e', 'apps/interviewer/e2e']),
    );
    expect(trackedFiles).toEqual(
      expect.arrayContaining([
        'apps/architect/src/templates/testingMapboxToken.ts',
        'packages/protocols/templates/transnational-networks/protocol.json',
        'packages/protocols/development/protocol.json',
        'apps/architect/e2e/fixtures/files/all-interfaces.netcanvas',
        'packages/protocols/e2e/silos/silos_chicago-2026-06-02_17-31.netcanvas',
        'apps/interviewer/e2e/fixtures/malformed.netcanvas',
      ]),
    );
  });

  // Then prove the scanner reads content on both paths (plain text and inside
  // an archive) by finding the allowed token exactly where it is known to be.
  // Each pin is load-bearing: the template needs it to render out of the box,
  // and both archives need it so `TestingMapboxTokenAlert` renders the banner
  // that Architect's e2e specs and baselines were measured against.
  it('finds the shared testing token in the template and inside the zipped fixtures', () => {
    expect(TESTING_MAPBOX_TOKEN).toMatch(
      new RegExp(`^${MAPBOX_TOKEN_PATTERN}$`),
    );

    const carriers = Array.from(tokensByFile.entries())
      .filter(([, tokens]) => tokens.includes(TESTING_MAPBOX_TOKEN))
      .map(([file]) => file);

    expect(carriers).toEqual(
      expect.arrayContaining([
        'apps/architect/src/templates/testingMapboxToken.ts',
        'packages/protocols/templates/transnational-networks/protocol.json',
        'apps/architect/e2e/fixtures/files/all-interfaces.netcanvas',
        'packages/protocols/e2e/silos/silos_chicago-2026-06-02_17-31.netcanvas',
      ]),
    );
  });

  it('contains no Mapbox token other than TESTING_MAPBOX_TOKEN', () => {
    const offenders = Array.from(tokensByFile.entries()).flatMap(
      ([file, tokens]) =>
        tokens
          .filter((token) => token !== TESTING_MAPBOX_TOKEN)
          .map((token) => `${file}: ${token}`),
    );

    expect(
      offenders,
      'Only the URL-restricted testing token (TESTING_MAPBOX_TOKEN) may be committed. Study tokens are supplied to deployments at runtime, never through a fixture.',
    ).toEqual([]);
  });
});
