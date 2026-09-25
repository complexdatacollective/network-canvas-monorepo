import { Effect, Layer } from 'effect';
import { HttpRouter } from 'effect/unstable/http';
import type { Hono } from 'hono';

import type { StudioHonoEnv } from '../app.ts';
import { honoHandler } from './hono-bridge.ts';
import { clientAddress, httpRateLimit } from './middleware/rate-limit.ts';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

/**
 * The public data API — a separate surface from the SPA's RPC, per the
 * 2026-08-11 decision on #1248 — behind its limit. The handlers are still the
 * Hono app's until stage 7 rebuilds them as an `HttpApi`; what is the Effect
 * router's already is the `public_api` limit in front of them, so these routes
 * forward to the same web handler the bridge does.
 *
 * Limited per client address, and deliberately not per `Authorization` header
 * (#1909). There is no token plane yet — the principal resolution answers any
 * Authorization header with no principal until #1899 builds one — so a header
 * is an unvalidated string, and keying on it would let an anonymous caller
 * mint a fresh bucket per request by rotating the value, which is the address
 * limit doing nothing at all. When a token is validated the key becomes its
 * resolved id, which cannot be minted.
 *
 * `/api/v1/*` registers the bare `/api/v1` beside its children; `HEAD` reaches
 * the `GET` route, as it reached Hono's.
 */
export const ApiV1Routes = (app: Hono<StudioHonoEnv>) =>
  HttpRouter.use((router) =>
    Effect.forEach(
      METHODS,
      (method) => router.add(method, '/api/v1/*', honoHandler(app)),
      { discard: true },
    ),
  ).pipe(Layer.provide(httpRateLimit('public_api', clientAddress).layer));
