import { Context, Schema } from 'effect';
import * as RpcMiddleware from 'effect/rpc/RpcMiddleware';

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

export class HostSession extends RpcMiddleware.Service<
  HostSession,
  { provides: HostCaller }
>()('@protocolBuilder/HostSession', {
  error: HostUnauthorized,
  requiredForClient: false,
}) {}
