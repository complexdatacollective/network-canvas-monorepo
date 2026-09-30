import { Effect, Layer } from 'effect';

import { readClientSessionId } from '@codaco/studio-contract/client-session';
import {
  CLIENT_SESSION_HEADER,
  ClientSession,
  ClientSessionMiddleware,
} from '@codaco/studio-contract/middleware/client-session';

import { transportHeaders } from './request-headers.ts';

/**
 * Which browser tab is calling, read from one header on the request itself.
 *
 * A fetch request to `/rpc` — the one mount this middleware is provided to —
 * carries `x-studio-client-session` itself. A `/ws` handshake cannot set a
 * header from a browser, so there the id rides on the upgrade URL, and the
 * route middleware rewrites it onto the request
 * (`http/middleware/client-session-query.ts`) — which is where the protocol
 * builder's `HostSessionLive` reads it (`protocol-builder/session.ts`). Either
 * way the id ends up on the request, which is the only place it may be read
 * from: the merged set the rpc server hands a middleware puts the message's
 * own headers over the request's, so a caller reading `options.headers` could
 * name any tab they liked — and a lease's owner is exactly the thing the `/ws`
 * query-only rule was hardened to keep a caller from choosing.
 *
 * It cannot fail: a caller that named nothing, and one that named an id
 * `readClientSessionId` rejects, are both `null` — which is the ordinary case,
 * not a refusal.
 *
 * No `StudioRpcs` procedure declares it yet: the protocol builder's
 * lock-acquiring procedures, which are what reads a tab id, sit behind the
 * core's `HostSession` instead, and resolve it there. It is provided to the
 * `/rpc` server for a procedure that will name it, and proved through a
 * scratch group in the meantime.
 */
export const ClientSessionMiddlewareLive: Layer.Layer<ClientSessionMiddleware> =
  Layer.succeed(ClientSessionMiddleware)((effect, options) =>
    Effect.flatMap(transportHeaders(options.headers), (headers) =>
      Effect.provideService(effect, ClientSession, {
        id: readClientSessionId(headers[CLIENT_SESSION_HEADER]) ?? null,
      }),
    ),
  );
