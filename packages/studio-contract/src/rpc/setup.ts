import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';

import { Conflict, NotFound, Unauthorized } from '../schema/errors.ts';
import { CompleteSetupInput, CompleteSetupResult } from '../schema/setup.ts';

// First-run bootstrap (#1909): authenticated by the bootstrap token carried
// in the payload, not by a cookie, so this group takes no `Authenticated`
// middleware.

export const SetupRpcs = RpcGroup.make(
  /**
   * First-run bootstrap (#1909). Public and session-free by necessity: it
   * runs on an instance where no account exists yet, and the bootstrap token
   * the schema step printed is the whole of its authorization.
   *
   * A wrong token and a missing one are the same `Unauthorized`; an instance
   * that already has an owner is `NotFound`, which is what `/setup` renders
   * as a not-found screen. On success the response carries the new owner's
   * session cookie.
   */
  Rpc.make('setup.complete', {
    payload: CompleteSetupInput,
    success: CompleteSetupResult,
    error: Schema.Union([Unauthorized, NotFound, Conflict]),
  }),
);
