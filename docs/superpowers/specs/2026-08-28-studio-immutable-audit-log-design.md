# Studio Immutable Team Audit Log Design

**Status:** Accepted for implementation (2026-08-28).

**Tracking:** #1259 (audit log and data-egress alerting), #1252
(observability foundation), #1257 (role-based access control), #1256 (team
invitations), #1515 (initial team-management UI), #1519 (immutable foundation),
#1520 (activity UI), and #1521 (producer and alert expansion).

## 1. Summary

Studio will give authorized team administrators an immutable, chronological
record of every potentially important action taken within their team. The log
is a domain record, not an application debug log: it explains who did what,
when, to which resource or person, and whether the action succeeded, without
copying protocol contents, participant answers, secrets, or raw requests into
the record.

Immutability is enforced in PostgreSQL. Application and maintenance roles may
insert and read audit events, but may not update, delete, or truncate them. A
trigger rejects update and delete attempts as a second line of defense. Audit
rows do not cascade from mutable team, user, member, or resource records, and
display labels needed to understand an event are captured at event time.

An important successful mutation and its audit event MUST commit in the same
database transaction. If Studio cannot append the event, it MUST roll back the
mutation and return an error. This requires team-administration writes that are
currently sent directly to Better Auth, beginning with role changes and
invitations, to move behind Studio-owned domain commands. Better Auth may
continue to provide authentication, sessions, active-team selection, and
read-only organization data, but a client-visible Better Auth endpoint must not
remain as an unaudited alternative for a mutation Studio owns.

The immutable foundation and current team-administration producers are the next
Studio implementation slice. They will establish the mandatory audited-command
seam and audit the team actions already exposed in the UI. A team activity
screen and export follow on that foundation. Protocol, study, participant,
interview-data, credential, and integration producers are added as those
capabilities become writable. Data-egress alerts are derived from the same
immutable events through a transactional outbox; they depend on the broader
observability and notification work but do not block the initial audit log.

## 2. Requirements

### 2.1 Fundamental requirement

Teams must be able to observe all potentially important actions taken in their
scope. The audit log MUST be immutable.

For this design, “potentially important” means an action that changes or
attempts to change one of the following:

- who can access a team or what they are allowed to do;
- the lifecycle, published state, or availability of an important resource;
- the contents of a protocol at a meaningful server commit boundary;
- participant identity, consent, or research data;
- the movement of sensitive data out of Studio;
- a credential, API token, webhook, integration, or security setting; or
- an audit, retention, deletion, or other compliance-relevant control.

### 2.2 Invariants

1. **Append only.** No supported application, administrative, migration, or
   maintenance operation updates, deletes, or truncates an audit event.
2. **Atomic on success.** An important mutation and its successful audit event
   commit or roll back together.
3. **Server authoritative.** Events are created by the server command that
   performs or authoritatively observes the action. The browser never submits
   a trusted actor, timestamp, previous value, outcome, or arbitrary event.
4. **Team isolated.** Every query and insert is constrained by the explicit
   team in the command and by PostgreSQL row-level security.
5. **Historically intelligible.** Removing or renaming an actor, target, team,
   or resource cannot erase or silently rewrite what the event meant.
6. **Data minimizing.** The log contains enough context to understand the
   action, but no secrets, participant answers, protocol document bodies, raw
   requests, or unbounded arbitrary metadata.
7. **Ordered.** Each team has a gap-tolerant, monotonically increasing event
   sequence. Pagination never depends only on wall-clock timestamps.
8. **Fail closed for required audit writes.** If an audit-required successful
   mutation cannot append its event, the mutation does not commit.

### 2.3 Interpretation of immutability

The requirement is an application and database contract: the Studio runtime
roles, including `studio_maintenance`, cannot mutate existing events, and the
database rejects such statements. A self-hosting database owner necessarily
retains the power to alter its own schema, disable triggers, restore backups,
or rewrite storage. Cryptographic notarization to an independent write-once
service is therefore outside the first implementation. It could add tamper
evidence later, but it would not replace the database restrictions in this
design.

## 3. Relationship to observability and alerts

Studio must keep three related systems distinct:

| System                            | Purpose                                                                       | Mutability and retention                                                             |
| --------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Team audit log                    | Human-readable accountability for domain and security actions                 | Append-only; retained for the installation/team lifetime                             |
| Operational observability (#1252) | Debugging, performance, traces, metrics, infrastructure and incident response | Operational retention; may be sampled or rotated                                     |
| Alert delivery                    | Notify configured recipients about selected high-risk audit events            | Mutable delivery attempts in an outbox; immutable source event remains authoritative |

Operational logs may correlate to an audit event using `request_id` and
`audit_event_id`, but an operational log entry does not satisfy the audit
requirement. An email or webhook delivery record does not become the source of
truth for the underlying action.

## 4. Event model

### 4.1 `audit_events` table

Add an `AUDIT_TABLES` schema module under
`apps/studio/server/src/audit/schema.ts`, registered with the existing Studio
schema and fingerprint pipeline.

| Column           | PostgreSQL type | Contract                                                   |
| ---------------- | --------------- | ---------------------------------------------------------- |
| `id`             | `uuid`          | Server-generated primary key                               |
| `team_id`        | `text`          | Required tenant key; deliberately no cascading foreign key |
| `sequence`       | `bigint`        | Required per-team order; unique with `team_id`             |
| `occurred_at`    | `timestamptz`   | Required database default `statement_timestamp()`          |
| `event_type`     | `text`          | Stable machine name such as `team.member.role_changed`     |
| `event_version`  | `smallint`      | Payload schema version, initially `1`                      |
| `category`       | `text`          | One of the categories in section 4.3                       |
| `outcome`        | `text`          | `succeeded`, `denied`, or `failed`                         |
| `actor_kind`     | `text`          | `user`, `api_token`, or `system`                           |
| `actor_id`       | `text`          | Stable identifier; nullable only for a system actor        |
| `actor_label`    | `text`          | Minimal display snapshot, normally name or email           |
| `subject_type`   | `text`          | Optional affected person/credential kind                   |
| `subject_id`     | `text`          | Optional stable affected-person identifier                 |
| `subject_label`  | `text`          | Optional minimal affected-person display snapshot          |
| `resource_type`  | `text`          | Optional affected resource kind                            |
| `resource_id`    | `text`          | Optional stable resource identifier                        |
| `resource_label` | `text`          | Optional display snapshot such as protocol name            |
| `request_id`     | `uuid`          | Required request/operation correlation id                  |
| `details`        | `jsonb`         | Required event-specific, versioned, bounded payload        |

Database checks constrain `category`, `outcome`, and `actor_kind` to their
known values. `actor_id` is required unless `actor_kind = 'system'`. Event
payload validation remains in the typed server writer because each event type
has a different `details` shape.

`statement_timestamp()` records the start of the insert statement rather than
the start of a possibly long or lock-blocked transaction. `occurred_at` is a
display and date-filter value; `sequence` remains the authoritative order.

Indexes:

- unique `(team_id, sequence)`, which also serves the newest-first primary
  activity feed through a backward B-tree scan;
- `(team_id, occurred_at DESC, sequence DESC)` for bounded date-range scans;
- `(team_id, event_type, sequence DESC)` for event filtering; and
- `(team_id, actor_id, sequence DESC)` for actor filtering.

There is deliberately no separate `(team_id, sequence DESC)` index: PostgreSQL
can scan the unique ascending B-tree backward, and duplicating it would add
write amplification and lifetime storage to the highest-volume table.

The primary feed cursor is the last returned `sequence`. It requests events
with a lower sequence, so equal timestamps, clock adjustments, and concurrent
requests cannot duplicate or omit rows.

Because a PostgreSQL `bigint` can exceed JavaScript's safe integer range,
`sequence` is represented as a base-10 string at the RPC boundary. Clients may
display and round-trip it but do not perform numeric arithmetic on it.

### 4.2 Per-team sequence allocation

`AuditStore.append(client, event)` receives the `pg.PoolClient` already owned
by the domain transaction. It acquires a transaction-scoped PostgreSQL advisory
lock derived from `team_id`, reads the current maximum sequence through the
team-first index, and inserts `maximum + 1`. The lock is held until commit or
rollback, which serializes append order for that team without introducing a
mutable stream-head row.

The advisory-lock key derivation must be centralized and tested. The query
still includes an explicit `team_id` predicate and runs inside a `TenantDb`
transaction with `app.team_id` set, so row-level security is not the only
tenant boundary. A rolled-back transaction may result in a reused candidate
sequence, but committed rows remain monotonic; consumers must not interpret a
sequence as a count of attempted actions.

### 4.3 Categories

Version 1 defines these stable categories:

- `team_access`
- `protocol`
- `study`
- `participant_data`
- `data_egress`
- `credential`
- `integration`
- `security`
- `audit`

Categories are a presentation and filtering aid. Authorization and alert
policy are based on the exact event type, not a user-provided category.

### 4.4 Typed event definitions

The server owns a discriminated `AuditEventInput` union. Each member fixes its
`eventType`, `eventVersion`, `category`, subject/resource kinds, and `details`
schema. The writer does not accept an arbitrary string plus arbitrary JSON.

Every event type is registered with:

- its input validator;
- its human-readable title and detail renderer;
- its sensitive-field/redaction rules;
- whether it requires an alert-outbox row; and
- its test fixture.

An exhaustive registry test fails when a union member lacks any of these
entries. Responses exposed through `@codaco/studio-rpc` use a separate output
schema that is the wire allowlist.

### 4.5 Data-minimization rules

`details` may contain identifiers, bounded before/after values, counts, the
name of an exported format, and policy-relevant classifications. It MUST NOT
contain:

- protocol sections, patches, or assembled protocol JSON;
- participant answers, network data, consent form contents, or interview data;
- passwords, magic links, session values, API token material, cookies,
  authorization headers, or object-storage credentials;
- raw HTTP request/response bodies, stack traces, or SQL;
- files or exported data; or
- an open-ended copy of client-submitted metadata.

Team invitation addresses may be stored as `subject_label` because the target
address is necessary to understand an access grant and the log is restricted
to team administrators. Participant contact details are never stored as
labels; participant events use a stable identifier and a non-sensitive study
reference. Labels are length-bounded at validation and insertion.

## 5. Immutability and tenant enforcement

### 5.1 Database privileges

`ACCESS_SIDECAR_SQL` currently grants `SELECT`, `INSERT`, `UPDATE`, and
`DELETE` over all tables to both runtime roles. The audit sidecar must run
after that general grant and revoke the capabilities the audit table must not
have:

```sql
REVOKE UPDATE, DELETE, TRUNCATE ON audit_events
  FROM studio_app, studio_maintenance;
```

Both roles retain `SELECT` and `INSERT`. There is no application API or store
method that issues an audit update or delete. Future generic privilege changes
must keep the revocation last; a database integration test guards that order.

### 5.2 Trigger defense

A `BEFORE UPDATE OR DELETE` trigger on `audit_events` raises `audit events are
immutable`. This protects against a future broader grant and privileged
maintenance code. `TRUNCATE` is prevented by privileges. The table has no
cascading foreign keys; ordinary deletion of a user, membership, invitation,
protocol, study, or participant cannot remove its history.

### 5.3 Row-level security

`audit_events` uses an audit-specific forced-RLS policy and is included in the
complete tenant-table inventory. Unlike the general maintenance policy, the
audit policy requires `app.team_id` to be set and equal to the row's `team_id`
for both `studio_app` and `studio_maintenance`. Maintenance work that needs
audit access therefore opens one explicit `TenantDb` scope per team; a
maintenance connection with missing context sees no rows and cannot insert.
The schema test that enumerates team tables must fail if the audit table is not
covered, and an integration test guards the stricter maintenance predicate.

RLS prevents cross-team reads and writes. The RPC layer separately verifies
the caller's membership and required role against the explicit `teamId`; it
never trusts the session's active team as authorization.

### 5.4 Retention and correction

Audit events are retained for the lifetime of the installation. Team deletion
remains disabled. If a future legal or installation-retirement workflow must
destroy audit data, it is a separately authorized, offline database-owner
operation—not a row-level Studio feature—and its consequences must be made
explicit to the operator.

An incorrect event is not edited. A correcting event refers to the original
`audit_event_id` and explains the correction without replacing history.

## 6. Authorization

Version 1 adds two permissions to the Studio authorization vocabulary:

- `audit.read`
- `audit.export`

Until #1257 introduces configurable/custom role policy, built-in `owner` and
`admin` receive both permissions and `member` receives neither. Server
procedures check the permission explicitly; hiding a route or button is not an
authorization boundary. This restriction is appropriate because the log may
contain invitation addresses and security events.

An event keeps actor and subject snapshots from the time it occurred. Access
to an old event is determined by the viewer's current team role, not by the
actor's current membership or role.

## 7. Event policy and initial taxonomy

### 7.1 Record these actions

The first implementation defines the following event names even when their
producer arrives in a later feature. Producers are added only when the
corresponding domain operation exists.

**Team and access**

- `team.created`
- `team.settings.updated`
- `team.invitation.created`
- `team.invitation.cancelled`
- `team.invitation.accepted`
- `team.invitation.rejected`
- `team.member.added`
- `team.member.removed`
- `team.member.role_changed`
- `team.ownership.transferred`

`team.member.role_changed` records the target member id and label, exact
`previousRoles` and `newRoles` arrays, and the authenticated actor. It does not
infer the previous value after the update.

**Protocols**

- `protocol.created`
- `protocol.imported`
- `protocol.renamed`
- `protocol.draft.committed`
- `protocol.published`
- `protocol.archived`
- `protocol.deleted`
- `protocol.exported`

`protocol.draft.committed` is emitted once per accepted server command batch or
explicit commit boundary, not once per keystroke, cursor move, undo, redo, or
lease renewal. It may record the protocol and draft ids, revision, affected
section ids/categories, operation types, and operation count. It does not
store the patch or section contents.

**Studies, participants, and research data**

- study creation, settings changes, protocol assignment/version changes,
  archive, deletion, and study-specific access changes;
- participant creation, import, transfer, archive, and deletion;
- consent captured or withdrawn, by identifier and policy version only;
- viewing or exporting participant-identifying information;
- interview-data export and deletion; and
- bulk data-export request, completion, and failure.

Exact names and version-1 payload schemas are added with the feature that
creates each producer, using the naming rules in this specification.

**Credentials, integrations, security, and the log itself**

- API token creation, scope change, revocation, and data-egress use;
- webhook/integration creation, sensitive configuration change, disable, and
  deletion;
- denied high-risk access or mutation attempts when a team can be established
  without creating an existence oracle; and
- `audit.export.started`, `audit.export.failed`, and `audit.corrected`.

### 7.2 Do not record these actions

The team audit log excludes ordinary navigation, switching the active team,
opening non-sensitive metadata lists, form validation messages, focus and
selection changes, draft keystrokes, cursor/presence traffic, synchronization
heartbeats, lease renewal, health checks, metrics, and debug traces.

This avoids turning the audit log into noisy product analytics while retaining
meaningful server-side commit boundaries.

### 7.3 Outcomes and denied attempts

Successful writes use `outcome = 'succeeded'` and share the transaction with
the action.

Denied attempts are recorded for actions with elevated security relevance—for
example, role escalation, sensitive export, PII access, token use, or audit-log
access—when Studio can establish the target team without changing the
non-member/unknown-team response. The denial writer uses the authenticated
principal and server-derived target. Authorization work returns a typed
`denied` decision rather than throwing inside the primary transaction; the
executor commits the denial event with no domain mutation and only then
translates the decision into the RPC authorization error. If that append fails,
the requested action remains denied and the server emits a critical operational
signal; an audit outage must never cause an unauthorized action to succeed.

`failed` covers both an important asynchronous operation whose committed
attempt later fails and an authorized, audit-relevant synchronous attempt that
rolls back because a domain invariant or execution step rejects it. For the
synchronous case, the executor first rolls back the primary transaction, then
opens a separate audit-only transaction containing the original request id,
server-established team and actor, event type, and a bounded stable failure
reason. It never copies exception text, a stack, request data, or partially
mutated state. Failure of this secondary append cannot turn the failed action
into success; it produces a critical operational signal.

Denied requests are rate-limited before any per-team audit advisory lock or
append. A bounded, expiring operational counter is keyed by authenticated
actor, team, and operation. Attempts within the policy threshold receive
individual immutable events. Excess attempts are still denied but update the
bounded counter, and at most one immutable
`security.denied_attempts.rate_limited` summary per actor/team/operation/window
records the suppressed count and first/last timestamps. Unknown teams never
receive events. This preserves security visibility without allowing a caller
to grow permanent storage or serialize a team's legitimate audit commands at
an unbounded rate.

## 8. Command and transaction architecture

### 8.1 Audit writer

Create:

- `apps/studio/server/src/audit/events.ts` — discriminated event inputs and
  registry;
- `apps/studio/server/src/audit/store.ts` — append and team query operations;
- `apps/studio/server/src/audit/schema.ts` — Drizzle table plus immutable/RLS
  sidecar; and
- `apps/studio/server/src/audit/render.ts` — server-controlled presentation
  fields or keys used by the client.

The core method has the shape:

```ts
append(client: pg.PoolClient, event: AuditEventInput): Promise<AuditEvent>
```

It cannot acquire its own pool transaction. Requiring the existing client
makes accidental non-atomic use visible in code review and types. The command
context uses a discriminated actor union: an authenticated user principal, an
authenticated API-token principal, or a server-owned system actor carrying a
bounded stable id/label. System contexts can be constructed only through a
server-internal capability that is unavailable to RPC input and client
packages; workers never fabricate a user principal. The event builder also
receives the request/operation id, explicit team id, and server-read
before/after values. No generic client-facing “emit audit event” procedure
exists.

### 8.2 Audited domain commands

The TypeScript domain layer exposes one `runAuditedMutation` executor for
audit-required writes. It owns the `TenantDb.transaction`; the callback receives
the transaction's `pg.PoolClient` and must return both its result and one or
more typed `AuditEventInput` values. The executor appends those events before
commit. Its required-event return type makes a successful audited command
impossible to express without declaring its event.

The intended shape is:

```ts
runAuditedMutation<T>(
  context: AuditedCommandContext,
  work: (
    client: pg.PoolClient,
  ) => Promise<{
    result: T;
    events: readonly [AuditEventInput, ...AuditEventInput[]];
  }>,
): Promise<T>
```

Mutating stores accept the supplied `pg.PoolClient`; they do not open or commit
their own transaction. RPC handlers, synchronization endpoints, workers, and
future public-API adapters call a domain command rather than a writable store
directly. A module-boundary test prevents server mutation entry points from
opening raw `TenantDb` transactions outside the audited command executor and a
small reviewed allowlist for schema/bootstrap operations.

This is the automatic adoption mechanism for future behavior: a new important
domain mutation uses the shared executor, and the type contract requires its
event. A mutation deliberately classified as `none` uses a separate explicit
path carrying a static reason that appears in the command registry. There is no
boolean flag that can silently disable auditing.

An audit-required mutation follows this order inside the executor's
transaction:

1. acquire the transaction-wide per-team audited-command advisory lock;
2. lock the actor's current membership/authorization state and authorize the
   explicit team and operation;
3. lock and read the current target state;
4. validate invariants using that locked state;
5. write the domain change;
6. append the event using the same `pg.PoolClient`; and
7. when applicable, insert an alert-outbox row referencing the event.

The team command lock uses the same centralized key and lock ordering as
sequence allocation, so a concurrent demotion/removal cannot commit before an
already-authorized privileged action. Owner-affecting commands acquire it
before reading the owner set and lock/recheck all memberships relevant to the
last-owner invariant; two concurrent owner demotions therefore serialize
rather than each observing the other owner. All paths use the lock order team,
actor membership, target memberships/resources to avoid deadlocks.

Any thrown error rolls back all three writes. Side effects that cannot
participate in PostgreSQL—email, webhooks, or object-store work—are driven from
a committed outbox, never performed between the mutation and audit append.

Protocol stores that already own transactions are refactored to accept the
executor's client or are invoked from a domain command that owns the
transaction. Audit context is not optional on a required path, and the
implementation must not append a second, post-commit “best effort” event.

Sensitive reads and egress use a sibling `runAuditedRead` executor. It
authorizes and materializes a bounded response (or a committed export-job /
one-time-download record), appends the required audit event and alert-outbox
row, commits, and only then releases response data or permits an external side
effect. If the audit transaction fails, no response body, download capability,
webhook, email, or object-storage result is released. Streaming implementations
must stage behind that committed boundary; they may not start sending bytes
and attempt a best-effort audit append afterward.

Authorization denials use the committed decision path in section 7.3.
Authorized synchronous failures use the separate post-rollback audit-only path
defined there. These are deliberately distinct from successful mutation
atomicity: no failed domain state is committed, while the important attempt
remains observable.

### 8.3 Database responsibility and trigger boundary

PostgreSQL is the final authority for storage, append-only privileges, the
immutability trigger, sequence allocation, row-level security, and atomic
commit. It does not use generic table triggers to invent domain audit events.

A generic database trigger can observe a row change, but it cannot reliably
know the authenticated user or API token, the request id, the domain intent,
the safe display snapshot, or which bounded fields are appropriate. It also
cannot observe important read-only actions such as PII access and data export.
Recording raw row diffs would leak sensitive content and still miss those
behaviors. Semantic event production therefore belongs in the mandatory typed
domain-command layer, while PostgreSQL makes the resulting history immutable
and transactionally inseparable from the write.

### 8.4 Better Auth organization mutations

The installed Better Auth organization hooks run outside the domain
transaction required by this specification. An `after` hook is therefore not
an acceptable producer for an atomic success event.

Studio must own commands for organization mutations exposed by the product.
Before Slice A is complete, the implementation inventories the exact
method/path surface registered by the configured Better Auth organization
plugin at runtime. Every route is classified and a test fails if an upgrade
adds an unclassified endpoint. Every route that can mutate team,
membership/access, or invitation state is blocked unless a Studio-owned
audited command already replaces it—including create/update organization,
accept/reject invitation, remove/leave member, ownership change, and the three
initial commands below. A workflow not yet present in the UI is not evidence
that its authenticated HTTP endpoint is unreachable.

The first slice replaces direct client calls for role changes and invitations:

- `team.updateMemberRole`
- `team.createInvitation`
- `team.cancelInvitation`

Acceptance/rejection, member removal/leave, team creation/settings, ownership
transfer, and any future enabled organization mutation remain blocked until
they use the same pattern. Each command uses Studio's database and
authorization seams, preserves Better Auth's required invariants, and commits
the organization-table write with the audit event. Session-only active-team
selection and POST-shaped read endpoints may remain available only under an
exact documented `none` classification.

The direct `/api/auth/organization/*` mutation endpoints are blocked at the
server boundary, not merely hidden from the SPA, and are tested as blocked.
Better Auth read/session endpoints may remain available. It is not acceptable
to leave any callable endpoint that can perform a team/access write without an
event.

Every other server-side mutation must make its audit classification explicit:
`required`, `denied-only`, or `none` with a documented reason. A command
registry test enumerates the internal RPC mutation surface, and each non-RPC
write path (synchronization, worker, maintenance job, or future public API)
must register at its domain boundary. Review cannot accept a new mutation with
an unclassified audit policy.

For `team.updateMemberRole`, the transaction first acquires the per-team
audited-command lock, then locks the actor and target memberships, captures the
previous role, locks/rechecks the owner set, enforces the
last-owner/ownership constraints, writes the new role, and appends
`team.member.role_changed`. A no-op request either returns the unchanged member
without an event or is rejected consistently; it never creates a false
“changed” record.

## 9. Internal API

Add these SPA procedures to `@codaco/studio-rpc`:

```text
audit.list({
  teamId,
  cursor?,
  limit?,
  categories?,
  eventTypes?,
  actorId?,
  outcomes?,
  from?,
  to?
}) -> {
  items: AuditEventSummary[]
  nextCursor: string | null
}

audit.get({ teamId, eventId }) -> AuditEventDetail
```

`limit` defaults to 50 and is capped at 100. Filters are validated and
parameterized. The list response contains only fields needed by the feed;
`get` returns the bounded typed details for one event. Unknown and unauthorized
events both return the same not-found/forbidden policy used by the team RPC
surface, without becoming a cross-team oracle.

CSV export is initiated only by a same-origin-protected unsafe request:

```text
POST /api/teams/:teamId/audit-exports
{ filters } -> CSV response or short-lived, single-use download handle
```

The route requires the same Origin/CSRF protection as other mutations; it is
never a `GET` that navigation, link preview, crawler, or browser prefetch can
trigger. If a handle is returned, the handle is bound to the requesting actor
and team, expires promptly, carries no credentials in its contents, and its
download `GET` performs no new audit mutation.

At the start of export, the server captures the visible high-water sequence
and row count. Before returning a handle or sending the first CSV byte it
commits
`audit.export.started` with the filters, row count, and high-water sequence.
The exported file therefore does not recursively include its own later event.
If the server can authoritatively detect a later generation or transfer
failure, it appends `audit.export.failed` referencing the start event; a client
disconnect alone is not reported as a definitive failure. The file contains
exact UTC timestamps, sequence, stable ids, display labels,
type/category/outcome, and a bounded JSON details column. It never exposes
internal stack traces or operational logs.

Every string cell—including actor, subject and resource labels, event type,
request id, and serialized details—is passed through the shared CSV cell
sanitizer or an equivalent audited helper before RFC 4180 escaping. Values
whose first character is `=`, `+`, `-`, `@`, tab, or carriage return are
prefixed with a single quote so spreadsheet software treats member-controlled
content as literal text. Export tests include hostile values for every formula
trigger and verify both neutralization and ordinary CSV quoting.

## 10. Team activity interface

Add `/teams/$teamId/activity` and an **Activity** destination to the team
workspace navigation. It is visible and routable only for callers with
`audit.read`.

The initial screen provides:

- newest-first rows with **When**, **Actor**, **Action**, **Subject or
  resource**, and **Outcome** columns;
- category, action, actor, outcome, and date-range filters;
- cursor-based **Load more** pagination;
- a row details panel with the exact local time and UTC time, stable ids,
  before/after values, request id, and event-specific details; and
- **Export CSV** for callers with `audit.export`.

The feed uses shared Fresco UI components. The shared `Table` owns its overflow
behavior, so the screen must not add a second surface or overflow wrapper
around it. Action titles and sentences come from the typed renderer rather
than exposing machine event names as primary copy. Unknown future event types
fall back to a safe generic presentation while preserving their machine type
and timestamp.

Filters, pagination, details disclosure, and export are keyboard accessible.
Times display in the viewer's local zone in the feed, with an exact ISO-8601
UTC value in details and exports. Empty, loading, permission-denied, and retry
states are explicit.

## 11. Data-egress alerts

When an event type matches alert policy, the same transaction that inserts the
event inserts an `audit_alert_outbox` row referencing `audit_event_id`. The
event remains immutable; outbox delivery status, attempt count, next retry,
and last error are mutable operational state.

Initial alert candidates are:

- participant or interview-data bulk exports;
- exports or reads containing direct participant identifiers;
- API-token use that causes data egress;
- unusually large or repeated export activity; and
- repeated denied attempts against role, audit, credential, or egress
  operations.

Policy decides from the server-owned event type and bounded details, never
from rendered text. Delivery may use email or a future webhook/notification
channel established with #1252. The underlying authorized action does not wait
for external delivery; it waits only for the durable outbox insert. Delivery
retries are operational records and do not create duplicate domain events.

Alert thresholds, recipients, rate limits, and notification-channel UX are
deferred to the alert-delivery slice. The event and outbox seam is fixed here
so that delivery cannot become a lossy afterthought.

## 12. Migration and deployment

There is no reliable historical source from which to reconstruct actions that
predate the audit table. The migration MUST NOT synthesize individual actor
events from current rows.

After deployment, each team's first event may be preceded by a system
`audit.enabled` event, or the activity screen may display a fixed
“Activity is available from this installation date” boundary. In either case,
the UI clearly states that older activity is unavailable.

The schema work must:

- register the table and sidecar in the Studio schema assembly;
- include the table in forced-RLS and schema-inventory tests;
- run the immutable privilege revocation after the generic access grant;
- regenerate `apps/studio/server/src/db/fingerprint.generated.ts`, the Studio
  schema README section, and `apps/studio/schema-erd.svg`; and
- document the deployment's schema-fingerprint transition.

No changeset mixes Studio packages with the normal release lane. If the
implementation changes a Studio package's releasable behavior, use one Studio
changeset for the affected Studio workspace packages.

## 13. Verification

### 13.1 Database integration tests

- `studio_app` and `studio_maintenance` can insert and select audit rows only
  with matching explicit team context, and cannot update, delete, or truncate
  them; missing maintenance context sees no rows.
- The immutable trigger rejects update/delete even through a privileged test
  connection unless deliberately disabled by the database owner.
- Forced RLS hides another team's rows and rejects cross-team insert attempts.
- Missing team context sees no rows.
- Concurrent appends for one team produce unique, increasing committed
  sequences; concurrent appends for separate teams do not contend on one lock.
- `occurred_at` reflects the insert statement rather than transaction start;
  date-window queries use the team/timestamp/sequence index, and the schema has
  no redundant reverse-sequence index.
- User, membership, invitation, and resource deletion cannot cascade to an
  event.
- A domain failure rolls back its event, and an audit insert failure rolls back
  its domain mutation.
- An authorized synchronous failure rolls back domain state and commits one
  bounded `failed` event separately; failure of that append emits a critical
  operational signal without changing the command result.
- The generated schema fingerprint, schema inventory, README section, and ERD
  remain synchronized.

### 13.2 Domain and RPC tests

- An owner/admin role change stores the exact actor, member, previous role,
  new role, request id, and success outcome.
- Last-owner and unauthorized role changes do not change membership.
- Concurrent owner demotions cannot both pass the last-owner invariant, and a
  concurrent actor revocation prevents the actor's privileged command from
  committing afterward.
- A relevant denied action produces the defined denial event without exposing
  whether an unknown team exists.
- Denial throttling runs before the per-team lock; excess attempts create at
  most one bounded summary per policy window rather than one permanent row per
  request.
- Invitation creation/cancellation and acceptance/rejection create the defined
  events and never store a token or magic link.
- Every runtime-registered Better Auth organization route has an exact audit
  classification, and every team/access mutation without a Studio-owned
  audited command is refused, proving there is no unaudited bypass.
- Audit list/get enforce current role permissions, RLS, filters, cursor order,
  page limits, and output redaction.
- A sensitive read returns no data when its required audit/outbox transaction
  fails.
- Export requires a same-origin-protected `POST`, stops at its high-water
  sequence, records one export event without recursively exporting it, and
  neutralizes every formula-leading string cell before CSV escaping.

### 13.3 UI and end-to-end tests

- Changing a member role through the team screen immediately produces the
  correct activity row after the mutation succeeds.
- Creating an invitation produces a row with the target address but no secret
  invitation material.
- A member cannot see, route to, query, or export team activity.
- Filtering, loading another page, opening details, empty/error states, and
  CSV export work with keyboard and screen-reader semantics.
- The activity table has one overflow owner and no redundant wrapper.

Every important producer test must first prove its oracle can fail—for example,
by asserting the event is absent when the append call is deliberately removed
or the expected type is changed—before its new expected state is accepted.

## 14. Delivery plan

### Slice A — immutable foundation and current team administration (#1519)

Bring this slice into the current Studio team-workspace phase:

1. add the immutable/RLS audit schema, typed event registry, append store, and
   database tests;
2. add Studio-owned role-change and invitation commands;
3. inventory every configured Better Auth organization route and block every
   team/access mutation path that lacks a Studio-owned audited command;
4. emit the team/access events for those commands; and
5. include the Studio schema artifacts and changeset.

This is the minimum slice that makes the currently demonstrated role and
invitation functionality accountable. It should follow or stack on #1515.

### Slice B — team activity UI and export (#1520)

Add the authorized list/get contract, activity route, filters, detail view,
pagination, CSV export, and integration/E2E coverage. Slice B depends on Slice
A and can be stacked while Slice A is reviewed.

### Slice C — producer expansion and egress alerts (#1521)

As protocol, study, participant, data API, credential, and integration features
land, add their event producers as acceptance criteria of the owning feature.
Add the alert outbox and notification delivery with #1252. This preserves the
Phase 7 production-readiness work without delaying the team audit foundation.

## 15. GitHub tracking

#1259 remains the audit/egress epic, with #1519, #1520, and #1521 as linked
child issues matching Slices A–C. Slices A and B are in Phase 3 (Editor core)
because team administration is already user-visible and role changes are the
motivating risk. Slice C remains in Phase 7 because its broader data-egress and
notification work depends on observability and future data domains.

#1519 is **Ready** as the next enabling issue and remains outside the active
sprint. It may stack on #1515 rather than waiting for that pull request to
merge. #1520 remains Backlog until the immutable foundation is underway. This
brings the requirement forward without pretending that alert delivery no
longer has Phase 7 dependencies.

## 16. Definition of done

The audit-log foundation is not complete merely because an activity table is
visible. It is complete when:

- the database prevents application and maintenance roles from mutating audit
  history;
- current team role and invitation mutations cannot succeed without their
  event, and every other configured team/access mutation remains blocked until
  it has an audited command;
- owner/admin users can query and export their team's isolated, ordered log;
- ordinary members and other teams cannot access it;
- event payloads pass the data-minimization rules;
- concurrency, rollback, RLS, privilege, authorization, and UI tests pass;
- the event producer policy is included in acceptance criteria for every later
  potentially important Studio action; and
- alert-eligible events durably create an outbox record once Slice C is
  enabled.
