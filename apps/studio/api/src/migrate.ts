import * as NodeRuntime from '@effect/platform-node/NodeRuntime';

import { MigrateProgram } from './programs/migrate.ts';

// `disableErrorReporting`: the program prints a refusal itself.
NodeRuntime.runMain(MigrateProgram, { disableErrorReporting: true });
