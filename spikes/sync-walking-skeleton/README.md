# Spike: Studio sync walking skeleton (ADR #1247 acceptance gate)

Implements the specified server-reconciliation protocol's safety core against
real Postgres, and property-tests its failure modes:

- **Lease state machine** (`src/server.ts`) — every transition one atomic
  conditional statement: acquire/expired-takeover CAS (epoch bump), renew
  guarded by owner+epoch+expiry, explicit duplicate-tab takeover, release by
  expiring in place (epochs stay monotonic per section), all expiry
  comparisons on the database clock.
- **Commit path** — commit-time lease validation (owner + epoch + `expires_at`;
  the epoch alone is not sufficient), `client_seq` idempotency backed by the
  command log's unique constraint, per-draft serialization via the draft-head
  `FOR UPDATE` row lock, and the command-log append in the same transaction.
- **Content-addressed store** (`src/schema.ts`) — immutable section documents
  keyed by hash, manifests as section-hash maps with parent links
  ("hashes identify, sequences order").
- **Shared apply engine** (`src/apply.ts`) — the isomorphic module both sides
  run, with canonical (key-sorted) serialization feeding sha256 content
  hashes.
- **Client half** (`src/client.ts`) — optimistic echo, pending queue with
  per-(owner, section, epoch) client_seq, suffix rollback on rejection,
  reconnect via manifest-hash resync + retransmission.

**Result: gate cleared** — all specified failure modes pass. Findings on the
ADR issue:
https://github.com/complexdatacollective/network-canvas-monorepo/issues/1247

## Reproduce (~2 min)

Prerequisites: Node ≥ 24, Docker.

```bash
docker run -d --name studio-spike-pg -e POSTGRES_PASSWORD=spike -p 54318:5432 postgres:18
npm install
npm test
```

(The container can be shared with the aggregate-performance spike; each test
file creates its own database.)

## Test coverage (21 tests)

- `test/lease.test.ts` — sleep/wake takeover; late heartbeats; expiry-window
  writes; duplicate-tab takeover of an ACTIVE lease; racing acquires admit
  exactly one winner; release keeps epochs monotonic.
- `test/commit.test.ts` — disconnect-during-commit retransmission dedup
  (sequential and concurrent); per-draft serialization under 30 concurrent
  multi-section commits (linear chain asserted); non-holder/wrong-epoch
  rejection; hash agreement with the shared engine.
- `test/resume.test.ts` — reconnect/resume with retransmission of
  unacknowledged batches; hash-diff resync fetches only changed sections;
  suffix rollback on takeover.
- `test/golden.test.ts` — golden-transcript hash equality across three
  replays: client in-memory, server commit path, and the Postgres command log
  itself; canonical-serialization key-order independence.
- `test/property.test.ts` — fast-check: 300-case pure properties (determinism,
  purity, hash order-independence) and a 25-schedule randomized interleaving
  property over two contenders with a model tracking who holds the lease
  (epoch monotonicity, stale-commit rejection, expired-lease rejection,
  chain linearity).

Time passage (slept laptops) is simulated by `forceExpire`, which rewrites
only `expires_at` — the state machine's statements are never special-cased
for tests.
