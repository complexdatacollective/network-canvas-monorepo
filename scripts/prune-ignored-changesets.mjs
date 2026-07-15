#!/usr/bin/env node
// The library release (changesets/action) picks between its two paths by
// whether any changeset files exist: some pending -> push a Version Packages
// branch and open a PR; none pending -> publish unpublished packages to npm.
// Gated-product changesets deliberately persist in .changeset/ until their
// product release PR consumes them, but `changeset version` never touches
// them (their packages are in the config `ignore` list) — so when only
// product changesets are pending, the action pushes a branch identical to
// main (PR creation then fails with "No commits between...") and the publish
// path never runs, silently skipping npm publishes after a Version Packages
// merge.
//
// Deleting ignored-lane changesets from the working tree before the action
// reads state scopes its decision to the library lane. Nothing is committed:
// the publish path never commits, and the version path starts with the
// action's own `git reset --hard`, which restores the deleted files.
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { readChangesets } from './changeset-app-utils.mjs';

const changesetDir = join(process.cwd(), '.changeset');
const config = JSON.parse(
  readFileSync(join(changesetDir, 'config.json'), 'utf8'),
);
const ignored = new Set(config.ignore ?? []);

let pruned = 0;
for (const cs of readChangesets(changesetDir)) {
  if (cs.releases.length === 0) continue;
  if (!cs.releases.every((release) => ignored.has(release.name))) continue;
  rmSync(join(changesetDir, `${cs.id}.md`));
  pruned += 1;
  console.log(
    `pruned .changeset/${cs.id}.md (${cs.releases.map((r) => r.name).join(', ')})`,
  );
}

console.log(
  pruned === 0
    ? 'no ignored-lane changesets to prune'
    : `pruned ${pruned} ignored-lane changeset(s) from the working tree`,
);
