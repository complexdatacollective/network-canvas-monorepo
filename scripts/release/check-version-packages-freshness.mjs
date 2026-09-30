#!/usr/bin/env node
// Merge-time guard for the Version Packages PR (changeset-release/main).
//
// changesets/action picks its path by whether any changeset the normal lane
// owns is still present: some pending -> regenerate the release PR; none ->
// publish whatever main's package.json versions say is unpublished. The
// generated PR consumes every normal-lane changeset that existed when it was
// last regenerated, and every push to main regenerates it — but a head that
// was generated before main's newest changeset can still be queued and merged.
// On 2026-09-01 #1558 merged 48 seconds after #1574 added
// .changeset/clean-icons-guard.md; the merged tree carried both the bumped
// versions and that changeset, so the action regenerated the PR instead of
// publishing. @codaco/fresco-ui 6.3.0, @codaco/interview 9.0.1 and fresco
// 4.1.3 were committed on main but never reached npm or the Fresco mirror, the
// next release PR bumped past them, and apps-release-fresco failed on every
// push for sixteen hours because the mirrored manifest pinned versions that
// did not exist.
//
// Run against the merged tree (the merge-queue commit, or the PR's merge ref)
// it fails when any changeset that would send the action down the regenerate
// path survives the merge. The remedy is never manual: the push that added
// the changeset also regenerates the PR, so queue the updated head instead.
//
// Ignored-lane changesets (Documentation, Website, Studio) persist by design
// and are hidden from the action by prune-ignored-changesets.mjs; the two
// scripts share one predicate for what the normal lane owns.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  isIgnoredLaneChangeset,
  readChangesets,
} from './changeset-app-utils.mjs';

export function unconsumedChangesets(changesets, ignored) {
  return changesets.filter((cs) => !isIgnoredLaneChangeset(cs, ignored));
}

function main() {
  const changesetDir = join(process.cwd(), '.changeset');
  const config = JSON.parse(
    readFileSync(join(changesetDir, 'config.json'), 'utf8'),
  );
  const ignored = new Set(config.ignore ?? []);
  const unconsumed = unconsumedChangesets(
    readChangesets(changesetDir),
    ignored,
  );

  if (unconsumed.length === 0) {
    console.log(
      'Version Packages PR is current: no normal-lane changeset survives the merge.',
    );
    return;
  }

  console.error(
    'This Version Packages PR is stale. The merged tree still carries changesets the normal\n' +
      'release lane owns, so changesets/action would regenerate the PR instead of publishing\n' +
      'the versions this merge puts on main:\n',
  );
  for (const cs of unconsumed) {
    const targets =
      cs.releases.length > 0
        ? cs.releases.map((release) => release.name).join(', ')
        : 'empty changeset';
    console.error(`  .changeset/${cs.id}.md (${targets})`);
  }
  console.error(
    '\nDo not merge this head. The push that added each changeset regenerates\n' +
      'changeset-release/main; wait for the PR to update, then queue the new head.',
  );
  process.exit(1);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
