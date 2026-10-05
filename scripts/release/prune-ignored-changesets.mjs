#!/usr/bin/env node
// The library release (changesets/action) picks between its two paths by
// whether any changeset files exist: some pending -> push a Version Packages
// branch and open a PR; none pending -> publish unpublished packages to npm.
// Separately gated product changesets deliberately persist in .changeset/
// until their product release PR consumes them, but `changeset version` never
// touches them (their packages are in the config `ignore` list) — so when only
// those changesets are pending, the action pushes a branch identical to main
// (PR creation then fails with "No commits between...") and the publish path
// never runs, silently skipping npm publishes after a Version Packages merge.
//
// Deleting ignored-lane changesets from the working tree before the action
// reads state scopes its decision to the library lane. Nothing is committed:
// the publish path never commits, and the version path starts with the
// action's own `git reset --hard`, which restores the deleted files.
//
// That reset only happens on the action's Git CLI push path, so the release
// job pins `push-with-git-cli: true`. The v2 default (GitHub API push) commits
// the whole working-tree diff against the pushed SHA instead, which would turn
// these deletions into real ones and drop the gated-product changesets. Do not
// remove that input without replacing this working-tree-only approach.
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import {
  isIgnoredLaneChangeset,
  readChangesets,
} from './changeset-app-utils.mjs';

const changesetDir = join(process.cwd(), '.changeset');
const config = JSON.parse(
  readFileSync(join(changesetDir, 'config.json'), 'utf8'),
);
const ignored = new Set(config.ignore ?? []);

let pruned = 0;
for (const cs of readChangesets(changesetDir)) {
  if (!isIgnoredLaneChangeset(cs, ignored)) continue;
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
