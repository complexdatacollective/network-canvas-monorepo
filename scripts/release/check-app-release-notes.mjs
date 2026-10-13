#!/usr/bin/env node
// Merge-time guard for the Version Packages PR (changeset-release/main).
//
// Architect, Interviewer and Fresco publish the `## <version>` section of their
// CHANGELOG.md as the GitHub release body (release-notes.mjs), and Architect
// and Interviewer show that body to researchers in their update dialog. The
// section changesets generates is written for maintainers: one entry per
// changeset, each prefixed with a commit hash, plus an "Updated dependencies"
// list. Before a release merges, those sections are rewritten into grouped,
// user-facing notes with the `simplifying-release-notes` skill.
//
// This check fails while an app whose version this tree changes still carries
// the generated section. Every push to main regenerates changeset-release/main
// and discards the rewrite, so the check turns red again by itself and a
// regenerated head cannot merge with maintainer-facing notes.
//
// Usage: node scripts/release/check-app-release-notes.mjs --base <git-ref>
// The base ref is the tree this one would merge into; an app is checked only
// when its package.json version differs from the base's.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { notesFromChangelog } from './release-notes.mjs';

export const RELEASE_NOTE_APPS = [
  'apps/architect',
  'apps/interviewer',
  'apps/fresco',
];

const GENERATED_MARKERS = [
  {
    pattern: /^- [0-9a-f]{7,40}: /m,
    problem: 'lists changeset entries prefixed with a commit hash',
  },
  {
    pattern: /^- Updated dependencies\b/m,
    problem: 'carries the generated "Updated dependencies" list',
  },
  {
    pattern: /^### (Major|Minor|Patch) Changes\s*$/m,
    problem: 'uses the generated Major/Minor/Patch Changes headings',
  },
];

// Why a release-notes section still reads as changesets generated it; empty
// when it has been rewritten.
export function generatedNoteProblems(section) {
  return GENERATED_MARKERS.filter(({ pattern }) => pattern.test(section)).map(
    ({ problem }) => problem,
  );
}

function versionAt(root, ref, appDir) {
  try {
    const manifest = execFileSync(
      'git',
      ['show', `${ref}:${appDir}/package.json`],
      {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    );
    return JSON.parse(manifest).version;
  } catch {
    return null;
  }
}

export function releaseNoteFailures({ root, base, apps = RELEASE_NOTE_APPS }) {
  const failures = [];
  for (const appDir of apps) {
    const { version } = JSON.parse(
      readFileSync(join(root, appDir, 'package.json'), 'utf8'),
    );
    if (versionAt(root, base, appDir) === version) continue;
    const section = notesFromChangelog(join(root, appDir), version);
    if (!section) {
      failures.push({
        appDir,
        version,
        problems: [`has no "## ${version}" section`],
      });
      continue;
    }
    const problems = generatedNoteProblems(section);
    if (problems.length > 0) failures.push({ appDir, version, problems });
  }
  return failures;
}

function main() {
  const baseIndex = process.argv.indexOf('--base');
  const base = baseIndex === -1 ? undefined : process.argv[baseIndex + 1];
  if (!base) {
    console.error(
      'Usage: node scripts/release/check-app-release-notes.mjs --base <git-ref>',
    );
    process.exit(2);
  }

  const failures = releaseNoteFailures({ root: process.cwd(), base });
  if (failures.length === 0) {
    console.log(
      'App release notes are rewritten for users, or no app version changes.',
    );
    return;
  }

  console.error(
    'This Version Packages PR still carries generated release notes. Each section\n' +
      'below becomes a GitHub release body, and Architect and Interviewer show it\n' +
      'in their update dialog:\n',
  );
  for (const { appDir, version, problems } of failures) {
    console.error(
      `  ${appDir}/CHANGELOG.md ## ${version}: ${problems.join('; ')}`,
    );
  }
  console.error(
    '\nRewrite these sections with the simplifying-release-notes skill and push the\n' +
      'result to changeset-release/main (or a PR into it). A push to main regenerates\n' +
      'the branch and discards the rewrite, so re-apply it after any regeneration.',
  );
  process.exit(1);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
