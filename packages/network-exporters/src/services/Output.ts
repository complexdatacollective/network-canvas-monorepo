import { Context, type Effect } from 'effect';

import type { OutputError } from '../errors';
import type { OutputEntry, OutputHandle, OutputResult } from '../output';

export class Output extends Context.Tag('NetworkExporters/Output')<
  Output,
  {
    readonly begin: () => Effect.Effect<OutputHandle, OutputError>;
    readonly writeEntry: (
      handle: OutputHandle,
      entry: OutputEntry,
    ) => Effect.Effect<void, OutputError>;
    readonly end: (
      handle: OutputHandle,
    ) => Effect.Effect<OutputResult, OutputError>;
    // Optional so existing implementations stay valid: called when the
    // pipeline is interrupted between begin and end, releasing anything the
    // backend holds outside the interrupted fiber (buffers, forked fibers).
    readonly abort?: (handle: OutputHandle) => Effect.Effect<void>;
  }
>() {}
