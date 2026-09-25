import { Effect } from 'effect';
import type { SqlError } from 'effect/unstable/sql';

import { SetupRpcs } from '@codaco/studio-contract/rpc/setup';
import {
  Conflict,
  NotFound,
  Unauthorized,
} from '@codaco/studio-contract/schema/errors';

import { completeSetup, SetupCommandError } from '../../setup/commands.ts';
import type { RpcDeps } from '../deps.ts';

/**
 * What a refused first-run setup leaves as. A wrong token and no token are both
 * `Unauthorized` and say nothing more: the only caller who can tell them apart
 * is one who already holds the right one. An owned instance is `NotFound`,
 * which is the same answer the route itself gives once setup is closed.
 * Anything else is a fault and leaves untouched.
 */
const refusals = <A, R>(
  command: Effect.Effect<A, SetupCommandError | SqlError.SqlError, R>,
): Effect.Effect<A, Unauthorized | NotFound | Conflict, R> =>
  command.pipe(
    Effect.catch(
      (error): Effect.Effect<never, Unauthorized | NotFound | Conflict> => {
        if (!(error instanceof SetupCommandError)) return Effect.die(error);
        if (error.reason === 'unauthorized') return new Unauthorized({});
        if (error.reason === 'emailTaken') {
          return new Conflict({ reason: 'emailTaken' });
        }
        return new NotFound({});
      },
    ),
  );

export const SetupHandlers = (deps: RpcDeps) =>
  SetupRpcs.toLayer({
    /**
     * First-run bootstrap (#1909). No session and no middleware: this runs on
     * an instance where no account exists, and the bootstrap token is the
     * authorization.
     *
     * The new owner's session leaves through `SetCookies`, which the command
     * itself appends to and the `/rpc` route middleware provides per request.
     * A call that arrived over the WebSocket, or in process, has no response
     * to carry a cookie on — so nothing is set and `signedIn` says so, which
     * is what decides whether the shell continues into the signed-in app or
     * sends the new owner to sign in.
     */
    'setup.complete': (payload) =>
      // An instance with no database has no installation row and no token
      // outstanding, so setup is closed here exactly as `status` reports it.
      deps.pool === undefined
        ? new NotFound({})
        : refusals(completeSetup(deps.auth, payload)),
  });
