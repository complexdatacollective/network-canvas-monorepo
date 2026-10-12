import { readFile } from 'node:fs/promises';

import * as NodeRuntime from '@effect/platform-node/NodeRuntime';
import { Effect } from 'effect';

import { migrateProgramReading } from '../../programs/migrate.ts';

// `src/migrate.ts` with one difference: the migrations document is the file
// named by the first argument rather than the one rendered beside the bundle,
// so a suite can run the command as a deployment runs it against a release
// it made up. Everything after the read is the image's own program.

const path = process.argv[2];
if (path === undefined) throw new Error('usage: migrate-entry.ts <document>');

NodeRuntime.runMain(
  migrateProgramReading(Effect.promise(() => readFile(path, 'utf8'))),
  { disableErrorReporting: true },
);
