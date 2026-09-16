import * as NodeRuntime from '@effect/platform-node/NodeRuntime';

import { MigrateProgram } from './programs/migrate.ts';

// The migrate entry: `studio-api migrate` (#1909). One line of behaviour, so
// that the bundle entry stays a file of its own
// (src/__tests__/process-separation.test.ts reads the graph from here) and
// the command itself lives in src/programs/migrate.ts.
NodeRuntime.runMain(MigrateProgram);
