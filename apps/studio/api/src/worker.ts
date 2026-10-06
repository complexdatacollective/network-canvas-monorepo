import * as NodeRuntime from '@effect/platform-node/NodeRuntime';

import { WorkerProgram } from './programs/worker.ts';

// `disableErrorReporting`: the program prints a refusal to start itself.
NodeRuntime.runMain(WorkerProgram, { disableErrorReporting: true });
