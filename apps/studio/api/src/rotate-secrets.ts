import * as NodeRuntime from '@effect/platform-node/NodeRuntime';

import { RotateSecretsProgram } from './programs/rotate-secrets.ts';

// The rotation entry: `studio-api rotate-secrets` (#1900). One line of
// behaviour, so that the bundle entry stays a file of its own
// (src/__tests__/process-separation.test.ts reads the graph from here) and
// the command itself lives in src/programs/rotate-secrets.ts.
// `disableErrorReporting`: the program prints a refusal itself, as the one
// sentence an operator acts on (src/programs/command.ts); the runtime's own
// report would bury it under a timestamp, a class name and a stack.
NodeRuntime.runMain(RotateSecretsProgram, { disableErrorReporting: true });
