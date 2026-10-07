# Studio API multi-replica sync: implementation plan

Design: `docs/superpowers/specs/2026-10-07-studio-api-multi-replica-sync-design.md`
(accepted). Base: `a98ddf5b5` (PR #2107, design §7.1 landed). Branch:
`feat/studio-multi-replica-sync`. Effect 4 (`effect@4.0.0`); read
`node_modules/effect/AGENTS.md` before writing Effect code.

Paths below are relative to `apps/studio/api/` unless they start with
`apps/`, `packages/` or `docs/`. `pb/` = `src/protocol-builder/`,
`T/` = `src/__tests__/`.

---

## 1. Corrections to the design (verified against the code)

1. **§3.3 / §7.1 are done.** `renewHeld` exists in
   `packages/studio-sync/src/server.ts` with tests in
   `packages/studio-sync/src/__tests__/lease.test.ts` (only owner, never
   resurrects, other owners untouched). WatchProtocol already adopts. **No
   studio-sync change is needed**; drop it from §10's file list.
2. **§7.4 comment drift is already fixed.** `pb/leases.ts:19-24` already
   states the ~6.6 s socket ladder and the 0.25–4 s watch loop. Only the
   README/docs drift (§11) remains.
3. **The object store cannot hold `staging/<teamId>/<uuid>`.**
   `src/storage/object-store.ts` is content-addressed only (`put(bytes,
mediaType) → {hash}`, `get(hash)`, `head`, keys `assets/<hash>`). It has
   no delete, no arbitrary key, and no copy. Nothing in the repo GCs asset
   blobs. Staging needs a port extension (`putStaged/getStaged/deleteStaged`
   - backend `remove`) in **both** backends (`storage/s3/`,
     `storage/azure-blob/`) and in `storage/__tests__/contract.ts`. "Re-key on
     promotion" becomes "read staged bytes → `put` (content hash) → delete the
     staged object after commit". There is no server-side copy.
4. **`SecretsCipher` has no general seal by design** (`src/secrets/cipher.ts`
   is identity-bound per store). Add a `staged-resource` identity
   (`sealStagedSecret/openStagedSecret/resealStagedSecret`, identity
   `['staged-resource', teamId, draftId, owner, resourceId]`). Register the
   column in `src/secrets/stores.ts` `SECRET_STORES` (key-ids-in-use and
   reseal). Otherwise retiring a key strands live staged secrets.
5. **The worker has no `ObjectStore`.** `src/programs/worker.ts` builds no
   object-store layer, though it shares `*studio-env`, so the bucket config
   is present. §6's "worker's `protocol-store-gc` sweeps staging" needs the
   worker to build `ObjectStore`. `serve` has no `MaintenanceDatabase`, so a
   cross-team sweep cannot live in the API.
6. **The unary kind is really "contact".** The held map today renews any
   lease while its owner is socket-connected **or touched within `IDLE_MS`**.
   That covers ws-plane calls made without a watch, and tests rely on it
   ("keeps renewing a lock whose caller went away as it was taken"). The
   row kind is therefore `'socket' | 'contact'`, and **every**
   `openSession` (both planes) upserts a contact row keyed
   `connection_id = 'contact:' || owner`. A `ws:<uuid>` socket row and a
   contact row for the same tab would otherwise collide on the PK.
7. **Presence lives in the socket row, so `Presence.join/leave` collapse
   into `Leases.connect`.** `AcquireLock` sets mode with an `UPDATE … WHERE
connection_id = $ws`, which is naturally a no-op on the unary plane. The
   `WsConnection` branch in `AcquireLock` goes away.
8. **The reaper's "is the latest lock event a holder?" check is not cheap**
   as a per-poll `DISTINCT ON` over the draft's log, and `leases` cannot tell
   a clean release from an expiry, because both leave
   `expires_at <= now`. Instead the relay keeps an in-memory
   `section → owner` lock map. It is seeded once at relay start with one
   `DISTINCT ON (section_id)` query, then updated from the lock events it
   relays. Each poll checks only the believed-held sections against live
   `leases` rows, and rechecks under `FOR UPDATE` before appending.
9. **Ghost presence never rings.** An expired socket row produces no commit
   and no doorbell. The safety poll must re-read presence and emit when the
   set differs from the last one emitted.
10. **Relay start must be synchronous with `subscribe`.** If a new relay
    fixed `next` after the subscriber's backlog read, events between the two
    would be lost. `subscribe` returns only after the relay has fixed `next`
    by reading `max(cursor)+1` after the queue is registered. Duplicates are
    removed by the existing `cursor <= last` filter.
11. **The Valkey subscriber cannot reuse the rate-limit client's
    behaviour.** `src/rate-limit/store.ts` sets `retryStrategy: () => null`
    and `commandTimeout: 250`. The subscriber needs its own connection and a
    reconnect loop modelled on `src/jobs/worker.ts` `forkListener`
    (933-990):
    - catch the cause, repeat with capped backoff;
    - keep a `MutableRef` for `degraded` readiness;
    - emit a `Resync` signal on every (re)subscribe so local relays read once.

    Pub/sub ignores the Valkey DB number, so the channel must be
    configurable (tests use unique channels).

12. **Compose: listed servers, not the Docker provider.**
    `apps/studio/docker-compose.yml` deliberately uses only Traefik's file
    provider (no Docker socket). Multi-replica compose is one named service
    per replica plus a server list. The inline dynamic config lives in
    `configs:`, so move the `api` server list into its own small config
    that a variant can override.
13. **`/readyz` draining** needs a boolean. `WebSocketDrain` exposes only
    `closing: Effect<void>`. Add `draining: Effect<boolean>` (the latch's
    `isOpen()`). `HealthRoutes` reads it directly. It cannot be a
    `HealthCheck`, because checks are `R = never` Effects built before the
    drain service exists.
14. **The test clock is `makeShiftableClock()`, not `TestClock`**
    (`T/support/protocol-builder.ts`). DB expiry uses `forceExpire`. N
    replicas = N `createProtocolBuilderClient(studio, …)` calls over one
    studio, with one injected in-memory doorbell hub.
15. **Test Valkey is shared and flushed.** `T/support/valkey.ts`
    `reachableRedis(n)` FLUSHes DB `n`. Exactly one file may own a DB number.
    Doorbell tests use pub/sub on a per-test channel and never flush.
16. **Epoch-on-Submit is not needed** for any claim here. Submit re-reads
    owner and liveness `FOR UPDATE` in the write transaction (`pb/host.ts`
    submit ~904, create ~1047). The same-tab hazard does not depend on
    replica count. It stays out (§5 already says optional).
17. **`protocol_events` reads need nothing new.** `readProtocolEvents(teamId,
draftId, since)` (`pb/events.ts`) works inside any `TenantScope.open`.
    The relay does not call `requireProtocol`; each subscriber re-authorizes,
    as today.
18. **Persisting staging moves the "store not configured" refusal for
    content** from `plan` to `stage`. Secrets do not need the store. This is
    contract-visible as an earlier failure with the same reason.

---

## 2. Shared shapes (frozen by F, consumed by everyone)

### 2.1 Tables (`pb/schema.ts`, owned by F)

`protocol_connections`:

- Columns, with a composite FK `(draft_id, team_id)` to `drafts` `ON DELETE
CASCADE` and `teamIsolationPolicy()`:
  - `team_id text`, `draft_id uuid`, `connection_id text`
  - `kind text CHECK IN ('socket','contact')`
  - `owner text`, `user_id text`, `display_name text`
  - `mode text CHECK IN ('viewing','editing')`, `section_id text NULL`
  - `replica_id text`, `expires_at timestamptz`
  - `created_at timestamptz DEFAULT clock_timestamp()`
- PK `(draft_id, connection_id)`.
- Indexes: `(team_id, draft_id, owner)` and `(expires_at)`.

`protocol_staged_resources`:

- Columns, with the same FK and RLS:
  - `team_id`, `draft_id`, `owner`, `edit_id`, `resource_id`, `request_id`
  - `kind text`: the stage-request kind, part of idempotency
  - `descriptor jsonb`
  - `object_key text NULL`, `byte_length bigint NULL`, `content_type text NULL`
  - `secret_ciphertext text NULL`, `secret_key_id text NULL`
  - `created_at`
- PK `(draft_id, owner, edit_id, resource_id)`.
- Unique `(draft_id, owner, edit_id, kind, request_id)`. Note that the
  design's key omits `kind`, but `resources.ts` keys idempotency on
  `kind\0requestId`.
- Check: exactly one of `object_key`/`secret_ciphertext` is non-null.

Sidecar: append both table names to `PROTOCOL_BUILDER_SIDECAR_SQL =
tenantTablesSql([...])` and both tables to `PROTOCOL_BUILDER_TABLES`.

### 2.2 Services after F

Signatures are given as Effect types. `S` = `ProtocolBuilderSession` from
`pb/host.ts`.

```ts
// pb/leases.ts
interface AdoptedLease { readonly sectionId: string; readonly epoch: bigint }
class Leases extends Context.Service<Leases, {
  readonly connect: (session: S, end: Effect<void>)
    => Effect<ReadonlyArray<AdoptedLease>, SqlError, Scope.Scope>
  readonly contact: (session: S) => Effect<void>          // never fails; logs
  readonly releaseOwner: (session: S)
    => Effect<{ readonly released: boolean;
                readonly events: ReadonlyArray<LoggedProtocolEvent> }, SqlError>
  readonly connected: (session: S, owner: string) => Effect<boolean, SqlError>
}>()('@studio/protocol-builder/Leases')

// pb/presence.ts
class Presence extends Context.Service<Presence, {
  readonly setMode: (session: S, mode: 'viewing' | 'editing', sectionId?: string)
    => Effect<void, SqlError>
  readonly list: (session: S) => Effect<ReadonlyArray<PresenceEntry>, SqlError>
}>()

// pb/doorbell.ts
const DoorbellMessage = Schema.Union([
  Schema.TaggedStruct('Advanced', { draftId: Schema.String, cursor: Schema.String }),
  Schema.TaggedStruct('Presence', { draftId: Schema.String }),
])
type DoorbellSignal = DoorbellMessage | { readonly _tag: 'Resync' }
class Doorbell extends Context.Service<Doorbell, {
  readonly ring: (message: DoorbellMessage) => Effect<void>   // never fails
  readonly signals: Effect<Stream<DoorbellSignal>, never, Scope.Scope>
  readonly subscribed: Effect<boolean>                        // readiness
}>() {
  static readonly layerMemory: Layer<Doorbell>                // F
  static readonly layer: Layer<Doorbell, never, Valkey>       // V
}
const makeMemoryDoorbell: Effect<Doorbell['Service'], never, Scope.Scope>  // shared hub for tests

// pb/publisher.ts
class ProtocolEvents extends Context.Service<ProtocolEvents, {
  readonly publish: (session: S, entries: ReadonlyArray<LoggedProtocolEvent>) => Effect<void>
  readonly presenceChanged: (session: S) => Effect<void>
  readonly subscribe: (session: S)
    => Effect<Stream<LoggedProtocolEvent, SubscriberOverflow>, SqlError, Scope.Scope>
  readonly subscribers: (draftId: string) => Effect<number>   // keep: tests use it
}>() {
  static readonly layer: Layer<ProtocolEvents, never, Database | Doorbell | Presence>
  static readonly layerWith: (options: { readonly safetyPollMs: number })
    => Layer<ProtocolEvents, never, Database | Doorbell | Presence>
}

// pb/resources.ts
interface StagingEdit { readonly session: S; readonly editId: string }
class StagedImports extends Context.Service<StagedImports, {
  readonly stage: (edit: StagingEdit, requestId: string, request: StageRequest)
    => Effect<ResourceOutcome<{ descriptor: Descriptor }>, SqlError>
  readonly descriptors: (edit: StagingEdit) => Effect<ReadonlyArray<Descriptor>, SqlError>
  readonly plan: (edit: StagingEdit, resourceIds: ReadonlyArray<string>)
    => Effect<ResourceOutcome<PromotionPlan>, SqlError>
  readonly completePromotion: (edit: StagingEdit, resourceIds: ReadonlyArray<string>)
    => Effect<void>                                   // after commit; never fails
  readonly discard: (edit: StagingEdit, resourceId: string | undefined)
    => Effect<DiscardOutcome, SqlError>
  readonly inspect: (edit: StagingEdit, assets: SectionDoc, resourceId: string)
    => Effect<ResourceOutcome<Inspection> | undefined, SqlError>   // undefined = not staged here
  readonly preview: (edit: StagingEdit, assets: SectionDoc, resourceId: string)
    => Effect<ResourceOutcome<Preview> | undefined, SqlError>
  readonly releaseOwner: (session: S) => Effect<void>                 // grace release
}>()
```

`ProtocolBuilderState` (`pb/rpc.ts`) stays `Layer.mergeAll(Leases.layer,
Presence.layer, ProtocolEvents.layer, StagedImports.layer)`. It newly
requires **`Doorbell`** from outside, so serve and the test harness can
provide it (a shared hub in tests).

### 2.3 Handler wiring after F (`pb/handlers.ts`, `pb/session.ts`)

- `openSession`: rate limits → resolve → `leases.contact(session)`. Drop
  `leases.touch`, `staged.touch` and `staged.expire`.
- `endOwner(session)`:
  1. `{released, events} = leases.releaseOwner(session)`
  2. if `released`: `staged.releaseOwner(session)`
  3. `events.publish(session, events)`
  4. `events.presenceChanged(session)`

  The result is `orDie`d as today, inside the grace fiber.

- WatchProtocol order:
  1. `openSession`
  2. `live = events.subscribe(session)`
  3. backlog (unchanged)
  4. `Effect.addFinalizer(() => events.presenceChanged(session))`
  5. `adopted = leases.connect(session, endOwner(session))`
  6. `events.presenceChanged(session)`
  7. the live stream, unchanged (re-authorization, `cursor <= last` filter,
     cutoff)

  The finalizer is registered _before_ connect, so it runs after connect's
  row deletion.

- AcquireLock: on a granted lease, run `presence.setMode(session,
'editing', sectionId)`, then `publish`, then `presenceChanged`. No
  `leases.hold`.
- ReleaseLock: `releaseLock(session, sectionId)` now returns `{events,
stillHeld: ReadonlyArray<string>}`. `stillHeld` is read from `leases` in
  the same transaction (`pb/host.ts`, F). Then `presence.setMode(…,
stillHeld[0] ? 'editing' : 'viewing', stillHeld[0])`, then `publish`.
- Submit/Create:
  1. `staged.plan({session, editId}, ids)` before the transaction
  2. the transaction (unchanged)
  3. `publish`
  4. `staged.completePromotion(edit, ids)`
- Resources*: route to `staged.descriptors/stage/discard/inspect/preview`
  with `{session, editId}`. Committed fallbacks are unchanged.

---

## 3. Workstreams

Each workstream lists its goal, the files it owns, and its shapes, tests and
dependencies. Every file has exactly one owner after F0/F; parallel
workstreams touch disjoint files.

### F0: split the protocol-builder suite (serial, first)

- **Goal:** let L, R and S edit tests without sharing a 3460-line file. It
  is a pure move with no behaviour change.
- **Owns:**
  - new `T/support/protocol-builder-suite.ts`: the fixture from
    `T/rpc-protocol-builder.test.ts` ~280-590 (users, memberships,
    `call/watch/watching/drain/createStage/present/keeperTick/teamRows`,
    the objectStore stub, and a `setupProtocolBuilderSuite()` that does
    today's `beforeAll`/`afterAll` and returns the context);
  - the split into:
    - `T/rpc-protocol-builder.test.ts`: core writes, plus the **only**
      `reachableRedis(REDIS_DATABASES.protocolBuilder)` rate-limit test;
    - `T/rpc-protocol-builder-leases.test.ts`: lease/presence tests, today
      at 1860, 2317-2425, 2596, 2621, 2761, 2869, 3164, 3410;
    - `T/rpc-protocol-builder-events.test.ts`: fan-out/order, 2183, 2225,
      2991-3346;
    - `T/rpc-protocol-builder-resources.test.ts`: staging, 847-1169,
      1436-1740, 1947-2057, 2458-2520, 2813.
- **Test:** the case count is 94 before and after
  (`pnpm exec vitest run src/__tests__/rpc-protocol-builder*.test.ts` from
  `apps/studio/api`), all green. Each file opens its own scratch schema via
  `TestDatabaseLive`, so the files run in parallel safely.
- **Depends on:** nothing.

### F: foundation (serial, after F0)

- **Goal:** freeze schema, migration, policies and §2 interfaces. Rewire all
  call sites once, with interim implementations that keep today's behaviour
  and keep every existing test green.
- **Owns (then hands off):**
  - `pb/schema.ts` (§2.1);
  - `src/db/fingerprint.generated.ts` (`pnpm --filter @codaco/studio-api
sync-fingerprint`);
  - `migrations/0002_studio_multi_replica_sync/` (`pnpm --filter
@codaco/studio-api migrate:generate --name studio_multi_replica_sync`;
    new tables, no `backfill.sql`);
  - ERD docs (`generate:erd`, then `check:schema-docs`);
  - `src/audit/transaction-policy.ts`: all new `kind:'none'` ops with
    reasons:
    - `protocolBuilder.connect`, `protocolBuilder.contact`,
      `protocolBuilder.liveness`, `protocolBuilder.releaseOwner`,
      `protocolBuilder.reap`, `protocolBuilder.relayRead`;
    - `protocolBuilder.staging.stage`, `.read`, `.discard`, `.promoted`,
      `.releaseOwner`;
    - the maintenance ops `protocol.gc.staging` and
      `protocol.gc.connections` in the map used by
      `noAuditMaintenanceTransaction`;
  - `pb/handlers.ts`, `pb/session.ts`, `pb/rpc.ts`: §2.3, made **final**;
  - `pb/host.ts`: `releaseLock` returns `stillHeld`;
  - `pb/doorbell.ts`: tag, schema, `layerMemory` and `makeMemoryDoorbell`
    (a `PubSub.unbounded` hub);
  - `pb/connections.ts`: **stub only** with L's signatures (§3 L). The
    reaper functions return `[]`, and `livePresence` delegates to the
    interim presence map. L owns the file afterwards;
  - interim §2.2 implementations:
    - `pb/leases.ts`: in-memory registrations keyed `(draftId, owner)`. The
      tick calls `renewHeld` per registered pair: socket-connected, or
      contacted within `IDLE_MS`. `connect` = adopt in one transaction,
      plus the in-memory grace as today. `releaseOwner` = today's
      `releaseConnection` over the adopted list.
    - `pb/presence.ts`: in-memory, keyed by connectionId, written by
      `connect`.
    - `pb/publisher.ts`: in-process, as today. `presenceChanged` lists
      presence and publishes.
    - `pb/resources.ts`: wraps `StagedResourceRegistry`, with lazy idle
      expiry at the start of each call.
  - `src/programs/serve.ts`: provide `Doorbell.layerMemory` (V replaces);
  - `T/support/protocol-builder.ts`: accept `doorbell?: Layer<Doorbell>`,
    defaulting to `layerMemory`;
  - the split test files, only where interfaces changed. Assertions on
    `Leases.heldSections` become `liveLeases(owner)` (a DB read of live
    `leases` rows, added to the suite fixture), and `Presence.list(draftId)`
    becomes `present()`. The two held-map mechanism tests (today ~2389
    "keeps a lease the database never answered a renewal for" and ~3410
    "stops renewing a stranded owner's leases…") are deleted here and
    rewritten by L as I12/I13; the commit message says so.
- **Shapes:**
  - `releaseLock: (session: S, sectionId: string) => Effect<{ events:
ReadonlyArray<LoggedProtocolEvent>; stillHeld: ReadonlyArray<string> },
…>`.
  - Remove `Leases.hold/drop/heldSections/touch` and
    `StagedImports.for/opened/touch/expire/releaseMatching` from the public
    shapes.
- **Tests:** all four split files plus `T/ws-protocol-builder.test.ts`,
  `T/rpc-protocol-reauthorization.test.ts`,
  `src/db/__tests__/migrations-converge.test.ts` and the fingerprint
  check.
- **Depends on:** F0.

### V: Valkey, doorbell transport, readiness (parallel)

- **Goal:**
  - a shared `Valkey` platform service, with `RateLimitStore` built on it;
  - the Valkey doorbell with a reconnecting subscriber;
  - `/readyz` 503 while draining;
  - the boot warning text;
  - serve wiring.
- **Owns:**
  - new `src/platform/valkey.ts`;
  - `src/rate-limit/store.ts` (keeps its public shape: `configured`, `run`,
    `ping`, `layerOf`, `layerAbsent`, `layer`, so its many users are
    untouched);
  - `pb/doorbell.ts` (adds `layer`/`layerWith`);
  - `src/platform/ws-drain.ts`, `src/http/health.ts`;
  - `src/programs/serve.ts`;
  - `T/health.test.ts`, new `T/doorbell-valkey.test.ts`.
- **Shapes:**

  ```ts
  class Valkey extends Context.Service<Valkey, {
    readonly configured: boolean
    readonly command: <A>(name: string, work: (client: Redis) => Promise<A>)
      => Effect<A, ValkeyUnavailable>
    readonly ping: Effect<void, ValkeyUnavailable>
    readonly subscribe: (channel: string)
      => Effect<Stream<ValkeySignal>, never, Scope.Scope>
  }>() { static layerOf(url: string | undefined): Layer<Valkey>;
         static layer: Layer<Valkey, never, Environment> }
  type ValkeySignal = { _tag: 'Message'; payload: string } | { _tag: 'Subscribed' }
  // ValkeyUnavailable: Schema tagged error
  // Doorbell.layerWith({ channel }); default channel 'studio:protocol-events'
  // WebSocketDrain: + readonly draining: Effect<boolean>
  ```

  - The subscriber uses its own `new Redis(url, {lazyConnect, connectionName:
'studio-doorbell', retryStrategy: () => null})`. The loop is:
    `acquireRelease(connect+SUBSCRIBE) → emit Subscribed → messages until
'end'|'error' → fail`, wrapped in `Effect.repeat(capped exponential
250 ms → 5 s)`.
  - The doorbell maps `Subscribed` to `Resync` and decodes payloads with
    `Schema.decodeUnknownOption(Schema.fromJsonString(DoorbellMessage))`,
    dropping undecodable ones.
  - `ring` = `PUBLISH`, best-effort (errors logged at warning, never
    raised).
  - Without `REDIS_URL`, `Doorbell.layer` = `layerMemory`.
  - Readiness check `doorbell`: `'degraded'` when configured and not
    subscribed.
  - `HealthRoutes` → `Layer<never, never, HttpRouter | WebSocketDrain>`.
    `/readyz` returns 503 `{status:'failing', checks:{…, draining:'failed:
draining'}}` when `draining`.
  - Boot warning (`rate-limit/store.ts:49-51`) adds that cross-replica
    protocol-builder updates fall back to the 5 s poll.

- **Tests:**
  - `T/health.test.ts`: §10 #9, `/readyz` 503 once `drain` has started, 200
    before.
  - `T/doorbell-valkey.test.ts` (real Valkey, per-test channel
    `studio:protocol-events:<uuid>`, **no** `reachableRedis`, so no flush):
    - two layers: ring on one, signal on the other;
    - `CLIENT KILL TYPE pubsub` → `Resync` arrives after resubscribe and
      `subscribed` goes false→true;
    - garbage payload ignored.
  - Existing rate-limit tests stay green.
- **Depends on:** F (tag/schema in `doorbell.ts`).

### L: leases, connections, presence in Postgres (parallel)

- **Goal:** design §3.1-3.4. Registrations are persisted, liveness is a
  per-team pass, grace is DB-checked, presence is the union of live socket
  rows, and the reaper statement is provided.
- **Owns:**
  - `pb/leases.ts`, `pb/presence.ts`;
  - `pb/connections.ts` (SQL; stubbed by F);
  - `pb/host.ts`: lease section only. Delete `renewLease`, `adoptLeases`
    and `releaseConnection`; add `shareDraftHead` (`FOR SHARE`).
    Submit/create are untouched;
  - `T/rpc-protocol-builder-leases.test.ts`.
- **Shapes (`pb/connections.ts`):**

  ```ts
  const REPLICA_ID: string                       // randomUUID() per process, diagnostics only
  connectSocket(session: S, presence: PresenceFields)
    : Effect<ReadonlyArray<AdoptedLease>, SqlError, Database>
    // noAuditTransaction('protocolBuilder.connect'): shareDraftHead; renewHeld;
    // upsert socket row (expires_at = clock_timestamp()+TTL, mode from adopted)
  upsertContact(session: S): Effect<void, SqlError, Database>
    // expires_at = greatest(existing, clock_timestamp()+IDLE_MS)
  livenessPass(access: TeamAccess, rows: ReadonlyArray<LocalRegistration>)
    : Effect<void, SqlError, Database>
    // one tx per team: INSERT … ON CONFLICT (draft_id, connection_id)
    // DO UPDATE SET expires_at for socket rows; then renewHeld per
    // distinct (draft, owner) that has a live row in `rows`
  deleteSocket(session: S): Effect<void, SqlError, Database>
  releaseOwner(session: S): Effect<{ released: boolean; events }, SqlError, Database>
    // lockDraftHead FOR UPDATE; if live socket row for (draft, owner) → {false, []};
    // else release every live lease of owner read from `leases`, append lock-null events
  livePresence(access: TeamAccess, draftId: string)
    : Effect<ReadonlyArray<PresenceEntry>, SqlError, Database>
  liveSections(access: TeamAccess, draftId: string, sectionIds: ReadonlyArray<string>)
    : Effect<ReadonlySet<string>, SqlError, Database>   // read-only, for the relay's cheap check
  reapExpired(access: TeamAccess, draftId: string, candidates: ReadonlyArray<string>)
    : Effect<ReadonlyArray<LoggedProtocolEvent>, SqlError, Database>
    // FOR UPDATE; per candidate: latest lock event has holder AND no live lease → append release
  ```

  - `Leases` local state: `Map<connectionKey, LocalRegistration>`, where
    `LocalRegistration = {access, draftId, owner, connectionId, kind,
presence, until?}` and `until` applies to contact only.
  - Contact upserts are throttled to once per 30 s per `(draft, owner)`.
  - The tick (`Schedule.spaced(RENEW_INTERVAL_MS)`, `forkScoped`) runs
    `livenessPass` per team. A failure logs and keeps every registration
    (I12).
  - Socket scope close: delete the local entry, `deleteSocket`
    (best-effort), then fork the grace `forkIn(layerScope)`, deduped per
    `(draft, owner)`.
  - Grace: `sleep(RECONNECT_GRACE_MS)`, then `end`.
  - Local reconnect interrupts the pending grace, as an optimisation only;
    correctness comes from the DB check.
  - Before `end`, contact registrations for the owner are dropped, so a
    failed release still stops renewal (I13).
  - Layer shutdown interrupts graces, so a draining replica never releases
    (I8).
  - `connected(session, owner)`: true if a live row of any kind exists.
  - `Presence.setMode` updates the row and the local registration;
    `Presence.list` = `livePresence`.

- **Tests (`T/rpc-protocol-builder-leases.test.ts`)**, using the existing
  single-replica harness:
  - every moved lease/presence test stays green;
  - I12: liveness failure keeps the lease, via the faulty-`Database`
    pattern from today's ~3410 test;
  - I13: a stranded owner whose release fails is no longer renewed;
  - new: grace no-ops when another socket for the owner is live;
  - new: a contact-only (unary) owner's lease survives calls spaced under
    `IDLE_MS`, and lapses after `IDLE_MS` of silence.
- **Depends on:** F.

### R: log-ordered relay (parallel)

- **Goal:** design §4.1, plus correction items 8-10.
- **Owns:** `pb/publisher.ts`, `T/rpc-protocol-builder-events.test.ts`.
- **Shapes:**
  - `ProtocolEvents.layerWith({safetyPollMs})`.
  - Internal `Relay` per draft holds:
    - `access` (from the first subscriber; replaced when it leaves);
    - `next: bigint`;
    - `queues: Set<Queue.Queue<…>>` (bounded 1024; overflow →
      `SubscriberOverflow`, as today);
    - `locks: Map<sectionId, owner>`;
    - `lastPresence: string` (canonical JSON);
    - `wake`: a `Queue.sliding(1)` for coalescing.
  - `subscribe`:
    1. register the queue;
    2. if the relay is new: fix `next` and seed `locks` in one
       `relayRead` transaction, then fork the relay fiber in the layer
       scope;
    3. return the stream.

    The relay is removed (fiber interrupted) when the last queue leaves.

  - The relay fiber loops on `wake` or `sleep(safetyPollMs)`:
    1. `readProtocolEvents(teamId, draftId, next - 1)` → offer the
       contiguous run to every queue → advance `next` → update `locks`
       from lock events;
    2. on presence wake or poll: `livePresence` → emit
       `{event:{type:'presence', present}}` if changed;
    3. on poll only: if `locks` is non-empty, `liveSections` → candidates =
       held minus live → `reapExpired` → if any events, wake and ring.
  - `publish(session, entries)` = wake the local relay + `doorbell.ring(
Advanced{draftId, cursor: max})`. `presenceChanged` = wake local +
    `ring(Presence)`.
  - One fiber per layer consumes `doorbell.signals`: `Advanced`/`Presence`
    wake that draft's relay if present; `Resync` wakes all.
- **Tests (`T/rpc-protocol-builder-events.test.ts`):**
  - all moved fan-out tests;
  - new: an event committed between `subscribe` and the backlog read is
    delivered exactly once (I4b; reuse `holdingEvents`-style latches);
  - new: a doorbell that never rings still delivers within `safetyPollMs`
    (the layer built with a doorbell whose `ring` is a no-op);
  - new: presence clears after a row is expired without a ring (a direct
    `UPDATE … expires_at = clock_timestamp()` helper).
- **Depends on:** F. Uses L's `pb/connections.ts` exports (`livePresence`,
  `liveSections`, `reapExpired`) through F's stub until L lands. R never
  edits that file.

### S: persistent staging (parallel)

- **Goal:** design §6, plus corrections 3, 4, 5 and 18.
- **Owns:**
  - `pb/resources.ts`;
  - new `pb/staging-store.ts` (SQL + objects);
  - `src/storage/object-store.ts`, `storage/s3/object-store-s3.ts`,
    `storage/azure-blob/object-store-azure-blob.ts`,
    `storage/__tests__/contract.ts`;
  - `src/secrets/cipher.ts`, `src/secrets/stores.ts`;
  - `src/jobs/handlers/protocol-store-gc.ts`;
  - `src/programs/worker.ts` (builds `ObjectStore`);
  - `T/rpc-protocol-builder-resources.test.ts`,
    `src/secrets/__tests__/no-plaintext-at-rest.test.ts`,
    `src/secrets/__tests__/stores.test.ts`, and the gc handler's tests.
- **Shapes:**

  ```ts
  // ObjectStore port additions (both backends + contract.ts)
  readonly putStaged: (key: StagingKey, bytes: Uint8Array, mediaType: string)
    => Effect<void, ObjectStoreError>
  readonly getStaged: (key: StagingKey) => Effect<Uint8Array | undefined, ObjectStoreError>
  readonly deleteStaged: (key: StagingKey) => Effect<void, ObjectStoreError>   // idempotent
  type StagingKey = string & Brand<'StagingKey'>     // `staging/<teamId>/<uuid>`, minted only here
  // ObjectBackend: + remove(key)
  // SecretsCipherApi: sealStagedSecret / openStagedSecret / resealStagedSecret
  //   (identity StagedSecretIdentity = { teamId, draftId, owner, resourceId })
  ```

  - `stage`:
    1. look up the unique key; if present, return its descriptor;
    2. validate (empty and too-large, as today);
    3. content: `putStaged`, then insert the row. Secret: seal, then insert;
    4. on a unique-violation race, delete the just-written object and
       return the winner's descriptor.

    A crash between `putStaged` and the insert leaves an orphan object
    (Q1).

  - `plan`: read the rows. Content: `getStaged` → `store.put` → entry. Secret:
    `openStagedSecret` → plaintext into `entries.value`, as
    `planPromotion` does today. An object-store failure keeps today's
    retryable `ResourceOutcome` failure.
  - `completePromotion`: delete the rows `RETURNING object_key` (op
    `staging.promoted`), then `deleteStaged` each, best-effort, logged.
  - `discard` and `releaseOwner`: the same delete-then-objects pattern.
  - `inspect`: open the sealed secret.
  - `preview`: `getStaged` → `data:` URL, as today.
  - GC (worker, `noAuditMaintenanceTransaction('protocol.gc.staging')` per
    team): delete staged rows older than `IDLE_MS` whose `(draft, owner)` has
    no live `protocol_connections` row, `RETURNING object_key` → delete the
    objects. Also delete `protocol_connections` rows expired over 1 h
    (`protocol.gc.connections`).

- **Tests:**
  - moved staging tests green;
  - new in `T/rpc-protocol-builder-resources.test.ts`:
    - restart: stage, dispose the client, new client, then submit promotes
      (single-replica proof of persistence; H re-proves it cross-replica);
    - discard deletes the row and the object (objectStore stub records
      `deleteStaged`);
  - `contract.ts`: put/get/delete staged round-trip and idempotent delete,
    for both backends;
  - gc handler test: abandoned rows and objects removed; a live owner's are
    kept;
  - `no-plaintext-at-rest.test.ts`: seed a staged secret, so the scan proves
    I9;
  - `stores.test.ts`: the store is registered and reseals.
- **Depends on:** F.

### H: N-replica harness and cross-replica scenarios (parallel with L/R/S, finishes last)

- **Goal:** §10 scenarios 1-8 across replicas.
- **Owns:** `T/support/protocol-builder.ts` (after F), new
  `T/protocol-builder-replicas.test.ts`.
- **Shapes:**

  ```ts
  createProtocolBuilderReplicas(studio, {
    count: number, clock?: ShiftableClock, objectStore?: …,
    doorbell?: (replica: number, hub: Doorbell['Service']) => Doorbell['Service'],
    safetyPollMs?: number,
  }): Promise<{ replicas: ProtocolBuilderTestClient[];
                crash(i: number): Promise<void>;
                restart(i: number): Promise<ProtocolBuilderTestClient>;
                dispose(): Promise<void> }>
  ```

  - `crash(i)`: swap replica i's `Database` for a refusing one (the
    faulty-`Database` pattern from today's ~3410 test), then close its
    scope. Finalizers run but cannot write, which models a dead process.
    `dispose` is the orderly shutdown.
  - One `makeMemoryDoorbell` hub; per-replica wrappers to drop or reorder.

- **Tests (`T/protocol-builder-replicas.test.ts`):**
  1. Acquire on A; A's watch drops; reconnect on B within grace; advance
     the clock past grace and the TTL, with B's liveness tick running. The
     lease is held and Submit via B succeeds.
  2. No reconnect: released after grace, and B's watcher sees a lock-null
     event.
  3. Restart: dispose A (orderly), `restart(0)`, reconnect. The lease is
     kept and no release event is logged (also I8).
  4. Writers on A and B interleaved; B's doorbell wrapper reorders and drops
     50%. Every watcher sees strictly contiguous cursors with no gaps.
  5. Presence on A and B lists both. `crash(1)` → B's entry disappears
     within TTL + poll.
  6. `crash(0)` while holding; no reconnect. After TTL, B's relay reaper
     emits lock-null. Variant: the owner reconnects on B before TTL → the
     lease is kept and no reaper event.
  7. Concurrent AcquireLock on A and B (`Promise.all`): exactly one `held`.
  8. Stage on A, Submit with promote on B. The asset is committed and the
     staged row and object are gone. Discard and GC paths are covered in S.
- **Depends on:** F (harness hook). Scenarios go green as L (1-3, 5-7), R
  (4-6) and S (8) land. H can write them first against interfaces, red.

### D: docs, stack-test, changeset (parallel; last commits after H green)

- **Owns:**
  - `apps/studio/docker-compose.yml` (move the `api` server list into its
    own config; no behaviour change for one replica);
  - `apps/studio/stack-test/variants/two-api.yml` (adds `api-b` extending
    `api` and overrides the server list to `http://api:3000`,
    `http://api-b:3000`);
  - `apps/studio/stack-test/lib.sh` (`VARIANTS`), `stack-test/assert.sh`
    (two-api block), `stack-test/README.md`;
  - the CI job listing variants, as enforced by
    `scripts/ci/ci-workflow.test.mjs`;
  - the docs in design §11:
    - `apps/studio/README.md` run-mode table ~1029, topologies
      ~1281-1288, live-session impact ~1306-1308, Valkey section (adds
      `PUBLISH`/`SUBSCRIBE`), schema list;
    - `docs/self-host/requirements.md` 236-245, `run.md`, `upgrade.md`,
      `docs/topology.md` 135-150 (paths under `apps/studio/`);
  - `.changeset/<name>.md`: Studio lane, `@codaco/studio-api` minor; no
    other lane.
- **Stack-test scenario** (curl only, through Traefik, deterministic
  routing by stopping replicas, reusing `assert.sh`'s `rpc` helper and
  cookie jar):
  1. `compose stop api-b`
  2. sign in; `protocols.create` (`/rpc`); read a section id via
     `/rpc/protocol-builder`
  3. `AcquireLock` with a fixed client-session header (lands on api)
  4. `compose start api-b`, wait for its health
  5. `compose stop api`
  6. call `ListSections` every 5 s for 40 s (lands on api-b; contact
     renews)
  7. `Submit` succeeds

  Without the change, step 7 is `NotLockHolder`, which is the oracle (I15).
  The WS cross-replica reconnect is proven by H#1, not by bash.

- **Depends on:** L (contact rows), V (readiness), S (worker ObjectStore
  env). The docs can be drafted early.

---

## 4. Ordering

```
F0 → F → { V, L, R, S, H(red tests), D(drafts) } in parallel → H green → D final → PR
```

- F0 and F are one agent each, serial, and committed before fan-out. Every
  later worktree branches from F's commit.
- Merge order inside the fan-out: V and L first (independent), then R
  (needs L's real `connections.ts` for presence and reap), S any time, then
  H last.
- Each workstream runs its own test files plus `pnpm agent:test`. Only the
  final integration runs `pnpm --filter @codaco/studio-api test`.
- Shared-file rule: after F, `pb/handlers.ts`, `pb/session.ts`, `pb/rpc.ts`
  and `src/audit/transaction-policy.ts` are frozen. A workstream that needs
  a change there reports back instead of editing.

---

## 5. Invariants and oracles

Each invariant has a test that would fail and the mutation that proves the
test can fail. Run each mutation once locally, see red, and revert.

| #   | Invariant                                                                     | Test                                                        | Mutation proving it can fail                                                   |
| --- | ----------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------ |
| I1  | Reconnecting to any replica keeps the owner's live leases                     | H#1, H#3                                                    | drop `renewHeld` from `connectSocket`                                          |
| I2  | Grace never releases while a live socket row exists for the owner             | L "grace no-ops when another socket is live", H#1           | remove the live-socket check in `releaseOwner`                                 |
| I3  | A renewal never resurrects an expired lease                                   | `packages/studio-sync/src/__tests__/lease.test.ts` (exists) | drop `gt(expiresAt, clockNow())` from `renewHeld`                              |
| I4a | Watchers see contiguous cursors despite reordered or dropped doorbells        | H#4                                                         | relay offers only the ringing cursor's row instead of the range from `next`    |
| I4b | An event committed between `subscribe` and the backlog read is delivered once | R new test                                                  | fix `next` lazily in the relay fiber instead of in `subscribe`                 |
| I5  | At most one holder per section across replicas                                | H#7                                                         | make `acquire`'s CAS ignore a live foreign lease (local mutation only)         |
| I6  | Presence is the union across replicas; ghosts clear without a ring            | H#5, R presence-expiry test                                 | filter `livePresence` by `REPLICA_ID`; separately, emit presence only on rings |
| I7  | An expired, unreleased lease gets a release event within TTL + poll           | H#6                                                         | skip `reapExpired` in the poll                                                 |
| I8  | A draining or disposed replica appends no release                             | H#3 (no lock-null in the log)                               | run `end` on grace interruption                                                |
| I9  | A staged secret is never plaintext at rest                                    | `no-plaintext-at-rest.test.ts`                              | store `request.value` unsealed                                                 |
| I10 | Promotion, discard and GC delete row and object                               | S tests, H#8                                                | skip `deleteStaged` in `completePromotion`                                     |
| I11 | `/readyz` is 503 while draining                                               | `T/health.test.ts`                                          | `draining: Effect.succeed(false)`                                              |
| I12 | A failed liveness pass keeps registrations                                    | L rewrite of today's ~2389 test                             | delete the registration on pass failure                                        |
| I13 | A stranded owner stops being renewed even if its release fails                | L rewrite of today's ~3410 test                             | drop registrations only after a successful release                             |
| I14 | Migration path equals the Drizzle push path                                   | `migrations-converge.test.ts`, fingerprint check            | edit `schema.ts` without `migrate:generate`                                    |
| I15 | A unary (contact) owner keeps its lease across a replica stop                 | D stack-test, L contact test                                | skip `upsertContact` in `openSession`                                          |
| I16 | A Valkey resubscribe triggers a log read                                      | V `CLIENT KILL` test (poll at 60 s)                         | omit `Subscribed` on reconnect                                                 |

---

## 6. Decisions (orchestrator, 2026-10-07)

- **Q1:** extend the object-store port (`putStaged/getStaged/deleteStaged`
  plus `listStaged(olderThan)`). The worker GC also deletes `staging/`
  objects older than one day that have no row, so a crash between
  `putStaged` and the insert never leaks a roster. Bucket lifecycle rules
  are documented as optional.
- **Q2:** no Traefik health check in compose. Document `/readyz` draining
  for other load balancers.
- **Q3:** `degraded`, matching the rate limiter.

## 7. Risks and open questions

- **Q1 Staging storage model.** The plan extends the object-store port. The
  alternative is to stage straight into content-addressed `assets/`: simpler,
  but discarded uploads would stay as unreferenced blobs, and no asset GC
  exists. Rosters can be sensitive, so that is a privacy regression. Also
  decide whether the worker GC lists `staging/` for objects older than a day
  with no row (crash between `putStaged` and the insert), or relies on a
  bucket lifecycle rule. That rule cannot be assumed on Garage/MinIO
  self-hosts.
- **Q2 Traefik health checks.** An active `healthCheck` on `/readyz` routes
  around a draining replica, but `/readyz` also fails on a db or
  object-store outage, which pulls every replica. The errors middleware then
  serves the maintenance page, arguably correct. The alternative is no
  health check, relying on client retries during the 5 s drain. The plan
  leaves it off in compose, documents it for other load balancers, and asks
  for a decision.
- **Q3 Valkey failover semantics.** With `REDIS_URL` set but Valkey down,
  rings fail silently and latency is the 5 s poll. `/readyz` reports
  `degraded`, not `failing`. Confirm that is the wanted signal.
- **Risk: a stalled replica.** One paused longer than the TTL lets its
  owners' leases lapse. Its liveness upsert re-creates rows afterwards but
  cannot resurrect leases (I3). This is accepted, same as a crash.
- **Risk: Re-authorization only runs on delivered entries.** An idle watch
  of a removed member keeps its socket row (and leases) alive until the
  next event. This is unchanged from today; flag it, do not fix it here.
- **Risk: F is the bottleneck.** It freezes every interface and rewrites
  handler wiring with interim implementations. If F slips, all parallel
  streams wait. Keep F's interim implementations minimal; they are thrown
  away by L, R and S.
