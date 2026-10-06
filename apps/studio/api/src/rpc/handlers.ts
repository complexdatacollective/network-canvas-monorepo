import { Layer } from 'effect';
import type { Rpc, RpcGroup } from 'effect/rpc';

import type { Authenticated } from '@codaco/studio-contract/middleware/authenticated';
import type { TeamAdministration } from '@codaco/studio-contract/middleware/team-administration';
import type { StudioRpcs } from '@codaco/studio-contract/rpc/studio';

import type { AuthService } from '../auth/service.ts';
import type { RateLimiter } from '../rate-limit/limiter.ts';
import { AuthenticatedLive } from './authenticated.ts';
import type { RpcDeps, RpcServices } from './deps.ts';
import { AccountHandlers } from './handlers/account.ts';
import { AuditHandlers } from './handlers/audit.ts';
import { ProtocolsHandlers } from './handlers/protocols.ts';
import { SetupHandlers } from './handlers/setup.ts';
import { StatusHandlers } from './handlers/status.ts';
import { StudiesHandlers } from './handlers/studies.ts';
import { TeamHandlers } from './handlers/team.ts';
import { TeamAdministrationLive } from './team-administration.ts';

export const StudioRpcHandlers = (
  deps: RpcDeps,
): Layer.Layer<
  Rpc.ToHandler<RpcGroup.Rpcs<typeof StudioRpcs>>,
  never,
  RpcServices
> =>
  Layer.mergeAll(
    StatusHandlers(deps),
    SetupHandlers(deps),
    AccountHandlers(deps),
    TeamHandlers(deps),
    StudiesHandlers(deps),
    ProtocolsHandlers(deps),
    AuditHandlers(deps),
  );

export const StudioRpcMiddleware = (
  deps: RpcDeps,
): Layer.Layer<
  Authenticated | TeamAdministration,
  never,
  AuthService | RateLimiter
> => Layer.mergeAll(AuthenticatedLive, TeamAdministrationLive(deps));
