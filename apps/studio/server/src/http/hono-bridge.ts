import { Effect, type Layer } from 'effect';
import {
  HttpEffect,
  HttpRouter,
  type HttpServerError,
} from 'effect/unstable/http';
import type { Hono } from 'hono';

import type { StudioHonoEnv } from '../app.ts';
import { ClientAddress } from './middleware/client-address.ts';
import { RequestId } from './middleware/request-id.ts';

// Everything the Hono app still owns — the `/api/v1` handlers and the machine
// surfaces' problem-JSON catch-alls — reached through one catch-all route at
// the end of the Effect router. The routes the Effect shell owns are
// registered before this one and win, because find-my-way prefers a literal
// path to a wildcard.
//
// What the Effect shell resolved is handed over as the adapter's bindings,
// which is how a Hono handler reads a value its adapter produced: the request
// id every surface logs under, and the client address the rate limits are
// counted against.

/** The Hono app as an Effect route handler, for this bridge and `/api/v1`'s. */
export const honoHandler = (app: Hono<StudioHonoEnv>) =>
  Effect.gen(function* () {
    const requestId = yield* RequestId;
    const clientAddress = yield* ClientAddress;
    return yield* HttpEffect.fromWebHandler((request) =>
      Promise.resolve(app.fetch(request, { requestId, clientAddress })),
    );
  });

/**
 * `/*` and `/` both, because the router registers a wildcard against the
 * children of a prefix and not the bare prefix itself.
 */
export const HonoBridge = (
  app: Hono<StudioHonoEnv>,
): Layer.Layer<
  never,
  never,
  | HttpRouter.HttpRouter
  | HttpRouter.Request.From<'Requires', RequestId | ClientAddress>
  | HttpRouter.Request.From<'Error', HttpServerError.HttpServerError>
> => {
  const handler = honoHandler(app);
  return HttpRouter.use((router) =>
    Effect.gen(function* () {
      yield* router.add('*', '/*', handler);
      yield* router.add('*', '/', handler);
    }),
  );
};
