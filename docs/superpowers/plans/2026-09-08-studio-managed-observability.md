# Managed Studio observability implementation

Status: Registry operational metrics and the collector's durable budget primitive
are implemented and locally verified on the integration branch. The collector,
independent budget anchor adapter and live account qualification remain unfinished.

Use a dedicated New Relic Free organization for operational logs and raw dimensional metrics, with Original Data retention of 30 days. Keep PostHog as the sole application exception destination. Do not install New Relic APM, browser, trace or exception instrumentation. Operator alerts go independently through New Relic email to `info@networkcanvas.com`, the existing repository security contact. This avoids dependence on Studio, its database, Postmark or a delivery queue during an incident. The destination must be verified and tested before qualification.

The four application singletons need a separate private collector Machine. Price its full 744-hour compute, persistent budget checkpoint volume, retry traffic and egress in the complete $100 monthly hosting estimate. A 512 MB shared CPU candidate is unqualified until its memory and queue behavior are measured. Do not silently include collector resources in the four application allocations.

The collector uses pinned Prometheus and Vector components. Subscribe to exactly the four application log subjects and apply a second service allowlist. Retain only fixed route/status/duration/request identity and approved operational diagnostic fields; discard the original message and all raw URLs, bodies, headers, exceptions and provider replies. Scrape token-protected application metrics over private networking. Add Registry request, event-loop and pool metrics using its existing bounded diagnostics and shared database pool seams. Federation of Fly infrastructure metrics uses a read-only organization credential.

Send only allowlisted raw dimensional metrics through New Relic's remote-write endpoint, and bounded structured log batches through its Log API. Keep the ingest license key solely in the forwarding process, never in URLs, repository configuration, receipts or Terraform state. Bound request sizes, duration, retries and memory/disk queues. Reject redirects and any host outside the selected New Relic region.

Preserve the eleven existing Studio operator rules. Where the NRQL equivalent cannot preserve a compound ratio or time-relative condition, publish a continuous bounded condition gauge from the same inputs and compare it against the existing Prometheus scenarios. Use explicit per-service/environment targets and collector heartbeats for lost-signal alerts. Qualification must observe each expected target before independently stopping it; a missing target that never emitted a sample cannot be treated as covered.

New Relic Free stops ingestion and platform access after its account limit, but does not provide the required earlier stop. Data Budgets are paid tracking/notification, and Pipeline Control requires paid Advanced Compute. Implement a persistent local egress gate shared by both log and metric forwarding: reserve estimated stored bytes under the qualified expansion policy before each attempt, never refund ambiguous attempts, and refuse a missing/corrupt monthly UTC checkpoint. Reserve a small final budget-exhaustion signal before closure. Use a dedicated Free account without paid features, keep every other ingest credential out of workloads, require a measured forecast no greater than 50 GB/month, and verify the effective account configuration. Configuration booleans alone cannot establish that this works.

Live completion requires current provider prices, collector sizing and retry measurements, delivery to the verified operator mailbox, independent target/collector loss tests, a persistent-budget restart/corruption drill, and dated non-sensitive canaries proving queryability through day 30. No account is provisioned, no email is sent and no retention period is claimed from these implementation decisions.

Local integration evidence on 2026-09-08: Registry's full 390-test suite and the
66 Studio observability tests pass. Both applications use shared request
completion, proxy trust and metric primitives; the Registry protects `/metrics`
with an independent bearer credential. A real TCP reset before artifact
production completes records exactly one cancellation, and forcing a success
status causes its regression oracle to fail. The budget primitive requires an
independent monotonic anchor, pins its directory/lock descriptors, bounds native
`flock` acquisition and refuses automatic clock-based month resets. Its 26
controls passed within 141 composed managed-estate/CI controls before the later
recovery-cost additions. Neither a passing local counter nor an unqualified
remote anchor establishes production budget enforcement.

The local checkpoint carries its attempted-byte counters and limits to an
account-scoped monotonic HTTP state machine. That service admits one
create-once lineage, full-checkpoint CAS advances, and an operator-authorized
exact next UTC month. Forwarding and operator authorities are distinct. A
production adapter must bind the fixed account partition to independently
administered storage whose forwarder cannot delete, initialize, or advance
months; no local directory or changed configuration creates another allowance.

The local byte counter is not by itself a proof of New Relic account ingestion. New Relic documents decompression and enrichment increasing stored remote-write size, including an illustrative 15-times ratio to compressed input. Its account consumption view is approximate and can lag by about three hours. Qualification must therefore measure stored-byte expansion for the exact bounded metric/log schemas, bound the maximum outstanding traffic during that reporting lag, and reserve that allowance before forwarding. An assumed universal multiplier or a polled usage alert alone cannot establish the pre-limit stop. Missing, stale or inconsistent provider usage evidence must close forwarding; the dedicated Free account remains the independent spending ceiling.

Sources checked on 2026-09-08:

- [Fly log export](https://fly.io/docs/monitoring/exporting-logs/) and [metrics federation](https://fly.io/docs/monitoring/metrics/).
- [New Relic remote write](https://docs.newrelic.com/docs/infrastructure/prometheus-integrations/install-configure-remote-write/set-your-prometheus-remote-write-integration/), [Log API](https://docs.newrelic.com/docs/logs/log-api/introduction-log-api/) and [Vector forwarding](https://docs.newrelic.com/docs/logs/forward-logs/vector-output-sink-log-forwarding/).
- [Raw metric and log retention](https://docs.newrelic.com/docs/data-apis/manage-data/manage-data-retention/) and [Free edition pricing](https://newrelic.com/pricing).
- [NRQL lost signal](https://docs.newrelic.com/docs/alerts/create-alert/create-alert-condition/create-nrql-alert-conditions/), [email notifications](https://docs.newrelic.com/docs/alerts/get-notified/notification-integrations/) and [usage alerts](https://docs.newrelic.com/docs/accounts/accounts-billing/new-relic-one-pricing-billing/usage-queries-alerts/).
- [Data Budget prerequisites](https://docs.newrelic.com/docs/data-apis/manage-data/data-ingest-budgets/overview/) and [Pipeline Control costs](https://docs.newrelic.com/docs/new-relic-control/pipeline-control/costs/).
- [Remote-write sent versus billed bytes](https://docs.newrelic.com/docs/infrastructure/prometheus-integrations/troubleshooting/compare-rw-data-sent-billed-bytes/).
