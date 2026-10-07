# Studio API multi-replica sync: implementation plan

Design: `docs/superpowers/specs/2026-10-07-studio-api-multi-replica-sync-design.md`
(accepted). Base: `a98ddf5b5` (PR #2107, design §7.1 landed); F0 landed as
`f2f26dcda`. Branch: `feat/studio-multi-replica-sync`. Effect 4
(`effect@4.0.0`); read `node_modules/effect/AGENTS.md` before writing Effect
code.

Paths are relative to `apps/studio/api/` unless they start with `apps/`,
`packages/`, `docs/` or `.github/`. Abbreviations: `pb/` =
`src/protocol-builder/`, `T/` = `src/__tests__/`.

**Ground rules for every stream:**

- **No interim implementations and no stub exports.** knip runs on push.
- **Policy and allowlist tests are exact-match.** These are
  `src/audit/__tests__/policy.test.ts`,
  `src/audit/__tests__/scope-openers.test.ts` and
  `src/db/__tests__/raw-sql-policy.test.ts`. A stream adds or removes only
  its own keys and rows, in the same commit as the code that uses them. The
  streams that edit these files run serially (C1 → C2 → S).
- **New code adds no pooler hazards:**
  - no session-level advisory locks;
  - no LISTEN;
  - no session GUCs: tenant settings stay `set_config(…, true)`;
  - no reliance on connection affinity.

---

## 1. Corrections to the design (verified against the code)

1. **§3.3/§7.1 are done.** `renewHeld` and its tests exist
   (`packages/studio-sync/src/__tests__/lease.test.ts`). No studio-sync
   change is needed. The §7.4 comment drift in `pb/leases.ts:19-24` is fixed
   too; only the docs drift (§11) remains.
2. **The object store is content-addressed only**
   (`src/storage/object-store.ts`: `put/get/head`, keys `assets/<hash>`,
   `ObjectStoreError.operation ∈ 'put'|'get'|'head'`):
   - it has no delete, list, copy or arbitrary key;
   - no asset GC exists.

   Staging therefore extends the port and both backends (S).

3. **`SecretsCipher` has no general seal.** A staged secret needs its own
   identity and a `SECRET_STORES` entry, modelled on `protocol_asset_keys`
   (`bytea ciphertext` + `key_id`).
4. **The worker builds no `ObjectStore`, and serve has no
   `MaintenanceDatabase`.**
   - Staging GC runs in the worker, which must now build `ObjectStore` (it
     already shares `*studio-env`).
   - `T/process-separation.test.ts` forbids the worker from loading the
     host modules (`PROTOCOL_BUILDER_HOST` = `rpc|handlers|session|leases|
presence|publisher`). `pb/schema.ts` is outside that set and already
     reachable through `db/schema.ts`.
5. **Connection keys are per watch, not per socket or per owner.** One
   socket can carry several `WatchProtocol` streams.
   - Socket rows: `connection_id = ws:<socketUuid>:<watchUuid>`, with
     `socket_id = ws:<socketUuid>` for presence and `setMode`.
   - Contact rows (any `openSession`, on both planes):
     `unary:<owner>:<ReplicaId>`, one per `(draft, owner, replica)`. A
     replica only extends or expires its own.

   The design's `'unary'` kind is `'contact'`. Today's keeper renews any
   owner touched within `IDLE_MS`, ws-plane calls included, and a test
   relies on that.

6. **Close marks the row expired; it does not delete it.** Liveness is an
   `UPDATE` only, with no resurrecting `INSERT`. Grace re-checks the
   database instead of trusting the local view (§2.3).
7. **Presence lives in the socket row.** `Presence.join/leave` collapse into
   `Leases.connect`, and the `WsConnection` branch in `AcquireLock` goes
   away (`setMode` is an `UPDATE … WHERE socket_id = $`, a no-op on the
   unary plane).
8. **The reaper uses an in-memory lock map.**
   - A per-poll `DISTINCT ON` over the log is too costly, and `leases`
     cannot tell a clean release from an expiry.
   - The relay seeds a `section → owner` map once, keeps it up to date from
     relayed lock events, and checks only believed-held sections.
   - Migration 0002 adds the partial index `protocol_events (draft_id,
section_id, cursor DESC) WHERE kind = 'lock'` for the seed and the
     reaper recheck. The columns are verified in `pb/schema.ts`.
9. **Ghost presence never rings,** so the safety poll diffs presence.
10. **A new relay must fix `next` before `subscribe` returns,** or events
    between the relay's start and the backlog read are lost.
11. **Valkey subscriber.** The rate limiter's client (`retryStrategy: () =>
null`, 250 ms timeout) stays untouched. The doorbell opens its own
    subscriber connection with ioredis reconnects and re-subscribes itself
    on every `ready` (`autoResubscribe: false`: ioredis's own resubscribe
    never reports the server's confirmation, and `Resync` must follow it),
    plus a separate publish connection (`enableOfflineQueue: false`). Pub/sub
    ignores the DB number, so the channel is configurable.
12. **Compose keeps the file provider.** `docker-compose.yml` deliberately
    has no Docker socket, so it uses one named service per replica and a
    server list moved into its own config.
13. **`/readyz` draining.** `WebSocketDrain` gains `draining`. `HealthRoutes`
    reads it with `Effect.serviceOption` when the routes are built, so its
    `R` stays `HttpRouter` and the worker is untouched.
14. **The test clock is `makeShiftableClock()`, not `TestClock`.** Database
    time is real, so tests age rows with SQL instead of waiting (§3 C1).
15. **Test Valkey is shared and flushed by `reachableRedis(n)`.** Doorbell
    tests use per-test channels and never flush.
16. **Epoch-on-Submit is not needed.** Submit re-reads owner and liveness
    `FOR UPDATE` in the write transaction (`pb/host.ts` submit ~904, create
    ~1047).
17. **`protocol_events` reads need nothing new.** `readProtocolEvents`
    works in any `TenantScope.open`; the relay does not call
    `requireProtocol`.
18. **Content staging is refused earlier.** Persisting staging moves the
    "store not configured" refusal for content from promotion to stage.

---

## 2. Shared shapes

### 2.1 Tables (`pb/schema.ts`, migration `0002_studio_multi_replica_sync`, both owned by C1)

Both tables get a composite FK `(draft_id, team_id)` → `drafts` `ON DELETE
CASCADE`, `teamIsolationPolicy()`, an entry in `PROTOCOL_BUILDER_TABLES`,
and an entry in `PROTOCOL_BUILDER_SIDECAR_SQL = tenantTablesSql([...])`.
Table constants stay unexported until code imports them.

**`protocol_connections`**

- Columns:
  - `team_id`, `draft_id`, `connection_id`
  - `socket_id NULL`
  - `kind CHECK IN ('socket','contact')`
  - `owner`, `user_id`, `display_name`
  - `mode CHECK IN ('viewing','editing')`, `section_id NULL`
  - `replica_id`, `expires_at`
  - `created_at DEFAULT clock_timestamp()`
- PK `(draft_id, connection_id)`.
- Indexes:
  - `(team_id, draft_id, owner, expires_at)`: grace, renewal and the GC
    "no live row" test;
  - `(draft_id, socket_id)`;
  - `(expires_at)`: connection GC;
  - `(draft_id, expires_at) WHERE kind = 'socket'`: `livePresence` (its
    plan ranges the index over both columns).

**`protocol_staged_resources`**

- Columns:
  - `team_id`, `draft_id`, `owner`, `edit_id`, `resource_id`
  - `request_id`, `kind`
  - `descriptor jsonb`
  - `object_key NULL`, `content_hash NULL`, `byte_length NULL`,
    `content_type NULL`
  - `secret_ciphertext bytea NULL`, `secret_key_id NULL`
  - `created_at`
- PK `(draft_id, owner, edit_id, resource_id)`.
- Unique `(draft_id, owner, edit_id, kind, request_id)`. The kind is
  included because `resources.ts` keys idempotency on `kind\0requestId`.
- CHECKs: exactly one of `object_key`/`secret_ciphertext` is set; the
  secret's key id is present iff its ciphertext is.
- Index `(team_id, created_at)`: GC.

**`protocol_events` addition:** the partial lock index from correction 8.

Generate with `pnpm --filter @codaco/studio-api sync-fingerprint`, then
`pnpm --filter @codaco/studio-api migrate:generate --name
studio_multi_replica_sync`. There is no `backfill.sql`. Then run
`generate:erd` and `check:schema-docs`. S never regenerates the migration.

### 2.2 Final service shapes

`S` = `ProtocolBuilderSession`.

```ts
// pb/leases.ts (C1)
class Leases extends Context.Service<Leases, {
  readonly connect: (session: S,
      onReleased: (events: ReadonlyArray<LoggedProtocolEvent>) => Effect<void>)
    => Effect<void, SqlError, Scope.Scope>
  readonly contact: (session: S) => Effect<void>        // never fails; logs
  readonly connected: (owner: string) => Effect<boolean> // local view; C1 only, S deletes it
}>()
// layer: Layer<Leases, never, Database | MaintenanceTriggers>

// pb/presence.ts (C1)
class Presence extends Context.Service<Presence, {
  readonly setMode: (session: S, mode: 'viewing' | 'editing', sectionId?: string)
    => Effect<void, SqlError>
  readonly list: (session: S) => Effect<ReadonlyArray<PresenceEntry>, SqlError>
}>()

// pb/doorbell.ts (V)
const DoorbellMessage = Schema.Union([
  Schema.TaggedStruct('Advanced', { draftId: Schema.String, cursor: Schema.String }),
  Schema.TaggedStruct('Presence', { draftId: Schema.String }),
])
type DoorbellSignal = typeof DoorbellMessage.Type | { readonly _tag: 'Resync' }
class Doorbell extends Context.Service<Doorbell, {
  readonly ring: (message: typeof DoorbellMessage.Type) => Effect<void>  // never fails
  readonly signals: Effect<Stream<DoorbellSignal>, never, Scope.Scope>
  readonly subscribed: Effect<boolean>
}>() {
  static readonly layerMemory: Layer<Doorbell>
  static readonly layerValkey: (options: { url: string; channel: string }) => Layer<Doorbell>
  static readonly layer: Layer<Doorbell, never, Environment>   // REDIS_URL ? Valkey : memory
}
const makeMemoryDoorbell: Effect<Doorbell['Service'], never, Scope.Scope>

// pb/publisher.ts (C2)
class ProtocolEvents extends Context.Service<ProtocolEvents, {
  readonly publish: (session: S, entries: ReadonlyArray<LoggedProtocolEvent>) => Effect<void>
  readonly presenceChanged: (session: S) => Effect<void>
  readonly subscribe: (session: S)
    => Effect<Stream<LoggedProtocolEvent, SubscriberOverflow | RelayFailed>, SqlError, Scope.Scope>
  readonly subscribers: (draftId: string) => Effect<number>
}>()
// layer / layerWith({ safetyPollMs, maxConsecutiveFailures }):
//   Layer<ProtocolEvents, never, Database | Doorbell | MaintenanceTriggers>

// pb/resources.ts (S)
interface StagingEdit { readonly session: S; readonly editId: string }
class StagedImports extends Context.Service<StagedImports, {
  readonly stage: (edit, requestId: string, request: StageRequest)
    => Effect<ResourceOutcome<{ descriptor: Descriptor }>, SqlError>
  readonly descriptors: (edit) => Effect<ReadonlyArray<Descriptor>, SqlError>  // ORDER BY created_at, resource_id
  readonly plan: (edit, resourceIds: ReadonlyArray<string>)
    => Effect<ResourceOutcome<PromotionPlan>, SqlError>
  readonly discard: (edit, resourceId: string | undefined) => Effect<DiscardOutcome, SqlError>
  readonly inspect: (edit, assets: SectionDoc, resourceId: string)
    => Effect<ResourceOutcome<Inspection> | undefined, SqlError>
  readonly preview: (edit, assets: SectionDoc, resourceId: string)
    => Effect<ResourceOutcome<Preview> | undefined, SqlError>
  readonly releaseOwner: (session: S) => Effect<void>
}>()
```

### 2.3 Lease and connection transitions (C1, `pb/connections.ts`)

All arithmetic uses `clock_timestamp()`, except `livePresence`'s expiry
bound: it uses `now()` so the socket index can range over `expires_at`, and
its transaction is a single read.

**Lock order, the deadlock rule.** Every transaction takes its locks in one
total order:

1. the draft head (`drafts` row);
2. `protocol_connections` rows, ascending `connection_id`;
3. `leases` rows, ascending `section_id`.

A single-row writer still closes a cycle: one that holds a lease and then
waits on the head (or on a connection row) deadlocks against a transaction
that holds the head and waits on that lease. So the order binds every
locker, not only the multi-row ones.

- `connectSocket`, `upsertContact` and liveness take the head `FOR SHARE`;
  `releaseOwner` takes it `FOR UPDATE`. Each then locks connection rows (an
  ordered `SELECT … FOR UPDATE`, or the upsert's own row), then the owner's
  leases in one ordered statement (`lockOwnerLeases`), and only then calls
  `sync.renewHeld` or `sync.release`.
- `setSocketMode` and `expireConnection` lock only connection rows (ordered)
  and wait on nothing after them, so they skip the head.
- `sync.acquire`, `sync.commit` and the host's writes take the head before
  any lease.
- `discardDraft` takes the head `FOR UPDATE`, then the cascade reaches leases
  and connections. Holding the head exclusively, it waits on no one who
  holds a row it needs.

Liveness is **one transaction per draft**. It renews the replica's own rows
(`replica_id = ReplicaId`) and the leases of their owners. `40P01` and any
other failure is logged and retried next tick, and registrations are kept.
A draft whose head is gone is forgotten: its registrations are dropped.

```ts
ReplicaId: Context.Reference<string>                 // randomUUID() per process; tests give one per client
contactKey(session: S, replicaId: string): string    // `unary:<owner>:<replicaId>`
connectSocket(session: S, key: string): Effect<boolean, SqlError, Database>
  // noAuditTransaction('protocolBuilder.connect'): FOR SHARE head (false if gone);
  // upsert socket row as viewing; lockOwnerLeases + renewHeld; then mode/section
  // from the first held lease by section_id
renewConnections(access: TeamAccess, draftId: string, local: ReadonlyArray<LocalRegistration>)
  : Effect<Liveness, SqlError, Database>
  // 'protocolBuilder.liveness': FOR SHARE head (gone if missing); SELECT own live
  // rows among `local` ORDER BY connection_id FOR UPDATE; extend them (socket:
  // now + TTL, contact: greatest(expires_at, …)); lockOwnerLeases + renewHeld per
  // owner. Rows not found are `missing`; the caller re-runs connectSocket (socket)
  // or upsertContact (contact) for each, each in its own transaction.
upsertContact(session: S): Effect<boolean, SqlError, Database>  // 'protocolBuilder.contact'; false if gone
expireConnection(registration: LocalRegistration): Effect<void, SqlError, Database>
releaseOwner(session: S): Effect<OwnerRelease, SqlError, Database>
  // 'protocolBuilder.releaseOwner': FOR UPDATE head (a gone draft releases nothing);
  // if a live socket row exists for (draft, owner) → { released: false }; else
  // lockOwnerLeases, release each live lease, append lock-null events
livePresence(access: TeamAccess, draftIds: ReadonlyArray<string>)
  : Effect<ReadonlyMap<string, ReadonlyArray<PresenceEntry>>, SqlError, Database>
  // live socket rows, one entry per socket_id (editing wins), sessionId = socket_id
setSocketMode(session: S, mode, sectionId?): Effect<void, SqlError, Database>
  // only the caller's own rows on its socket (socket_id and owner); socket callers only
type Liveness = { readonly gone: true } | { readonly gone: false; readonly missing: ReadonlyArray<LocalRegistration> }
type OwnerRelease =
  | { readonly released: true; readonly events: ReadonlyArray<LoggedProtocolEvent> }
  | { readonly released: false }
```

**`released` means "no live socket row for the owner"**, not "at least one
lease was released". It gates the staging release.

**`Leases` local state.** Socket registrations, each with its own
one-permit semaphore; contact registrations per `(draft, owner)`; graces per
`(draft, owner)`. `LocalRegistration = {session, key, kind}`.
`Leases.connect` returns `void`.

- **`connect`:**
  1. mint `<connectionId>:<watchUuid>`;
  2. `connectSocket`; if the draft is gone, register nothing;
  3. register locally;
  4. only now interrupt a pending grace for the owner, so a reconnect that
     failed to be recorded leaves the grace to give the leases back;
  5. scope finalizer: unregister → `expireConnection` under the
     registration's semaphore (best-effort) → fork the grace into the layer
     scope, deduped per `(draft, owner)`.
- **One grace per closure, on the replica whose socket closed:**
  `sleep(RECONNECT_GRACE_MS)` → drop the owner's local contact registration →
  `releaseOwner`:
  - `released: false` (the owner has a live socket elsewhere) → the grace
    ends, with no re-sleep. The replica holding that socket runs a whole
    grace of its own when it closes.
  - `released: true` → `onReleased(events)`;
  - failure → retried with a bounded exponential backoff (0.5 s doubling,
    5 retries, 15.5 s in all), then logged (the leases lapse at TTL; C2's
    reaper publishes). Shutdown and maintenance closure still stop it.
- **Mode updates:** AcquireLock and ReleaseLock change presence only for a
  caller on a socket (`WsConnection`), retried with the same backoff, then
  logged. A unary caller's connection id is its login's session id, which
  every HTTP watch of that login carries as its socket id too.
- **Tick:** `Schedule.spaced(RENEW_INTERVAL_MS)`, per draft →
  `renewConnections`, then re-connect the missing. A socket's re-record runs
  under its registration's semaphore and re-checks the registration there,
  so a re-record cannot commit after the close's expiry and leave a live row
  nothing renews.
- **`contact`:** `upsertContact`, throttled to once per 30 s per `(draft,
owner)`, then a local contact registration until `IDLE_MS`.
- **Maintenance closure:** when `MaintenanceTriggers.closure` is a
  non-migration closure (`socketClosure` in `pb/rpc.ts:64`, moved to a
  shared module that `rpc.ts` and `leases.ts` import), the tick, `contact`
  and `releaseOwner` are skipped.
- **Shutdown:** layer shutdown interrupts graces; a draining replica never
  releases.

---

## 3. Workstreams

### F0: split the protocol-builder suite (done, `f2f26dcda`)

70 tests, split across:

- `T/rpc-protocol-builder.test.ts`
- `T/rpc-protocol-builder-leases.test.ts`
- `T/rpc-protocol-builder-events.test.ts`
- `T/rpc-protocol-builder-resources.test.ts`

The fixture is `T/support/protocol-builder-suite.ts`. Its late-bound values
are getters, which each file copies in its own `beforeAll`.

### C1: foundation + leases, connections, presence (serial, main worktree)

**Owns:**

- Schema and migration:
  - `pb/schema.ts` (§2.1);
  - `src/db/fingerprint.generated.ts`;
  - `migrations/0002_studio_multi_replica_sync/`;
  - the ERD block.
- New code:
  - new `pb/connections.ts` (§2.3);
  - the shared `socketClosure` module.
- Rewrites:
  - `pb/leases.ts`, `pb/presence.ts`;
  - `pb/host.ts` lease section: delete `renewLease`, `adoptLeases` and
    `releaseConnection`; `releaseLock` returns `{events, stillHeld}`, with
    `stillHeld` read from `leases` in the same transaction.
- Rewiring in `pb/handlers.ts`, `pb/session.ts` and `pb/rpc.ts`:
  - `openSession`: `leases.contact(session)`. `staged.touch/expire` stay,
    and `expire` keeps calling `leases.connected`.
  - WatchProtocol:
    1. `subscribe`
    2. backlog
    3. `addFinalizer(publishPresence)`
    4. `leases.connect(session, onReleased)`
    5. `publishPresence`
  - `onReleased(events)` = `staged.releaseMatching(ownerPrefix)` →
    `publish(events)` → `publishPresence`, running only when `released`.
  - AcquireLock: `presence.setMode(…'editing'…)`; no `leases.hold`.
  - ReleaseLock: mode from `stillHeld`.
- Policy and allowlists:
  - `src/audit/transaction-policy.ts`: add `protocolBuilder.connect`,
    `.liveness`, `.contact`, `.expireConnection`, `.releaseOwner`; remove
    `protocolBuilder.releaseConnection`;
  - its rows in `raw-sql-policy.test.ts` and `scope-openers.test.ts`;
  - `T/process-separation.test.ts`: add `connections` to
    `PROTOCOL_BUILDER_HOST` and the web-only list.
- Test support:
  - `T/support/protocol-builder.ts`: provide `MaintenanceTriggers.layerOpen`
    beneath state;
  - `T/support/protocol-builder-suite.ts`: the helpers below.
- Tests:
  - `pb/__tests__/leases.test.ts`, `presence.test.ts`, `session.test.ts`;
  - `T/rpc-protocol-builder-leases.test.ts`, `T/ws-protocol-builder.test.ts`,
    `T/rpc-protocol-reauthorization.test.ts`.

Publisher and staging keep their behaviour; only call sites whose interface
changed move.

**Test helpers** (suite fixture). Database time is real, so tests never wait
out a TTL.

- `ageLeases(owner, byMs)` / `ageConnections(match, byMs)`: `UPDATE …
SET expires_at = clock_timestamp() + interval '2 s'` (or `- …` to lapse).
- `leaseExpiry(owner)` / `connectionRows(draftId)`: reads.
- `liveLeases(owner)`: replaces `Leases.heldSections`.
- Renewal-count seam: a span-recording `Tracer` layer provided beneath
  `ProtocolBuilderState`, so forked fibers inherit it. It counts
  `protocolBuilder.liveness` and `sync.renewHeld` spans. This replaces the
  deleted `hold` counting with no production seam.

**Tests:**

- every moved lease and presence test is green, reading database
  observables;
- I2, I12, I13, I17, I18, I19 and I15b from §5.

**Behaviour change in the moved "stops renewing a stranded owner's leases
even when giving them back fails" test.** When every attempt of
`releaseOwner` fails, staging is no longer released immediately (it was
released before the attempt). It stays until GC. Renewal still stops,
because contact registrations are dropped before the first attempt. The
test steps through each backoff, then asserts exactly `RETRY_TIMES + 1`
attempts, no further `sync.renewHeld` spans and an unchanged `leaseExpiry`.

### V: doorbell transport and readiness (parallel with C1; own worktree from `f2f26dcda`; merged before C2)

**Owns:**

- `pb/doorbell.ts` (§2.2);
- `src/platform/ws-drain.ts` (`draining: Effect<boolean>` = latch
  `isOpen()`; `layerTest` → `false`);
- `src/http/health.ts`;
- the boot-warning text at `src/rate-limit/store.ts:49-51`: add that
  cross-replica protocol-builder updates fall back to the 5 s poll. No
  other rate-limit change;
- `T/health.test.ts`, `src/platform/__tests__/ws-drain.test.ts`, new
  `T/doorbell-valkey.test.ts`.

**Shapes:**

- `layerValkey`:
  - one subscriber `Redis` (`connectionName: 'studio-doorbell'`, ioredis
    default reconnect with capped backoff, `autoResubscribe: false`, an
    explicit `SUBSCRIBE` on every `ready`, and a periodic `PING` that forces
    a reconnect on a half-open socket). ioredis's automatic resubscribe
    gives no confirmation event, which `Resync` needs;
  - one publisher `Redis` (`enableOfflineQueue: false`);
  - every `subscribe` confirmation emits `Resync`;
  - `ready`/`close` drive `subscribed`;
  - payloads are decoded with
    `Schema.decodeUnknownOption(Schema.fromJsonString(DoorbellMessage))`;
    undecodable ones are dropped.
- `ring` = `PUBLISH`; its errors are logged, never raised.
- Default channel `studio:protocol-events`.
- `/readyz`: `Effect.serviceOption(WebSocketDrain)` is read once in
  `HealthRoutes`. When draining it answers `503 {status:'failing',
checks:{…, draining: 'failed: draining'}}`. The worker and `router.ts`
  are untouched. V wires `Doorbell` into no program.

**Tests:**

- `/readyz` is 200, then 503 after `drain` starts (§10 #9);
- `ws-drain` `draining` flips;
- Valkey (real server, channel `studio:protocol-events:<uuid>`, no
  `reachableRedis`, so no flush):
  - ring on A arrives at B;
  - `CLIENT KILL TYPE pubsub` → `subscribed` goes false then true, and
    `Resync` arrives;
  - a garbage payload is ignored;
  - `layerMemory` hub fan-out.

### C2: the relay (serial, after C1 and V)

**Owns:**

- `pb/publisher.ts`;
- additions to `pb/connections.ts`:
  - `seedRelay(access, draftId) → {next, locks}`: **one statement**, a
    `max(cursor)+1` subquery plus `DISTINCT ON (section_id)` over the
    partial index, so both come from one snapshot;
  - `liveSections(access, pairs) → ReadonlySet<draftId:sectionId>`;
  - `reapExpired(access, draftId, candidates) → events` (`FOR UPDATE`
    head; per candidate, latest lock event has a holder AND no live lease
    → append release);
  - `readRelayBatch(access, wants: ReadonlyArray<{draftId, next}>)` (one
    statement, `unnest` join, `ORDER BY draft_id, cursor`);
- wiring `Doorbell` into `ProtocolBuilderState` and every provider:
  - `src/http/router.ts`, `src/programs/serve.ts` (both
    `withDatabase` and `withoutDatabase`: `Doorbell.layer`);
  - `T/support/serve.ts`, `T/support/protocol-builder.ts` (`doorbell?`
    option, default `layerMemory`);
  - `T/maintenance-authority.test.ts`;
- handlers:
  - `publish`/`presenceChanged`/`subscribe(session)`;
  - catch `RelayFailed` like `SubscriberOverflow`, with `Stream.die` so the
    client resubscribes;
  - the doorbell readiness check in serve's checks: `'degraded'` when
    configured and unsubscribed;
- policy and allowlists: `protocolBuilder.relayRead` and
  `protocolBuilder.reap`, plus their allowlist rows; `doorbell` and
  `connections` in `PROTOCOL_BUILDER_HOST` if loaded by web only;
- tests: `pb/__tests__/publisher.test.ts`,
  `T/rpc-protocol-builder-events.test.ts`.

**Relay shape (per draft, with ≥1 local queue):**

- **State:** `access`, `next`, `queues` (bounded 1024; overflow →
  `SubscriberOverflow`), `locks`, `lastPresence`, and dirty flags
  `{events, presence}` behind a `Ref`, plus a void wake signal. There is no
  payload in the wake, so nothing can be lost.
- **`subscribe`:** register the queue; if the relay is new, `seedRelay`,
  then fork the fiber into the layer scope; return the stream. The relay
  stops when its last queue leaves.
- **Wake path (per draft):** read from `next` → offer the contiguous run →
  advance `next` → update `locks`. On a presence flag, run `livePresence`
  and emit if it changed.
- **Safety poll** (`safetyPollMs`, default 5 s), **batched per team:**
  - one transaction for `readRelayBatch`, `livePresence(draftIds)` and
    `liveSections`;
  - then `reapExpired` only for drafts with candidates; those reaper events
    are rung.
- **Failure:** each iteration is caught and logged, and retried on the next
  wake or poll. After `maxConsecutiveFailures` (default 5), fail every queue
  of that draft with `RelayFailed` and drop the relay.
- **Publishing:** `publish` sets the local dirty flag and wakes, then forks
  `doorbell.ring(Advanced)` into the layer scope, off the write path.
  `presenceChanged` does the same with `Presence`.
- **Doorbell signals:** one fiber per layer consumes `doorbell.signals`;
  `Resync` dirties every relay.
- **Maintenance closure:** reads and the reaper are skipped (§2.3).

**Tests:**

- moved fan-out tests;
- I4a, I4b, I6b, I7b, I20 and I21 from §5.

### S: persistent staging (serial, after C2)

**Owns:**

- `pb/resources.ts`, new `pb/staging-store.ts`;
- `pb/host.ts` submit/create: delete the promoted staged rows **inside**
  the write transaction; only object deletes run after commit;
- `pb/handlers.ts`: Resources* routing to §2.2 and Submit/Create
  `plan`. `onReleased` calls `staged.releaseOwner`;
- `pb/session.ts`: remove `staged.touch/expire`;
- `pb/leases.ts`: delete `connected`, whose only caller goes away;
- object store:
  - `src/storage/object-store.ts`;
  - `storage/s3/object-store-s3.ts` (`DeleteObject`, `ListObjectsV2`,
    `CopyObject`);
  - `storage/azure-blob/object-store-azure-blob.ts` (`deleteBlob`,
    `listBlobsFlat`; copy only if same-account authorization is verified,
    otherwise fall back);
  - `storage/__tests__/contract.ts` (per-test key prefix);
- every `ObjectStore.of` fake:
  - `T/assets.test.ts`;
  - the suite fixture stub;
  - `T/rpc-participant-address.test.ts`;
  - `src/interview/__tests__/procedures.test.ts`;
  - `src/rpc/__tests__/team-scope.test.ts`;
  - `ObjectStore.absent`;
- secrets:
  - `src/secrets/cipher.ts`: `seal/open/resealStagedSecret`, identity
    `['staged-secret', teamId, draftId, owner, resourceId]`;
  - `src/secrets/stores.ts`: a `SECRET_STORES` entry modelled on
    `protocolAssetKeysStore`;
  - `rotate.test.ts`, `no-plaintext-at-rest.test.ts` (seed changes if
    needed), `stores.test.ts`;
- worker:
  - `src/programs/worker.ts` builds `ObjectStore`;
  - new `src/jobs/handlers/staged-resources-gc.ts`, importing only `db/`,
    `storage/` and `pb/schema.ts`, all outside `PROTOCOL_BUILDER_HOST`. It
    is called from `protocolStoreGc` after `gcProtocolStore`, with errors
    caught and logged at error level. `gcProtocolStore`'s signature, the
    registrations and studio-sync stay unchanged. It reads `ObjectStore`
    via `Effect.serviceOption`, so the handler's `R` stays
    `MaintenanceDatabase`;
- policy: `protocolBuilder.stageResource`, `.readStaged`,
  `.discardStaged`, `.releaseStaged`, `protocol.gcStagedResources`,
  `protocol.gcProtocolConnections`, plus their allowlist rows;
- tests: `T/rpc-protocol-builder-resources.test.ts`, the gc test, and the
  backend tests.

**Port shapes:**

```ts
// ObjectStoreError.operation: + 'delete' | 'list'
type StagingKey = string & Brand<'StagingKey'>   // staging/<teamId>/<uuid>, minted only in staging-store.ts
putStaged(key: StagingKey, bytes: Uint8Array, mediaType: string): Effect<void, ObjectStoreError>
getStaged(key: StagingKey): Effect<Option<Uint8Array>, ObjectStoreError>
deleteStaged(key: StagingKey): Effect<void, ObjectStoreError>               // idempotent
listStaged(prefix: string, olderThan: Date): Effect<ReadonlyArray<StagingKey>, ObjectStoreError>
promoteStaged(key: StagingKey, hash: string, mediaType: string): Effect<void, ObjectStoreError>
  // head assets/<hash> → present: skip; else backend.copy if defined, else get + write
// ObjectBackend: + remove(key, signal), list(prefix, olderThan, signal), copy?(from, to, signal)
```

**Behaviour:**

- **`stage`:**
  1. Return the existing descriptor on a unique-key hit.
  2. Validate: empty, too large, store configured for content.
  3. Content: compute the sha256 → `putStaged` → insert the row (with
     `content_hash`). Secret: seal → insert.
  4. On a unique race, delete our object and return the winner's
     descriptor.
- **`plan`:**
  - content: `promoteStaged(key, hash)` → `storedSource(hash, filename)`;
  - secret: `openStagedSecret` → `entries.value`, as today;
  - object-store failures keep today's retryable `ResourceOutcome`.
- **Submit/create:** the write transaction deletes the promoted rows
  `RETURNING object_key`; `deleteStaged` runs after commit, best-effort.
- **`discard` and `releaseOwner`:** delete the objects, then the rows.
- **`inspect`:** open the secret. **`preview`:** `getStaged` → `data:` URL.
- **GC** (worker, per team, `noAuditMaintenanceTransaction`):
  1. Select staged rows with **no `protocol_connections` row for `(draft,
owner)` where `expires_at > clock_timestamp() - IDLE_MS`**.
  2. Delete each object, **then** the row.
  3. Orphan sweep: `listStaged('staging/<teamId>/', now - 1 day)` minus
     keys with rows → delete.
  4. Delete connection rows expired more than 1 h ago.
  5. Skip all object work when `!configured`.

**Tests:**

- moved staging tests;
- restart persistence (stage, dispose the client, new client, promote);
- I9, I10a-c from §5;
- contract: staged round-trip, idempotent delete, `list` honours prefix and
  age, `promoteStaged` skips an existing asset;
- rotation reseals a staged secret.

### H: N-replica harness and scenarios (after S)

**Owns:** `T/support/protocol-builder.ts` (additions) and new
`T/protocol-builder-replicas.test.ts`.

```ts
createProtocolBuilderReplicas(studio, {
  count: number; clock?: ShiftableClock; objectStore?: ObjectStore['Service'];
  doorbell?: (replica: number, hub: Doorbell['Service']) => Doorbell['Service'];
  safetyPollMs?: number;
}): Promise<{ replicas: ProtocolBuilderTestClient[];
              crash(i: number): Promise<void>;     // swap i's Database for a refusing one, then close its scope
              restart(i: number): Promise<ProtocolBuilderTestClient>;
              dispose(): Promise<void> }>
```

**Scenarios (§10 1-8):** each ages rows with the C1 helpers and asserts
database observables.

1. Acquire on A, A's watch ends, B reconnects within grace, then grace
   elapses with `ageLeases(+2 s)`. B's tick advances `leaseExpiry`, and
   Submit via B succeeds.
2. No reconnect → after grace, B's watcher sees lock-null.
3. Dispose A (orderly), `restart(0)`, reconnect → lease kept, no lock-null
   in the log.
4. Interleaved writers on A and B, with B's doorbell reordering and
   dropping 50% → every watcher sees contiguous cursors.
5. Presence on A and B lists both. `crash(1)`, then `ageConnections` →
   B's entry disappears by the next poll.
6. `crash(0)` while holding, then `ageLeases` to lapse → B's reaper emits
   lock-null. Variant: reconnect on B first → kept, no reaper event.
7. Concurrent AcquireLock on A and B → exactly one `held`.
8. Stage on A, promote on B → asset committed, staged row and object gone.

### D: deployment, stack-test, docs, changeset (drafts now in own worktree; final after H)

**Owns:**

- `apps/studio/docker-compose.yml`:
  - move the `api` server list into its own config;
  - add a Traefik `loadBalancer.healthCheck` on **`/healthz`** (the api's
    own healthcheck path, `docker-compose.yml:197`; liveness, not readiness;
    see Q2).
- Stack-test:
  - `apps/studio/stack-test/variants/two-api.yml` (`api-b` extending
    `api`; server list `api:3000`, `api-b:3000`);
  - `lib.sh` `VARIANTS`, an `assert.sh` two-api block, the stack-test
    README;
  - the `studio-stack` job in `.github/workflows/ci-and-release.yml`
    (up/assert + teardown steps);
  - `scripts/ci/ci-workflow.test.mjs`: exact variant list, teardown count.
- Docs:
  - design §11;
  - `docs/self-host/requirements.md` ~165-180: the S3 operations table
    gains `DeleteObject`, `ListObjectsV2`, `CopyObject`, and "no listing,
    no deletion" is rewritten;
  - `swap.md` ~144: the worker identity now also opens the container and
    needs blob delete and list. Storage Blob Data Contributor already
    grants them; say so;
  - `upgrade.md`: an IAM step for S3 policies;
  - `apps/studio/README.md` ~708: the secrets table gains staged secrets;
  - the Valkey section gains `PUBLISH`/`SUBSCRIBE`;
  - never hand-edit the generated schema-docs block.
- The Studio-lane changeset (`@codaco/studio-api`).

**Stack-test scenario.** It uses the `rpc` helper and cookie jar, and polls
for state rather than sleeping.

1. `stop api-b`.
2. Sign in; `protocols.create`; read a section id.
3. `AcquireLock` with a fixed client-session header.
4. `start api-b`; poll until healthy.
5. `stop api`; poll until requests are served (by api-b).
6. `ListSections` every 5 s until 40 s have passed since the acquire.
7. `Submit` succeeds. Without contact renewal it returns `NotLockHolder`
   (I15).

**CI budget.** The last successful `studio-stack` run took 6.9 min (warm
cache) against `timeout-minutes: 40`. One more variant adds ~2 min, so no
raise is needed. D rechecks against a cold-build run before finalising.

---

## 4. Ordering

```
F0 (done) ─┬─ C1 (main worktree) ───────┐
           └─ V (own worktree) ─ merge ─┴─ C2 ─ S ─ H ─ D final ─ PR
D drafts in its own worktree throughout.
```

- C1, C2 and S each run their own test files plus `pnpm agent:test`.
- Only the final integration runs `pnpm --filter @codaco/studio-api test`.
- No stream edits another's files while that stream is open.

---

## 5. Invariants and oracles

To prove each oracle can fail: apply its mutation once, see red, then
revert.

| #    | Invariant                                                                                                                      | Test                                           | Observable                                                                     | Mutation                                                        |
| ---- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| I1   | Reconnect on any replica keeps the owner's live leases                                                                         | H#1, H#3                                       | `leaseExpiry` advances after reconnect; Submit succeeds                        | drop `renewHeld` from `connectSocket`                           |
| I2   | Grace never releases while the owner has a live socket row                                                                     | C1 leases                                      | no lock-null event; `liveLeases` unchanged                                     | remove the live-socket check in `releaseOwner`                  |
| I3   | Renewal never resurrects an expired lease                                                                                      | studio-sync `lease.test.ts` (exists)           | `renewHeld` returns `[]` after `forceExpire`                                   | drop the expiry predicate                                       |
| I4a  | Contiguous cursors despite reordered or dropped rings                                                                          | H#4                                            | per-watcher cursor sequence has no gaps                                        | offer only the ringing cursor's row                             |
| I4b  | Event committed between `subscribe` and backlog arrives once                                                                   | C2 events                                      | exactly one delivery of cursor n                                               | fix `next` lazily in the fiber                                  |
| I5   | At most one holder per section                                                                                                 | H#7                                            | one `held`, one `readOnly`                                                     | let `acquire` ignore a live foreign lease (local only)          |
| I6a  | Presence is the union across replicas                                                                                          | H#5                                            | both sessionIds listed                                                         | filter `livePresence` by `ReplicaId`                            |
| I6b  | Ghost presence clears without a ring                                                                                           | C2 events                                      | presence event without the aged row                                            | emit presence only on rings                                     |
| I7a  | Crash: unreleased expired lease gets lock-null                                                                                 | H#6                                            | lock-null event after `ageLeases`                                              | skip `reapExpired` in the poll                                  |
| I7b  | Reaper is idempotent across replicas                                                                                           | C2 events (two relays)                         | exactly one lock-null                                                          | drop the recheck under `FOR UPDATE`                             |
| I8   | Disposed or draining replica appends no release                                                                                | H#3                                            | no lock-null in the log                                                        | run `onReleased` on grace interruption                          |
| I9   | Staged secret never plaintext at rest                                                                                          | `no-plaintext-at-rest.test.ts`                 | scan finds no plaintext                                                        | store `request.value` unsealed                                  |
| I10a | Promotion removes row (in tx) and object (after)                                                                               | S, H#8                                         | row gone at commit; stub records `deleteStaged`                                | delete rows after commit instead of in tx (test kills between)  |
| I10b | Discard removes object then row                                                                                                | S                                              | both gone                                                                      | skip `deleteStaged`                                             |
| I10c | GC removes abandoned, keeps live owners                                                                                        | gc test                                        | row+object gone / kept                                                         | invert the live-row predicate                                   |
| I11  | `/readyz` 503 while draining                                                                                                   | `T/health.test.ts`                             | status code                                                                    | `draining: Effect.succeed(false)`                               |
| I12  | Failed liveness pass keeps registrations                                                                                       | C1 leases (faulty `Database`)                  | next healthy tick advances `leaseExpiry`                                       | delete registrations on pass failure                            |
| I13  | Stranded owner stops renewing on the grace's replica even if every release fails                                               | C1 leases                                      | `RETRY_TIMES + 1` attempts; no new `sync.renewHeld` spans                      | drop contact registrations only after a successful release      |
| I14  | Migration path equals push path                                                                                                | `migrations-converge.test.ts`, fingerprint     | equality                                                                       | edit `schema.ts` without regenerating                           |
| I15a | Contact keeps a unary owner's lease across a replica stop                                                                      | D stack-test                                   | Submit succeeds                                                                | skip `upsertContact`                                            |
| I15b | Contact lease lapses after `IDLE_MS` silence                                                                                   | C1 leases                                      | span count stops; `ageLeases` lapse → `readOnly` for others                    | renew contact rows forever                                      |
| I16  | Valkey resubscribe triggers a read                                                                                             | V Valkey test, C2 (poll 60 s)                  | `Resync` signal; event delivered before poll                                   | omit `Resync` on resubscribe                                    |
| I17  | Two watches on one socket: ending one does not release                                                                         | C1 leases                                      | no lock-null; other watch's row live                                           | key rows by socket instead of watch                             |
| I18  | A grace that finds the owner's socket live elsewhere ends; that replica's grace releases a whole grace after its socket closes | C1 leases                                      | A: no release span after 10× grace; B: no release at grace − 1 s, one at grace | re-sleep and retry on `released: false`; ignore the live socket |
| I19  | Liveness re-creates a missing live row via `connectSocket`                                                                     | C1 leases                                      | row exists after tick following an external expire                             | treat `missing` as success                                      |
| I20  | Relay failure fails queues after N tries; transient failure recovers                                                           | C2 events (faulty `Database`)                  | stream dies with `RelayFailed` after N; recovers below N                       | never fail queues / fail on first error                         |
| I21  | Maintenance closure stops relay, liveness, contact, reaper writes                                                              | C1 + C2 with a closing `MaintenanceTriggers`   | no liveness/relay spans while closed                                           | ignore `closure`                                                |
| I22  | Liveness and contact take the draft head before any connection or lease row                                                    | C1 leases (a second connection holds the head) | the waiter holds no `protocol_connections` or `leases` lock (`pg_locks`)       | drop or move the head lock                                      |
| I23  | A reconnect that fails to be recorded keeps the grace                                                                          | C1 leases (a trigger refuses the row)          | grace still pending; lease released after it                                   | interrupt the grace before `connectSocket`                      |
| I24  | A watch closing during its re-record leaves no live row                                                                        | C1 leases (own pool, held row)                 | no live row for the key                                                        | expire outside the registration's semaphore                     |
| I25  | Mode changes touch only the caller's own rows, and only from a socket                                                          | C1 presence                                    | the other tab's or HTTP watch's row unchanged                                  | drop the owner predicate; drop the `WsConnection` skip          |

---

## 6. Risks and open questions

- **Q1 Orphan objects.** A crash after `putStaged` but before the insert,
  or after commit but before `deleteStaged`, leaves an object that only the
  daily-age orphan sweep removes. Is a 1-day floor acceptable for possibly
  sensitive rosters?
- **Q2 Traefik health checks.** The compose health check uses `/healthz`,
  so a draining replica stays in rotation for its 5 s drain and relies on
  close-1001 plus client reconnect. `/readyz` would also pull every replica
  on a database or object-store outage. Confirm this choice.
- **Q3 Valkey degradation.** With Valkey down, `/readyz` says `degraded`
  and latency falls to the poll. Confirm `degraded` rather than `failing`.
- **Q4 Azure server-side copy.** Same-account copy under managed identity
  needs source authorization. Until verified, promotion falls back to read
  and write.
- **Risk: a stalled replica.** One paused past the TTL loses its owners'
  leases, and I3 prevents resurrection. Its next liveness pass finds its
  rows lapsed and re-records each socket row, with no leases behind it: the
  tab is listed as viewing and must take its locks again. This is accepted,
  same as a crash.
- **Risk: I13 holds only on the replica running the grace.** Another
  replica holding a contact for the same owner keeps renewing until that
  contact idles out (`IDLE_MS`).
- **Risk: a blip inside another replica's grace.** If the owner's socket on
  B closes and has not yet come back when A's grace ends, A finds no live
  socket and releases, although B's own grace would have waited. Accepted:
  the window is the reconnect itself.
- **Risk: re-authorization only on delivered entries.** An idle watch of a
  removed member keeps renewing until the next event. This is
  pre-existing; flag it, do not fix it here.
- **Out of scope: making the existing DB client pooler-safe.** This is
  pre-existing, and the user decides separately. It covers:
  - role and `statement_timeout` startup parameters;
  - named prepared statements;
  - the worker's LISTEN;
  - migrate's session advisory lock.

  This plan adds none of these.
