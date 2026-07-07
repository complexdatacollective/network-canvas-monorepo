#!/usr/bin/env node
// CI guard: a single changeset must not mix an app (ignored) with a library.
// `changeset version` hard-errors on such "mixed" changesets, which would break
// the entire library release. Fail fast on the PR instead.
import { join } from 'node:path';

import {
  classifyChangeset,
  isMixedChangeset,
  readChangesets,
} from './changeset-app-utils.mjs';

const changesets = readChangesets(join(process.cwd(), '.changeset'));
const offenders = changesets.filter((cs) => isMixedChangeset(cs));

if (offenders.length === 0) process.exit(0);

console.error(
  'Mixed changesets found — these combine an app with a library and would break\n' +
    'the library release (`changeset version` rejects them):\n',
);
for (const cs of offenders) {
  const { appReleases, libReleases } = classifyChangeset(cs);
  console.error(`  .changeset/${cs.id}.md`);
  console.error(`    apps:      ${appReleases.map((r) => r.name).join(', ')}`);
  console.error(`    libraries: ${libReleases.map((r) => r.name).join(', ')}`);
}
console.error(
  '\nSplit each into an app-only changeset and a library-only changeset ' +
    '(run `pnpm changeset` twice).',
);
process.exit(1);
