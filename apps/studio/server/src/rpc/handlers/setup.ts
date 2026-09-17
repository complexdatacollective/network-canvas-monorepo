import { Effect, Option } from 'effect';

import { SetupRpcs } from '@codaco/studio-contract/rpc/setup';
import {
  Conflict,
  NotFound,
  Unauthorized,
} from '@codaco/studio-contract/schema/errors';

import { completeSetup, SetupCommandError } from '../../setup/commands.ts';
import { runCommand } from '../bridge.ts';
import type { RpcDeps } from '../deps.ts';
import { SetCookies } from '../set-cookies.ts';

/**
 * What a refused first-run setup leaves as. A wrong token and no token are both
 * `Unauthorized` and say nothing more: the only caller who can tell them apart
 * is one who already holds the right one. An owned instance is `NotFound`,
 * which is the same answer the route itself gives once setup is closed.
 * Anything else is a fault and leaves untouched.
 */
const setupRefusal = (
  cause: unknown,
): Effect.Effect<never, Unauthorized | NotFound | Conflict> => {
  if (!(cause instanceof SetupCommandError)) return Effect.die(cause);
  if (cause.reason === 'unauthorized') return new Unauthorized({});
  if (cause.reason === 'emailTaken')
    return new Conflict({ reason: 'emailTaken' });
  return new NotFound({});
};

export const SetupHandlers = (deps: RpcDeps) =>
  SetupRpcs.toLayer({
    /**
     * First-run bootstrap (#1909). No session and no middleware: this runs on
     * an instance where no account exists, and the bootstrap token is the
     * authorization.
     *
     * The new owner's session leaves through `SetCookies`, which the `/rpc`
     * route middleware provides per request. A call that arrived over the
     * WebSocket, or in process, has no response to carry a cookie on — so
     * nothing is set and `signedIn` says so, which is what decides whether the
     * shell continues into the signed-in app or sends the new owner to sign in.
     */
    'setup.complete': (payload) =>
      Effect.gen(function* () {
        // An instance with no database has no installation row and no token
        // outstanding, so setup is closed here exactly as `status` reports it.
        const pool = deps.pool;
        if (pool === undefined) return yield* new NotFound({});
        const session = yield* runCommand(
          () => completeSetup({ auth: deps.auth, pool }, payload),
          setupRefusal,
        );
        const setCookies = yield* Effect.serviceOption(SetCookies);
        const cookies = session.headers.getSetCookie();
        if (Option.isNone(setCookies) || cookies.length === 0) {
          return { instanceName: payload.instanceName, signedIn: false };
        }
        for (const cookie of cookies) {
          yield* setCookies.value.append(cookie);
        }
        return { instanceName: payload.instanceName, signedIn: true };
      }),
  });
