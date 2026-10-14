# Alert runbook

Codaco's own alerts on Studio, for the people who run the managed platform.
They read the telemetry every Studio deployment sends to Codaco's Studio
project in PostHog (project
[249487](https://us.posthog.com/project/249487)) while `STUDIO_TELEMETRY` is
on and no `OTEL_EXPORTER_OTLP_ENDPOINT` is set: the managed platform, and any
self-hosted instance that has left both at their defaults. An institution that
sends telemetry to its own store, as the
[self-host guide's telemetry page](../self-host/telemetry.md) describes, is not
covered by these alerts and builds its own from the same records.

Every record names the deployment it came from in `installation_id` (on error
reports) or the resource attribute `studio.installation_id` (on logs and
spans). The managed platform has one installation id of its own; filter on
it first when an alert fires. The one exception is a process whose database
has no installation id yet, which in practice means `migrate` has never run
against it: its records carry none, so a `schema_mismatch` record without an
installation id is a new deployment, and its `program` and timing are what
tell you which.

## How the alerts are delivered

There are exactly two alerts:

| Alert                             | Insight                                                             | Fires when                                                           |
| --------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Studio: new error-tracking issues | [8Fiytr6H](https://us.posthog.com/project/249487/insights/8Fiytr6H) | Error Tracking opened at least one new Studio issue in the last hour |
| Studio: operator alert records    | [hakbUrbN](https://us.posthog.com/project/249487/insights/hakbUrbN) | Any operator alert code has at least one record in the last hour     |

- **Both are switched off until Studio launches.** Each exists in the project,
  fully configured, and is turned on at launch.
- **They are PostHog insight alerts**, checked every hour.
- **They are delivered by email** to the PostHog users subscribed to them. The
  PostHog organisation is on the free plan, where insight alerts are the alert
  type that can send email. Slack and webhook destinations, and Error
  Tracking's own alerts, are on paid plans, which is why the error-tracking
  alert is an insight over `$exception` events rather than an Error Tracking
  alert.
- **The six log codes share one alert** because the free plan allows five
  alerts in all. The alert's email names the code that fired; the sections
  below say what each one means and what to do.
- **Codaco's PostHog project has no metrics.** Studio exports its gauges
  (queue depth, event-loop delay, memory), but PostHog's metrics product is
  not enabled for the organisation, so Codaco can neither see nor alert on
  them. Queue backlog and event-loop lag reach these alerts as log records
  instead (`queue_backlog` and `event_loop_lag`, below). An operator who sends
  telemetry to their own OpenTelemetry store does get the metrics.

## Error tracking

### New error-tracking issues

[Alert insight](https://us.posthog.com/project/249487/insights/8Fiytr6H)

**What it means.** An unexpected failure Studio has not reported before:
PostHog Error Tracking opened a new issue for it within the last hour. Studio
reports a failure once, as its error type and stack frames, from three places:
a request that ended in a 5xx or a defect (`error_origin = 'request'`), a job
that failed on its last attempt or carried an undeclared payload, or whose
lease expired (`'job'`), and the browser, from the researcher web app or a participant page
(`'browser'`, with `surface` naming which). Interrupted
requests and expected refusals are never reported. Participant pages'
exceptions arrive as `$exception` events too, forwarded by the api with their
error type only and no frames, and count here.

**Query** (HogQL):

```sql
select count() as new_issues
from (
  select properties.$exception_issue_id as issue, min(timestamp) as first_seen
  from events
  where event = '$exception'
    and properties.app = 'studio'
    and timestamp > now() - interval 365 day
  group by issue
)
where first_seen > now() - interval 1 hour
```

**Threshold.** Above 0.

The lookback matches PostHog's one-year event retention. An issue that has had
no event for longer than that has no history left to compare with, so if it
recurs it alerts as new.

**What to do.**

1. Open the new issue in
   [Error Tracking](https://us.posthog.com/project/249487/error_tracking). The
   report carries the error type and frames only, never the message.
2. Read `installation_id`, `error_origin` and `program` (`serve` or `worker`)
   on the event. A request report carries `request_id` and, when a researcher
   was signed in, `team_id`; a job report carries `job_queue` and `job_id`.
3. Find the same `request_id` or `job_id` in the logs (below): the records
   around it show what the request or job was doing. The full message is not in
   PostHog. On the managed platform it is on the process's stdout, and for a job
   in the `last_error` column of its row in `studio_jobs.jobs`.
4. Fix it, or resolve the issue in Error Tracking if it is understood and
   expected, so a recurrence opens a new one.

## Operator alert records

[Alert insight](https://us.posthog.com/project/249487/insights/hakbUrbN)

Each code below is carried by error-level log records from `studio-api` (both
the `serve` and the `worker` processes export under that service name) in the
annotation `alert`. The codes are one constant, `OPERATOR_ALERTS` in
[`api/src/platform/operator-alerts.ts`](../../api/src/platform/operator-alerts.ts),
and each record's code is asserted by a test.

**Query** (HogQL):

```sql
select attributes['alert'] as code, count() as records
from logs
where service_name = 'studio-api'
  and severity_text = 'error'
  and attributes['alert'] in (
    'delivery_uncertain', 'job_dead_lettered', 'readiness_failing',
    'schema_mismatch', 'queue_backlog', 'event_loop_lag'
  )
  and timestamp > now() - interval 1 hour
group by code
order by records desc
```

**Threshold.** At least one record for any code in the last hour. The alert's
email names the code.

### Invitation delivery outcome uncertain

Code `delivery_uncertain`.

**What it means.** An invitation email's delivery attempt ended in a way that
leaves its outcome unknown, and Studio does not retry it, so the invitee never
gets two copies. Two records carry the code, each with `queue`
(`invitation-delivery`) and `job_id`:

- `the delivery attempt failed; its outcome is uncertain`: the attempt failed
  after it may already have handed the message to the mail server, and the
  record of what happened could not be written. The delivery is stamped
  `uncertain`.
- `the delivery ended while its send was in flight; its outcome is uncertain`:
  the mail server took the message, but by then the delivery had already been
  ended by something else, so the send could not be recorded against it. The
  delivery is stamped `uncertain` unless what ended it already stamped it.

**What to do.**

1. Take `job_id` and the installation from the record. The cause is on the
   worker's stdout and in the delivery's `last_error` in
   `team_invitation_deliveries`, which shows how the delivery ended
   (`uncertain_at`, or the stamp of whatever ended it first).
2. Check the mail provider's logs for the message to the invitee. If it was
   accepted, nothing is wrong but the record.
3. If it was not, the invitee has no email: tell the team that sent it, so they
   can invite them again.
4. Several in one hour point at the database or the mail transport rather than
   one invitation: check readiness and the database's own logs.

### Job dead-lettered

Code `job_dead_lettered`.

**What it means.** A background job ended for good without succeeding, and
will not be retried. Three records carry the code, each with `queue` and
`job_id`:

- `job attempt failed and will not be retried` (also `attempt`): its handler
  failed on its last allowed attempt.
- `job lease expired on its last attempt; it will not be retried`: the worker
  running it stopped answering for it, and the lease ran out on its last
  attempt.
- `job carries a payload this queue does not declare`: the row's payload does
  not decode for its queue, so it was killed without running.

The first two leave the row `failed`, and on a queue that declares a
dead-letter queue a copy is queued there; the third leaves it `dead`. Each is
also reported to Error Tracking.

**What to do.**

1. Read `queue` and `job_id`. The job's `last_error` in `studio_jobs.jobs`, and
   the worker's stdout, hold the cause.
2. Open the matching Error Tracking issue (same `job_id`) for the stack.
3. Decide from the queue what was lost: an invitation or sign-in email that was
   not sent, a usage event that did not reach PostHog, or a clean-up pass that
   will run again on its schedule.

### Readiness failing

Code `readiness_failing`.

**What it means.** A process's `/readyz` checks turned failing. Each process
writes `readiness is failing` once when that happens, naming the failing checks
in `failing_checks` (comma-separated: `db`, `schema`, `objectStore`,
`maintenance`, `jobs` and so on), and an info-level `readiness has recovered`
once they pass again; it does not repeat the record on every probe. A drain at
shutdown is not a check and writes neither. The record is written when
`/readyz` is asked, so it depends on something polling it: the reference
stack's worker healthcheck polls the worker every ten seconds, and the
platform's load balancer must poll the api.

**What to do.**

1. Read `failing_checks` and `studio.program`.
2. `maintenance` alone, during an upgrade, is the upgrade's maintenance window:
   confirm a `readiness has recovered` follows once it ends.
3. `schema` alongside a `schema_mismatch` record is a new image waiting for
   `migrate` (below).
4. `db` or `objectStore`: the database or the bucket is unreachable or
   refusing the credentials. Ask `/readyz` directly; its body names the reason.
5. `jobs` on the worker: the worker is not claiming jobs. A worker that has
   just started reports it until its queue starts, and a recovery record
   follows within seconds; otherwise check its stdout and the database.

### Database schema mismatch

Code `schema_mismatch`.

**What it means.** A process started against a database whose schema is not
the one its build expects: none at all, or tables without a fingerprint, or a
fingerprint from another build. It waits, closed (the api answers with the
maintenance page and the worker runs no jobs), and checks again every three
seconds. The record is written once when the process starts waiting; the stale
case also carries `expected_fingerprint`, `found_fingerprint` and
`recorded_at`. The development lane logs a warning instead and never fires
this alert.

**What to do.**

1. During an upgrade this is expected: the new images start before `migrate`
   runs. Confirm the same process logs `Database schema current.` once
   `migrate` has run.
2. Outside an upgrade, or with no `Database schema current.` after it, run
   `migrate` from the image the processes are running. If `migrate` refuses,
   follow the remedy it prints.

### Job queue backlog

Code `queue_backlog`.

**What it means.** Jobs are being queued faster than the workers claim them:
more than 100 jobs on one queue have been waiting to run for ten minutes. The
worker counts each queue's waiting (`created`) jobs once a minute, from
`studio_jobs.jobs`, and writes
`jobs waiting to run have stayed above the backlog alert threshold` once, with
`queue` and `waiting`, when the count has stayed above 100 for ten minutes. It
writes an info-level
`jobs waiting to run are back under the backlog alert threshold` when the count
drops back to 100 or fewer, and a new episode starts the window again. The
threshold and window are `SUSTAINED_ALERT_RULES.queueBacklog`, beside the codes.

**What to do.**

1. Read which `queue` is backed up, and `waiting`.
2. Check the worker is running and ready (`readiness_failing` above, and its
   `jobs` check).
3. Check the worker's stdout for jobs retrying: a queue retrying every job
   (`job attempt failed; retrying`) backs up behind its own retries.
4. A queue that keeps growing while the worker is healthy needs another worker
   replica.

### Event-loop lag

Code `event_loop_lag`.

**What it means.** A Studio process's event loop is blocked for long stretches:
its 99th-percentile event-loop delay has stayed above 200 ms for five minutes.
This is the leading indicator of editing locks expiring under editors who are
still working (ADR #1245, risk 5), because lock renewal waits on the same loop.
Each process samples its delay every ten seconds and writes
`event-loop delay has stayed above the lag alert threshold` once, with
`p99_ms`, when it has stayed above 200 ms for five minutes, and an info-level
`event-loop delay is back under the lag alert threshold` when it drops back.
The threshold and window are `SUSTAINED_ALERT_RULES.eventLoopLag`.

**What to do.**

1. Read `studio.program` and the installation: one `serve` replica or the
   worker.
2. Check the process's memory on its host (`docker stats`): a heap near its
   limit spends its time in garbage collection.
3. Look at the slowest spans in the same window for a request or job holding
   the loop, such as a large protocol import or export.
4. If editors are affected, add an api replica while the cause is found.

## Dashboards and the grant's C.8 figures

- [Usage](https://us.posthog.com/project/249487/dashboard/2211469): the
  figures the grant's C.8 commits to tracking, computed in PostHog from the
  product events Studio sends.
- [Operations](https://us.posthog.com/project/249487/dashboard/2211471).

The C.8 insights:

| Figure                           | Insight                                                             |
| -------------------------------- | ------------------------------------------------------------------- |
| Researchers active in 30 days    | [DdvqE9a8](https://us.posthog.com/project/249487/insights/DdvqE9a8) |
| Teams active in 30 days          | [myUcrjNp](https://us.posthog.com/project/249487/insights/myUcrjNp) |
| Weekly active researchers        | [emrtFMxf](https://us.posthog.com/project/249487/insights/emrtFMxf) |
| Studies created                  | [KKeS7Y5u](https://us.posthog.com/project/249487/insights/KKeS7Y5u) |
| Interviews started and completed | [bsqPkzcR](https://us.posthog.com/project/249487/insights/bsqPkzcR) |
| Waves run                        | [CjRAtltZ](https://us.posthog.com/project/249487/insights/CjRAtltZ) |
| Interfaces used                  | [DkPL63sl](https://us.posthog.com/project/249487/insights/DkPL63sl) |
| Stage types                      | [9bPFXkE1](https://us.posthog.com/project/249487/insights/9bPFXkE1) |
| Team invitations                 | [7oqIV7Sj](https://us.posthog.com/project/249487/insights/7oqIV7Sj) |

Every one counts from **2026-10-14**. Studio events in the project before that
date are CI traffic, not use.

## Retention

- **Logs are kept 14 days**, PostHog's default. The target is **30 days**,
  set at launch: on the current plan the setting cannot be made for one
  service, only for the whole shared project, so it waits until launch. This
  amends the "30 days" in
  [#1897](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1897).
- **Events** (product events, participant usability events and error reports)
  are kept 1 year, the free plan's retention, which is inside the 24-month cap
  on usage data that the [privacy notice](../privacy-notice.md) states.
- **Re-check the cap on any plan change.** The project is shared with
  Codaco's other products, and moving it to a paid plan changes how long events
  are kept. A retention longer than 24 months would break the cap the privacy
  notice promises, so a plan change must set Studio's event retention back to 24
  months or less.
