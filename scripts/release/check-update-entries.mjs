#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

import {
  missingReleaseEntries,
  readAppVersions,
  readUpdateRows,
  UPDATE_APPS,
  UPDATES_CSV_PATH,
} from './update-entries.mjs';

const root = process.cwd();
const baseRef = process.env.UPDATE_ENTRIES_BASE_REF ?? 'HEAD^1';

function versionAt(ref, directory) {
  return JSON.parse(
    execFileSync('git', ['show', `${ref}:${directory}/package.json`], {
      cwd: root,
      encoding: 'utf8',
    }),
  ).version;
}

const released = readAppVersions(root).filter(({ app, version }) => {
  const { directory } = UPDATE_APPS.find(({ id }) => id === app);
  return versionAt(baseRef, directory) !== version;
});

const missing = missingReleaseEntries(readUpdateRows(root), released);

if (missing.length > 0) {
  console.error(
    `These app versions have no entry in ${UPDATES_CSV_PATH}, so the Updates page and the\n` +
      'in-app release notes would have nothing to show for them:\n',
  );
  for (const { app, version } of missing) {
    console.error(
      `  ${UPDATE_APPS.find(({ id }) => id === app)?.name ?? app} ${version}`,
    );
  }
  process.exit(1);
}

console.log(
  released.length === 0
    ? 'no app released; nothing to check'
    : `every released app version has an update entry: ${released.map(({ app, version }) => `${app}@${version}`).join(', ')}`,
);
