// Staleness guard for Studio's two committed generated artifacts: the ERD
// (schema-erd.svg) and the schema section of the server README. Both are
// rendered from the assembled Drizzle schema and the raw-SQL sidecars, so a
// schema change, a sidecar change, or a change to the renderer itself leaves
// them behind unless they are resynced.
//
// A CI step of its own rather than a vitest case. The render is a DBML import
// plus an SVG layout — seconds of CPU with no database in it — and as a test
// it shared a runner, and a per-test timeout, with suites that hold Postgres
// busy for minutes. That made it fail the test job for being slow rather than
// for being stale. Here it competes with nothing, and a failure reads as the
// one instruction that fixes it.
import process from 'node:process';

import {
  renderSchemaDocs,
  staleSchemaDocs,
  SYNC_COMMAND,
} from './schema-docs.ts';

const stale = staleSchemaDocs(await renderSchemaDocs());

if (stale.length > 0) {
  console.error(`Stale generated schema docs: ${stale.join(' and ')}.`);
  console.error(`Regenerate them with: ${SYNC_COMMAND}`);
  process.exit(1);
}

console.log('The committed Studio ERD and README schema section are current.');
