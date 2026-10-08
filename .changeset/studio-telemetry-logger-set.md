---
'@codaco/studio-api': patch
---

With telemetry on, Studio's processes now keep writing each log record to
stdout as Studio's JSON line, with its request, team, trace and span ids, beside
exporting it. Before, turning telemetry on replaced that logger with Effect's
default text logger and a logger that copied every record, failure text
included, onto the current span as an event, so the failure text left the
instance with the exported trace. Log records are no longer copied onto spans,
and a span event's `effect.cause` is dropped before export.
