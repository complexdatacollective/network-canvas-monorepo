import { Context, type Effect } from 'effect';

import type { DatabaseError } from '../errors';
import type { InterviewExportInput } from '../input';

export class InterviewRepository extends Context.Tag(
  'NetworkExporters/InterviewRepository',
)<
  InterviewRepository,
  {
    readonly getForExport: (
      ids: readonly string[],
    ) => Effect.Effect<InterviewExportInput[], DatabaseError>;
  }
>() {}
