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
 * A fetch request to `/rpc` — the one mount an rpc middleware runs on today —
 * carries `x-studio-client-session` itself. `/ws` is the protocol builder's
 * oRPC bridge and runs no rpc middleware at all: a handshake cannot set a
 * header from a browser, so the id rides on the upgrade URL, and the route
 * middleware there rewrites it onto the request
 * (`http/middleware/client-session-query.ts`) for the bridge to read off
 * (`http/ws-bridge.ts`). Stage 8 moves that plane onto rpc, and the rewrite is
 * what will let a `/ws` frame reach this middleware with the id already where
 * a fetch request puts it. Either way the id ends up on the request, which is
 * the only place it may be read from: the merged set the rpc server hands a
 * middleware puts the message's own headers over the request's, so a caller
 * reading `options.headers` could name any tab they liked — and a lease's
 * owner is exactly the thing the `/ws` query-only rule was hardened to keep a
 * caller from choosing.
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
