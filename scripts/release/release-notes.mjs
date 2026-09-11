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
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

// Split a changeset markdown file into { frontmatter, body }.
function splitChangeset(contents) {
  const match = contents.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { frontmatter: '', body: contents.trim() };
  return { frontmatter: match[1], body: match[2].trim() };
}

// Notes from a dedicated release changeset. We scan `release-*.md` files whose
// name carries this version (dotted `6.6.0` or dashed `6-6-0`) and whose
// frontmatter targets this package, and return the first match's body. This
// supports a per-app changeset (e.g. release-architect-6-6-0.md) so each
// product's GitHub release gets its own self-contained, correctly-titled notes,
// and still works for a single combined release-6-6-0.md targeting both apps.
// Restricting to version-named `release-*` files keeps the forced-release notes
// deterministic — unrelated pending changesets don't bleed into the body.
export function notesFromDedicatedChangeset(pkgName, version, changesetDir) {
  if (!existsSync(changesetDir)) return '';
  const versionForms = [version, version.replace(/\./g, '-')];
  for (const file of readdirSync(changesetDir).toSorted()) {
    if (!file.startsWith('release-') || !file.endsWith('.md')) continue;
    if (!versionForms.some((form) => file.includes(form))) continue;
    const { frontmatter, body } = splitChangeset(
      readFileSync(join(changesetDir, file), 'utf8'),
    );
    // Frontmatter lines look like:  '@codaco/architect-classic': patch
    const targetsPkg = frontmatter
      .split('\n')
      .some((line) =>
        line.replace(/['"]/g, '').trim().startsWith(`${pkgName}:`),
      );
    if (targetsPkg && body) return body;
  }
  return '';
}

// Every stable version in the changelog above `since` and up to `version`,
// newest first. A release run can be dropped while pending on its app's
// concurrency group (see apps-release-<app> in ci-and-release.yml), and the
// next release is then the first to mention those changes — so its body has to
// carry their sections too, or the skipped notes never reach anyone.
export function versionsSince(appDir, version, since) {
  const changelogPath = join(appDir, 'CHANGELOG.md');
  if (!existsSync(changelogPath)) return [];
  const stable = /^## +(\d+\.\d+\.\d+)\s*$/gm;
  const found = [...readFileSync(changelogPath, 'utf8').matchAll(stable)].map(
    (match) => match[1],
  );
  const rank = (semver) => semver.split('.').map(Number);
  const newer = (a, b) => {
    const [left, right] = [rank(a), rank(b)];
    for (let i = 0; i < 3; i += 1) {
      if (left[i] !== right[i]) return left[i] > right[i];
    }
    return false;
  };
  return found.filter(
    (candidate) =>
      !newer(candidate, version) &&
      (candidate === version || !since || newer(candidate, since)),
  );
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

export function releaseNotes({ appDir, pkgName, version, since }) {
  const dedicated = notesFromDedicatedChangeset(
    pkgName,
    version,
    join(repoRoot, '.changeset'),
  );
  if (dedicated) return dedicated;

  // Only ever more than one when a release was skipped: each extra section
  // keeps its own heading so the reader can see which versions rolled up here.
  // Without a previous release there is nothing to roll up — an app's whole
  // changelog is not release notes for one version.
  const versions = since ? versionsSince(appDir, version, since) : [];
  if (versions.length > 1) {
    const rolled = versions
      .map((each) => {
        const body = notesFromChangelog(appDir, each);
        return body ? `## ${each}\n\n${body}` : '';
      })
      .filter(Boolean);
    if (rolled.length) return rolled.join('\n\n');
  }

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
  const { app, pkg, version, since, out } = parseArgs(process.argv.slice(2));
  if (!app || !pkg || !version) {
    console.error(
      'Usage: node scripts/release-notes.mjs --app <appDir> --pkg <packageName> --version <version> [--since <version>] [--out <path>]',
    );
    process.exit(1);
  }
  const notes = releaseNotes({ appDir: app, pkgName: pkg, version, since });
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
