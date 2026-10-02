import defaultChangelog from '@changesets/cli/changelog';

import { stripUpdateLine } from './update-entries.mjs';

const COMMIT_URL =
  'https://github.com/complexdatacollective/network-canvas-monorepo/commit/';

export function getDependencyReleaseLine(changesets, dependenciesUpdated) {
  if (dependenciesUpdated.length === 0) return '';

  const commits = [
    ...new Set(
      changesets
        .map((changeset) => changeset.commit)
        .filter((commit) => commit !== undefined),
    ),
  ];
  const commitLinks = commits.map(
    (commit) => `[${commit.slice(0, 7)}](${COMMIT_URL}${commit})`,
  );
  const links = commitLinks.length > 0 ? ` (${commitLinks.join(', ')})` : '';
  const dependencyLines = dependenciesUpdated.map(
    (dependency) => `  - ${dependency.name}@${dependency.newVersion}`,
  );

  return [`- Updated dependencies${links}`, ...dependencyLines].join('\n');
}

export function getReleaseLine(changeset, type, options) {
  return defaultChangelog.getReleaseLine(
    { ...changeset, summary: stripUpdateLine(changeset.summary) },
    type,
    options,
  );
}

export default {
  ...defaultChangelog,
  getReleaseLine,
  getDependencyReleaseLine,
};
