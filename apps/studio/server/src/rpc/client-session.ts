import { Effect, Layer } from 'effect';

import { readClientSessionId } from '@codaco/studio-contract/client-session';
import {
  CLIENT_SESSION_HEADER,
  ClientSession,
  ClientSessionMiddleware,
} from '@codaco/studio-contract/middleware/client-session';

/**
 * Which browser tab is calling, read from one header on both transports.
 *
 * A fetch request carries `x-studio-client-session` itself; a `/ws` handshake
 * cannot set a header from a browser, so the id rides on the upgrade URL and
 * the route middleware on `/ws` rewrites it into the header before any rpc
 * middleware runs (`http/middleware/client-session-query.ts`). By the time this
 * executes there is only ever a header to read.
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
    Effect.provideService(effect, ClientSession, {
      id: readClientSessionId(options.headers[CLIENT_SESSION_HEADER]) ?? null,
    }),
  );
