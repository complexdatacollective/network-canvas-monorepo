---
'@codaco/studio-server': minor
---

The API process, the worker, `migrate` and `rotate-secrets` are now Effect
programs on Effect's Node HTTP server (stage 1 of the Effect 4 migration,
#1927). What a deployment sees:

- Logs are one JSON line each on stdout. Boot failures still print a plain
  message.
- Exit codes come from the runtime's teardown: 0 after a clean stop, 130 on
  SIGTERM/SIGINT, 1 when the process refuses to start (missing database, a
  schema this build did not create, a keyring that cannot open the stored
  secrets).
- On a deploy, open editor sessions are asked to finish and their sockets are
  closed with a plain close frame rather than the previous `1001 Server
shutting down`; browsers report it as a clean close (#1247).
- Every response carries an `x-request-id` header, and every error response
  Studio synthesises is RFC 9457 problem JSON.
- The worker keeps answering `/readyz` while it finishes its in-flight jobs
  on a stop; the health listener now closes after the job drain rather than
  before it.
- `migrate` and `rotate-secrets` still print a refusal as the one sentence
  to act on, and still exit 1.
- A new optional `OTEL_EXPORTER_OTLP_ENDPOINT` variable exports logs, traces
  and metrics to an OTLP/HTTP collector when `STUDIO_TELEMETRY` is on; unset
  means nothing is exported (#1897).
- `@hono/node-server` and `ws` are no longer direct dependencies of the server.
