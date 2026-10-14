---
'@codaco/studio-api': minor
---

Studio no longer lets PostHog store an IP address or a location for anything
it sends. Every product event, `$identify`, forwarded participant usability
event and error report now sets `$ip` to `0.0.0.0`, which overwrites the
sending server's address PostHog would otherwise record, alongside
`$geoip_disable: true`.

The log records operators alert on now carry one of six fixed `alert` codes,
at error level: `delivery_uncertain` on an invitation delivery whose outcome is
uncertain (including one that ended while its send was in flight, which now
logs its own record), `job_dead_lettered` on a job that ended for good (its last attempt failed,
its lease expired on its last attempt, which now logs its own record, or its
payload does not decode for its queue),
`readiness_failing` on a new record each process writes once when its
`/readyz` checks turn failing (naming them in `failing_checks`, with an
info-level `readiness has recovered` when they pass again), and
`schema_mismatch` on the message a deployed process logs while it waits for
`migrate`. That message was a warning; the development lane's equivalent still
is. Two new records cover what metrics would otherwise alert on, each written
once per episode with an info-level record when it clears: `queue_backlog`,
when more than 100 jobs have waited on one queue for ten minutes, and
`event_loop_lag`, when a process's p99 event-loop delay has stayed above
200 ms for five minutes.

The self-host guide gains a telemetry page: what leaves the machine and to
whom, how to turn it off, and how to send logs, traces, metrics and error
reports to your own OpenTelemetry store, with an Azure Monitor example through
an OpenTelemetry Collector. The requirements page names a configured
OpenTelemetry endpoint as an outbound host. Studio's docs also gain a privacy
notice, an IT FAQ, and the runbook for Codaco's alerts.
