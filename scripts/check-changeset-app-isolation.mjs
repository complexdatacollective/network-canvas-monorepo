#!/usr/bin/env node
// CI guard: a single changeset must not mix an ignored app with a library.
// `changeset version` hard-errors on such "mixed" changesets, which would break
// the entire library release. Fail fast on the PR instead.
//
// The set of ignored apps is read from the Changesets config's `ignore` list —
// the authoritative source `changeset version` itself uses — rather than a
// hard-coded product list, so every ignored private app (the maintenance-mode
// classic apps, the gated products) is covered without a second list to keep in
// sync. The gated-product multi-product check still uses GATED_PRODUCT_PACKAGES,
// since only those apps have their own release PR.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  classifyChangeset,
  isMixedChangeset,
  isMultiProductChangeset,
  readChangesets,
} from './changeset-app-utils.mjs';

const changesetDir = join(process.cwd(), '.changeset');
const { ignore = [] } = JSON.parse(
  readFileSync(join(changesetDir, 'config.json'), 'utf8'),
);
const changesets = readChangesets(changesetDir);
const mixedOffenders = changesets.filter((cs) => isMixedChangeset(cs, ignore));
const multiProductOffenders = changesets.filter((cs) =>
  isMultiProductChangeset(cs),
);

if (mixedOffenders.length === 0 && multiProductOffenders.length === 0) {
  process.exit(0);
}

if (mixedOffenders.length > 0) {
  console.error(
    'Mixed changesets found — these combine an ignored app with a library and would break\n' +
      'the library release (`changeset version` rejects them):\n',
  );
  for (const cs of mixedOffenders) {
    const { productReleases, libReleases } = classifyChangeset(cs, ignore);
    console.error(`  .changeset/${cs.id}.md`);
    console.error(
      `    apps:      ${productReleases.map((r) => r.name).join(', ')}`,
    );
    console.error(
      `    libraries: ${libReleases.map((r) => r.name).join(', ')}`,
    );
  }
  console.error('');
}

if (multiProductOffenders.length > 0) {
  console.error(
    'Multi-product changesets found — each gated product has an independent release PR,\n' +
      'so every product must have its own changeset:\n',
  );
  for (const cs of multiProductOffenders) {
    const { productReleases } = classifyChangeset(cs);
    console.error(`  .changeset/${cs.id}.md`);
    console.error(
      `    products: ${productReleases.map((r) => r.name).join(', ')}`,
    );
  }
  console.error('');
}

console.error(
  'Split each listed file into one changeset per release lane ' +
    '(run `pnpm changeset` once for each product or library lane).',
);
process.exit(1);
