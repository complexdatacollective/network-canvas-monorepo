import * as NodeRuntime from '@effect/platform-node/NodeRuntime';

import { ServeProgram } from './programs/serve.ts';

// `disableErrorReporting`: the program prints a refusal to start itself.
NodeRuntime.runMain(ServeProgram, { disableErrorReporting: true });
