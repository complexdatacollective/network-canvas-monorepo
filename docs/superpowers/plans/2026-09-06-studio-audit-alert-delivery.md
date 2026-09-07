# Studio audit-alert delivery (#1252)

The immutable audit event remains the source of truth. `AuditStore.append`
evaluates a closed policy from the validated event type/version and bounded
details, then inserts its outbox row and recipient/channel work in the same
transaction. A failed insert rolls back the originating action; an email
failure happens later and cannot roll it back. Delivery never appends the
originating event again.

## Initial policy

- Each authorized participant-contact read, and each contact lookup returning
  at least one result, creates a contact-access alert. Single access is enough:
  direct identifiers have crossed the protected boundary even for one person.
- Webhook credential reads for configuration and credential updates create a
  credential-access alert. Routine delivery and key rotation do not notify
  researchers; they remain audited maintenance activity.
- Five denied role, audit, or participant-contact operations in fifteen
  minutes create one repeated-denial alert per team/window. The existing
  rate-limited denial summary contributes its bounded suppressed count. This
  catches repeated attempts while avoiding an email per denied request.
- Only registered, implemented producers participate. Bulk export, API-token
  egress and large/repeated export events do not yet exist in this build; their
  producers must add an explicit versioned policy case when implemented. No
  policy matches rendered text, free-form labels, arbitrary categories, or
  protocol contents.

## Recipients and channels

Team owners/admins configure up to ten current, verified members who retain
`audit.read`. Each recipient chooses in-app, email, or both through the existing
team settings screen. A new team has no recipients until configured. Settings
apply to future events; enrollment never backfills older events. Each stored
recipient preference has an identity: changing/removing it invalidates queued
work even if the same member is later re-enrolled. Membership identity also
prevents leaving/rejoining from recovering old alerts.

The worker rechecks the team, exact preference, membership, verification and
permission immediately before delivery. Locks keep those decisions stable
through the bounded handoff. Revocation or deletion suppresses pending work.
Feed reads and read acknowledgements recheck the same current authorization.
Settings changes and acknowledgement of an uncertain delivery are audited;
ordinary read state and retry bookkeeping are operational state.

## Delivery and backlog

One durable child row per outbox/member/channel is the dispatch unit. Completed
siblings are never retried after partial success. The shared dispatcher owns
leases, heartbeat, exponential backoff, maximum attempts and bounded polling;
the alert adapter supplies SQL and eligibility policy. Metrics keep the finite
`audit_alert_outbox` queue name and count its recipient/channel work.

Email attempts reserve durable minute buckets: ten per team and sixty per
deployment. Capacity is consumed by attempts, including rejected ones. A full
bucket defers work without consuming a retry. These low initial limits bound
notification storms and provider costs while retaining a visible queue. Work
older than seven days is suppressed with a bounded expiry reason rather than
releasing an obsolete burst when a long outage ends. Pending/terminal state is
retained; no retry silently deletes evidence.

Immediately before email handoff, the worker commits a started marker. Expired
started attempts become terminal `uncertain`: a crash cannot prove non-delivery.
A proven pre-content/retryable rejection clears that marker and schedules the
shared backoff. Success and uncertainty use lease-owner compare-and-set even
after a transient renewal error; a replaced owner cannot be overwritten.
Uncertainty is visible for manual reconciliation and may be acknowledged, but
this slice never automatically or manually resends it.

The operational recent-failure timestamp includes durable uncertainty, so an
interrupted handoff remains visible when the first scrape happens after a worker
restart. The existing unresolved-uncertainty operator alert remains separate
from the five-minute recent notice and the researcher's personal acknowledgement.
Operators reconcile or silence their incident externally without modifying
delivery evidence.

Email uses the existing `StudioMailer`/`EmailSender` selected SMTP or Postmark
transport and its bounded cancellation lifecycle. Bodies contain only a fixed
policy description, timestamp and authenticated Studio link. They contain no
actor/participant labels, raw event details, protocol contents, request URLs,
decrypted values, or secrets. Operator queue pages remain outside this feed.

## Integration and proof

Migration `0006` follows reviewed `0005`; historical migration bytes stay
unchanged. New tables carry tenant/maintenance and independent backup policies,
with application delivery-state writes limited to read/reconciliation fields.
The worker runs for `STUDIO_ROLE=worker|both`, including in-app delivery without
an email transport; web-only processes do not claim work. Shutdown stops claims
before canceling active transport work and awaiting bounded drain.

Verification includes actual PostgreSQL multiworker contention, atomic rollback,
partial success, stale preference/membership/verification suppression, durable
rate limits, backlog expiry, crash recovery, lost leases, transient heartbeat
failures, retryable rejection and terminal uncertainty. Canary and deliberate
guard-removal controls must fail for the intended reason. The settings/feed UI
will be inspected in a running synthetic instance with accessible interaction
tests; changes affect Studio screens only, outside the pinned Architect,
Interview and Interviewer pixel suites.
