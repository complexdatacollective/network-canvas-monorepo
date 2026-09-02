import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

import JSZip from 'jszip';
import { beforeAll, describe, expect, it } from 'vitest';

import { TESTING_MAPBOX_TOKEN } from '../testingMapboxToken';

// Guards every tracked file in the repository against carrying any Mapbox
// access token other than the URL-restricted testing token. The account's
// previous default public token, embedded in the protocol fixtures, was
// scraped and abused for millions of raster-tile requests in August 2026; a
// study token for a Fresco deployment is unrestricted and would be worse.
//
// Two scans cover the whole tree: `git grep` over every tracked text file
// (binaries are skipped by git's own detection), and a pass over every tracked
// zip archive (`.netcanvas`, `.zip`) that reads each text entry inside it. So
// a token pasted into a source file, a story, a scenario builder, a doc, a
// protocol.json, or an asset inside a zipped protocol all fail this test.
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

// Media and font entries inside an archive cannot carry a token as text.
// Everything else inside a zip is read as UTF-8 and searched.
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
// `git grep` already searches them as plain text; any other archive that fails
// to open, or a .netcanvas that opens without a protocol.json, fails the test
// rather than being skipped — a skip is where a token would hide.
const KNOWN_NON_ARCHIVE_FIXTURES = new Set([
  'apps/interviewer/e2e/fixtures/malformed.netcanvas',
]);

const git = (args: string[]): string =>
  execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });

// Tracked files only: an untracked scratch protocol on a contributor's disk
// is not a leak, and CI scans exactly what the commit contains.
const trackedFiles = git(['ls-files', '-z'])
  .split('\0')
  .filter((file) => file.length > 0);

const trackedArchives = trackedFiles.filter(
  (file) =>
    ARCHIVE_EXTENSIONS.has(extname(file).toLowerCase()) &&
    !KNOWN_NON_ARCHIVE_FIXTURES.has(file),
);

const findTokens = (text: string): string[] =>
  Array.from(
    text.matchAll(new RegExp(MAPBOX_TOKEN_PATTERN, 'g')),
    (match) => match[0],
  );

// Every token-shaped match in every tracked text file, via git's own search:
// `-I` skips files git detects as binary, `-o` prints only the match, `-z`
// terminates the path with NUL so paths containing ':' or spaces still parse.
// `git grep` exits 1 when nothing matches, which is a legitimate (if
// unexpected) answer here, not an error.
const grepTrackedText = (): Map<string, string[]> => {
  let output = '';
  try {
    output = git([
      'grep',
      '-I',
      '-o',
      '-z',
      '--no-color',
      '-E',
      MAPBOX_TOKEN_PATTERN,
      '--',
      '.',
    ]);
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status !== 1) {
      throw error;
    }
  }

  const found = new Map<string, string[]>();
  // Each record is `<path>\0<match>\n` (line numbers are off by default).
  for (const record of output.split('\n')) {
    if (!record) continue;
    const separator = record.indexOf('\0');
    if (separator === -1) {
      throw new Error(`unparseable git grep record: ${record}`);
    }
    const file = record.slice(0, separator);
    const token = record.slice(separator + 1);
    found.set(file, [...(found.get(file) ?? []), token]);
  }
  return found;
};

// Every token-shaped match in every text entry of a tracked archive.
const scanArchive = async (file: string): Promise<string[]> => {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(readFileSync(join(repoRoot, file)));
  } catch (error) {
    throw new Error(
      `${file} could not be opened as a zip archive; nothing to scan means nothing is guarded`,
      { cause: error },
    );
  }

  if (file.toLowerCase().endsWith('.netcanvas') && !zip.file('protocol.json')) {
    throw new Error(
      `${file} is a .netcanvas archive with no protocol.json entry; nothing to scan means nothing is guarded`,
    );
  }

  const tokens: string[] = [];
  for (const entry of Object.values(zip.files)) {
    if (entry.dir || BINARY_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      continue;
    }
    tokens.push(...findTokens(await entry.async('string')));
  }
  return tokens;
};

// file -> every token literal found in it (with repeats). Archive hits are
// keyed by the archive path.
let tokensByFile: Map<string, string[]>;

beforeAll(async () => {
  tokensByFile = grepTrackedText();
  for (const archive of trackedArchives) {
    const tokens = await scanArchive(archive);
    if (tokens.length > 0) {
      tokensByFile.set(archive, [
        ...(tokensByFile.get(archive) ?? []),
        ...tokens,
      ]);
    }
  }
});

describe('Mapbox tokens committed anywhere in the repository', () => {
  // The scan is data-driven, so first prove its input is what it claims to be:
  // a `git ls-files` that returned nothing, or an archive list that missed a
  // directory, would otherwise pass every assertion below with nothing read.
  it('enumerates the whole tracked tree, including fixtures outside the protocol roots', () => {
    expect(trackedFiles.length).toBeGreaterThan(1000);
    expect(trackedFiles).toEqual(
      expect.arrayContaining([
        'apps/architect/src/templates/testingMapboxToken.ts',
        'packages/protocols/templates/transnational-networks/protocol.json',
        'packages/protocols/development/protocol.json',
        'packages/development-protocol/protocol.json',
        'packages/interview/e2e/matrix/geospatial.scenarios.ts',
        'apps/interviewer/e2e/fixtures/malformed.netcanvas',
      ]),
    );
    expect(trackedArchives).toEqual(
      expect.arrayContaining([
        'apps/architect/e2e/fixtures/files/all-interfaces.netcanvas',
        'packages/protocols/e2e/silos/silos_chicago-2026-06-02_17-31.netcanvas',
        'apps/interviewer-classic/integration-tests/data/mock.netcanvas',
      ]),
    );
    expect(trackedArchives).not.toContain(
      'apps/interviewer/e2e/fixtures/malformed.netcanvas',
    );
  });

  // Then prove both scanners read content by finding the allowed token exactly
  // where it is known to be: the text path in the constant and the source
  // protocols, the archive path inside both zipped fixtures. Each pin is
  // load-bearing: the template needs it to render out of the box, and both
  // archives need it so `TestingMapboxTokenAlert` renders the banner that
  // Architect's e2e specs and baselines were measured against.
  it('finds the shared testing token in the constant, the source protocols and inside the zipped fixtures', () => {
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
        'packages/protocols/development/protocol.json',
        'packages/development-protocol/protocol.json',
        'packages/protocols/e2e/all-interfaces/protocol.json',
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
      'Only the URL-restricted testing token (TESTING_MAPBOX_TOKEN) may be committed, anywhere in the repository. Study tokens are supplied to deployments at runtime, never through a fixture or a source file.',
    ).toEqual([]);
  });
});
