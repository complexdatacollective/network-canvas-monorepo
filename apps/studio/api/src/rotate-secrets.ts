import * as NodeRuntime from '@effect/platform-node/NodeRuntime';

import { RotateSecretsProgram } from './programs/rotate-secrets.ts';

// `disableErrorReporting`: the program prints a refusal itself.
NodeRuntime.runMain(RotateSecretsProgram, { disableErrorReporting: true });
