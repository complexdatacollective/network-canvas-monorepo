---
'@codaco/studio-api': minor
'@codaco/studio-sync': minor
---

Studio now exports its logs, traces and metrics while `STUDIO_TELEMETRY` is on,
which it is by default. They go to Codaco's PostHog project unless
`OTEL_EXPORTER_OTLP_ENDPOINT` names another OpenTelemetry collector; the new
`OTEL_EXPORTER_OTLP_HEADERS` supplies that collector's credentials and is
treated as a secret. With `STUDIO_TELEMETRY=false` no exporter is built. Logs
are written to stdout either way.

Only public data is exported. A request's span records its method, route
template, status and duration, and no longer its URL, query string, headers,
user agent or client address; a `traceparent` a client sends is ignored. A
failure is exported as its type and stack frames, never its message. Every
export carries the instance's `studio.installation_id`, and each exported log
record carries the same `request_id`, `team_id`, `trace_id` and `span_id` as
the line on stdout.

Both processes now report event-loop delay (p99 and mean) and memory as
`studio_runtime_*` gauges every ten seconds.

A job queued while handling a request is traced as part of that request: the
job row records the queuing span (migration `0004_job_correlation` adds a
`correlation` column to the jobs table), and the handler's `JobWorker.handle`
span is its child. Scheduled jobs carry no correlation.
