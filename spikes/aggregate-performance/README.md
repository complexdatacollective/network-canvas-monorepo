# Spike: aggregate performance under RLS (ADR #1246 acceptance gate)

Prototypes the graph-shaped relational schema (workspaces → studies → sessions
spine; nodes/edges rows with JSONB attribute bags) with the ADR's full RLS
role topology, seeds it via `@codaco/protocol-utilities` `generateNetwork` at
10× study scale, and measures the three canonical aggregates as the app role,
concurrent with pg-boss queue churn in the same database.

**Result: gate cleared (p95 < 1s)** on the query tier the network layer would
actually serve. Full findings and measurements are posted on the ADR issue:
https://github.com/complexdatacollective/network-canvas-monorepo/issues/1246

## Reproduce (~15 min total)

Prerequisites: Node ≥ 24, Docker.

```bash
npm install

# 1. PostgreSQL 18 with the documented baseline tuning
docker run -d --name studio-spike-pg -e POSTGRES_PASSWORD=spike -p 54318:5432 postgres:18
docker exec studio-spike-pg psql -U postgres -c "ALTER SYSTEM SET shared_buffers = '1GB'"
docker exec studio-spike-pg psql -U postgres -c "ALTER SYSTEM SET max_parallel_workers = 8"
docker restart studio-spike-pg

# 2. Roles + schema + forced RLS (owner migrates; app role is non-owner, NOBYPASSRLS)
node migrate.mjs

# 3. Seed: 21,000 main-study sessions (7,000 participants × 3 waves) + 2×2,000
#    noise-workspace sessions — every session an individual generateNetwork()
#    output (~80 nodes / ~220 edges). ~4 minutes.
node seed.mjs

# 4. Covering index for the raw degree tier + role tuning
docker exec studio-spike-pg psql -U studio_owner -d studio_spike -c \
  "CREATE INDEX edges_session_endpoints ON edges (workspace_id, session_id) INCLUDE (from_node, to_node)"
docker exec studio-spike-pg psql -U postgres -d studio_spike -c "ALTER ROLE studio_app SET work_mem = '256MB'"
for t in edges nodes sessions; do docker exec studio-spike-pg psql -U postgres -d studio_spike -c "VACUUM (ANALYZE) $t"; done

# 5. Rollup tier (network-layer per-session projections) + benchmark
node rollups.mjs
node bench.mjs
```

## Files

- `migrate.mjs` — "RLS done right": `studio_owner` runs DDL; `studio_app` is a
  distinct non-owner NOBYPASSRLS login; `ENABLE` + `FORCE ROW LEVEL SECURITY`
  everywhere; policies read `NULLIF(current_setting('app.workspace_id', true), '')::uuid`.
- `protocol.mjs` — synthetic codebook + stages (name generator, two dyad
  censuses) sized under the brief's <100 nodes / <300 edges bounds.
- `seed.mjs` — generateNetwork-seeded COPY load (superuser: see the COPY/RLS
  finding in the issue comment).
- `rollups.mjs` — per-session `session_stats` + `session_degree_hist`
  projections, same RLS posture, backfilled once (production maintains them
  in the session-write transaction; that cost is measured by the bench).
- `bench.mjs` — tenancy guards (cross-tenant reads/writes, missing context),
  pg-boss churn, and the timed aggregates (`SET LOCAL` per transaction, app
  role). Exit code is the gate verdict.
