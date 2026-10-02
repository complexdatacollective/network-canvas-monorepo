import { Effect } from 'effect';
import { Headers, HttpRouter, HttpServerRequest } from 'effect/http';

import {
  CLIENT_SESSION_HEADER,
  CLIENT_SESSION_PARAM,
  readClientSessionId,
} from '@codaco/studio-contract/client-session';

/**
 * The header is always rewritten from the query and removed when it names
 * none: any client can set the header on a handshake, and a value that never
 * passed `readClientSessionId` must not reach the handlers.
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
