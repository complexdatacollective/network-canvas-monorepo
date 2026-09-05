# @codaco/studio-sync

The Studio sync protocol's core, promoted from the ADR acceptance-gate spike
([#1247](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1247),
[spike findings](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1247#issuecomment-5219652417)).
Per the ADR, the apply engine is a shared, isomorphic workspace package
versioned in lockstep with the `studio.sync.v1` subprotocol.

## Modules (per-subpath imports, no barrel)

- `@codaco/studio-sync/apply` — the shared apply engine both sides run:
  section-document commands (`set`/`unset`/`insertItem`/`removeItem`/`moveItem`),
  canonical key-sorted serialization, and sha256 content/manifest hashing
  (via `@noble/hashes`, so it runs identically in the browser and Node).
- `@codaco/studio-sync/server` — the server half: the lease state machine
  (every transition one atomic conditional statement; epoch fencing), the
  idempotent commit path (client_seq + log unique constraint, per-draft
  serialization via the draft-head row lock), and manifest-hash resume.
- `@codaco/studio-sync/postgres-pool` — the shared Node pool factory:
  preserves URL connection settings, pins and verifies an optional startup
  role, bounds connection waits to 10 seconds and pool capacity to 1–32
  (default 10), and calls the idle-error logger without connection details.
- `@codaco/studio-sync/client` — the client half: optimistic local echo,
  pending queue, suffix rollback on rejection, reconnect with retransmission.
- `@codaco/studio-sync/schema` — the Postgres schema (drafts, immutable
  content-addressed sections, manifests, leases, command log).

The server/schema/postgres-pool modules depend on `pg`; client code must
import only `./apply` and `./client`.

## Conformance suite

```bash
pnpm --filter @codaco/studio-sync test
```

Pure suites (apply-engine properties, canonicalization) always run. The
DB-backed suites — every specified failure mode: sleep/wake takeover, late
heartbeats, expiry-window writes, duplicate-tab takeover,
disconnect-during-commit, manifest linearity under concurrency, golden
transcripts, and a randomized interleaving property — need a reachable
Postgres and skip with a notice otherwise:

```bash
docker run -d -e POSTGRES_PASSWORD=spike -p 54318:5432 postgres:18
```

(`PGPORT` overrides the port. Each test file creates its own scratch
database as the `postgres` superuser — point it at a disposable instance,
never a real one.)

## Status

Landed ahead of protocol milestones still to come: WebSocket/SSE transport,
presence, undo, and the versioned message schemas. The two open design notes
from the spike (release expires the lease in place; explicit duplicate-tab
takeover as its own transition) are carried here as implemented, pending
team discussion on #1247.
