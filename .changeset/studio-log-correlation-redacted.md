---
'@codaco/studio-api': minor
'@codaco/studio-contract': minor
'@codaco/studio-sync': minor
'@codaco/studio-web': patch
---

Every log line Studio writes is now one JSON record from the same logger, and
a record written while a request is being handled carries that request's
`request_id`, the `team_id` of the team it acted on, and the `trace_id` and
`span_id` of the span it was written in. The request id is the one returned in
the `x-request-id` header and stored with the request's audit events, so one
id finds a request's response, its log lines, its trace and its audit trail.
A record written outside a request carries none of the request keys.

Log messages are fixed text. The values a message used to quote (queue names,
job ids, counts, versions) are now separate fields on the record. The worker's
start-up line, for example, reads `Network Canvas Studio worker started` with
the version in its own `version` field.

`STUDIO_LOG_LEVEL` sets the least severe level written (`Info` by default;
Effect's level names, from `Trace` to `Fatal`, or `None`).

Values that are not public — researcher emails and names, team, study and
protocol names, protocol content, participant data, tokens, secrets, asset
values and client addresses — are now held marked as private from the moment
they are read, so they appear as `<redacted>` in any log line, trace or error
built from them. Nothing changes on the wire.

Logs no longer quote database or driver error text. A failed audit write and a
failed periodic reading log the error's type and its Postgres error code; the
full cause of a failed reading is logged at `Debug`. The job worker's
maintenance warning names what closed the deployment (`maintenance`,
`migration`, `schema` or `starting`) rather than quoting the maintenance
reason. An unusable `TRUSTED_PROXIES` entry is reported as a count, not by
quoting the addresses.

The first-run setup token, and the sign-in and invitation links the
development mail transport prints, are written to standard output only and
never pass through the logger.
