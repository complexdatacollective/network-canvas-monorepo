# Managed Studio estate candidate

This directory is a reviewable foundation for issue #1243/#1251. It selects one
US estate: Fly IAD compute, one Crunchy Bridge Hobby-2 PostgreSQL cluster on AWS
`us-east-1`, Cloudflare R2 US-jurisdiction primary objects, two AWS KMS keys in
`us-east-1`, and an independently owned US-region Backblaze B2 recovery bucket.
New Relic Free is the candidate 30-day log and metric destination. Nothing here
is evidence that the estate is production-ready.

The four persistent singleton services are Studio production, Studio staging,
Registry production, and Registry staging. Studio and Registry each use one
signed immutable image for both environments. Every input must be a full
`name@sha256:<digest>` reference authenticated against the combined release
manifest before the deployment module receives it. Managed Studio uses the same
server artifact as self-hosting with `STUDIO_DEPLOYMENT_MODE=managed`; its client
assets are promoted separately to the managed CDN, while self-hosting retains
assets in the composite image. There is no managed product fork.

## What this module creates

- Four private R2 buckets with `jurisdiction = "us"`, one for each logical
  database/service boundary. `location` is deliberately omitted because it is a
  best-effort hint rather than a jurisdiction guarantee.
- One non-HA Crunchy Bridge cluster candidate with AWS/`us-east-1`, the
  catalogue-verified Hobby-2 plan, PostgreSQL 18, and the shared candidate's 20 GB storage. The data source must report the exact plan identity, CPU,
  memory, and AWS region; missing or changed catalogue entries refuse planning.
- Two regional AWS KMS keys, one per environment, with annual automatic
  rotation. Runtime principals can only decrypt with Studio's actual
  `studio-deployment`, `studio-purpose=root-key.v1`, and
  `studio-root-reference=STUDIO_ENCRYPTION_ROOT_*` context. Separate wrapping
  principals can encrypt/generate data keys with the same context. Input
  validation requires complete IAM user/role ARNs, disjoint production/staging
  runtime principals, no runtime overlap with wrappers or administrators, and
  distinct valid deployment context ids. Wrappers are distinct across
  environments and from administrators. KMS administrators retain full `kms:*`
  authority and are fully trusted cryptographic principals; disjoint runtime
  and wrapper identities do not restrict an administrator's key access. The
  authenticated Terraform IAM principal must itself appear in the administrator
  list, preserving KMS's default policy lockout check. STS sessions are resolved
  to their issuing IAM role (including its path); that session needs `iam:GetRole`
  on its own role. Account-root delegation and lockout-check bypass are not used.
- One private B2 bucket with SSE-B2/AES256, Object Lock, and 31-day compliance
  retention. The recovery pipeline must additionally encrypt and authenticate
  every archive client-side using a private key held outside B2 and the primary
  estate.

Provider versions are exact pins. The R2 `us` jurisdiction is supported by
Cloudflare provider 5.24.0. The B2 provider supports SSE-B2 and default Object
Lock retention. The Crunchy provider only provisions the cluster. It does not
create the four databases or enforce the SQL security contract.

Fly's official Terraform provider was archived in 2024. `candidate_inventory`
therefore emits service requirements, not Machines API request bodies. The four
sizes and 744-hour billing month come from `candidate-sizing.json`, shared with
the cost estimator; changes to CPU or memory require a reviewed sizing and
price update. Private database/object connectivity, health checks, secret
injection, and the single-origin routing contract remain later deployment
steps. R2 credentials/versioning, database enrollment, New Relic configuration,
and replication/validation workers also remain explicit modules rather than
unsupported placeholder resources.

`fly-machine-preparation.mjs` implements only the nonrunning-Machine preparation
part of that handoff. Its caller supplies the four existing app names, expected
organization slug, Terraform service requirements, and an organization-scoped
token directly in memory. Before its first write it checks every app's
organization and complete Machine inventory. It creates missing Machines with
`skip_launch: true` and `skip_service_registration: true`, or leases and updates
an exactly marked `created` or `stopped` Machine with optimistic version
matching. Requests use the public `https://api.machines.dev/v1` API, reject
redirects and pagination, and bound request time, total time, and response
bytes. Lifecycle reads continue only through that total operation deadline and
stop immediately on a changed identity, config, or unsafe state. Update leases
use Fly's bounded opaque nonce as a header and request enough TTL to cover the
remaining operation; a shorter returned expiry is refused before update. A
final fresh inventory must show the same digest-pinned, candidate-sized,
nonrunning Machine per app.

Preparation does not create Fly apps or accounts, inject secrets, allocate
addresses, define services, start Machines, or qualify deployment. Activation
still requires the authenticated deployment workflow, private connectivity,
health checks, secret delivery, routing, and live capacity evidence described
below. The request and lifecycle shapes follow Fly's official
[Apps](https://fly.io/docs/machines/api/apps-resource/) and
[Machines](https://fly.io/docs/machines/api/machines-resource/) resources. The
nested lease response and nonce-header behavior are also cross-checked against
Fly's pinned
[`fly-go` v0.9.15 client](https://github.com/superfly/fly-go/blob/v0.9.15/flaps/flaps_machines.go#L261-L316)
and
[`MachineLease` types](https://github.com/superfly/fly-go/blob/v0.9.15/machine_types.go#L1021-L1032).

The routing-only Cloudflare Worker in `workers/studio-ingress` defines the
single public origin: fixed server surfaces stream to the persistent Fly
backend, including `/ws`, while all other GET/HEAD traffic reaches the Netlify
client origin without cookies or authorization headers. Its checked-in
configuration is fail-closed and dry-run-only; live domain routing remains a
separate qualified operator action.

## Managed operational log boundary

`scripts/studio-managed-log-sanitizer.mjs` is the collector-facing privacy
boundary for application logs. Its byte-oriented API accepts only the four
service/environment pairs in this estate, parses at most 4 KiB per record, and
refuses an input batch above 256 records or 256 KiB before decoding any member.
It imports the application-owned route and diagnostic catalogs. Unknown fields,
routes, diagnostics, bindings, malformed UTF-8 and over-limit records do not
produce a forwarded record.

The output is a flat structured log suitable for a bounded New Relic Log API
batch. It contains only the pinned schema identity, service, environment,
normalized timestamp, fixed event kind, and either the bounded request fields
or one approved diagnostic identifier. Studio's authorized team correlation is
accepted as a known source field and discarded. Raw source messages, URLs,
headers, bodies, exceptions, provider replies and arbitrary service labels are
absent from the output schema. The schema identity is a SHA-256 digest of the
exact services, routes, diagnostics, methods, fields and amount limits; a catalog
change fails module loading until the reviewed identity and tests are updated.

This seam does not subscribe to Fly logs, frame stream input, persist the shared
egress budget, construct an HTTP request, hold a New Relic key, retry delivery,
or prove destination retention. The future collector must preserve private
subject provenance when it supplies the binding, call this sanitizer before
queueing any bytes for egress, and treat an empty result as a dropped batch. No
provider call or account configuration is exercised by its repository tests.

`scripts/studio-managed-fly-log-envelope.mjs` supplies the preceding portable
Fly-envelope boundary. Fly's official log stream uses the NATS subject
`logs.<app_name>.<region>.<instance_id>` and sends a structured JSON envelope;
Fly's maintained Log Shipper first parses the NATS message as JSON, while the
maintained Fly Telemetry configuration separately parses the resulting inner
`.message`. The adapter therefore accepts the authenticated NATS subject only
as caller-owned transport provenance, matches it to one configured exact app
and the fixed `iad` region, verifies the redundant Fly envelope metadata, then
passes only the inner application-message bytes to the sanitizer. Envelope
fields can refuse a record but can never select its service or environment.

The adapter accepts current Fly application envelopes for both stdout and
stderr (`log.level` is checked and discarded). It validates and discards Fly's
nanosecond-capable envelope timestamp; the forwarded timestamp remains the
application logger's strict timestamp. Unknown or duplicate envelope or inner
application members, platform/non-application events, malformed UTF-8,
malformed subjects and unconfigured apps are dropped. Outer input is bounded at
8 KiB per event, 256
events and 256 KiB per batch before JSON parsing. The concrete subject is capped
before splitting or byte encoding, and its bytes count with every outer payload
toward the batch limit even when that event is later dropped. These choices
follow the
[Fly Logs API description](https://fly.io/docs/monitoring/logs-api-options/),
[official Log Shipper transform](https://github.com/superfly/fly-log-shipper/blob/main/vector-configs/vector.toml),
and [official Fly Telemetry transform](https://github.com/superfly/fly-telemetry/blob/main/vector.yaml).
The future network collector must still authenticate the read-only Fly NATS
connection, take the subject from the subscription callback rather than the
message, configure the four deployed app names, handle reconnect/backpressure,
measure and alert on bounded drops or Fly schema drift, and preserve the
egress-budget and delivery guarantees. Repository tests do not qualify that
network boundary.

## Required credentials and custody

Terraform provider credentials are `TF_VAR_cloudflare_api_token`,
`TF_VAR_crunchybridge_application_secret`, `TF_VAR_b2_application_key_id`,
`TF_VAR_b2_application_key`, and AWS `AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`, and `AWS_REGION` for a short-lived
deployment session. Values must come from the operator secret system and must
never be committed. The module does not create long-lived access keys because
their secret values would enter Terraform state. The remaining API modules need
`FLY_API_TOKEN`, `NEW_RELIC_API_KEY`, `NEW_RELIC_ACCOUNT_ID`, and
`NEW_RELIC_REGION`; the recovery worker needs independently scoped
`B2_APPLICATION_KEY_ID`, `B2_APPLICATION_KEY`, `B2_BUCKET_NAME`, and its
archive recipient, while the validator alone receives the matching private
archive key. These are missing module contracts, not currently implemented app
variables. Runtime secret names are exported separately as names only, including
Studio's `POSTMARK_SERVER_TOKEN` and the separate Registry
`REGISTRY_POSTMARK_SERVER_TOKEN`. The B2
account and archive-decryption private key must remain under independent
operator custody, outside Cloudflare, Fly, Crunchy Bridge, the primary
configuration archive, and their account-recovery paths.

## Gates before any apply or promotion

1. Confirm current provider quotes and account-visible product identifiers. Run
   `node cost-model.mjs cost-input.json --budget` to check the arithmetic,
   complete billing categories, current pricing declarations, reserve, and headroom
   against the $100 cap.
   This command **cannot qualify an apply or promotion**: its result always
   reports `qualificationComplete: false`. The retired `--gate` option fails
   closed even if the input contains true evidence Booleans. Actual provider,
   capacity, recovery, retention, and alert receipts must be independently
   authenticated by the deployment qualification workflow before it can admit
   deployment. That workflow is not implemented in this foundation.

   The checked-in input is illustrative and incomplete, with unverified prices,
   zero reserve, and no selected Workers tier; it fails `--budget`.
   `node cost-model.mjs cost-input.json`
   only reports the estimate. Every budget line requires a `pricing` object with
   `currency: "USD"`, the exact `quantity` and `unitPriceUsd`, and a `reviewedAt`
   date (`YYYY-MM-DD`) within the preceding 30 days. Paid categories require
   `kind: "rate"` and an HTTPS provider `sourceUrl`; zero-priced categories
   require `kind: "included"`, that source, a written `coverage` explanation,
   and `coveredQuantity` covering the entire declared usage. The reserve uses
   `kind: "operator-reserve"`. Placeholder evidence is refused even after a
   reserve is added. These are operator declarations, not authenticated quotes;
   the command never grants deployment qualification.

   Its traffic, object-version, mail, and execution quantities are synthetic
   arithmetic examples rather than measurements from an account or workload.
   Replace every one with bounded measurement evidence before supplying current
   pricing declarations.

   Included-price declarations also name an `allowance` with `billingScopeId`,
   `productId`, `allowanceId`, `unit`, `period: "month"` and `limitQuantity`.
   The pricing row names `providerId`; `coveredQuantity` equals the shared limit.
   Every row using that provider/billing-scope/product/allowance consumes the same
   allowance. Identities and unit labels are compared without case differences;
   units and limits must agree. The estimator sums the full execution
   month, including annual maintenance, quarterly drills and their receipt I/O,
   before checking the shared limit. Distinct rows cannot each spend an entire
   Lambda or B2 allowance. An overage requires paid pricing rather than another
   copy of the free declaration; operator quotes must identify the actual billing
   scope and allowance, not invented subdivisions.

   Quantities must match measured usage. Compute prices all four candidate
   Machines for 744 hours. `flyApplicationEgressGb` measures their API,
   WebSocket, Registry, and other outbound delivery; `flyRecoveryUploadGb`
   separately measures capture/upload traffic, including encrypted-envelope
   overhead, metadata, and retries. Its floor includes every scheduled dump
   and changed object uploaded from Fly to B2. `flyEgressGb` prices at least
   the sum of both measurements (650.2 GB in this synthetic example). The ingress Worker has
   separate mandatory tier, request, CPU-millisecond, and WebSocket-minute
   categories. Plain Workers bill a WebSocket upgrade as a request and do not
   charge for connection duration, so upgrades belong in
   `workerMonthlyRequestCount`; the WebSocket-minute row must carry an explicit
   zero-price inclusion declaration for the same selected tier. Durable Objects
   are unsupported by this model and require a reviewed extension for their
   request, duration, and storage dimensions. No zero-priced per-GB placeholder
   represents Worker account charges. `workerTierId` remains unselected until an
   account-visible product and its current allowances/rates have been reviewed.

   The New Relic subscription row covers only New Relic. The private collector
   is a fifth persistent workload with separate 744-hour compute, checkpoint
   storage, and egress rows. Its synthetic candidate is one 512 MB shared CPU
   Machine in IAD; provider pricing declarations must identify that exact size
   and region. The independently administered monotonic anchor has separate AWS
   HTTP-request, compute GB-second, DynamoDB read/write request-unit, and durable
   storage rows bound to `us-east-1`. These measured dimensions must include
   retries and reconciliation. Free allowances need explicit complete coverage;
   they cannot be represented by the unrelated New Relic Free declaration.

   Both monitoring workloads also appear in `candidate_inventory.monitoring`.
   Their shared sizing contract names the private always-on Fly collector, its
   at-least-1-GB checkpoint volume, and the independently administered US AWS
   HTTP/Lambda/DynamoDB anchor. The anchor handoff fixes the `account`/`record`
   string key schema and permanent `ENROLLMENT` record, disables TTL, requires
   deletion protection and PITR, and separates collector, service and enrollment
   authorities. These are requirements for the remaining deployment module;
   neither workload is provisioned by these outputs. DynamoDB transaction IAM
   permissions apply to the [underlying item operations](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis-iam.html)
   and are restricted by the enclosing transaction operation.

   `databaseDumpSizesGb` must measure each of the four compressed archives.
   `databaseExpandedSizesGb` separately measures each restored database after
   expansion, must fit within the selected PostgreSQL storage, and sets the
   minimum scratch-database storage for both drill paths. The shared
   30-minute schedule requires at least 5,952 database validations and 595.2 GB
   of source-provider egress in this illustrative 0.4 GB aggregate-dump case,
   with the corresponding B2 and validator requests and full-dump transfer.
   Each database generation prices an archive PUT, independent readback GET,
   and a separate immutable checkpoint PUT after successful validation.
   For objects, current count/bytes, monthly version churn, and the complete
   recovery-retained version inventory are separate measurements. Each count
   and byte total must be zero or nonzero together so a nonempty inventory
   cannot be priced as zero bytes. The retained
   inventory must cover current objects plus churn. Its 31-day storage,
   recovery-copy reads/writes and immediate independent readback transfer, every one-minute primary-bucket
   inventory page, and every retained version's
   30-day B2 readback/validator scrub are lower bounds on the aggregate R2, B2,
   and validator quantities. Every changed version requires a readback GET,
   a validation invocation, and separately measured validation GB-seconds
   before its copy can be included in a checkpoint. The periodic history scrub
   cannot substitute for that validation. Retries and growth must increase the
   relevant measurements. Quarterly restore drills are separate mandatory costs
   below; a reserve cannot substitute for their execution.

   `primaryObjectBucketInventories` binds each of the four buckets' retained
   version count to its measured requests for one complete authoritative scan.
   The sum must equal the retained inventory. Every bucket needs at least one
   request, and [R2 listings return at most 1,000 objects per page](https://developers.cloudflare.com/api/resources/r2/subresources/buckets/subresources/objects/methods/list/).
   Short pages and retries must be included in the measured scan count. The
   fixture's 12,500 versions occupy 13 pages across four buckets, requiring
   580,320 monthly listing requests plus 2,500 version writes; four requests per
   scan would underprice reconciliation.

   Postmark pricing separates one selected plan from the overage message count
   derived as `max(0, postmarkMessageCount - postmarkIncludedMessages)`. A
   current budget declaration must identify the same plan and included-message
   allowance on both mail rows. Validator compute adds database validation
   GB-seconds to independently measured new-copy validation, per-bucket
   reconciliation/checkpoint signing, and complete object-scrub GB-seconds.
   `objectCopyValidationMemoryGb` and `objectCopyValidationDurationSeconds`
   measure each changed version's full independent readback and validation;
   multiply by monthly version churn. `objectReconciliationMemoryGb` and
   `objectReconciliationDurationSeconds` measure one complete bucket scan,
   proof comparison, and checkpoint publication, including all listing pages.
   The one-minute schedule therefore requires 178,560 such executions and
   checkpoint PUTs across four buckets, even when they are idle. The source
   capture/upload workers use the four already priced Machines; their CPU and
   memory demand remains part of those Machines' required capacity test.
   Any separately hosted capture process requires an additional cost row before
   it can be selected.

   The independent store is also read during reconciliation.
   `recoveryObjectRequestsPerReconciliation` measures the complete B2 operation
   count per bucket, including discovery/listing pages, every GET needed to
   consume its signed proof index, and the new checkpoint PUT (at least three).
   `recoveryObjectRequestsPerScrubStart` separately measures discovery and
   proof-index reads for each bucket at the start of each history scrub (at
   least two). Multiple index objects, listing pages, and retries raise these
   measurements. Proof-index read bytes and outgoing signed checkpoint bytes
   are included in the respective transfer floors; object payload reads alone
   cannot pay for recovery metadata I/O.

   Every history scrub also persists a result for every retained version and
   publishes each bucket's revised proof index, including invalidation after a
   corruption finding. `objectScrubResultSizeBytes` measures each complete
   durable record. `objectScrubResultRequestsPerVersion` and
   `objectScrubPublicationRequestsPerBucket` each require at least one PUT;
   additional shards, readback, and retries increase them. The estimator includes
   all result/index PUTs, outgoing validator bytes, and locked result/index
   retention. Scrub execution measurements must include this publication work.

   `restoreDrills.pitr` and `restoreDrills.independent` each require at least one
   complete estate drill per quarter. Both name all four services and measure
   their restored database storage and retained object counts/bytes. The model
   prices each mode's compute GB-seconds, runner requests, provider-specific
   database and object source requests and transfer, runner transfer, four
   scratch database hours, scratch
   database GB-hours, and temporary GB-hours separately, amortized over the
   shared three-month interval. Restore transfer includes archive/envelope and
   metadata overhead; paged discovery, object fetches, failed attempts, cleanup,
   and receipt publication must be included in the measured resource totals.
   Source request floors include every object and at least one proof/checkpoint
   discovery read per object bucket on the object provider, plus all four database
   archives and their discovery reads on the database provider. PITR database source usage is declared against Crunchy
   Bridge while PITR object source usage is declared against Cloudflare R2.
   Independent database and object source usage remain separate categories even
   though both are declared against B2. A budget declaration must identify the
   expected provider on each source-pricing row. The independent B2 store also
   prices each drill receipt's
   PUT/readback GET, readback bytes, and full immutable retention. Scratch
   database storage must measure the expanded restored database, rather than
   treating a compressed dump as its storage requirement. The fixture's four
   hours and 28,800 GB-seconds per mode are synthetic inputs, not RTO evidence.
   Initial qualification drills are additional setup usage. The result reports
   monthly accrual as `totalUsd` and the conservative month in which both drill
   paths execute as `peakMonthUsd`. Budget acceptance and dollar headroom use
   that peak cost, so quarterly amortization cannot hide a breach of the cap.

   Annual maintenance re-encryption is also measured rather than absorbed into
   the monthly KMS rows or reserve. Production and staging each declare their
   scanned record inventory, batch size, actual bounded batch invocations,
   final verification invocations, complete configured historical-root count,
   and measured compute GB-seconds. A command loads the full configured root
   set once before its batch or verification work, so the KMS quantity is the
   sum of `(batch invocations + verification invocations) * configured roots`
   for each environment. The batch count must cover every record plus the
   terminal empty/full-page proof, and even an empty environment prices one
   batch invocation, final verification, root loads, and positive compute.
   Annual usage accrues monthly in `totalUsd`; `peakMonthUsd` restores the other
   eleven months to the execution month so rotation cannot pass the cap through
   averaging.

   `databaseCheckpointSizeBytes` and `objectCheckpointSizeBytes` are positive
   measured upper bounds for complete signed checkpoint records, including
   their manifests/proof indexes. Price the full immutable retention window's
   metadata alongside archives and object versions. A longer shared retention
   setting increases both locked storage and the exported B2 retention handoff.
   `objectScrubRunCount` covers at least two complete scrubs in the 31-day window;
   its memory and duration must measure the full retained inventory, including
   every shard's billed seconds when a scrub uses several jobs. The illustrative
   two 2-GB, 600-second scrubs add 2,400 GB-seconds; this is not a live measurement.
   Additional scrubs also increase the minimum request and transfer quantities.
   Requests and transfer are priced separately. A changed resource size is refused unless the shared
   candidate and price review are updated together. PostgreSQL storage and plan
   identity are also bound to that same candidate; an independent tfvars storage
   increase or plan substitution refuses validation. Total recurring cost,
   including a non-zero recovery reserve, must be at most $100/month and preserve
   the selected dollar headroom. Measured New Relic ingest must keep at least 2x
   headroom under its free limit.

2. Prove Hobby-2 can actually sustain `shared_buffers >= 1 GB` and app-role
   `work_mem >= 256 MB`, all process pools and four logical databases under
   representative concurrent load. Record CPU throttling, memory, connection,
   storage-growth, and latency headroom. The plan has no PgBouncer, no SLA, and
   best-effort health/audit/support, so price and `terraform validate` cannot
   qualify it.

   The earlier `docs/superpowers/plans/2026-09-07-studio-managed-hosting-estimate.md`
   Standard-4 table is a historical cost comparison showing that candidate's
   fixed floor exceeded the cap. It is not the active plan selection. The
   active candidate is Hobby-2, and it remains unqualified until the
   live catalogue, settings, grants, and representative capacity checks above
   succeed.

3. Create all four databases closed to public connection, run the real numbered
   migrations, install exhaustive current runtime/operator/backup role grants,
   verify effective settings, and only then admit their matching singleton.
   Ordinary deploys must never migrate.
4. Prove provider PITR separately for all four database identities: at least
   seven days of continuous points, latest-restorable-point polling every minute,
   an alert at four minutes lag, and stopped-WAL detection. A daily-backup time
   or general health signal is insufficient. Initial and quarterly restores must
   meet RPO <= 5 minutes and RTO <= 4 hours.
5. Every 30 minutes, capture each database. Independently reconcile every primary
   bucket once per minute so new versions can be copied and validated within the
   five-minute object recovery target; a database dump schedule cannot establish
   object recovery freshness. Reconcile each primary bucket to
   an authoritative version inventory. The independent validator must run
   outside the primary account, authenticate/decrypt/read back, restore, verify
   schema/migrations/content/row counts/sequences and every referenced object,
   then advance a signed checkpoint. Keep seven days of every restorable
   generation and one daily generation for 30 days; retain object versions for
   at least 31 days and until no retained database point references them. Test
   corrupt, missing, truncated, wrong-key, stopped-stream, pagination, dropped
   event, orphan-cleanup, and at-least-29-day recovery cases. Meet independent
   database RPO <= 1 hour, object RPO <= 5 minutes, and end-to-end RTO <= 4 hours
   in initial and quarterly drills.
6. Prove New Relic Free retains queryable logs and raw metrics for 30 days,
   implements the existing alert semantics including lost-signal behavior, and
   delivers independently of Studio mail. Enforce a hard stop before the 100 GB
   free ingest limit. No automatic paid upgrade is allowed, and PostHog remains
   the only application error-reporting path.

## Preliminary subprocessor inventory

| Provider                             | Candidate data/role                                                    | Location statement                                                | Status                                                                                                        |
| ------------------------------------ | ---------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Fly.io                               | Backend/Registry request traffic, process logs, runtime secrets        | IAD, United States                                                | Selected candidate; contracts, support, routing, and live qualification pending                               |
| Crunchy Data / Crunchy Bridge on AWS | Four logical PostgreSQL databases in one cluster                       | AWS `us-east-1`                                                   | Selected candidate; tuning, PITR latest point, stopped-WAL monitoring, capacity, and restore evidence pending |
| Cloudflare                           | CDN/DNS and four primary R2 asset buckets                              | R2 `us` jurisdiction; edge processing must be separately assessed | Selected candidate; credentials, version inventory, retention, routing, and DPA evidence pending              |
| Amazon Web Services                  | Two KMS application-root wrapping keys and ciphertext context metadata | `us-east-1`                                                       | Encoded; policy review, principal custody, billing, and recovery drills pending                               |
| Backblaze                            | Independently encrypted database/object recovery archives              | Independently owned US-region account required                    | Selected candidate; region/account custody, Object Lock, egress, restore, and deletion evidence pending       |
| New Relic                            | Operational logs, metrics, queries, and operator alerts                | US account/region handling requires contractual verification      | Cost candidate; 30-day retention, hard cap, alert routing, and DPA evidence pending                           |
| Postmark                             | Transactional Registry/Studio mail                                     | Existing candidate; residency and contracts pending               | No resource in this module                                                                                    |
| PostHog relay                        | Existing redacted telemetry and error reporting                        | Existing behavior; downstream terms remain separately documented  | Existing integration, not replaced by New Relic                                                               |

This inventory is preliminary input to the #1260 subprocessor list and HECVAT
Lite handoff. Provider legal names, affiliates, data categories, residency,
retention/deletion, security reports, breach terms, support, and account recovery
must be confirmed before publication.

## Collector egress budget state

`observability-egress-budget.mjs` is the admission primitive for the planned
private collector. It deliberately has no same-directory rollback marker. Its
operations require separate `runtimeAnchor` and `operatorAnchor` ports backed by
one independently durable, monotonic store. The runtime port provides `read` and
atomic compare-and-set `advance`; the operator port provides `read`, create-once
`initialize`, and authenticated `advanceMonth`.
Each format-2 checkpoint exposes the fixed account hash, reviewed policy
binding, payload and final-signal limits, both attempted-byte counters,
exhaustion state, last observed time, UTC month, month and reservation
sequences, and exact local-state digest. The remote state machine enforces the
visible counters and independently recomputes the digest; it does not treat an
opaque hash as evidence of spend. `advanceMonth(previous, next,
authorization)` receives the target UTC month in `next`, so its authorization
decision can bind the requested transition rather than accept generic freshness.
The primitive writes and fsyncs local state first, updates the anchor second,
and reads the anchor back before returning. A missing, stale, corrupt, failed,
or ambiguous anchor operation refuses forwarding. A failure after the local
rename can leave local state ahead; this conservatively requires operator
reconciliation and never refunds an attempted reservation.

An operator awaits `bootstrapMonthlyEgressBudget(options, { operatorAnchor })`
once in a private mode-0700 directory. Normal collector startup awaits
`openMonthlyEgressBudget(options, { runtimeAnchor })`; it refuses missing, partial,
corrupt, differently bound, permissive, linked, concurrently locked,
clock-regressed, or anchor-mismatched state. Changing the dedicated New Relic
account, the externally reviewed schema/usage policy digest, the monthly limit,
or the final-signal reserve is refused by the active remote lineage. A new
operator-controlled directory does not create another allowance for the same
account. A future policy transition must conservatively preserve attempted
bytes; none is implemented here. The primitive refuses a monthly limit
above the plan's measured 50 GB forecast bound.

Crossing a UTC month never resets capacity from the host clock. Open and reserve
operations return `EGRESS_BUDGET_MONTH_TRANSITION_REQUIRED` until an operator
calls `transitionMonthlyEgressBudget` with the next month's canonical observed
instant and an opaque authorization. The anchor's separately qualified
`advanceMonth` implementation must authenticate that authorization and atomically
advance its checkpoint. Arbitrary future-month jumps and locally invented
freshness booleans are not accepted.

The collector must hold the returned budget open for its complete process
lifetime and await `close()` during orderly shutdown. Reservations and close are
serialized on each instance: close drains already admitted operations and
immediately refuses new ones. Every reservation is asynchronous and returns only
after the local state is fsynced, the remote compare-and-set is acknowledged, and
the exact checkpoint is read back. The inherited-descriptor
`flock` is a kernel lease: a second process is refused, orderly close releases
it, and process death releases it. Linux uses the native util-linux `flock`;
the Perl implementation is only a macOS test fallback. Lock acquisition has a
five-second subprocess timeout and a dedicated contention exit code. The held
directory and lock descriptors are revalidated against their paths, and regular
budget files must have exactly one link. Each log or metric request must call
`reserveEstimatedIngest` with
its conservative estimated **provider-billed ingest bytes before forwarding**.
A returned reservation is never refunded after an ambiguous request. Regular
traffic cannot consume `finalSignalReserveBytes`; after exhaustion, exactly one
`reserveFinalExhaustionSignal` call may admit the separately estimated closure
signal. State replacement and its containing directory are fsynced before a
reservation returns. Creating the private state directory also fsyncs its parent.

This counter deliberately has no `providerUsageFresh` Boolean and does not
accept raw compressed or uncompressed wire bytes as proof. Before calling it,
the forwarding layer still has to authenticate fresh New Relic account-usage
evidence, measure the stored-byte expansion of the exact bounded schemas,
reserve the maximum traffic outstanding during reporting lag, and bind those
rules into `configurationIdentity`. Missing or stale provider evidence must
close forwarding outside this primitive. The counter does not establish New
Relic qualification, retention, queryability, alerts, or the provider's hard
account limit.

`observability-monotonic-anchor.mjs` defines bounded JSON POST routes
`/v1/read`, `/v1/initialize`, `/v1/advance`, and `/v1/advance-month` for one
fixed account. Authentication resolves a forwarding or operator authority.
Only the operator initializes the permanent lineage and authorizes an exact
next-month transition; only the forwarder advances ordinary spend. The durable
store must make initialization create-once even after active-record loss and
compare-and-set the complete checkpoint atomically. Its account partition and
permanent enrollment marker must be outside collector filesystem and deletion
authority. Handler timeouts are ambiguous failures: a late commit remains
charged and the next read discovers it.

`observability-dynamodb-anchor-store.mjs` supplies the transactional adapter.
An operator first creates its permanent `ENROLLMENT` item; initialization then
atomically creates `STATE` and closes that marker. Reads use
`TransactGetItems`, and every advance transaction checks the marker plus the
exact serialized previous checkpoint. The table belongs in the independently
administered recovery AWS account with point-in-time recovery. Its service role
is limited to the fixed table and account partition. Collector forwarder and
operator identities invoke separately authorized HTTP routes and receive no
DynamoDB permissions; the service role denies `DeleteItem`, `DeleteTable`, and
marker recreation. Deployment administration is disjoint from all three. The
adapter and mocked request-shape tests do not provision or qualify the table,
IAM policy, recovery account, or a live network path.

`observability-anchor-client.mjs` is the server-side HTTPS adapter for that
boundary. A forwarder client exposes only `read` and `advance`; an operator
client exposes only `read`, `initialize`, and `advanceMonth`. The fixed account,
HTTPS origin, and bearer token are snapshotted at construction. The token is
accepted only as explicit process input and never appears in returned state or
errors. Requests refuse redirects, cap JSON request and response bodies at 16
KiB, enforce a 100–30,000 ms deadline with an abort signal, and validate the
complete returned checkpoint and state digest. The injected request adapter is
for tests; production still requires an independently authenticated HTTPS
service and separately held operator and forwarder credentials.

The complete local path can be exercised without cloud calls against an
explicit loopback DynamoDB Local endpoint:

```sh
DYNAMODB_LOCAL_ENDPOINT=http://127.0.0.1:58000 node --test apps/studio/deployment/managed/observability-anchor-client.test.mjs
```

Without that variable the real-service case is skipped; the client never falls
back to a cloud endpoint.

No production anchor adapter or forwarding integration is qualified here. An
adapter stored on the same filesystem or administered through the same rollback
boundary does not satisfy the independent monotonic-store requirement. The
adapter must separately prove atomic compare-and-set behavior, durable readback,
month-authorization authentication, bounded calls, and its failure semantics
before this primitive can admit live forwarding. Descriptor revalidation also
does not defend against a malicious same-UID process racing filesystem paths;
the private directory remains an operator-owned custody boundary.

## New Relic log transport

`observability-new-relic-logs.mjs` applies the authenticated Fly envelope and
strict operational sanitizer before constructing the New Relic detailed-array
request. It posts only to the fixed US Log API endpoint, with a separate API-key
header, manual redirects, a 262,144-byte body limit and a bounded deadline.
Provider response text is discarded. A successful HTTP response records only
acceptance; it does not prove storage, queryability or retention.

Every attempt has a fresh random identifier and a digest binding that identifier,
the reviewed policy, exact schema identity, payload hash, wire bytes and record
count. The supplied `reserveAttempt` authorizer must echo that binding after
awaiting durable budget admission. Receipts cannot be reused across attempts,
including a collector restart; the transport also rejects backward month or
reservation sequences. UTC month is checked again immediately before fetch.
Retries require a new reservation, and uncertain requests are never refunded.

The transport has no subscription, queue or independent account-usage reader.
Its authorizer must still authenticate fresh provider usage and measured schema
expansion before admitting production traffic. Local tests use injected fetch
and native Request construction; they do not send data to New Relic. Positive
controls and deliberate mutations cover cached receipts, sequence replay and
rollover between reservation and fetch.

The request contract follows the [official New Relic Log API](https://docs.newrelic.com/docs/logs/log-api/introduction-log-api/).

## Account usage evidence

`observability-new-relic-usage.mjs` provides a separate read-only NerdGraph
client using an operator-supplied user key. It queries the exact configured US
account and UTC month, requires a complete month-to-date data-platform report,
and rejects absent, stale, malformed, regressed or wrong-month evidence. A
missing report never means zero usage. Epoch seconds are normalized to
milliseconds only when the value fits the requested interval unambiguously.
Both report timestamps and ingest values come from rows containing the required
attributes, so a partial row cannot refresh an old ingest value's freshness.

The reader bounds response size, request duration and concurrency, rejects
redirects and GraphQL partial errors, and discards provider error text. It does
not authorize forwarding, reset a durable budget, cover other accounts or
provide a billing upper bound. New Relic describes these figures as approximate
and delayed; the separate forwarding policy still needs measured ingest
expansion, headroom and the independent monotonic reservation service. Local
injected-response tests prove the refusal paths and timestamp normalization;
no live account query or production qualification is claimed.

The query follows the [official usage query guidance](https://docs.newrelic.com/docs/accounts/accounts-billing/new-relic-one-pricing-billing/usage-queries-alerts/)
and [NrMTDConsumption attribute definitions](https://docs.newrelic.com/attribute-dictionary/).

## Offline review

Run `terraform fmt -check -recursive`, `terraform init -backend=false
-lockfile=readonly`, `terraform validate`, `terraform test`, and `node --test
cost-model.test.mjs`. The required repository support check runs the estimator
controls and, when this module or its CI wiring changes, validates and tests
Terraform with mocked providers and no deployment credentials. Terraform 1.14.5
and its Linux executable checksum are pinned in that job. Initialization downloads
the four pinned providers and verifies their committed checksums without changing
the lock file. When deliberately updating provider pins, run `terraform providers
lock -platform=linux_amd64 -platform=darwin_arm64` to retain the package hashes
needed by both CI and macOS, then review the registry signatures and lockfile diff.
Do not run `plan` or `apply` without live-account authorization and a remote-state
design. Official capability references:

- <https://fly.io/docs/blueprints/infra-automation-without-terraform/>
- <https://registry.terraform.io/providers/CrunchyData/crunchybridge/0.3.0/docs/resources/cluster>
- <https://docs.crunchybridge.com/concepts/plans-pricing/>
- <https://developers.cloudflare.com/r2/reference/data-location/>
- <https://registry.terraform.io/providers/cloudflare/cloudflare/5.24.0/docs/resources/r2_bucket>
- <https://docs.aws.amazon.com/kms/latest/developerguide/conditions-kms.html>
- <https://registry.terraform.io/providers/hashicorp/aws/6.62.0/docs/resources/kms_key>
- <https://registry.terraform.io/providers/Backblaze/b2/0.13.2/docs/resources/bucket>
- <https://docs.newrelic.com/docs/data-apis/manage-data/manage-data-retention/>

The catalogue mapping is documented by the [official provider API](https://docs.crunchybridge.com/api/provider) and the [pinned Terraform provider](https://github.com/CrunchyData/terraform-provider-crunchybridge/blob/v0.3.0/internal/provider/data_source_cloudprovider.go). Plan CPU and memory fields describe capacity, not measured performance or an authenticated billing quote.
