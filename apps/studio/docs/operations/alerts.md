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
reports) or the resource attribute `studio.installation_id` (on logs, spans and
metrics). The managed platform has one installation id of its own; filter on
it first when an alert fires.

## How the alerts are delivered

- **Every alert is switched off until Studio launches.** Each one exists in
  the project, fully configured, and is turned on at launch.
- **They are PostHog insight alerts**, checked every hour, and each fires when
  its value is above its threshold.
- **They are delivered by email** to the PostHog users subscribed to them. The
  PostHog organisation is on the free plan, where insight alerts are the alert
  type that can send email. Slack and webhook destinations, and Error
  Tracking's own alerts, are on paid plans, which is why the error-tracking
  alert below is an insight over `$exception` events rather than an Error
  Tracking alert.

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
    and timestamp > now() - interval 90 day
  group by issue
)
where first_seen > now() - interval 1 hour
```

**Threshold.** Above 0.

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

## Log alerts

Each of these matches an error-level log record from `studio-api` (both the
`serve` and the `worker` processes export under that service name) carrying
the annotation `alert` with a fixed code. The codes are one constant,
`OPERATOR_ALERTS` in
[`api/src/platform/operator-alerts.ts`](../../api/src/platform/operator-alerts.ts),
and each record's code is asserted by a test.

All four use the same query with a different code:

```sql
select count() as records
from logs
where service_name = 'studio-api'
  and severity_text = 'error'
  and attributes['alert'] = '<code>'
  and timestamp > now() - interval 1 hour
```

**Threshold** for each: above 0.

### Invitation delivery outcome uncertain

[Alert insight](https://us.posthog.com/project/249487/insights/8BY5tqLd) ·
code `delivery_uncertain`

**What it means.** An invitation email's delivery attempt failed in a way that
leaves its outcome unknown: the attempt ended after it may already have handed
the message to the mail server, and the record of what happened could not be
written. Studio stamps the delivery `uncertain` and does not retry it, so the
invitee never gets two copies. The record is
`the delivery attempt failed; its outcome is uncertain`, with `queue`
(`invitation-delivery`) and `job_id`.

**What to do.**

1. Take `job_id` and the installation from the record. The cause is on the
   worker's stdout and in the delivery's `last_error` in
   `team_invitation_deliveries`, which also has `uncertain_at` set.
2. Check the mail provider's logs for the message to the invitee. If it was
   accepted, nothing is wrong but the record.
3. If it was not, the invitee has no email: tell the team that sent it, so they
   can invite them again.
4. Several in one hour point at the database or the mail transport rather than
   one invitation: check readiness and the database's own logs.

### Job dead-lettered

[Alert insight](https://us.posthog.com/project/249487/insights/SnKFwoMX) ·
code `job_dead_lettered`

**What it means.** A background job failed on its last allowed attempt and will
not be retried. Its row is `failed`, and on a queue that declares a dead-letter
queue a copy is queued there. The record is
`job attempt failed and will not be retried`, with `queue`, `job_id` and
`attempt`. The same failure is also reported to Error Tracking.

**What to do.**

1. Read `queue` and `job_id`. The job's `last_error` in `studio_jobs.jobs`, and
   the worker's stdout, hold the cause.
2. Open the matching Error Tracking issue (same `job_id`) for the stack.
3. Decide from the queue what was lost: an invitation or sign-in email that was
   not sent, a usage event that did not reach PostHog, or a clean-up pass that
   will run again on its schedule.

### Readiness failing

[Alert insight](https://us.posthog.com/project/249487/insights/uX1w1sWp) ·
code `readiness_failing`

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

[Alert insight](https://us.posthog.com/project/249487/insights/koixG77X) ·
code `schema_mismatch`

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

## Metric alerts

### Job queue backlog

Alert insight: link to follow.

**What it means.** Jobs are being queued faster than the workers claim them:
more than 100 jobs on one queue have been waiting to run for ten minutes. The
gauge is sampled once a minute per queue and state, from a count of
`studio_jobs.jobs`.

**Metric.** `studio_jobs_queue_depth{state="created"}`, per `queue`.

**Threshold.** Above 100 for 10 minutes.

**What to do.**

1. Read which `queue` is backed up.
2. Check the worker is running and ready (the readiness alert above, and its
   `jobs` check).
3. Check the worker's stdout for jobs retrying: a queue retrying every job
   (`job attempt failed; retrying`) backs up behind its own retries.
4. A queue whose depth keeps growing while the worker is healthy needs another
   worker replica.

### Event-loop lag

Alert insight: link to follow.

**What it means.** A Studio process's event loop is blocked for long stretches:
its 99th-percentile event-loop delay has stayed above 200 ms for five minutes.
This is the leading indicator of editing locks expiring under editors who are
still working (ADR #1245, risk 5), because lock renewal waits on the same loop.
The gauge is sampled every ten seconds per process.

**Metric.** `studio_runtime_event_loop_delay_p99_ms`.

**Threshold.** Above 200 ms for 5 minutes.

**What to do.**

1. Read `studio.program` and the installation: one `serve` replica or the
   worker.
2. Compare `studio_runtime_memory_heap_used_bytes` and
   `studio_runtime_memory_rss_bytes` over the same window: a heap near its limit
   spends its time in garbage collection.
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
