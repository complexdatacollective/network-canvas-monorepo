import { Layer } from 'effect';
import type { Rpc, RpcGroup } from 'effect/unstable/rpc';

import type { StudioRpcs } from '@codaco/studio-contract/rpc/studio';

import type { RpcDeps, RpcServices } from './deps.ts';
import { AccountHandlers } from './handlers/account.ts';
import { AuditHandlers } from './handlers/audit.ts';
import { ProtocolsHandlers } from './handlers/protocols.ts';
import { SetupHandlers } from './handlers/setup.ts';
import { StatusHandlers } from './handlers/status.ts';
import { StudiesHandlers } from './handlers/studies.ts';
import { TeamHandlers } from './handlers/team.ts';

/**
 * Every `StudioRpcs` procedure implemented, as one layer.
 *
 * Seven layers rather than one object because the contract is seven groups:
 * each area's handlers are checked against its own group's payloads, results
 * and declared errors, so a handler cannot be written against the wrong
 * procedure's schema. Merging them gives exactly the handler set the merged
 * group asks for — a procedure with no handler is a build error here, not a
 * request that answers "unknown tag" in production.
 *
 * `Layer.mergeAll` rather than a `provideMerge` chain: the seven are
 * independent, and nothing here depends on another's output.
 *
 * `RpcServices` is what they carry out: the application client, the operator
 * signal, the job queue, the process's cipher, the auth provider and the
 * limiter. A handler that
 * reads or writes tenant rows does it through `TenantScope.open`, which takes
 * the client from that tag; a command that queues work reaches `Jobs` the same
 * way, which is what makes "the job and the change commit together" a property
 * of the types rather than of a parameter. They are provided once where the
 * route is built rather than threaded through `RpcDeps` as a pool was.
 */
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
