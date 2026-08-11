#!/usr/bin/env node
// CI guard: a single changeset must not mix a separately gated product with a
// package in the normal Changesets lane. `changeset version` hard-errors on
// such "mixed" changesets, which would break the release. Fail fast on the PR
// instead.
import { join } from 'node:path';

import {
  classifyChangeset,
  isMixedChangeset,
  isMultiProductLaneChangeset,
  readChangesets,
} from './changeset-app-utils.mjs';

const changesets = readChangesets(join(process.cwd(), '.changeset'));
const mixedOffenders = changesets.filter((cs) => isMixedChangeset(cs));
const multiLaneOffenders = changesets.filter((cs) =>
  isMultiProductLaneChangeset(cs),
);

if (mixedOffenders.length === 0 && multiLaneOffenders.length === 0) {
  process.exit(0);
}

if (mixedOffenders.length > 0) {
  console.error(
    'Mixed changesets found — these combine a separately gated product with the normal release lane and would break\n' +
      'the Changesets release (`changeset version` rejects them):\n',
  );
  for (const cs of mixedOffenders) {
    const { gatedProductReleases, normalReleases } = classifyChangeset(cs);
    console.error(`  .changeset/${cs.id}.md`);
    console.error(
      `    gated products: ${gatedProductReleases.map((r) => r.name).join(', ')}`,
    );
    console.error(
      `    normal lane:    ${normalReleases.map((r) => r.name).join(', ')}`,
    );
  }
  console.error('');
}

if (multiLaneOffenders.length > 0) {
  console.error(
    'Multi-lane changesets found — every gated release lane has an independent release PR,\n' +
      'so products from different lanes must have separate changesets:\n',
  );
  for (const cs of multiLaneOffenders) {
    const { gatedProductReleases } = classifyChangeset(cs);
    console.error(`  .changeset/${cs.id}.md`);
    console.error(
      `    products: ${gatedProductReleases.map((r) => r.name).join(', ')}`,
    );
  }
  console.error('');
}

console.error(
  'Split each listed file into one changeset per release lane ' +
    '(run `pnpm changeset` once for each separately gated product or the normal lane).',
);
process.exit(1);
