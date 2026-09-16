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
 * A client that names nothing, or names an id `readClientSessionId` rejects,
 * leaves the request untouched: a parameter given twice arrives as an array,
 * which names no tab.
 */
export const ClientSessionQuery = HttpRouter.middleware((httpEffect) =>
  Effect.gen(function* () {
    const searchParams = yield* HttpServerRequest.ParsedSearchParams;
    const named = searchParams[CLIENT_SESSION_PARAM];
    const clientSessionId = readClientSessionId(
      typeof named === 'string' ? named : undefined,
    );
    if (clientSessionId === undefined) return yield* httpEffect;
    const request = yield* HttpServerRequest.HttpServerRequest;
    return yield* Effect.provideService(
      httpEffect,
      HttpServerRequest.HttpServerRequest,
      request.modify({
        headers: Headers.set(
          request.headers,
          CLIENT_SESSION_HEADER,
          clientSessionId,
        ),
      }),
    );
  }),
);
