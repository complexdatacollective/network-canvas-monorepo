# Network Canvas Studio

Cloud-based, multi-tenant platform for designing network interview protocols
and collecting network data remotely. Specified by the issue tree rooted at
[#1242](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1242);
the architecture follows the ADR recommendations on
[#1245](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1245)
(framework), [#1246](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1246)
(datastore), [#1247](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1247)
(sync), and [#1248](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1248)
(API).

## Layout

- `client/` — Vite + React SPA: TanStack Router, TanStack Query,
  `@codaco/fresco-ui`. Talks to the server through typed oRPC procedures
  (`@orpc/tanstack-query` over the `/rpc` surface; decision recorded 2026-08-10
  on [#1244](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1244)).
- `server/` — Hono app on `@hono/node-server` (Node 24 baseline): `/healthz`,
  the public API under `/api/v1/*` (REST routes and the OpenAPI 3.1 document
  at `/api/v1/openapi.json`, both generated from the oRPC contract; errors
  leave as RFC 9457 problem details), the SPA's oRPC surface at `/rpc`, and
  the app WebSocket endpoint at `/ws`. Both surfaces serve the same router —
  one contract, one implementation.
- `shared/` — the oRPC contract (each procedure carries its REST shape via
  `openapi()` metadata) and its Zod schemas, consumed source-first by both
  halves (type-only on the client).

## Development

```bash
pnpm --filter @codaco/studio dev
```

One process, one port (default 3000; `PORT` overrides): the Hono server runs
with the Vite dev server mounted in middleware mode, so the SPA, the API, and
WebSockets are all served together — dev/prod parity for the single-artifact
topology. Vite's HMR socket lives on `/__vite_hmr`, distinct from the app's
`/ws` endpoint; both share the one HTTP server.

## Production

```bash
pnpm --filter @codaco/studio build   # dist/client + dist/server
pnpm --filter @codaco/studio start   # node dist/server/index.js
```

The Docker image (one artifact: built client assets + bundled server) builds
from the monorepo root:

```bash
docker build -f apps/studio/Dockerfile -t network-canvas-studio .
docker run --rm -p 3000:3000 network-canvas-studio
```
