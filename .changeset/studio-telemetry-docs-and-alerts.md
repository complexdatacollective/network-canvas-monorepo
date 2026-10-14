---
'@codaco/studio-api': minor
---

Studio no longer lets PostHog store an IP address or a location for anything
it sends. Every product event, `$identify`, forwarded participant usability
event and error report now sets `$ip` to `0.0.0.0`, which overwrites the
sending server's address PostHog would otherwise record, alongside
`$geoip_disable: true`.

Four log records that operators alert on now carry a fixed `alert` annotation,
at error level: `delivery_uncertain` on an invitation delivery whose outcome is
uncertain, `job_dead_lettered` on a job that failed and will not be retried,
`readiness_failing` on a new record each process writes once when its
`/readyz` checks turn failing (naming them in `failing_checks`, with an
info-level `readiness has recovered` when they pass again), and
`schema_mismatch` on the message a deployed process logs while it waits for
`migrate`. That message was a warning; the development lane's equivalent still
is.

The self-host guide gains a telemetry page: what leaves the machine and to
whom, how to turn it off, and how to send logs, traces, metrics and error
reports to your own OpenTelemetry store, with an Azure Monitor example through
an OpenTelemetry Collector. The requirements page names a configured
OpenTelemetry endpoint as an outbound host. Studio's docs also gain a privacy
notice, an IT FAQ, and the runbook for Codaco's alerts.
