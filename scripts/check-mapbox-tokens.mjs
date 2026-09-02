#!/usr/bin/env node
// CI guard: no Mapbox access token other than the sandbox testing token may be
// committed anywhere in the repository.
//
// The account's previous default public token, embedded in the protocol
// fixtures, was scraped from this public repository and abused for millions of
// raster-tile requests in August 2026. Its replacement is URL-restricted and
// deliberately public; a study token for a Fresco deployment is unrestricted
// and must never land here.
//
// This is a repository-wide quality-support check rather than a package test
// on purpose. Turbo selects a package's tests by that package's declared
// inputs and restores cached results, so a guard that lived inside one package
// would not run for a token added to an unrelated package, and a full run could
// still reuse an earlier green. This script runs unconditionally in CI.
//
// Two scans cover the whole tracked tree: `git grep` over every tracked text
// file (git's own binary detection skips media), and every tracked zip archive
// (`.netcanvas`, `.zip`) opened with JSZip and each non-media entry inside it
// read as text. Tracked files only: an untracked scratch protocol on a
// contributor's disk is not a leak, and CI scans exactly what the commit holds.
//
// Usage: node scripts/check-mapbox-tokens.mjs   (from anywhere inside the repo)
// MAPBOX_TOKEN_ALLOWLIST="tok1,tok2" overrides the allowed set (tests only).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';

import JSZip from 'jszip';

import { TESTING_MAPBOX_TOKEN } from '../apps/architect/src/templates/testingMapboxToken.ts';

// Mapbox access tokens are `<prefix>.<base64url JSON>.<base64url signature>`
// with prefix `pk` (public), `sk` (secret) or `tk` (temporary). No word
// boundary on purpose: a token glued to other text must still be found.
const MAPBOX_TOKEN_PATTERN = '[pst]k\\.eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+';

// Media and font entries inside an archive cannot carry a token as text.
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
// `git grep` already searches them as plain text. Any other archive that fails
// to open, or a .netcanvas without a protocol.json, fails the check rather
// than being skipped: a skip is where a token would hide.
const KNOWN_NON_ARCHIVE_FIXTURES = new Set([
  'apps/interviewer/e2e/fixtures/malformed.netcanvas',
]);

const allowedTokens = new Set(
  process.env.MAPBOX_TOKEN_ALLOWLIST
    ? process.env.MAPBOX_TOKEN_ALLOWLIST.split(',')
        .map((token) => token.trim())
        .filter(Boolean)
    : [TESTING_MAPBOX_TOKEN],
);

const git = (root, args) =>
  execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });

const findTokens = (text) =>
  Array.from(
    text.matchAll(new RegExp(MAPBOX_TOKEN_PATTERN, 'g')),
    (match) => match[0],
  );

/** Every token-shaped match in every tracked text file, keyed by path. */
const grepTrackedText = (root) => {
  let output = '';
  try {
    // -I skips binaries, -o prints only the match, -z NUL-terminates the path
    // so paths containing ':' or spaces still parse. Exit 1 means no matches.
    output = git(root, [
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
    if (error.status !== 1) throw error;
  }

  const found = new Map();
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

/** Every token-shaped match in every text entry of one tracked archive. */
const scanArchive = async (root, file) => {
  let zip;
  try {
    zip = await JSZip.loadAsync(readFileSync(`${root}/${file}`));
  } catch (error) {
    throw new Error(`${file}: could not be opened as a zip archive`, {
      cause: error,
    });
  }
  if (file.toLowerCase().endsWith('.netcanvas') && !zip.file('protocol.json')) {
    throw new Error(`${file}: .netcanvas archive has no protocol.json entry`);
  }

  const tokens = [];
  for (const entry of Object.values(zip.files)) {
    if (entry.dir || BINARY_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      continue;
    }
    tokens.push(...findTokens(await entry.async('string')));
  }
  return tokens;
};

const main = async () => {
  const root = git(process.cwd(), ['rev-parse', '--show-toplevel']).trim();
  const trackedFiles = git(root, ['ls-files', '-z'])
    .split('\0')
    .filter((file) => file.length > 0);
  if (trackedFiles.length === 0) {
    throw new Error('git ls-files returned no tracked files; nothing scanned');
  }

  const archives = trackedFiles.filter(
    (file) =>
      ARCHIVE_EXTENSIONS.has(extname(file).toLowerCase()) &&
      !KNOWN_NON_ARCHIVE_FIXTURES.has(file),
  );

  const tokensByFile = grepTrackedText(root);
  const unreadable = [];
  for (const archive of archives) {
    try {
      const tokens = await scanArchive(root, archive);
      if (tokens.length > 0) {
        tokensByFile.set(archive, [
          ...(tokensByFile.get(archive) ?? []),
          ...tokens,
        ]);
      }
    } catch (error) {
      unreadable.push(error.message);
    }
  }

  const offenders = [];
  const carriers = [];
  for (const [file, tokens] of tokensByFile) {
    if (tokens.some((token) => allowedTokens.has(token))) carriers.push(file);
    for (const token of tokens) {
      if (!allowedTokens.has(token)) offenders.push(`${file}: ${token}`);
    }
  }

  const problems = [];
  if (unreadable.length > 0) {
    problems.push(
      'Archives that could not be scanned (a skip is where a token would hide):\n  ' +
        unreadable.join('\n  '),
    );
  }
  if (offenders.length > 0) {
    problems.push(
      'Mapbox tokens other than the allowed sandbox testing token:\n  ' +
        offenders.join('\n  ') +
        '\n\nOnly the URL-restricted testing token (TESTING_MAPBOX_TOKEN in apps/architect/src/templates/testingMapboxToken.ts) may be committed. Study tokens are supplied to deployments at runtime, never through a fixture or a source file.',
    );
  }
  if (carriers.length === 0) {
    // Non-vacuity: the allowed token is known to live in the template constant
    // and the protocol fixtures. Finding it nowhere means the scan read nothing
    // it could recognise, which is a failure of the guard, not a clean tree.
    problems.push(
      'The allowed testing token was not found anywhere; the scan is not reading what it should.',
    );
  }

  if (problems.length > 0) {
    console.error(problems.join('\n\n'));
    process.exit(1);
  }

  console.log(
    `Mapbox token check passed: ${trackedFiles.length} tracked files and ${archives.length} archives scanned; ` +
      `the allowed testing token appears in ${carriers.length} file(s):\n  ${carriers.toSorted((a, b) => a.localeCompare(b)).join('\n  ')}`,
  );
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
