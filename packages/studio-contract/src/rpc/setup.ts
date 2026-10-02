import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';

import { Conflict, NotFound, Unauthorized } from '../schema/errors.ts';
import { CompleteSetupInput, CompleteSetupResult } from '../schema/setup.ts';

export const SetupRpcs = RpcGroup.make(
  Rpc.make('setup.complete', {
    payload: CompleteSetupInput,
    success: CompleteSetupResult,
    error: Schema.Union([Unauthorized, NotFound, Conflict]),
  }),
);
