import { Effect } from 'effect';
import { Headers, HttpRouter, HttpServerRequest } from 'effect/unstable/http';

import {
  CLIENT_SESSION_HEADER,
  CLIENT_SESSION_PARAM,
  readClientSessionId,
} from '@codaco/studio-contract/client-session';

/**
 * Moves the tab's id from the `/ws` upgrade URL onto the request's headers, so
 * that everything downstream reads it in one place.
 *
 * A browser cannot put a header on a WebSocket handshake — the `WebSocket`
 * constructor takes a URL and subprotocols and nothing else — so the tab names
 * itself on the query string. A fetch request to `/rpc` carries the header
 * directly. Rewriting here is what lets the bridge, and the rpc middleware that
 * will read it, know only about the header.
 *
 * The query is the only thing that can name a tab on this route: the header is
 * always rewritten from it, and removed outright when the query names none.
 * A handshake is not a browser fetch — any non-browser client can set the
 * header itself — and the id ends up in the `leases.owner` column, so a value
 * that never passed `readClientSessionId` must not reach the bridge. A client
 * that names nothing, or names an id the contract rejects (a parameter given
 * twice arrives as an array, which names no tab), leaves the route with no
 * header at all.
 */
export const ClientSessionQuery = HttpRouter.middleware((httpEffect) =>
  Effect.gen(function* () {
    const searchParams = yield* HttpServerRequest.ParsedSearchParams;
    const named = searchParams[CLIENT_SESSION_PARAM];
    const clientSessionId = readClientSessionId(
      typeof named === 'string' ? named : undefined,
    );
    const request = yield* HttpServerRequest.HttpServerRequest;
    return yield* Effect.provideService(
      httpEffect,
      HttpServerRequest.HttpServerRequest,
      request.modify({
        headers:
          clientSessionId === undefined
            ? Headers.remove(request.headers, CLIENT_SESSION_HEADER)
            : Headers.set(
                request.headers,
                CLIENT_SESSION_HEADER,
                clientSessionId,
              ),
      }),
    );
  }),
);
