import * as NodeRuntime from '@effect/platform-node/NodeRuntime';
import { Layer } from 'effect';

import { WorkerProgram } from './programs/worker.ts';

// The worker entry: `studio-api worker` (#1895). One line of behaviour, so
// that the bundle entry stays a file of its own
// (src/__tests__/process-separation.test.ts reads the graph from here) and
// everything the process is lives in src/programs/worker.ts.
Layer.launch(WorkerProgram).pipe(NodeRuntime.runMain);
