#!/usr/bin/env node
// Derives GitHub release notes for an app + version.
//
//   1. Pending changesets: concatenate the bodies of any `.changeset/*.md` whose
//      frontmatter targets the app's package name (this is the source for the
//      forced 6.6.0 release, whose version is not produced by `changeset version`).
//   2. CHANGELOG fallback: the `## <version>` section of <appDir>/CHANGELOG.md
//      (used for future, normally-versioned releases).
//   3. Otherwise a minimal "Release v<version>" line.
//
// Usage:
//   node scripts/release-notes.mjs --app <appDir> --pkg <packageName> --version <version> [--out <path>]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

// Split a changeset markdown file into { frontmatter, body }.
function splitChangeset(contents) {
  const match = contents.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { frontmatter: '', body: contents.trim() };
  return { frontmatter: match[1], body: match[2].trim() };
}

// Notes from the dedicated `release-<version>.md` changeset only. Using a single
// version-named file (rather than every pending changeset that happens to target
// the package) keeps the forced-release notes deterministic — unrelated pending
// changesets for the same package don't bleed into the release body.
export function notesFromDedicatedChangeset(pkgName, version, changesetDir) {
  // Accept both the dotted version and the dashed form used by changeset
  // filenames in this repo (e.g. release-6.6.0.md / release-6-6-0.md).
  const candidates = [
    `release-${version}.md`,
    `release-${version.replace(/\./g, '-')}.md`,
  ];
  const file = candidates
    .map((name) => join(changesetDir, name))
    .find((path) => existsSync(path));
  if (!file) return '';
  const { frontmatter, body } = splitChangeset(readFileSync(file, 'utf8'));
  // Frontmatter lines look like:  'network-canvas-architect': patch
  const targetsPkg = frontmatter
    .split('\n')
    .some((line) => line.replace(/['"]/g, '').trim().startsWith(`${pkgName}:`));
  return targetsPkg ? body : '';
}

export function notesFromChangelog(appDir, version) {
  const changelogPath = join(appDir, 'CHANGELOG.md');
  if (!existsSync(changelogPath)) return '';
  const md = readFileSync(changelogPath, 'utf8');
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const start = md.search(new RegExp(`^## +${escaped}\\b`, 'm'));
  if (start === -1) return '';
  const after = md.slice(start);
  const nextHeading = after.slice(3).search(/^## /m);
  const section = nextHeading === -1 ? after : after.slice(0, nextHeading + 3);
  // Drop the leading "## <version>" heading line; keep the body.
  return section.replace(/^## .*\n?/, '').trim();
}

export function releaseNotes({ appDir, pkgName, version }) {
  const dedicated = notesFromDedicatedChangeset(
    pkgName,
    version,
    join(repoRoot, '.changeset'),
  );
  if (dedicated) return dedicated;
  const fromChangelog = notesFromChangelog(appDir, version);
  if (fromChangelog) return fromChangelog;
  return `Release v${version}`;
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (argv[i].startsWith('--')) args[argv[i].slice(2)] = argv[i + 1];
  }
  return args;
}

function main() {
  const { app, pkg, version, out } = parseArgs(process.argv.slice(2));
  if (!app || !pkg || !version) {
    console.error(
      'Usage: node scripts/release-notes.mjs --app <appDir> --pkg <packageName> --version <version> [--out <path>]',
    );
    process.exit(1);
  }
  const notes = releaseNotes({ appDir: app, pkgName: pkg, version });
  if (out) {
    writeFileSync(out, `${notes}\n`);
    console.error(`[release-notes] wrote ${out}`);
  } else {
    process.stdout.write(`${notes}\n`);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
