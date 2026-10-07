import { Context, Schema } from 'effect';
import { RpcMiddleware } from 'effect/rpc';

import type { TeamAccess as TeamAccessToken } from '@codaco/studio-sync/tenant';

import { Forbidden, RateLimited } from '../schema/errors.ts';
import { type Principal } from './authenticated.ts';

export class TeamAccess extends Context.Service<TeamAccess, TeamAccessToken>()(
  '@studio/TeamAccess',
) {}

/**
 * Declare this BEFORE `Authenticated` on an rpc: the middleware added last runs
 * first, and this one needs the `Principal` that `Authenticated` installs.
 */
export class TeamAdministration extends RpcMiddleware.Service<
  TeamAdministration,
  { provides: TeamAccess; requires: Principal }
>()('@studio/TeamAdministration', {
  error: Schema.Union([Forbidden, RateLimited]),
}) {}
