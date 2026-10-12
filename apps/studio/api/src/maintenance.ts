import * as NodeRuntime from '@effect/platform-node/NodeRuntime';

import { MaintenanceProgram } from './programs/maintenance.ts';

// `disableErrorReporting`: the program prints a refusal itself.
NodeRuntime.runMain(MaintenanceProgram(process.argv.slice(2)), {
  disableErrorReporting: true,
});
