import * as NodeRuntime from '@effect/platform-node/NodeRuntime';
import { Layer } from 'effect';

import { ServeProgram } from './programs/serve.ts';

// The web entry: `studio-api serve` (#1909). One line of behaviour, so that
// the bundle entry stays a file of its own (src/__tests__/process-separation.test.ts
// reads the graph from here) and everything the process is lives in
// src/programs/serve.ts.
Layer.launch(ServeProgram).pipe(NodeRuntime.runMain);
