# Studio operational observability

The Node server emits JSON to stdout and exposes standard Prometheus text. It
needs no hosted log collector, analytics service, or monitoring sidecar to boot.
Install a local or hosted collector only where operational retention and alerts
are wanted. Managed deployment storage must retain logs and metrics for 30 days;
that collector configuration belongs to the deployment, not the application.

## Requests and privacy

Every HTTP response produces one `http_request` JSON record, including static
client responses, auth refusals, machine 404s, unexpected errors, and WebSocket
handshakes. Node records response completion or an interrupted connection (499).
A response-stream failure aborts the transport and records 500; partial research
artifacts must not appear to finish successfully. Fetch-only runtimes record
handler completion because they do not expose transport completion. WebSocket
records describe the handshake; messages are never logged.

`X-Request-Id` is echoed on responses and reused by RPC immutable audit events.
The server generates a UUID unless a valid UUID arrives from an actual socket
peer covered by `TRUSTED_PROXIES`. IPv4-mapped IPv6 peers match IPv4 ranges.
Forwarded headers never establish peer trust. A deployment proxy must overwrite
client-supplied request ids; a CDN-specific id that is not a UUID cannot replace
this correlation id. Fetch-only runtimes always generate their own id.

Records contain the fixed route, method, status, duration, and request id. Team
ids are added only after membership, study tenancy, or invitation acceptance is
resolved. A forged team header, an inaccessible team, or a session's active-team
preference does not provide team correlation. No user or participant id is a
metric label. Unknown URLs, query strings, storage hashes, request and response
bodies, protocol contents, answers, email addresses, cookie and bearer values,
export bytes, and raw exception names/messages/stacks are not operational fields.

Fixed `STUDIO_*` diagnostic codes replace raw application, database, auth, audit
and worker errors. Invalid Node startup settings emit
`STUDIO_CONFIGURATION_INVALID` and exit before a listener starts; environment
validation does not print values or the validator's issues object.
The Node executable also records `STUDIO_PROCESS_FAILED` and exits for uncaught
exceptions and rejected promises; imported application modules install no
process handlers or console overrides. Missing client assets emit
`STUDIO_CLIENT_ASSETS_UNAVAILABLE` without a filesystem path and are picked up
when a development build appears.
`STUDIO_AUDIT_APPEND_FAILED` means the enclosing transaction
rolled back. `STUDIO_AUDIT_DENIAL_EVENT_LOST` means access stayed denied but its
required audit observation could not be persisted. Operational records do not
replace immutable audit history.

The explicitly enabled development console mailer remains an exception: local
`STUDIO_DEV_DEFAULTS` with `NODE_ENV=development` or `test` prints usable magic
and invitation links. Do not collect those development logs. Production rejects
that development configuration and never falls back to console mail delivery.

## Probes

`GET /healthz` is unconditional process liveness and remains the image's
`HEALTHCHECK`. Database or object-storage failure must not trigger a restart loop.

`GET /readyz` returns 200 only when an application-pool checkout and query work,
the current build's schema fingerprint matches, and an authenticated S3
`HeadBucket` succeeds. The object-store credentials therefore need bucket-head
permission. Missing configuration, stale or absent schema, failed dependencies,
and timeouts return 503 with only fixed dependency states. This endpoint does
not read research objects or run migrations.

Each dependency operation has a two-second deadline and observations are cached
for one second. Concurrent calls share the same operation. A timed-out database
checkout remains the sole outstanding checkout until it settles; a late client
is released without querying. A query interrupted by the deadline has its
client destroyed. Repeated probe calls cannot append an unbounded pool waitlist.
Queue collection uses the same bounds on the maintenance pool.

## Scraping and metrics

Set a separate random `STUDIO_METRICS_TOKEN` of at least 32 characters (for
example, `openssl rand -base64 32`). `GET /metrics` refuses with 404 while the
token is absent, and 401 unless `Authorization: Bearer <token>` matches. No
cookie or researcher membership grants scraper access. Keep the endpoint on
the operator network where practical and carry the credential over TLS outside
localhost. Responses are not cacheable.

An example Prometheus scrape uses a secret file rather than a token in source:

```yaml
scrape_configs:
  - job_name: studio
    scrape_interval: 30s
    scrape_timeout: 5s
    scheme: https
    authorization:
      credentials_file: /run/secrets/studio_metrics_token
    static_configs:
      - targets: [studio.example.org]
rule_files:
  - /etc/prometheus/studio-operator-rules.yml
```

| Metric                                                               | Meaning                                                                               |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `studio_http_requests_total`                                         | Count by finite method, route and status                                              |
| `studio_http_request_duration_seconds`                               | HTTP duration histogram by method and route                                           |
| `studio_websocket_connections`                                       | Current open application sockets                                                      |
| `studio_event_loop_lag_seconds`                                      | Mean, maximum and p99 delay since the preceding scrape                                |
| `studio_database_pool_connections` / `studio_database_pool_capacity` | Active, idle, waiting and configured maximum by application/maintenance pool          |
| `studio_dependency_ready`                                            | Latest database, object-store and fingerprint readiness                               |
| `studio_outbox_collection_success`                                   | Whether current cross-team queue data could be read                                   |
| `studio_outbox_jobs`                                                 | Queue depth and ready, leased, expired lease, failed, suppressed and uncertain states |
| `studio_outbox_oldest_ready_seconds`                                 | Age since a currently claimable job became available                                  |
| `studio_outbox_dispatch_results_total`                               | Shared dispatcher outcomes, including separate retried, failed and uncertain counts   |
| `studio_outbox_dispatch_duration_seconds`                            | Shared dispatcher run histogram                                                       |
| `studio_outbox_lease_renewals_total` / `studio_outbox_errors_total`  | Renewal outcomes and dispatcher/worker boundary errors                                |

Queue snapshots include `team_invitation_deliveries`, `audit_alert_outbox`,
`audit_export_jobs`, `message_deliveries`, `webhook_deliveries`, and both
`study_wave_rollups` and `study_stage_rollups` recompute worklists. Pending includes
future work and leased work. Ready excludes future work and unexpired leases;
expired leases become claimable. Uncertain rows are terminal and never appear
as retryable failures. Rollups use `stale_at`; their schema has no lease or
terminal-failure columns, so those states are zero. Failed queue collection
removes old snapshots and sets its success gauge to zero, never reporting a
false empty queue through tenant RLS. Shared lifecycle instrumentation observes
only dispatchers that have been implemented; a schema snapshot does not start
a worker. Dispatcher and worker error counters describe boundaries and can both
observe one propagated failure.

## Operator alerts

Load [operator-rules.yml](operator-rules.yml) into Prometheus-compatible rule
evaluation and route `audience=operators` exclusively to the deployment's
operator receiver. Rules cover unavailable processes/dependencies, HTTP error
rate, pool saturation, event-loop lag, missing queue snapshots, stalled queues,
expired leases, exhausted retries, uncertain acknowledgements and worker errors.
Thresholds are starting values to tune from production measurements.

Validate the file with `promtool check rules operator-rules.yml` and run its
positive and negative cases with `promtool test rules operator-rules.test.yml`
from this directory. The tests cover the pending interval, uncertain delivery
separation, and exclusion of readiness responses from application error rates.

No rule contains recipient addresses or tenant data. Infrastructure failures
must not go to researcher notifications. Team-configured research/audit alerts
use a separate delivery policy and are not implemented by this rule file.
