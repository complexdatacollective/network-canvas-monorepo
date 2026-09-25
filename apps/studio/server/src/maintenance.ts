import * as NodeRuntime from '@effect/platform-node/NodeRuntime';

import { MaintenanceProgram } from './programs/maintenance.ts';

// The maintenance entry: `studio-api maintenance on [reason…]|off` (#1901).
// One line of behaviour, so that the bundle entry stays a file of its own
// (src/__tests__/process-separation.test.ts reads the graph from here) and
// the command itself lives in src/programs/maintenance.ts. The arguments are
// read here because this is the process's edge; `bin/studio-api` has already
// taken `maintenance` off the front of them.
// `disableErrorReporting`: the program prints a refusal itself, as the one
// sentence an operator acts on (src/programs/command.ts); the runtime's own
// report would bury it under a timestamp, a class name and a stack.
NodeRuntime.runMain(MaintenanceProgram(process.argv.slice(2)), {
  disableErrorReporting: true,
});
