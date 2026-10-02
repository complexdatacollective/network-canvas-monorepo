#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { readChangesets } from './changeset-app-utils.mjs';
import {
  addReleaseEntries,
  readAppVersions,
  readUpdateRows,
  UPDATE_APPS,
  userNotesFor,
  writeUpdateRows,
} from './update-entries.mjs';

const root = process.cwd();
const changesetDir = join(root, '.changeset');

const notes = userNotesFor(readChangesets(changesetDir));
const before = readAppVersions(root);

const version = spawnSync('pnpm', ['exec', 'changeset', 'version'], {
  cwd: root,
  stdio: 'inherit',
});
if (version.status !== 0) process.exit(version.status ?? 1);

const released = readAppVersions(root).filter(
  ({ app, version: next }) =>
    before.find((previous) => previous.app === app)?.version !== next,
);

if (released.length === 0) {
  console.log('no app released; updates.csv unchanged');
  process.exit(0);
}

const { rows, added } = addReleaseEntries(readUpdateRows(root), {
  released,
  notes,
  date: new Date().toISOString().slice(0, 10),
});
writeUpdateRows(root, rows);

const releasedNames = released
  .map(
    ({ app, version: next }) =>
      `${UPDATE_APPS.find(({ id }) => id === app)?.name ?? app} ${next}`,
  )
  .join(', ');

writeFileSync(
  join(
    changesetDir,
    `updates-${released.map(({ app, version: next }) => `${app}-${next.replace(/[^0-9A-Za-z]+/g, '-')}`).join('-')}.md`,
  ),
  `---\n'networkcanvas.com': patch\n---\n\nAdd the Updates page entries for ${releasedNames}.\n`,
);

console.log(
  `updates.csv: ${added.length} release entr${added.length === 1 ? 'y' : 'ies'} added for ${releasedNames}`,
);
