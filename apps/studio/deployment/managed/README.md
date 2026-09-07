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
  account-resolved Hobby-2 plan id, PostgreSQL 18, and at least 20 GB storage.
- Two regional AWS KMS keys, one per environment, with annual automatic
  rotation. Runtime principals can only decrypt with Studio's actual
  `studio-deployment`, `studio-purpose=root-key.v1`, and
  `studio-root-reference=STUDIO_ENCRYPTION_ROOT_*` context. Separate wrapping
  principals can encrypt/generate data keys with the same context.
- One private B2 bucket with SSE-B2/AES256, Object Lock, and 31-day compliance
  retention. The recovery pipeline must additionally encrypt and authenticate
  every archive client-side using a private key held outside B2 and the primary
  estate.

Provider versions are exact pins. The R2 `us` jurisdiction is supported by
Cloudflare provider 5.24.0. The B2 provider supports SSE-B2 and default Object
Lock retention. The Crunchy provider only provisions the cluster. It does not
create the four databases or enforce the SQL security contract.

Fly's official Terraform provider was archived in 2024. `candidate_inventory`
therefore emits exact Fly Machines API inputs and this module does not pretend
to provision compute. A reviewed authenticated Machines API module must create
each service with one IAD Machine, no auto-stop, the exact digest, private
database/object connectivity, health checks, secret injection, and the
single-origin routing contract. R2 credentials/versioning, database enrollment,
New Relic configuration, and replication/validation workers also remain explicit
modules rather than unsupported placeholder resources.

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
variables. Runtime secret names are exported separately as names only. The B2
account and archive-decryption private key must remain under independent
operator custody, outside Cloudflare, Fly, Crunchy Bridge, the primary
configuration archive, and their account-recovery paths.

## Gates before any apply or promotion

1. Confirm current provider quotes and account-visible product identifiers. Run
   `node cost-model.mjs cost-input.json --gate`; it rejects missing cost classes,
   credits, paid New Relic fallback, fewer than four services/databases, or the
   weakened PostgreSQL minimums. The earlier $91.67 estimate and the checked-in
   model's current $86.83 result are both illustrative rather than complete
   quotes; the checked-in input is designed to fail qualification. Quantities
   are tied to the declared estate and measured usage, including validator
   invocations and traffic; missing memory or retention measurements refuse
   evaluation. Per-request and per-run prices must include the quoted execution
   size and duration. The gate checks the supplied evidence declarations, not
   provider accounts; a true Boolean is not independent proof. Measure
   ingress, database transfer, R2
   storage/Class A/Class B/egress, KMS requests, B2 storage/requests/egress,
   validator requests/traffic, mail, DNS, and a non-zero recovery reserve. Total
   recurring cost, including reserve, must be at most $100/month and preserve
   the explicitly selected dollar headroom. Measured New Relic ingest must keep
   at least 2x headroom under its free limit.
2. Prove Hobby-2 can actually sustain `shared_buffers >= 1 GB` and app-role
   `work_mem >= 256 MB`, all process pools and four logical databases under
   representative concurrent load. Record CPU throttling, memory, connection,
   storage-growth, and latency headroom. The plan has no PgBouncer, no SLA, and
   best-effort health/audit/support, so price and `terraform validate` cannot
   qualify it.
3. Create all four databases closed to public connection, run the real numbered
   migrations, install exhaustive current runtime/operator/backup role grants,
   verify effective settings, and only then admit their matching singleton.
   Ordinary deploys must never migrate.
4. Prove provider PITR separately for all four database identities: at least
   seven days of continuous points, latest-restorable-point polling every minute,
   an alert at four minutes lag, and stopped-WAL detection. A daily-backup time
   or general health signal is insufficient. Initial and quarterly restores must
   meet RPO <= 5 minutes and RTO <= 4 hours.
5. Every 30 minutes, capture each database and reconcile each primary bucket to
   an authoritative version inventory. The independent validator must run
   outside the primary account, authenticate/decrypt/read back, restore, verify
   schema/migrations/content/row counts/sequences and every referenced object,
   then advance a signed checkpoint. Keep seven days of every restorable
   generation and one daily generation for 30 days; retain object versions for
   at least 31 days and until no retained database point references them. Test
   corrupt, missing, truncated, wrong-key, stopped-stream, pagination, dropped
   event, orphan-cleanup, and at-least-29-day recovery cases. Meet independent
   RPO <= 1 hour and end-to-end RTO <= 4 hours in initial and quarterly drills.
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

## Offline review

Run `terraform fmt -check`, `terraform init -backend=false`, `terraform
validate`, and `node --test cost-model.test.mjs`. Initialization downloads the
four pinned providers and writes a lock file; review and commit its checksums.
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
