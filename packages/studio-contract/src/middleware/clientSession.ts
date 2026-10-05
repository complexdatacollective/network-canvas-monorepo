import { Context } from 'effect';
import { RpcMiddleware } from 'effect/rpc';

export { CLIENT_SESSION_HEADER } from '../clientSession.ts';

export class ClientSession extends Context.Service<
  ClientSession,
  { readonly id: string | null }
>()('@studio/ClientSession') {}

export class ClientSessionMiddleware extends RpcMiddleware.Service<
  ClientSessionMiddleware,
  { provides: ClientSession }
>()('@studio/ClientSessionMiddleware') {}
