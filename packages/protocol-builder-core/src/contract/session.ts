import { Context, Schema } from 'effect';
import * as RpcMiddleware from 'effect/unstable/rpc/RpcMiddleware';

/**
 * Who is calling a protocol-builder procedure, as the host resolved it.
 *
 * `connectionId` is the connection, which presence is keyed by.
 * `clientSessionId` is the browser tab, which leases are keyed by together with
 * `userId`: a tab keeps its locks across the connections it opens, and two tabs
 * of one researcher are two lock owners.
 */
export class HostCaller extends Context.Service<
  HostCaller,
  {
    readonly connectionId: string;
    readonly clientSessionId: string;
    readonly userId: string;
    readonly displayName: string;
  }
>()('@protocolBuilder/HostCaller') {}

export class HostUnauthorized extends Schema.TaggedError<HostUnauthorized>()(
  'HostUnauthorized',
  {},
) {}

/**
 * Declared here rather than by each host at its mount, because a middleware's
 * error is part of every procedure's type: declaring it once is what makes
 * Architect's and Studio's clients one client type.
 */
export class HostSession extends RpcMiddleware.Service<
  HostSession,
  { provides: HostCaller }
>()('@protocolBuilder/HostSession', {
  error: HostUnauthorized,
  requiredForClient: false,
}) {}
