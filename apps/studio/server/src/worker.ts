import * as NodeRuntime from '@effect/platform-node/NodeRuntime';

import { WorkerProgram } from './programs/worker.ts';

// The worker entry: `studio-api worker` (#1895). One line of behaviour, so
// that the bundle entry stays a file of its own
// (src/__tests__/process-separation.test.ts reads the graph from here) and
// everything the process is lives in src/programs/worker.ts.
// `disableErrorReporting`: the program prints a refusal to start itself, as the
// one sentence an operator acts on (src/programs/command.ts); the runtime's own
// report would bury it under a timestamp, a class name and a stack.
NodeRuntime.runMain(WorkerProgram, { disableErrorReporting: true });
