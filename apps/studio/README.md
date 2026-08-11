# Network Canvas Studio

Cloud-based, multi-tenant platform for designing network interview protocols
and collecting network data remotely. Specified by the issue tree rooted at
[#1242](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1242);
the architecture follows the ADR recommendations and recorded decisions on
[#1245](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1245)
(framework and deployment topology),
[#1246](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1246)
(datastore), [#1247](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1247)
(sync), and [#1248](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1248)
(API surfaces).

## Layout

Studio is two independently deployable halves plus one shared leaf — the
package diamond decided 2026-08-11 on
[#1244](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1244).
There is deliberately **no client↔server dependency edge**: the halves share
only the boundary package, so changesets and release CI re-gate a half only
when its boundary moved.

- `client/` — `@codaco/studio-client`: Vite + React SPA (TanStack Router,
  TanStack Query, `@codaco/fresco-ui`). Builds to static assets; talks to the
  server through typed oRPC procedures, importing the boundary contract
  type-only.
- `server/` — `@codaco/studio-server`: Hono app on `@hono/node-server`
  (Node 24 baseline), one persistent process serving every surface below,
  plus static client assets in the self-host topology.
- `packages/studio-rpc` — `@codaco/studio-rpc`: the internal RPC boundary
  (Zod schemas + typed oRPC contract). The only shared code between the
  halves.

## Surfaces

Three surfaces, one domain layer beneath them, none generated from another
(per the 2026-08-11 decision on #1248):

| Path       | Surface                  | Consumers                              | Stability                                             |
| ---------- | ------------------------ | -------------------------------------- | ----------------------------------------------------- |
| `/rpc`     | Internal RPC (oRPC v2)   | The SPA only                           | Unpublished, free-moving                              |
| `/api/v1`  | Public data API (REST)   | Researchers, external tools            | OpenAPI 3.1 (`/api/v1/openapi.json`), RFC 9457 errors |
| `/ws`      | Sync protocol            | The SPA's editor                       | Unpublished, protocol-versioned (#1247)               |
| `/storage` | Asset bytes (plain HTTP) | The SPA (upload), interviews (stimuli) | Unpublished; content-addressed, immutable (#1278)     |

Asset bytes live in S3-compatible object storage (#1246): Cloudflare R2 in
the managed topology, MinIO (or any S3-compatible endpoint) self-hosted.
Objects are keyed by content hash, so `/storage/:hash` responses are
immutable-cacheable by construction. Files ride plain HTTP rather than the
RPC surface — uploads must stream, retrievals must cache.

## Development

```bash
pnpm --filter @codaco/studio-server dev
pnpm --filter @codaco/studio-client dev
```

Two processes, one origin: the Vite dev server (port 5173) serves the SPA and
proxies `/api`, `/rpc`, `/storage`, `/healthz`, and `/ws` to the server
(port 3000) — playing the role the CDN plays in the managed topology, so the
browser sees a single origin in every topology. The server restarts on server
and `studio-rpc` source changes; the client has HMR.

The server's dev script also provisions **MinIO in Docker** (branch-scoped
container and volume, port 9100, bucket auto-created — mirroring Fresco's
`dev-s3` script), so asset storage works locally without any third-party
service. Docker must be running. The server's asset integration tests run
against this MinIO and skip when no object store is reachable.

## Production

```bash
pnpm --filter @codaco/studio-client build   # client/dist — static assets
pnpm --filter @codaco/studio-server build   # server/dist — Node bundle
pnpm --filter @codaco/studio-server start   # serves both locally
```

The Docker image — the self-host artifact — builds from the monorepo root and
contains the server bundle plus the built client assets:

```bash
docker build -f apps/studio/Dockerfile -t network-canvas-studio .
docker run --rm -p 3000:3000 network-canvas-studio
```

## Deployment topologies

Decided 2026-08-11 on #1245. Both topologies run the same artifacts and
present a single origin; they differ only in who serves the static client
assets.

### Managed service

Cloudflare fronts the single hostname: it serves the client's hashed assets
from the CDN (retaining old hashes across deploys, so open tabs never lose
their chunks) and routes the server's paths to the origin — a persistent Node
process colocated with the Postgres primary. Edge compute is a non-goal;
replicas serve only reads the query layer marks replica-tolerant (#1246).

```mermaid
graph LR
    P[Participant / researcher<br/>browser — Studio SPA]
    X[External tools<br/>Python, R, curl]

    subgraph CF[Cloudflare — one origin]
        CDN[CDN<br/>static client assets<br/>immutable hashed chunks]
        RT[Route<br/>/api/* · /rpc · /ws]
    end

    subgraph O[Origin region]
        S[studio-server<br/>persistent Node process<br/>WS + leases: single replica]
        PG[(Postgres<br/>primary)]
        RR[(Read replicas<br/>replica-tolerant<br/>reads only)]
    end

    R2[(R2 object storage<br/>content-addressed assets)]

    P -->|assets| CDN
    P -->|"/rpc · /ws (cookie)"| RT
    X -->|"/api/v1 (PAT)"| RT
    RT --> S
    S --> PG
    S -.-> RR
    PG -.->|streaming replication| RR
    S -->|S3 API| R2
    CDN -.->|stimuli, signed URLs| R2
```

### Self-host

The same server image embeds and serves the client assets itself: the app
container, Postgres, and an S3-compatible object store (MinIO by default, or
bring your own endpoint) — the same shape Fresco self-hosters already run.

```mermaid
graph LR
    B[Browser]

    subgraph H[Researcher-operated host — Docker]
        C[studio container<br/>server + embedded client assets<br/>assets · /api · /rpc · /ws · /storage]
        PG[(Postgres<br/>container)]
        M[(MinIO container<br/>or BYO S3 endpoint)]
    end

    B -->|one origin| C
    C --> PG
    C -->|S3 API| M
```

The server reads its object store from `S3_ENDPOINT`, `S3_REGION`,
`S3_BUCKET`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY` — all five or
none (partial configuration fails fast). Unset means asset routes refuse
with 503; outside production, unset defaults to the dev MinIO.

### What deploys when

| Release contains                 | Deploys                      | Live-session impact              |
| -------------------------------- | ---------------------------- | -------------------------------- |
| Client only                      | CDN asset publish            | None                             |
| Server only (boundary untouched) | Backend                      | WS reconnect + resume            |
| Additive boundary change         | Server, then client          | WS reconnect + resume            |
| Breaking boundary change         | Coordinated: server → client | Forced by the compatibility gate |

Backend deploys drop live WebSocket sessions by design, so the server drains
on SIGTERM (close 1001, stop the listener, bounded timeout) and the sync
protocol's reconnect-and-resume path makes the interruption routine (#1247).
Managed backend deploys trigger on `@codaco/studio-server` version changes —
never on image rebuilds — so client-only releases cannot bounce the backend.
