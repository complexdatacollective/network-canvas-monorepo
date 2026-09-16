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
 * A fetch request carries `x-studio-client-session`; a `/ws` handshake cannot
 * set a header from a browser, so the id rides on the upgrade URL and the route
 * middleware on `/ws` rewrites it onto the request before any rpc middleware
 * runs (`http/middleware/client-session-query.ts`). Either way the id is on the
 * request, which is the only place it may be read from: the merged set the rpc
 * server hands a middleware puts the message's own headers over the request's,
 * so a caller reading `options.headers` could name any tab they liked — and a
 * lease's owner is exactly the thing the `/ws` query-only rule was hardened to
 * keep a caller from choosing.
 *
 * It cannot fail: a caller that named nothing, and one that named an id
 * `readClientSessionId` rejects, are both `null` — which is the ordinary case,
 * not a refusal.
 *
 * No `StudioRpcs` procedure declares it yet. The ones that would are the
 * protocol builder's lock-acquiring procedures, and those are stage 8's — so it
 * is provided to the `/rpc` server for the procedures that will name it, and
 * proved through a scratch group in the meantime.
 */
export const ClientSessionMiddlewareLive: Layer.Layer<ClientSessionMiddleware> =
  Layer.succeed(ClientSessionMiddleware)((effect, options) =>
    Effect.flatMap(transportHeaders(options.headers), (headers) =>
      Effect.provideService(effect, ClientSession, {
        id: readClientSessionId(headers[CLIENT_SESSION_HEADER]) ?? null,
      }),
    ),
  );
