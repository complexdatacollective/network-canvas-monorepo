# Studio Study Model and Lifecycle Design

**Status:** Proposed (2026-08-31). Merging this document is acceptance of the
design on #1262, following the audit-log precedent (#1518).

**Tracking:** #1262 (study model and lifecycle), #1261 (studies and
participants phase), #1242 (Studio platform principles), #1263 (participants),
#1264 (participation modes), #1266 (consent), #1267 (wave management), #1268
(monitoring), #1270 (participant erasure), #1272 (editor foundation), #1276
(protocol versioning), #1288 (API tokens), #1297 (session delivery), #1302
(prior-data resolution), #1304 (scheduling), #1257 (roles), #1259 (audit log).

## 1. Summary

The study is Studio's central domain object: a team-scoped record that ties
together a protocol line, a set of waves (timepoints), delivery settings, and —
through later issues — participants and collected interview sessions. The
guiding boundary from the specification tree is fixed: **the protocol
describes the interview; the study owns everything else.** Waves, scheduling,
recruitment, and consent never enter the protocol schema.

A study moves through four lifecycle states — `draft`, `live`, `paused`,
`closed` — each with defined participant access, configuration mutability, and
data behavior. Every transition is an audited command with its own
preconditions and its own event. Closing archives: a closed study is
read-only, recoverable, and exportable. Hard deletion is a separate
admin-only, confirmed, audited action available only from Draft or Closed,
with a deletion grace window implemented as a soft-delete marker and a
maintenance-role purge job that appends its own system-actor audit event.

This design ships the schema spine — `studies` and `study_waves` — and the
creation, configuration, wave, lifecycle, and deletion commands, their audit
events, the RPC surface, and the first studies screens. It deliberately
excludes the feature work of its neighbours: participant records (#1263),
consent (#1266), wave windows and progression features (#1267), monitoring
(#1268), erasure mechanics (#1270), and session delivery (#1297) attach to
this spine in their own issues, using the decisions recorded here.

Every table follows the established tenancy pattern (denormalized `team_id`,
forced row-level security, composite foreign keys proving the copy honest),
and every mutation goes through `runAuditedCommand` so the domain write and
its audit event commit or roll back together. Both mechanisms are already
enforced by triggers, forced-RLS policies, and source-policy tests on `main`;
this design adds no new enforcement machinery, only a new domain that lives
inside the existing machinery.

Some decisions below are inherited from dated decisions in the issue tree;
others are made for the first time in this document. Each is labelled, because
merging this document is what turns the latter into decisions.

## 2. Requirements

### 2.1 Fundamental requirement

Researchers must be able to create a study, configure it while drafting, take
it live against an immutable published protocol version, pause and resume
enrolment, close it into a read-only archive, and delete it under the grace
rules — with every one of those actions recorded in the team audit log and
every row invisible to other teams.

### 2.2 The lifecycle contract

This table is #1262's lifecycle sketch, adopted verbatim by this design —
merging this document is what ratifies it. The one dated decision behind it
(2026-08-07) covers the closure and deletion rows: closing **archives**
(read-only, recoverable, exportable), and hard deletion is a separate
admin-only action behind confirmation, with a grace window, possible only
from Draft or Closed. (#1262 phrases the admin restriction as "Workspace
Admin"; in Studio's team model that is the team `owner`/`admin` roles.)

| State      | Participant access                                                                                                           | Configuration                                                                                    | Data                      |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------- |
| **Draft**  | None                                                                                                                         | Everything editable                                                                              | None                      |
| **Live**   | Enrolment and sessions                                                                                                       | Protocol versions pinned per wave; changes only by publishing a new version and rebinding a wave | Accumulating              |
| **Paused** | Links resolve to a participant-friendly pause notice; no new sessions; in-flight sessions may complete within a grace window | Editable as Live                                                                                 | Read/write                |
| **Closed** | None                                                                                                                         | Read-only                                                                                        | Read-only; export remains |

Every transition is audited — an event in the immutable log, always.

### 2.3 Invariants

1. **Team isolated.** Every study table carries `team_id`, a forced RLS
   policy, a team-first index, and composite foreign keys to its parents.
2. **Audited or rolled back.** Every study mutation runs inside
   `runAuditedCommand` (or, for the purge, an audited system-actor
   transaction) and returns at least one typed event; lifecycle transitions
   each have their own event type.
3. **Pins are immutable references.** A live wave references a
   `protocol_versions` row, which database triggers already make undeletable
   and unupdatable. Rebinding is an explicit audited act, never automatic —
   publishing a new version changes no pin.
4. **Closed is enforced, not advisory.** A database trigger refuses writes to
   a closed study's configuration, mirroring how `protocol_versions` protects
   itself: triggers carry the promises that must survive application bugs.
5. **Nothing cascades toward the audit log.** Deleting a study or any of its
   children never touches `audit_events`. `ON DELETE CASCADE` appears nowhere
   in the study schema.
6. **No PII on the study row.** Participant contact details live on the
   participant record (#1263) under its own protections; the study row and its
   audit labels stay safe to display and export.

## 3. Resolved design decisions

Nine questions were open going into this design. Each is resolved here; the
sections that follow give the resulting schema and commands in full.

### D1 — Waves enter the model now

`#1262` ships a minimal `study_waves` table alongside `studies`, and study
creation creates wave 1 in the same transaction. Nearly everything downstream
keys on waves, not studies: interview links are issued per-participant
per-wave (#1297), the Live state pins a protocol version per wave (§2.2),
prior-wave data resolution (#1302), scheduling (#1304), and monitoring
(#1268) are all wave-based. Creating the table later would force each of
those features through a schema change plus a data backfill at exactly the
moment backfills become risky (D4).

An ordinary one-off study is simply a single-wave study. Draft-only wave
add/remove commands exist from the start (§5.2) so multi-wave studies are
creatable through the audited path, but the UI does not surface waves until
#1267 builds wave management. #1267 then becomes additive columns
(`opens_at`/`closes_at` windows — nullable, backfill-free) plus feature work
— progression behavior and management screens — on an existing spine.

### D2 — The version pin lives on the wave

The study references its **protocol line** (`protocols.id`, nullable while
Draft); each wave pins a **published version** (`protocol_versions.id`,
required from the first go-live). This reconciles the issue's two phrasings —
"links one or more protocol versions" and "pinned per wave" — in favour of the
per-wave pin the lifecycle table promises.

All of a study's waves MUST pin versions of the study's own protocol line.
Nothing in the issue tree requires a study to span protocol lines, and
forbidding it matches how researchers think about a study. The rule is
enforced in the command layer (go-live and rebind validate
`version.protocol_id = study.protocol_id`); encoding it as a composite
foreign key would require widening the immutable `protocol_versions` table's
unique constraints for no additional safety, since every path to a pin is an
audited command. The known future relaxation trigger is multi-arm studies
with different instruments per arm — #1266 defers multi-arm consent as an
extended flow — and relaxing then costs deleting one validation, not a
migration.

Retargeting a Draft study to a different protocol line is allowed as an
audited settings update; it clears any wave pins (the cleared wave ids and
their previous version ids are recorded in the event's details), which then
point at nothing until re-pinned.

Rebinding a live wave to a newer published version is a first-class audited
command (`study.wave.rebound@1`), never a side effect of publishing — and it
affects **only sessions started afterwards**: every session captures the
wave's pinned version at its own creation (§8), so an in-flight interview
never changes definition mid-stream and completed data always knows exactly
which version produced it.

### D3 — Lifecycle representation and enforcement

A `state` text column with a `CHECK` constraint over the four values — the
same style as `audit_events.category`. Timestamps (`went_live_at`,
`paused_at`, `closed_at`) are recorded as evidence and operational anchors
but never substitute for the state column; inferring state from nullable
timestamps is Fresco's anti-pattern and is explicitly rejected.

Transition legality, per-state editability, and go-live preconditions live in
`study/commands.ts` as a typed transition map — the command layer already
holds the locked row and the permission decision, and only commands know the
caller's intent. There is **one audited command per transition** — `goLive`,
`pauseStudy`, `resumeStudy`, `closeStudy`, `reopenStudy` — rather than a
generic `setState`: each transition has different preconditions and a
different event. `reopenStudy` is a distinct command (allowed only from
Closed) that shares `goLive`'s
precondition helper but emits `study.reopened@1`; calling either procedure
from a state it does not serve is a typed conflict, never a silent remap.

The database adds a safety net underneath: a trigger refuses `UPDATE` of a
closed study except on an explicitly allowed column set (§4.3), so Closed's
read-only promise survives application bugs.

Closed → Live reopening is allowed. #1262's "recoverable" strictly promises
only that a closed study is un-archivable and exportable; reading it as "may
resume data collection" is an extension made here, gated on re-running the
full go-live preconditions (§5.3).

"Draft has no data" — and Paused's "no new sessions" — are enforced where
data is created, and the rule #1297 consumes is two rules, not one:

- **Session creation** is refused for any study whose state is not `live`.
  A paused study accepts no new sessions, grace window or not.
- **Writes to already-started sessions** (autosave, completion, finalization)
  are additionally permitted while `paused`, but only within
  `pause_grace_minutes` of `paused_at` — the window exists so in-flight
  participants can finish, not so new ones can start.

The pause grace window is a per-study setting stored on the study row (#1262
says only "a grace window"; making it per-study rather than installation
configuration is decided here). Session delivery (#1297) consumes it; the
study model only stores it, plus the `paused_at` anchor the window is
measured from.

### D4 — Migrations gate: before pilot data, not before this schema

This work proceeds under the existing push semantics (the schema is
reconciled or wiped to match the code), which is what makes iterating on a
brand-new schema cheap. The README's line in the sand is restated here as an
explicit gate: **a real migration system MUST merge before any pilot study
goes Live.** Studies exist to collect participant research data —
unambiguously "data worth keeping" — so the gate binds to the first Live
study with real participants, not to the schema's existence. The gate is
recorded on #1262 and appears in the delivery plan (§10) as a parallel,
order-independent work item.

### D5 — Participation mode is a frozen-at-go-live study column

`participation_mode` (`managed` | `anonymous`) is a column on the study,
editable while Draft, frozen from the first go-live — enforced in the go-live
command, which is also the moment the choice starts to matter. #1264 decides
only that the mode is a per-study choice; the freeze is decided here.
Flipping the mode on a study with data is close to meaningless (anonymous
sessions have no participant records to attach to), and a freezable mode
kills the whole class of "handle both directions of the flip forever"
complexity in every identity-dependent feature.

Anonymous studies are single-wave in v1 — a **novel restriction made here**,
in no issue. Both of #1267's progression modes assume cross-wave identity,
and a per-study open link needs an unambiguous target wave; but a repeated
cross-sectional design (the same open link at several unlinked timepoints)
is a legitimate anonymous multi-wave study that this rule forecloses. It is
therefore a validation rule in the go-live and wave-creation commands, not a
different schema: relaxing it later costs one check, and until then the
workaround is one study per timepoint.

### D6 — Deletion is a soft-delete marker plus an audited maintenance purge

Study deletion is possible only from Draft or Closed, restricted to team
owners/admins, behind client confirmation, and audited. #1262 defers "the
retention rules in #1270", but #1270 contains no retention rules (it defines
participant data-rights operations), so the deletion mechanics here are
decided by this document, not inherited.

The grace window is a `deletion_requested_at` marker plus a **persisted
deadline**: an audited `requestStudyDeletion` command sets the marker and
computes `purge_after` from the grace window in force at request time —
atomically, so the deadline the event records, the deadline the UI shows,
and the deadline the purge honours are the same value, and a later change to
the server's grace configuration never moves an existing request's deadline
in either direction. An audited `cancelStudyDeletion` clears both —
"recoverable during grace" falls out for free. A repeat request while the
marker is set returns `unchanged`: it never resets the deadline or emits a
second event. While the marker is set, `goLive` and `reopenStudy` refuse
with a typed conflict ("cancel the deletion first"): a study scheduled for
destruction can never be collecting data when the purge arrives. After the
deadline, a background job running as the maintenance role purges for real,
the same operational pattern as protocol garbage collection and invitation
delivery — locking the study row and re-validating marker, deadline, and
`state IN ('draft', 'closed')` inside the purge transaction itself (§5.5),
so a cancellation that lands after the candidate scan still wins.

The purge is itself audited. It runs per study in one transaction under an
explicit per-team tenant scope — exactly the state in which the maintenance
role can insert audit events (audit design §5.3) — and appends
`study.deletion.purged@1` with a **system actor** (`actor_kind: 'system'`),
bounded details (study id, the deletion request's evidence, per-table row
counts), in that same transaction. The domain deletes run behind a savepoint
(the audit design's §7.3 synchronous-failure pattern, already implemented by
`runAuditedCommandWork`): a failed purge rolls the deletes back to the
savepoint and appends the `failed`-outcome event in the still-open outer
transaction, so the failure record survives the rollback; if that append
itself fails, the whole transaction rolls back and an operational signal is
emitted. This requires the system authorization-context
variant the audit design already mandates for its own staged-export worker
(audit design §8.1) — extending the audit writer beyond user principals is
part of the deletion slice, not new policy. An operational log alone would
not satisfy the audit requirement (audit design §3), and the request event
records a prediction, not the destruction: the log must be able to answer
"was this study's data actually destroyed, and when?"

The foreign-key graph is shaped so the purge is a simple bottom-up delete —
sessions → participants → waves → study, as those tables arrive — with no
`CASCADE` anywhere. Audit history survives the purge untouched: nothing in
the delete path references `audit_events`.

Participant erasure (#1270) is a separate audited command available in
**any** state — data-rights requests do not wait for a study to close. Its
mechanics ship with #1263/#1270; this design fixes two constraints for it:
the FK graph must make it a bounded bottom-up delete, and erasure is not
_only_ a delete — monitoring aggregates recompute afterward (#1270's own
decision), a derived-data obligation #1268 inherits.

Team deletion remains refused (`disableOrganizationDeletion: true`); this
design stops at the team boundary.

### D7 — Build against store-created versions; coordinate the publish RPC

`ProtocolStore.publishDraft` exists and works, but no RPC procedure exposes
it, and the protocol contract is actively owned by the editor track (#1272).
Nothing in the study model itself requires the RPC: foreign keys target the
table, and tests and seed data create versions through the store. The study
schema and commands therefore proceed immediately, and the
`protocols.publish` procedure is coordinated with the editor track as a
parallel item (§10). Until it lands, go-live works in tests and seeded
environments but cannot be demoed end-to-end from the UI.

### D8 — No study-roles table yet; discipline plus a named cutover debt

Study-level roles (Manager / Protocol Designer / Coordinator / Data Viewer)
are decided taxonomy (#1257) but scheduled for Phase 7. Study commands check
workspace roles the way protocol and team commands do today.

The preparation is structural: every study command makes its permission
check in exactly one place — a single predicate helper in
`study/commands.ts` — so #1257 later swaps the predicate without hunting
through plumbing. Version 1 predicates: any team member may read and create
studies and edit **Draft** configuration; configuration changes on a live or
paused study (which alter active delivery behavior), lifecycle transitions,
and deletion require owner/admin. The predicate is state-dependent so the
Draft-only boundary cannot be widened by accident in the command table.

Two consequences of v1 are recorded as known debt for the #1257 cutover
rather than discovered then. Under #1257's visibility model a workspace
Member sees only studies where they hold a study role, so the cutover needs
a grandfathering rule for studies that v1 made member-visible (for example,
seeding Study Manager for each study's creator) — the roles table arriving
empty does **not** mean the swap is free. And member-create is a v1-only
widening: #1257's matrix grants creation through study roles that someone
must assign, so the cutover will narrow it — a user-visible change to plan,
not an accident to explain.

### D9 — Row shape: typed columns for lifecycle, JSONB for delivery settings

Fields the lifecycle logic branches on are real typed columns: `state`,
`participation_mode`, `wave_progression`, `pause_grace_minutes`,
`deletion_requested_at`, and the evidence timestamps. Settings that future
delivery features will keep adding (link expiry, onboarding configuration)
live in a single `settings` JSONB column validated with Zod at write time —
the same posture as the protocol store's JSONB validation. The split is
deliberate; moving a field across it later is a migration.

The audit `resource_label` is the study name, following the platform's
name-as-label convention (team name, protocol name) for a consistent activity
feed. This is a recorded decision, not an accident: study names are
researcher-chosen and could be sensitive, and the log is already restricted
to team administrators, which is the same reasoning that admits invitation
addresses. Participant contact details never appear in any study event.

Interview sessions ship with #1297, but their shape is sketched in §8 so the
purge order (D6) and the queryability principle (#1242 principle 6) have a
stable target.

## 4. Schema

### 4.1 `studies`

A new schema module at `apps/studio/server/src/study/schema.ts`, exporting
`STUDY_TABLES` and `STUDY_SIDECAR_SQL`, registered in `db/schema.ts`
(`SCHEMA` spread and `SIDECARS` array). The sidecar's position must keep its
`tenantTablesSql` grants **before `AUDIT_SIDECAR_SQL`**, which must remain
last — the existing ordering test asserts every broad grant precedes the
audit revocations; anywhere before the audit sidecar satisfies it.

| Column                  | Type          | Contract                                                                                                              |
| ----------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------- |
| `id`                    | `uuid`        | Client-minted, server-validated primary key (idempotent create, §6)                                                   |
| `team_id`               | `text`        | Required; plain FK to `teams.id`, deliberately no cascade                                                             |
| `name`                  | `text`        | Required; whitespace-aware nonblank `CHECK` (the `teams` pattern); the audit label source, bounded at 320 in commands |
| `state`                 | `text`        | `draft`, `live`, `paused`, or `closed`; database `CHECK`; default `draft`                                             |
| `participation_mode`    | `text`        | `managed` or `anonymous`; database `CHECK`; default `managed`                                                         |
| `wave_progression`      | `text`        | `window` or `sequential`; database `CHECK`; default `window`                                                          |
| `pause_grace_minutes`   | `integer`     | Required, `>= 0`; default `60`; consumed by session delivery (#1297)                                                  |
| `protocol_id`           | `uuid`        | Nullable while Draft; composite FK `(protocol_id, team_id)` → `protocols`                                             |
| `settings`              | `jsonb`       | Required, default `{}`; Zod-validated delivery settings (D9)                                                          |
| `deletion_requested_at` | `timestamptz` | Nullable soft-delete marker (D6)                                                                                      |
| `purge_after`           | `timestamptz` | Nullable; the persisted deletion deadline, set/cleared atomically with the marker (D6)                                |
| `went_live_at`          | `timestamptz` | Nullable evidence of the first go-live; never a state substitute                                                      |
| `paused_at`             | `timestamptz` | Nullable; set by `pauseStudy`, cleared by `resumeStudy` and `closeStudy`; the grace-window anchor                     |
| `closed_at`             | `timestamptz` | Nullable evidence of the most recent close; cleared by `reopenStudy`                                                  |
| `created_at`            | `timestamptz` | Required, default now                                                                                                 |
| `updated_at`            | `timestamptz` | Required, default now                                                                                                 |

The nonblank `CHECK` is not cosmetic: the study name is every study event's
`resource_label`, and the audit table's label-length constraint would
otherwise turn a blank name into an opaque audit-append failure inside every
audited study command.

Constraints and indexes:

- `unique(id, team_id)` so children can composite-FK to the study;
- `index(team_id)` team-first, matching `protocols`;
- a **partial index** on `purge_after` (`WHERE deletion_requested_at IS NOT
NULL`) for the maintenance purge scan — the only cross-team query in the
  domain, which the team-first index cannot serve;
- `CHECK` constraints on `state`, `participation_mode`, `wave_progression`,
  `pause_grace_minutes >= 0`, the nonblank name, and marker/deadline
  consistency (`deletion_requested_at` and `purge_after` are both null or
  both set);
- `teamIsolationPolicy()` and membership in the sidecar's
  `tenantTablesSql([...])` call (forced RLS plus role grants).

`went_live_at` records the **first** go-live and is not cleared by pause,
close, or reopen — it is the participation-mode freeze evidence (D5).
`closed_at` is cleared by `reopenStudy` (a live study must not carry a close
timestamp); the close history lives in the audit log.

### 4.2 `study_waves`

| Column                | Type          | Contract                                                                                    |
| --------------------- | ------------- | ------------------------------------------------------------------------------------------- |
| `id`                  | `uuid`        | Client-minted, server-validated primary key (idempotent creation, §6)                       |
| `study_id`            | `uuid`        | Required; composite FK `(study_id, team_id)` → `studies (id, team_id)`                      |
| `team_id`             | `text`        | Required tenant key                                                                         |
| `wave_number`         | `integer`     | Required, `>= 1`; `unique(study_id, wave_number)`                                           |
| `name`                | `text`        | Nullable display name ("Baseline", "6-month follow-up")                                     |
| `protocol_version_id` | `uuid`        | Nullable until go-live; composite FK `(protocol_version_id, team_id)` → `protocol_versions` |
| `created_at`          | `timestamptz` | Required, default now                                                                       |

Constraints and indexes:

- `unique(id, team_id)` so sessions (#1297) can composite-FK to the wave;
- `unique(study_id, wave_number)` and `CHECK (wave_number >= 1)`;
- `index(team_id)` team-first;
- `teamIsolationPolicy()` and sidecar registration.

Wave windows (`opens_at` / `closes_at`) and progression enforcement belong to
#1267 as additive nullable columns plus feature work. `wave_progression`
already lives on the study (D9) so #1267 adds behavior, not a study
migration.

Study creation inserts wave 1 in the same transaction (D1). Waves are added
and removed by Draft-only commands (§5.2): `createWave` appends the next
`wave_number` (up to a domain maximum of 50 waves per study — far beyond any
real longitudinal design, and what keeps `StudyDetail` and the retarget
event's cleared-pin list bounded), and `deleteWave` removes only the
highest-numbered wave and
never wave 1, keeping numbering dense without renumbering history. Wave
identity (`wave_number`, `study_id`, `team_id`) is immutable at the database
level (§4.3) — sessions will attach to waves, and a renumbered wave would
silently reattribute data.

### 4.3 Sidecar: the Closed guard

`STUDY_SIDECAR_SQL` contains, alongside `tenantTablesSql(['studies',
'study_waves'])`:

- a `BEFORE UPDATE` trigger on `studies` that, when `OLD.state = 'closed'`,
  raises `closed studies are read-only` unless the update is confined to an
  **allowed column set** — `state`, `deletion_requested_at`, `purge_after`,
  `closed_at`, `updated_at` — the columns the reopen and deletion commands
  legitimately touch. The comparison is deny-by-default (compare
  `to_jsonb(OLD)` and `to_jsonb(NEW)` with the allowed keys removed), so a
  column added to `studies` later fails closed instead of silently becoming
  writable on closed studies. The `state` column being in the allowed set is
  not a free exit: the trigger additionally constrains the shape of leaving
  `closed` — the only permitted new state is `live` with `closed_at` cleared
  in the same update, the exact write `reopenStudy` makes. Anything else
  (closed → draft, closed → paused, or leaving with `closed_at` still set)
  raises. Preconditions, authorization, and the audit event remain the
  command layer's job — the trigger is a backstop against buggy writes, not
  a substitute for `reopenStudy`;
- a `BEFORE UPDATE` trigger on `study_waves` refusing any change to
  `wave_number`, `study_id`, or `team_id` (wave identity, §4.2); and
- a `BEFORE INSERT OR UPDATE OR DELETE` trigger on `study_waves` that raises
  `closed studies are read-only` when the parent study's state is `closed` —
  except that a **`DELETE` by the maintenance role** (`current_user =
'studio_maintenance'`) is admitted, which is how the purge job (§5.5)
  deletes the waves of a closed study. The exemption is scoped to `DELETE`
  because the purge only ever deletes: a maintenance `INSERT` or `UPDATE`
  under a closed study stays blocked like any other role's. The exemption
  mirrors the maintenance clause the RLS policies already carry; triggers
  otherwise apply to every role. A pleasant consequence worth preserving:
  because the `studies` trigger guards only `UPDATE`, it is this wave
  trigger plus the no-cascade FK that makes a closed study undeletable by
  the application role at the database level.

Like the `protocol_versions` triggers, these are the database-level backstop
for promises the command layer already enforces; the command layer remains
the source of the friendly, typed error.

### 4.4 Schema pipeline obligations

The schema PR must, in the same change:

- register `STUDY_TABLES` and `STUDY_SIDECAR_SQL` in `db/schema.ts` (ordering
  per §4.1);
- run `pnpm --filter @codaco/studio-server sync-fingerprint` (fingerprint
  constant, `apps/studio/schema-erd.svg`, README schema section);
- extend the hard-coded inventories: the full table list in
  `src/__tests__/schema.test.ts` and the tenant-table list in
  `src/db/__tests__/rls.test.ts`;
- extend `schema.test.ts`'s per-trigger documentation assertions with the new
  study trigger names; and
- update the README prose ("five modules" becomes six).

## 5. Commands and audit events

### 5.1 Module layout

`src/study/` mirrors `src/protocol/` exactly:

- `schema.ts` — tables plus sidecar (§4);
- `store.ts` — plain SQL methods taking a `pg.PoolClient`, `FOR UPDATE`
  row locks, no permission checks, no events;
- `commands.ts` — audited commands via `runAuditedCommand`, a single
  permission-predicate helper (D8), a typed transition map (D3), and a
  `StudyCommandError` carrying a union of stable error codes that the RPC
  layer maps to oRPC error codes.

The source transaction-policy test already prevents any other file from
opening a tenant transaction; `study/commands.ts` joins the audited-command
seam. Two importer allowlists change: a new test pins `study/commands.ts` as
the only importer of `study/store.ts`, and the existing `team/store.ts`
allowlist gains `study/commands.ts` (study commands lock the caller's
membership through `TeamStore.lockActor`).

### 5.2 Command inventory

Every command locks the caller's membership row inside the transaction
(`TeamStore.lockActor`), locks the study row `FOR UPDATE`, checks the
predicate for its operation, validates the transition map where applicable,
performs the write through the store, and returns its typed events.

| Command                | Allowed states      | Predicate                                  | Notes                                                                                                                                                            |
| ---------------------- | ------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createStudy`          | —                   | member                                     | Inserts the study (Draft) and wave 1 atomically; client-minted id makes retries idempotent (§6)                                                                  |
| `updateStudySettings`  | draft, live, paused | member (draft); owner/admin (live, paused) | Name, settings blob, grace window; `protocol_id` (retarget, clears pins), `participation_mode`, `wave_progression` only while Draft; no-op returns `unchanged`   |
| `createWave`           | draft               | member                                     | Appends the next `wave_number`, optional name; client-minted wave id (replay returns `unchanged`); refused for anonymous studies (D5) and beyond the 50-wave cap |
| `updateWave`           | draft, live, paused | member (draft); owner/admin (live, paused) | Display name only in v1; #1267 extends with windows                                                                                                              |
| `deleteWave`           | draft               | member                                     | Highest-numbered wave only, never wave 1 (§4.2)                                                                                                                  |
| `rebindWave`           | draft, live, paused | owner/admin                                | Pins a wave to a published version of the study's protocol line (D2)                                                                                             |
| `goLive`               | draft               | owner/admin                                | Preconditions in §5.3; refused while `deletion_requested_at` is set                                                                                              |
| `reopenStudy`          | closed              | owner/admin                                | Shares §5.3's precondition helper; clears `closed_at` and `paused_at`; refused while `deletion_requested_at` is set; emits its own event                         |
| `pauseStudy`           | live                | owner/admin                                | Sets `paused_at`                                                                                                                                                 |
| `resumeStudy`          | paused              | owner/admin                                | Clears `paused_at`                                                                                                                                               |
| `closeStudy`           | live, paused        | owner/admin                                | Sets `closed_at`; clears `paused_at`                                                                                                                             |
| `requestStudyDeletion` | draft, closed       | owner/admin                                | Sets `deletion_requested_at` and `purge_after` atomically; a repeat request while the marker is set returns `unchanged` (D6)                                     |
| `cancelStudyDeletion`  | any with marker set | owner/admin                                | Clears the marker and `purge_after`                                                                                                                              |

Reads (`getStudy`, `listStudies`) go through the store under the tenant
scope, are added to the reads exclusion set in the audit policy test, and
produce no events.

**Denied attempts.** Commands whose effect starts or stops data collection or
destroys data — `goLive`, `reopenStudy`, `closeStudy`,
`requestStudyDeletion` — record audited denial events when a caller without
the owner/admin predicate attempts them, joining `DENIED_AUDIT_OPERATIONS`
and the existing denial rate limiter, the pattern the team commands set.
Member-level operations and the reversible `pauseStudy` / `resumeStudy` /
`cancelStudyDeletion` return plain FORBIDDEN without an event, matching the
protocol commands — a recorded classification, not an omission.

**Synchronous failures.** No study command classifies any synchronous domain
failure as a `failed` audit event in v1: go-live precondition failures and
illegal transitions are validation surfaced straight to the caller, with no
security invariant and no ambiguity about committed state (the audit
design's §7.3 criteria). This is revisited when sessions arrive.

### 5.3 Go-live and reopen preconditions

`goLive` (from Draft) and `reopenStudy` (from Closed) share one precondition
helper, validated against locked rows:

1. `deletion_requested_at` is not set — a pending deletion must be cancelled
   first;
2. the study has a protocol line (`protocol_id` non-null);
3. every wave pins a published version, and every pinned version belongs to
   that protocol line (D2);
4. an anonymous study has exactly one wave (D5); and
5. on the **first** go-live, `went_live_at` is set and `participation_mode`
   freezes (D5) — subsequent transitions never unfreeze it.

A precondition failure is a typed domain error naming the failed
precondition; the study is unchanged (see §5.2's synchronous-failure
classification).

### 5.4 Audit events

New version-1 event schemas under the existing `'study'` category (the
`audit_events` category check already permits it; no audit schema change):

- `study.created@1`
- `study.settings.updated@1` — changed-field names drawn from a server-owned
  enum for the version, with before/after values only for an enumerated
  scalar subset; a retarget additionally records the cleared wave pins (wave
  ids and previous version ids). New settings keys require a new event
  version — the details shape stays closed, never an open string array
- `study.wave.created@1` / `study.wave.updated@1` / `study.wave.deleted@1`
- `study.wave.rebound@1` — wave id/number, previous and new version ids and
  version numbers
- `study.went_live@1`
- `study.paused@1`
- `study.resumed@1`
- `study.closed@1`
- `study.reopened@1`
- `study.deletion.requested@1` — effective purge date in details
- `study.deletion.cancelled@1`
- `study.deletion.purged@1` — **system actor** (D6): appended by the purge
  job in its per-team transaction, with the study id, request evidence, and
  per-table row counts; its `failed` outcome records a purge attempt whose
  domain deletes rolled back to the savepoint — the event itself commits in
  the still-open outer transaction (D6), so a failed purge is never silent
- denial variants for the elevated commands (§5.2):
  `study.go_live_denied@1`, `study.reopen_denied@1`, `study.close_denied@1`,
  `study.deletion.request_denied@1`

All use `resource_type: 'study'`, `resource_id: <study id>`, and the study
name as `resource_label` (D9). Each `(event_type, 1)` pair registers its
validator, renderer, redaction rules, alert classification, fixture, and
output schema, and joins the hard-coded key list in `events.test.ts`. Every
event is `createsAlert: false` in v1; `study.deletion.requested@1` is the
natural first alert candidate when the alert-delivery slice (#1521/#1252)
arrives. Every new RPC mutation is classified `required` in
`RPC_MUTATION_AUDIT_POLICIES`; the reads join the policy test's exclusion
set. The registry's exhaustiveness tests enforce all of this.

### 5.5 The purge job

A background job on the maintenance pool (the pattern of protocol GC and
invitation delivery) scans for studies whose persisted `purge_after` has
passed (via the partial index, §4.1) **and** whose `state` is `draft` or
`closed` (belt-and-braces under D6's go-live refusal). The scan only
nominates candidates: each study's purge runs in one transaction under an
explicit per-team tenant scope that **locks the study row `FOR UPDATE` and
re-validates the marker, the deadline, and the state before deleting
anything** — a `cancelStudyDeletion` that commits after the scan therefore
always wins the race, because cancellation clears the marker under the same
row lock. The deletes then run bottom-up — sessions → participants → waves →
study, as those tables exist — behind a savepoint, and the transaction
appends `study.deletion.purged@1` with a system actor (succeeded, or failed
after rolling the deletes back to the savepoint; D6) — so this is an audited
transaction, not an entry in `NO_AUDIT_TRANSACTION_POLICIES`. The wave
trigger's DELETE-scoped maintenance exemption (§4.3) is what admits the
delete on a closed study. The job never updates or deletes `audit_events`
rows (the database refuses it regardless).

The deletion grace window is a server configuration value — a new variable
in the env catalogue (declared with its group, default of 7 days, and docs
entry in the deletion slice) — not per-study: it is a compliance property of
the installation, not a researcher choice. It is distinct from the per-study
**pause** grace window (`pause_grace_minutes`), and the two are never
interchangeable in prose or code.

## 6. RPC surface

A `studies` group in `packages/studio-rpc` (inputs extend `TeamScopedSchema`;
input and output types structurally identical, no transforms; explicit `.ts`
import extensions as that package requires). `studies.create` takes a
client-minted `studyId`, the `protocols.create` idempotency pattern: a
retried request cannot double-create.

```text
studies.create({ teamId, studyId, name })                  -> StudyDetail
studies.list({ teamId })                                   -> StudySummary[]
studies.get({ teamId, studyId })                           -> StudyDetail
studies.updateSettings({ teamId, studyId, patch })         -> StudyDetail
studies.createWave({ teamId, studyId, waveId, name? })     -> StudyDetail
studies.updateWave({ teamId, studyId, waveId, name })      -> StudyDetail
studies.deleteWave({ teamId, studyId, waveId })            -> StudyDetail
studies.rebindWave({ teamId, studyId, waveId, versionId }) -> StudyDetail
studies.goLive({ teamId, studyId })                        -> StudyDetail
studies.pause({ teamId, studyId })                         -> StudyDetail
studies.resume({ teamId, studyId })                        -> StudyDetail
studies.close({ teamId, studyId })                         -> StudyDetail
studies.reopen({ teamId, studyId })                        -> StudyDetail
studies.requestDeletion({ teamId, studyId })               -> StudyDetail
studies.cancelDeletion({ teamId, studyId })                -> StudyDetail
```

Each procedure dispatches to exactly one §5.2 command (`studies.goLive` →
`goLive`, `studies.reopen` → `reopenStudy`). The server implements the group
behind the existing `requireTeam` middleware (unknown team and non-member
both receive FORBIDDEN — no existence oracle), with an error mapper
translating `StudyCommandError` codes: authorization failures to FORBIDDEN,
illegal transitions and precondition failures to CONFLICT with the stable
code in the error data, and missing studies to NOT_FOUND, matching the team
commands' within-team missing-resource mapping — the no-oracle property
holds because RLS makes another team's study indistinguishable from a
nonexistent one.

`studies.createWave`'s `waveId` is client-minted like `studies.create`'s
`studyId`: a replayed request returns `unchanged` instead of silently
appending an extra timepoint.

`StudyDetail` includes the waves (id, number, name, pinned version id and
version number) so the client renders a study without N+1 calls — and, once
the study has a protocol line, the **published versions of that line** (id,
version number, label, published-at), because the rebind and go-live flows
need version ids to offer and no protocol-contract procedure lists them.
Carrying them on the study response keeps this design off the protocol
contract the editor track owns (D7); a general published-version read
procedure may supersede it later. Commands
assume a user principal today; when API tokens (#1288) arrive, the
`Principal` `kind` discriminant gates which study operations a token may
perform — a conscious assumption, recorded here.

## 7. Client

The studies routes are **new route-tree structure**, not additions to an
existing one: today's "team workspace" is the `TeamWorkspace` component
rendered at `/`, driven by Better Auth's active-team selection, and the only
team-parameterized route is the flat editor route. PR 5 introduces a shared
`/teams/$teamId` layout route that the studies screens nest under; the URL's
`teamId` is authoritative and the active-team mechanism follows it, the rule
the editor route already applies.

- `/teams/$teamId/studies` — list with empty state and create flow;
- `/teams/$teamId/studies/$studyId` — detail: state, protocol line, waves and
  pins, settings; per-state editability mirrored from the transition map;
- lifecycle controls with confirmation dialogs (go-live shows the
  preconditions checklist; close and delete explain their consequences);
- the deletion request/cancel flow with its grace-window messaging ships in
  the deletion slice (PR 7), alongside its server half.

Calls go through the typed oRPC client with TanStack Query, cache
invalidation keyed by team, mirroring the protocol screens. UI states —
loading, empty, permission-denied, illegal-transition conflict — are
explicit. Screens use shared Fresco UI components; the UI slices invoke the
`developing-network-canvas-ui` skill and get interaction tests.

## 8. Sessions and participants: the sketch this schema serves

These tables ship with #1263 and #1297, not here. The study spine commits to
their shape only where it constrains this schema:

- A **participant** belongs to exactly one study (composite FK to
  `studies (id, team_id)`); identity that spans waves is minted here, which
  is what prior-wave data resolution (#1302) consumes. PII lives only on
  this record — including the participant's IANA time zone, which
  scheduling (#1304) makes first-class — keeping the encryption tier's
  blast radius (#1258) off the study row.
- An **interview session** belongs to a wave (composite FK to
  `study_waves (id, team_id)`) and, in managed studies, to a participant;
  anonymous sessions carry a null participant. It carries its own
  **immutable `protocol_version_id`**, captured from the wave's pin at
  session creation — the wave's pin says what new sessions will run, the
  session's own pin says what this session ran, so rebinding a wave (D2)
  can never change an in-flight interview or orphan completed data. It
  records delivery mode and
  the initiating researcher (#1297), the current stage, network data, and
  start/finish timestamps, and becomes immutable on finalization — an
  immutability that must be UPDATE-only or carry the same maintenance-role
  exemption as §4.3, or it would block the purge and erasure paths exactly
  as an unexempted wave trigger would. Participant and session tables also
  need their own parent-state Closed guards (with the DELETE-scoped
  maintenance and erasure exemptions), because §4.3's triggers cover only
  `studies` and `study_waves` — without them, a buggy write could still
  modify an archived study's collected data. Sessions are modelled for
  cross-interview queryability (#1242 principle 6), not just export.
- Both purge bottom-up under D6 with no cascades; participant erasure
  (#1270) deletes session rows through the same FK path and then recomputes
  monitoring aggregates (§3 D6).

Session-creating commands refuse any study whose state is not `live`; writes
to already-started sessions are additionally permitted while `paused` within
`pause_grace_minutes` of `paused_at` (D3) — the enforcement points for
"Draft has no data" and Paused's "no new sessions".

## 9. Verification

Every producer test first proves its oracle can fail before its expected
state is accepted, per the audit design's rule.

### 9.1 Database integration tests

- Both study tables carry forced RLS; the tenant-table inventory test covers
  them; another team's studies are invisible and uninsertable.
- A wave whose `team_id` differs from its study's is rejected by the
  composite FK; likewise a pin whose version belongs to another team.
- Every `CHECK` rejects an out-of-range value (`state`,
  `participation_mode`, `wave_progression`, negative `pause_grace_minutes`,
  `wave_number < 1`, blank and whitespace-only names); a duplicate
  `(study_id, wave_number)` is rejected; `state` defaults to `draft`.
- The Closed trigger rejects configuration updates on a closed study while
  permitting the reopen and deletion-marker columns, and fails closed for a
  column added to `studies` after the trigger (deny-by-default probe).
- The wave-identity trigger rejects `wave_number`, `study_id`, and `team_id`
  changes in every state.
- The studies Closed trigger refuses every exit shape from `closed` except
  `state = 'live'` with `closed_at` cleared in the same update — closed →
  draft, closed → paused, and closed → live with `closed_at` still set all
  raise.
- The wave Closed trigger blocks the application role's wave writes on a
  closed study but admits the maintenance role's **deletes only** — a
  maintenance `INSERT` or `UPDATE` under a closed study is refused, and the
  purge of a closed, deadline-expired study runs to completion through it.
- The marker/deadline consistency `CHECK` rejects a row with only one of
  `deletion_requested_at` / `purge_after` set.
- Deleting a study via the marker flow removes waves and the study
  bottom-up and leaves every `audit_events` row intact.
- The regenerated fingerprint, ERD, README section, and inventories are
  synchronized (existing tests enforce this).

### 9.2 Domain and RPC tests

- Every transition in the map succeeds from its allowed states and is
  refused with a typed code from every other state; each success commits
  exactly its event, and a forced audit-append failure rolls the transition
  back.
- Concurrency: two racing transitions on one study serialize under the row
  lock and exactly one succeeds; a `requestStudyDeletion` racing `goLive`
  cannot interleave into a live study carrying the marker.
- Go-live and reopen enforce all five preconditions (§5.3); each failure
  names its precondition and changes nothing; both are refused while the
  deletion marker is set, and the purge query's state check ignores a live
  study even with an expired marker.
- `participation_mode` and `wave_progression` edits succeed while Draft and
  are refused after `went_live_at` is set, including after close and reopen.
- Publishing a new protocol version changes no wave pin (invariant 2.3.3's
  "never automatic", as a negative probe).
- Rebind refuses a version from a different protocol line and an unpublished
  draft; a successful rebind records previous and new versions.
- Draft protocol-line retarget clears wave pins and records the cleared pins
  in its event details.
- Wave commands: `createWave` is Draft-only, refused for anonymous studies
  and at the 50-wave cap, and a replay with the same client-minted wave id
  returns `unchanged` instead of appending a timepoint; `deleteWave` refuses
  any wave but the highest-numbered and refuses wave 1; a multi-wave managed
  study created through the commands goes live.
- An anonymous study cannot go live with more than one wave; a managed
  multi-wave study can.
- A member's `updateStudySettings` / `updateWave` succeeds while Draft and
  is refused once the study is live or paused (owner/admin required) — the
  D8 Draft-only boundary.
- Deletion request/cancel enforce owner/admin and Draft/Closed;
  `requestStudyDeletion` persists `purge_after` from the grace window in
  force at request time, and a repeat request returns `unchanged` without
  moving the deadline or emitting a second event.
- Changing the server's grace-window configuration moves no existing
  request's `purge_after`.
- The purge job ignores studies whose deadline has not passed, purges those
  beyond it, and appends `study.deletion.purged@1` (succeeded) in the purge
  transaction — the oracle-can-fail probe asserts the succeeded event is
  absent when the purge is deliberately broken, while the `failed`-outcome
  event **is** present and the domain rows are intact after the savepoint
  rollback.
- Cancellation-versus-purge race: a `cancelStudyDeletion` that commits after
  the candidate scan but before the per-study purge transaction prevents the
  deletion — the purge's locked recheck sees the cleared marker and skips.
- Denied-attempt coverage: a member calling `goLive`, `reopenStudy`,
  `closeStudy`, or `requestStudyDeletion` receives FORBIDDEN **and** the
  corresponding
  `*_denied@1` event under the rate limiter; member-level and reversible
  operations produce no denial event.
- `studies.create` retried with the same client-minted id does not
  double-create.
- `StudyDetail` lists the study's waves and, once a protocol line is set,
  that line's published versions.
- Names longer than 320 characters are bounded in labels; settings-update
  no-ops return unchanged without inventing an event.

### 9.3 UI tests

- List, create, detail, and settings flows, including empty and
  permission-denied states.
- Lifecycle controls render per-state, confirm before acting, and surface
  precondition failures legibly.
- Interaction tests for the transition confirmations; the deletion
  grace-window messaging tests ship with the deletion slice (PR 7).

## 10. Delivery plan

Sequential PRs, landed one at a time on `main` (stacked PRs get no CI in this
repo until retargeted). Every implementation PR (2–7) carries one changeset
in the Studio release lane naming the Studio packages it touches — the
client and RPC packages included, not only the server — and never mixed with
the normal lane. PR 1 is docs-only and carries none.

Each PR extends the `studies` contract group with **only the procedures
whose commands it implements** — the contract/policy pairing test refuses a
procedure without its policy entry, so contract, implementation, and policy
land together per slice.

| PR  | Slice                          | Contents                                                                                                                                                                                                                                                                                 |
| --- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **This design**                | Docs-only; merge is acceptance on #1262; slices below filed as child issues                                                                                                                                                                                                              |
| 2   | **Schema spine**               | `studies` + `study_waves`, composite FKs, RLS, the three sidecar triggers, registration, regenerated artifacts, inventory updates. No commands or RPC — small on purpose, so review verifies the tenancy pattern exactly                                                                 |
| 3   | **Creation & configuration**   | `StudyStore`, `createStudy`/`listStudies`/`getStudy`/`updateStudySettings`, the wave commands, `rebindWave`, their events, the matching contract procedures and policy entries                                                                                                           |
| 4   | **Lifecycle transitions**      | One audited command per transition with the shared precondition helper, denial events, and matching procedures; the heart of #1262                                                                                                                                                       |
| 5   | **Client: studies home**       | The `/teams/$teamId` layout route (§7), list, create, detail, settings routes; empty states; interaction tests                                                                                                                                                                           |
| 6   | **Client: lifecycle controls** | State chips, transition confirmations, per-state editability                                                                                                                                                                                                                             |
| 7   | **Deletion & grace window**    | Request/cancel commands and procedures, the system-actor audit-writer extension (D6), the maintenance purge job with bottom-up-order tests, the grace-window env-catalogue variable, and the client request/cancel flow with its messaging. Last, because it needs the finished FK graph |

Parallel, order-independent:

- **Migrations adoption** — the D4 gate: must merge before any pilot study
  goes Live; blocks nothing above.
- **Seed data** — a demo team, protocol, published version, and study in
  `src/db/seed.ts` (currently a stub), any time after PR 3.
- **`protocols.publish` RPC** — coordinated with the editor track (#1272) in
  week one (D7). Until it lands, go-live is exercised through tests and seed
  data only.

## 11. GitHub tracking

#1262 is accepted by merging PR 1; slices 2–7 are filed as its child issues
inside the Phase 4 epic (#1261). The D4 migrations gate is recorded on #1262
so it cannot be forgotten. #1267 (waves), #1263 (participants), #1270
(erasure), and #1297 (sessions) remain their own issues and now build on the
spine and the decisions recorded here; nothing in this plan pulls their
feature work forward.

## 12. Definition of done

The study model is complete when:

- both tables exist under forced RLS with composite FKs, appear in every
  inventory, and the regenerated schema artifacts are synchronized;
- every command in §5.2 commits atomically with its typed event or not at
  all, the transition map refuses every undefined transition, and the
  elevated commands record their denial events;
- go-live and reopen enforce the five preconditions, freeze participation
  mode, and refuse a study marked for deletion;
- a closed study is read-only at the database level (deny-by-default) and
  reopenable through the audited command;
- deletion honours state and role restrictions, its persisted deadline, and
  a late cancellation; survives its grace window,
  purges bottom-up through the maintenance exemption without touching audit
  history, appends its system-actor purge event, and team deletion remains
  refused;
- researchers can create, configure, transition, and delete a study from the
  client with explicit per-state UI; and
- the D4 migrations gate is recorded and the `protocols.publish`
  coordination is underway.
