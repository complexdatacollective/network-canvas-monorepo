import { Effect } from 'effect';
import type { SqlError } from 'effect/sql';

import { SetupRpcs } from '@codaco/studio-contract/rpc/setup';
import {
  Conflict,
  NotFound,
  Unauthorized,
} from '@codaco/studio-contract/schema/errors';

import { completeSetup, SetupCommandError } from '../../setup/commands.ts';
import type { RpcDeps } from '../deps.ts';

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
    // No session and no middleware: the bootstrap token is the authorization.
    'setup.complete': (payload) =>
      deps.services === undefined
        ? new NotFound({})
        : refusals(completeSetup(payload)),
  });
