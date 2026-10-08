---
'@codaco/studio-api': minor
'@codaco/studio-sync': minor
---

Studio now exports its logs, traces and metrics while `STUDIO_TELEMETRY` is on,
which it is by default. They go to Codaco's PostHog project unless
`OTEL_EXPORTER_OTLP_ENDPOINT` names another OpenTelemetry collector; the new
`OTEL_EXPORTER_OTLP_HEADERS` supplies that collector's credentials and is
treated as a secret, and a value `fetch` would not accept as headers is refused
at boot. With `STUDIO_TELEMETRY=false` no exporter is built. Logs are written to
stdout either way. The reference compose stack now passes `STUDIO_TELEMETRY`,
`STUDIO_LOG_LEVEL` and the two OpenTelemetry variables from `.env` to the
Studio containers; before, setting them in `.env` had no effect.

Only public data is exported. A request's span records its method, route
template, final status (including for requests that end in an error) and
duration, and no longer its URL, query string, headers, user agent or client
address; a `traceparent` a client sends is ignored. Database spans keep their
statement text, with placeholders, but not the database host or name. A
failure is exported as its type and stack frames, never its message. Every
export carries the instance's `studio.installation_id`, including those from
the `migrate`, `maintenance` and `rotate-secrets` commands, and each exported log
record carries the same `request_id`, `team_id`, `trace_id` and `span_id` as
the line on stdout.

Both processes now report event-loop delay (p99 and mean) and memory as
`studio_runtime_*` gauges every ten seconds.

A job queued while handling a request is traced as part of that request: the
job row records the queuing span (migration `0004_job_correlation` adds a
`correlation` column to the jobs table), and the handler's `JobWorker.handle`
span is its child. Scheduled jobs carry no correlation.
