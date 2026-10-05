import { Effect, Layer } from 'effect';

import { readClientSessionId } from '@codaco/studio-contract/client-session';
import {
  CLIENT_SESSION_HEADER,
  ClientSession,
  ClientSessionMiddleware,
} from '@codaco/studio-contract/middleware/client-session';

import { transportHeaders } from './request-headers.ts';

export const ClientSessionMiddlewareLive: Layer.Layer<ClientSessionMiddleware> =
  Layer.succeed(ClientSessionMiddleware)((effect, options) =>
    Effect.flatMap(transportHeaders(options.headers), (headers) =>
      Effect.provideService(effect, ClientSession, {
        id: readClientSessionId(headers[CLIENT_SESSION_HEADER]) ?? null,
      }),
    ),
  );
