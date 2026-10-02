#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { parseChangeset } from './changeset-app-utils.mjs';
import { readUpdateLine, UPDATE_APPS } from './update-entries.mjs';

export function changesetsMissingUpdateLines(changesets) {
  const appPackages = new Set(
    UPDATE_APPS.map(({ packageName }) => packageName),
  );
  return changesets.filter(
    ({ releases, summary }) =>
      releases.some(({ name }) => appPackages.has(name)) &&
      !readUpdateLine(summary),
  );
}

function addedChangesetFiles(baseRef) {
  return execFileSync(
    'git',
    [
      'diff',
      '--name-only',
      '--diff-filter=A',
      `${baseRef}...HEAD`,
      '--',
      '.changeset/*.md',
    ],
    { encoding: 'utf8' },
  )
    .split('\n')
    .filter((file) => file && basename(file) !== 'README.md');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const baseRef = process.env.CHANGESET_BASE_REF ?? 'origin/main';
  const offenders = changesetsMissingUpdateLines(
    addedChangesetFiles(baseRef).map((file) => ({
      file,
      ...parseChangeset(readFileSync(join(process.cwd(), file), 'utf8')),
    })),
  );

  if (offenders.length > 0) {
    console.error(
      'Changesets for Architect, Interviewer or Fresco need an "Update:" line: one sentence\n' +
        'for the Updates page and the in-app release notes, written for users. Use\n' +
        '"Update: none" for a change users will not notice.\n',
    );
    for (const { file } of offenders) console.error(`  ${file}`);
    process.exit(1);
  }
}
