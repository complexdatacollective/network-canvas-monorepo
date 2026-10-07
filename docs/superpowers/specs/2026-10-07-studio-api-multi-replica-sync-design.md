# Studio API: Multi-Replica Protocol-Builder Sync Design

**Status:** Accepted (2026-10-07). Staged imports are persisted (§8). The
restart-lock fix (§7 item 1) lands first, on its own.

**Tracking:** #1247 (sync protocol), under the Studio hosting-cost analysis
(epic #1243). Follows #1909, which moved the audit denial-rate window to
Valkey and left the sync leases as the remaining reason `serve` runs as a
single replica.

## 1. Summary

`apps/studio/README.md` says the web process must stay a single replica
because "the sync leases it holds are per-process state". That is only half
right. **The lease itself is already in Postgres.** `leases` holds owner,
epoch (the fencing token) and a wall-clock `expires_at`. Every grant, takeover,
renewal, release and commit is a single conditional statement under the
draft-head row lock (`packages/studio-sync/src/server.ts`). A second replica
cannot break single-writer-per-section.

What breaks is the in-memory machinery around the lease in
`apps/studio/api/src/protocol-builder/`. Four `Layer`s are merged as
`ProtocolBuilderState` in `rpc.ts:245`:

- `Leases` renews the leases the process granted, and releases them when the
  process sees the owner's last socket close.
- `Presence` records who is on a draft.
- `ProtocolEvents` fans committed events out to watchers.
- `StagedImports` holds imported files that have not been promoted yet, as
  bytes in RAM.

Each of these assumes that every call for an owner reaches the same process.

The design keeps Postgres as the only source of truth and adds three
mechanisms:

1. **A `protocol_connections` table.** It holds one heartbeated row per socket
   and doubles as presence. Lease renewal becomes "renew every live lease
   whose owner has a live socket on this replica", so a socket that reconnects
   to a different replica carries its leases with it. The decision to release
   after the grace period checks this table under the draft-head lock.
2. **A per-draft event relay on each replica.** It reads `protocol_events` in
   cursor order and is woken by a **Valkey pub/sub doorbell** that carries
   only `{draftId, cursor}`. A 5-second safety poll means correctness never
   depends on Valkey.
3. **Persistent staging.** Staged imports go to the object store plus a
   `protocol_staged_resources` row, so an import survives a reconnect to
   another replica (decided 2026-10-07; see §8).

With these in place, no load-balancer affinity is needed.

The exploration also found three defects that exist **today, with one
replica**, and that this design fixes (§7). The most serious: after any
backend restart the new process never renews the leases editors already hold,
and the client never re-acquires them. Every deploy therefore silently costs an
editor their lock after at most 30 s, and their unsaved form on the next save.

## 2. Inventory of per-process state on the sync path

| State                                                                       | Where                                                                     | Persisted?       | Breaks with >1 replica because…                                                                                                                                                                                                 |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lease row (owner, epoch, expiry)                                            | `leases` table, `studio-sync/server.ts`                                   | **Yes**          | It doesn't.                                                                                                                                                                                                                     |
| Per-draft ordering (manifest seq, event cursor)                             | `drafts.head_seq`, `protocol_events.cursor` (`max+1` under the head lock) | **Yes**          | It doesn't. Cursors are dense per draft.                                                                                                                                                                                        |
| Write idempotency                                                           | `protocol_write_receipts`, `command_log`                                  | **Yes**          | It doesn't.                                                                                                                                                                                                                     |
| Lock-holder display name                                                    | `protocol_events.holder` (`host.ts:458` reads it from the log)            | **Yes**          | It doesn't.                                                                                                                                                                                                                     |
| Lease renewal (keeper: `held` map, 10 s tick)                               | `leases.ts:74,109`                                                        | No               | Only the replica that **granted** a lease renews it. The client sends no heartbeat and never re-acquires after a reconnect (`protocol-builder/src/state/hooks.ts:283-356`), so a socket that lands on replica B goes unrenewed. |
| Owner's open-socket count and 20 s reconnect grace                          | `leases.ts:75,130-172`                                                    | No               | When A sees the owner's last socket close, it releases the owner's leases 20 s later, **even though the tab is live on B**. `releaseConnection` only checks owner and liveness.                                                 |
| Unary-plane "touched" time (5-min idle)                                     | `leases.ts:212`, `session.ts:153`                                         | No               | A touch on B never reaches A's keeper. (No shipped client uses the unary plane; only tests and `stack-test` do.)                                                                                                                |
| Presence (who is viewing or editing)                                        | `presence.ts`                                                             | No               | Each replica sees only its own sockets. (The web client writes presence into its cache but never reads it.)                                                                                                                     |
| Event fan-out (bounded queue per subscriber)                                | `publisher.ts`                                                            | Log yes, push no | A commit on A reaches only A's watchers. B's watchers see it only after reconnecting with `since`.                                                                                                                              |
| Staged imports (descriptors, bytes up to 100 MB, plaintext API-key secrets) | `resources.ts:192,424`                                                    | No               | If you stage on A and submit-with-promote on B, the promotion fails. Today a restart already loses them.                                                                                                                        |
| Socket identity, drain counter, maintenance cache                           | `rpc.ts:177`, `ws-drain.ts`, `maintenance-state.ts`                       | No               | Nothing: these are facts about this process's own sockets, or a 1 s cache of a database reading. They stay in memory.                                                                                                           |

A scan of `api/src` for `Ref.make`, `MutableRef.make` and `new Map<` found no
other process-singleton assumption in `serve`. Rate limits and the denial
window are already in Valkey. The worker's cron already uses
`pg_try_advisory_xact_lock`.

The rule this design enforces: **a replica may keep in memory only facts about
its own sockets. Anything another replica must observe lives in Postgres.**

## 3. Leases: liveness in Postgres, renewal by whoever holds the socket

### 3.1 `protocol_connections`

A new tenant table (RLS `team_isolation`, added to `tenantTablesSql`), in
`api/src/protocol-builder/schema.ts`:

| column                                          | notes                                                                                                 |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `team_id`, `draft_id`                           | composite FK into `drafts`, like `leases`                                                             |
| `connection_id`                                 | PK with `draft_id`; the `ws:<uuid>` minted per socket (`rpc.ts:177`), or the cookie session for unary |
| `kind`                                          | `'socket'` or `'unary'`                                                                               |
| `owner`                                         | `sessionOwner()` = `userId:clientSessionId`. Indexed with `draft_id`.                                 |
| `user_id`, `display_name`, `mode`, `section_id` | the `Presence` value                                                                                  |
| `replica_id`                                    | random per process; for diagnostics only, never for correctness                                       |
| `expires_at`                                    | `clock_timestamp()`-based, like every lease comparison                                                |

### 3.2 Transitions

All expiry arithmetic uses Postgres `clock_timestamp()`, so replica clock skew
is irrelevant.

- **Connect** (`WatchProtocol` start). One transaction:
  1. Take the draft-head lock `FOR SHARE`.
  2. Upsert the row with `expires_at = now + 30 s`.
  3. **Renew every live lease of `(draft, owner)`** (the new studio-sync
     statement below).

  The replica then adds the connection to its local set. Renewing at connect
  is what makes a reconnect to another replica, or to a restarted one, keep
  the editor's locks. The lease has at least 20 s left (TTL 30 s, renewed
  every 10 s), and the client's socket retry ladder reaches its fifth attempt
  in about 6.6 s.

- **Liveness pass.** Every 10 s (`RENEW_INTERVAL_MS`), one transaction per draft
  that has local connections:
  1. Push `expires_at` forward on this replica's rows (`connection_id = ANY($local)`).
  2. Renew every live lease whose `(draft_id, owner)` has a live row in that
     local set.

  This replaces the `held` map and its per-lease `renew` closures. Two
  replicas renewing the same lease is an idempotent no-op.

- **Socket close.** Delete the row, then fork the 20 s grace timer in the
  layer scope, as today.
- **Grace expiry** ("release everything the owner holds"). One transaction:
  1. Take the draft-head lock `FOR UPDATE`.
  2. If any live `'socket'` row exists for `(draft, owner)`, **do nothing**.
  3. Otherwise release every live lease of the owner on the draft, read from
     `leases` rather than from a local list, and append the lock-release
     events.

  Connect holds the same lock `FOR SHARE`, so the two serialize. Either the
  reconnect is visible and nothing is released, or the release lands first
  and the reconnecting socket finds no leases. The second case is exactly
  today's behaviour when a reconnect takes longer than 20 s. On shutdown the
  grace fibers are interrupted, as today, so a draining replica never
  releases anything.

  "Do nothing" ends the grace; it does not sleep again. The replica holding
  the live socket runs a whole grace of its own when that socket closes, so
  the grace on the replica whose socket closed is the only grace for that
  closure. A release that fails is retried with a bounded backoff, then
  logged, and the leases lapse at the TTL.

  Every transaction locks the draft head first, then connection rows by
  `connection_id`, then lease rows by `section_id`.

- **Unary contact.** `openSession` on the unary plane upserts a `'unary'` row
  with `expires_at = now + IDLE_MS`. The write is throttled per owner per
  replica to about once every 30 s. The serving replica keeps the row in its
  local renewal set until it expires. `StagedImports.expire`'s
  `connected(owner)` reads this table instead of the local map.

  If the replica that last served a unary owner dies, that owner's leases
  lapse at the TTL and its next submit is refused with `NotLockHolder`.
  That degradation is accepted because no shipped client uses the unary plane.

### 3.3 Changes to `studio-sync`

Add one statement to `makeSyncServer`:

- `renewHeld(draftId, owner)`: `UPDATE leases SET expires_at = now + ttl
WHERE draft_id, owner, team_id AND expires_at > clock_timestamp()`.

"A late heartbeat cannot resurrect an expired lease" still holds, because of
the expiry predicate. Epoch is deliberately absent. The owner is the tab, and
a re-acquire by the same owner after expiry bumps the epoch but is still that
owner's lease to keep alive. Another owner's lease is never touched.

`acquire`, `takeover`, `renew`, `release` and `commit` are unchanged.

### 3.4 Expiry reaper

A lease that expires with no release appends no lock event. The client knows
this (`hooks.ts:406-411`), and other editors keep showing the section as
locked. That happens today after a crash or a unary idle-out. With replicas it
also happens whenever a replica dies while its peers keep serving watchers.

The relay's safety poll (§4) does a cheap read-only check on each draft that
has local watchers: "is there a lease with `expires_at < now` whose latest
lock event names a holder?" Only when the answer is yes does it take the head
lock and append the release event, rechecking under the lock so the operation
is idempotent across replicas.

## 4. Fan-out: a log-ordered relay, woken by a Valkey doorbell

### 4.1 Mechanism

`protocol_events` is already a dense, per-draft, cursor-ordered durable log,
and `WatchProtocol` already replays it from `since`. Fan-out therefore never
needs to carry content. It only needs to say "draft D has advanced to cursor
c".

- **Publish.** After the committing transaction returns, which is where
  `handlers.ts` publishes today, the handler sends
  `PUBLISH studio:protocol-events {draftId, cursor}` (a Schema-encoded doorbell)
  and also rings the local relay directly. A presence change sends
  `{draftId, presence: true}`.
- **Relay.** There is one fiber per `(replica, draft with ≥1 local watcher)`.
  It holds `next`, the cursor it will emit next. On a doorbell with
  `cursor ≥ next`, it reads `cursor ≥ next ORDER BY cursor` in a team-stamped
  transaction and offers the rows, contiguous and in order, to the existing
  per-subscriber bounded queues. Doorbells that arrive during a read coalesce
  into one follow-up read. A presence doorbell re-reads the live `'socket'`
  rows and emits one `presence` event.
- **Safety poll.** Every 5 s, for each active draft, the relay reads from
  `next` and runs the §3.4 check. This covers a dropped pub/sub message, a
  publisher that crashed between commit and publish, and a Valkey outage.
- **Subscribe.** The handshake keeps today's order: register the queue, then
  read the backlog, then deliver live events filtered by `cursor > last`. Any
  event committed after registration is either in the backlog or delivered by
  the relay, because the relay only reads rows that are already committed.

Authorization stays per subscriber: `WatchProtocol` re-authorizes every
`REAUTHORIZE_MS`, as today. The relay's reads are a transport detail under
tenant RLS.

The subscriber connection is a duplicate of the ioredis client that
`RateLimitStore` opens. Extract a small `Valkey` platform service so the
connection is no longer owned by rate limiting. As built (plan §1 #11), the
doorbell instead opens its own subscriber and publisher connections. The
subscriber turns off ioredis's `autoResubscribe` and subscribes on every
`ready`: only an explicit `SUBSCRIBE` reports the server's confirmation, and
the resync read is safe only after it. One global channel is enough
at Studio's scale, because doorbells are tens of bytes per commit. If
`REDIS_URL` is unset, the doorbell is in-process only and cross-replica
latency falls to the 5 s poll. The boot warning that `REDIS_URL` absence
already logs should say so.

### 4.2 Why this option

| Option                                   | Latency           | Pooling-safe                                                                                                                     | Correct under message loss | New operational requirement                                                   |
| ---------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------- |
| **Valkey pub/sub doorbell + log + poll** | ms                | **Yes**: Postgres sees only ordinary transactions                                                                                | Yes (poll + gap fill)      | `PUBLISH`/`SUBSCRIBE` added to the documented Valkey command list             |
| LISTEN/NOTIFY doorbell + log + poll      | ms                | NOTIFY yes. **LISTEN no**: one session-mode connection per replica, unavailable through PgBouncer transaction mode or Hyperdrive | Yes                        | A direct database URL beside the pooled one                                   |
| Poll `protocol_events` only              | the poll interval | Yes                                                                                                                              | Yes                        | none, but about `drafts × replicas / interval` tenant transactions per second |
| Full payloads over Valkey                | ms                | Yes                                                                                                                              | **No** without the log     | Protocol content stored in Valkey, which today holds only disposable counters |

The worker already uses exactly the LISTEN-doorbell-plus-poll shape
(`jobs/worker.ts:950`, which reports `degraded` when the listener is lost). The
API does not copy it for one reason: API replicas are the processes we want to
put behind a transaction-mode pooler and scale out. NOTIFY's commit-time
transactional guarantee is attractive, but the poll already closes the
commit-then-crash window within 5 s. If a deployment wants to run without
Valkey, a LISTEN implementation of the same doorbell interface can be added
without touching the relay.

Not taken:

- **Effect's `cluster` module** (one entity per draft, sharded across runners).
  It brings a runner registry and message forwarding, and sockets still land
  on arbitrary replicas. Postgres already serializes the writes.
- **Sticky sessions as the primary fix.** They do not survive a deploy or a
  crash, which is exactly when reconnects happen.

## 5. Correctness

- **Single writer per section.** This is unchanged and already
  cross-replica. `acquire` is a compare-and-set on the lease row under the
  head lock. `submit` (`host.ts:877`) re-reads the lease `FOR UPDATE` under the
  head lock **in the same transaction as the write** and refuses unless it is
  owned and live. Replicas share the database, so no new fencing is needed.
- **Fencing token.** `epoch` bumps on takeover and on re-acquiring one's own
  expired lease. `studio-sync.commit` checks owner, epoch and expiry, but the
  protocol-builder `submit` checks owner and expiry only, not epoch. The
  remaining hazard is a stale submit from the **same tab** that lands after
  the tab lost and then re-took the section. That hazard does not depend on
  replica count. Closing it means returning the epoch from `AcquireLock` and
  sending it on `Submit`, which is a contract change in
  `protocol-builder-core`. It is listed as optional hardening and is not part
  of this design.
- **Replica crash.** Its sockets drop and clients reconnect elsewhere. The
  connect transaction renews their leases well inside the remaining TTL. The
  crashed replica's rows stop heartbeating: ghost presence clears within
  about 30 s, and leases of owners who never return expire at the TTL. The
  reaper then publishes the release events. A ghost row can only _delay_ a
  release, never cause a wrong one.
- **Rolling deploy.** The draining replica closes sockets with 1001
  (`ws-drain.ts`), deletes their rows in the socket finalizers, and does not
  release, because grace fibers are interrupted. Clients reconnect to a
  surviving replica, whose connect transaction renews their leases.
- **Event order.** The relay emits only contiguous cursor runs read from the
  log. This fixes the in-process ordering race described in §7.
- **Reconnect and resume on a different replica.** `WatchProtocol` resumes
  from `since` against the shared log. Leases follow the owner (§3.2). Write
  receipts make a retried `Submit` or `Create` replay instead of writing
  twice. They are keyed by draft and `requestId`, not by the caller, so a
  retry on another replica finds them. Staged imports follow once they are
  persisted (§6).

## 6. Staged imports

Today `ResourcesStage` keeps descriptors, bytes (up to 100 MB each) and API-key
secrets in the API process until the edit's `Submit` or `Create` promotes them
(`resources.ts:1-10`). The header comment records why: "a discarded stage leaves
nothing behind".

The proposal:

- **Bytes.** Write them to the object store under
  `staging/<teamId>/<uuid>` when staged.
- **Row.** Record a `protocol_staged_resources` row: team, draft, owner,
  edit id, resource id, request id, descriptor, object key, and the secret
  **sealed with `SecretsCipher`** and bound to the team and protocol, as #1900
  seals asset keys. Use the PK `(draft_id, owner, edit_id, resource_id)` and a
  unique `(draft_id, owner, edit_id, request_id)` constraint for `stage`
  idempotency.
- **Promotion.** Promotion re-keys the object to the final asset key inside
  the existing plan step, then deletes the row.
- **Discard and grace release.** Discard and the grace-expiry release delete
  rows and objects.
- **Abandoned staging.** The worker's `protocol-store-gc` cron sweeps rows
  whose owner has had no live connection for `IDLE_MS`. A bucket lifecycle
  rule on `staging/` is the backstop.

This also takes up to 100 MB per staged file out of API memory. Discarded
staging still leaves nothing behind, subject to GC latency after a crash.

## 7. Defects found that exist with one replica

1. **Restart drops every editor's lock.** After a deploy the new process's
   keeper is empty, and nothing reloads leases from the database. The client
   does not re-acquire (`hooks.ts:283-356`), so the lease expires at most 30 s
   later. The editor's next save is refused with `NotLockHolder`, and the
   editor discards its form (`hooks.ts:393-399`). The README's "reconnect and
   resume makes the interruption routine" holds for watching, not for
   editing. The connect-time renewal in §3.2 fixes this. It lands first, on
   its own: `WatchProtocol` renews the owner's live leases with `renewHeld`
   and hands them to the existing in-process keeper, before any of the
   multi-replica machinery exists.
2. **Fan-out ordering race.** Events are published after commit, from the
   committing fiber. If cursor `n+1` is published before `n`, the
   subscriber's `cursor <= last` filter (`handlers.ts:392`) **drops `n`
   permanently**. The window is rare with one process and routine across
   replicas. The relay in §4 fixes it.
3. **An expired lease leaves a stale lock indicator** for other editors. The
   reaper in §3.4 fixes it.
4. **Doc and comment drift.**
   - `leases.ts:20-23` cites a "0.5 s to 15.5 s" client reconnect ladder. The
     real socket ladder is Effect's default, `min(exponential(500, 1.5),
spaced(5 s))`, about 6.6 s over five attempts. The `WatchProtocol` loop
     is 0.25 s to 4 s (`protocol-builder/src/state/channel.ts:16`).
   - `docs/self-host/requirements.md:241-244` already implies that two API
     containers are fine.

## 8. Decision: persist staged imports

Decided 2026-10-07: staged imports are persisted as §6 describes, rather than
pinned to one replica with cookie affinity on `/ws`. Affinity would have been
cheaper, but it keeps today's "lost on deploy" behaviour and is the one thing
that would have kept a load-balancer requirement. Persistence removes the last
per-process state on the sync path.

## 9. Load balancer and hosting

After the change, **no sticky sessions are needed**. Each WebSocket is pinned
to one replica for its lifetime only because it is a TCP connection. Any
replica can serve the next one. The load balancer needs:

- **WebSocket upgrade support** on `/ws`. Traefik needs no configuration for
  this.
- **An idle timeout comfortably above the 5 s RPC ping.** Platforms that cap
  connection lifetime only cause reconnects, which become routine.
- **Readiness that fails while draining.** `/readyz` should return 503 once
  `WebSocketDrain.closing` opens, so new upgrades go elsewhere during the 5 s
  socket drain inside `stop_grace_period: 20s`. This is a small change in
  `http/health.ts`.
- **Valkey reachable from every API replica**, for live cross-replica updates.
- **For the compose stack:** the file-provider router names one server,
  `http://api:3000` (`docker-compose.yml:396-401`). Running `api` with
  `deploy.replicas > 1` needs Traefik's Docker provider, or one listed server
  per replica.

Hosting targets: this unlocks Azure Container Apps with more than one replica
and rolling deploys that do not interrupt editors. It does **not** by itself
make `serve` fit Azure Functions or Cloudflare Workers. Long-lived WebSockets
with a per-process liveness loop would there need Durable Objects or an
equivalent, which is a separate design.

## 10. Effort, risk, files, tests

**Effort:** about 2–3 focused weeks, as a single deliverable.

- Leases and connections, including the studio-sync statement: 3 days.
- Relay, doorbell and the `Valkey` service: 3 days.
- Presence and the reaper: 1.5 days.
- Staged-import persistence: 3 days.
- Health, readiness and docs: 1 day.
- The two-replica test harness and scenarios: 3 days.

**Risk:** medium.

- The sharp edges are the grace-versus-reconnect serialization (§3.2) and
  relay gap-filling (§4.1). Both have deterministic tests below.
- The schema change needs a migration now that `api/migrations/` exists
  (#1901).

**Files that change:**

- `packages/studio-sync/src/server.ts` (`renewHeld`)
- `apps/studio/api/src/protocol-builder/`: `schema.ts` (two tables), `leases.ts`
  (rewritten as local connections plus the liveness pass), `presence.ts`
  (database-backed), `publisher.ts` (relay), a new `doorbell.ts`, `host.ts`
  (connect, owner-wide release with the liveness check, reaper),
  `handlers.ts`, `session.ts`, `resources.ts`, `rpc.ts`
- `api/src/platform/valkey.ts` (extracted from `rate-limit/store.ts`), plus
  `http/health.ts` and `platform/ws-drain.ts`
- `api/src/audit/transaction-policy.ts` (new no-audit operations for
  connect, liveness, reap and staging)
- `api/src/jobs/handlers/protocol-store-gc.ts` (expired connection rows and
  staging)
- `api/migrations/`, a new migration
- a Studio-lane changeset

**Tests:**

- `studio-sync` (`src/__tests__/lease.test.ts`, using `helpers.ts`):
  - `renewHeld` renews only the owner's live leases.
  - It never resurrects an expired lease.
  - It leaves other owners untouched.
- API (`src/__tests__/support/protocol-builder.ts`, extended to build **N
  replicas**: separate `ProtocolBuilderState` layers over one database and one
  in-memory doorbell, with TestClock driving the timers and `forceExpire` the
  database expiry):
  1. Lease acquired on A, reconnect on B inside the grace period, advance past
     the grace period and the TTL. Lease still held, and the submit succeeds.
  2. No reconnect. Released after the grace period, and B's watcher sees the
     release event.
  3. Restart regression (§7.1): dispose a replica, build a new one, reconnect.
     Lease kept.
  4. Cross-replica revisions arrive in cursor order. Reordered and dropped
     doorbells are filled from the log, with no loss (§7.2).
  5. Presence is the union across replicas, and ghost rows expire.
  6. Replica "crash" (heartbeat stopped, no finalizers). Reaper events follow,
     and a reconnecting owner keeps its lease.
  7. Concurrent `AcquireLock` on A and B: exactly one is held.
  8. Stage on A, promote on B. Discard and GC delete row and object. The
     secret is never stored in plaintext.
  9. `/readyz` returns 503 during drain.
- `apps/studio/stack-test/`: a two-`api`-replica scenario. One editor
  reconnects across a `docker stop` of the replica it was on, and its next
  save is still written.

## 11. Documentation to update

- `apps/studio/README.md`:
  - The run-mode table (about line 1029): change `serve` "a single replica
    (#1247)" to "scalable; needs `REDIS_URL` for live cross-replica updates".
  - Deployment topologies (about lines 1281-1288): replace the
    single-replica paragraph with the liveness and relay model.
  - Live-session impact (about lines 1306-1308): editors keep their locks
    across a backend deploy.
  - The Valkey section: Valkey now also carries sync doorbells, still
    disposable.
  - The schema module list: add the new tables.
- `apps/studio/docs/self-host/requirements.md` (about lines 236-245): add
  `PUBLISH`/`SUBSCRIBE` to the command list. State what more than one API
  container requires.
- `apps/studio/docs/self-host/run.md` and `upgrade.md`: how to run more than
  one `api` (the Traefik provider change), and that upgrades no longer drop
  edit locks.
- `apps/studio/docs/topology.md` (about lines 135-150): `/ws` routing to N
  replicas.
- `apps/studio/api/src/protocol-builder/leases.ts`: correct the
  reconnect-ladder comment.
