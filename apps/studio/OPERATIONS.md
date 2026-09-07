# Studio operational runbooks

These runbooks cover the Studio server and the separate Template Registry. They
name commands that exist in this repository and link to the detailed procedures
that own them. They do not establish production readiness. The self-host
installer and recovery paths have source, command-boundary, and Compose
configuration evidence. The managed estate, provider credentials, alert delivery, and live recovery
measurements remain pending.

For every event, open an operator record with UTC start/end times, affected
Studio and Registry deployment/database/bucket identities, release manifest
digest, observed alerts, commands and exit statuses, evidence locations,
decisions, and named operator. Never copy credentials, tokens, participant data,
mail bodies, reconciliation contents, or key material into that record.

## Service levels and evidence that apply to every runbook

- Production and staging each require separate Studio and Registry recovery
  evidence. Success for one of the four logical databases cannot cover another.
- Provider PITR: RPO at most 5 minutes, RTO at most 4 hours, at least 7 days of
  continuous recovery points, initial and quarterly drills per database.
- Independent encrypted logical backups: one dump per database every 30 minutes,
  validated-restorable RPO at most 1 hour, RTO at most 4 hours, every validated
  generation retained 7 days and at least one per day retained 30 days.
- Objects: RPO at most 5 minutes and RTO at most 4 hours. Keep referenced live
  content indefinitely; keep overwritten/deleted versions for at least 31 days
  and until every retained database point that references them expires. Scrub
  every retained version at least once per 30 days.
- End-to-end recovery: RTO at most 4 hours through both applications, databases,
  historical keys, objects, current authorization reconciliation, routing,
  authenticated smoke, content-hash retrieval, and safely resumed workers.
- Managed logs and metrics retain 30 days and exclude participant identifiers and
  payloads. The managed estate must remain in one selected US region; its provider
  and exact region have not been selected or qualified.

The complete acceptance contract is in the [platform foundation plan](../../docs/superpowers/plans/2026-09-05-studio-platform-foundation.md#operational-decisions-and-pending-qualification).

## Deploy and rollback

### Signed self-host deployment

1. Record the independently obtained expected release-manifest SHA-256. Verify the
   complete installer archive with the trusted Cosign command and identity in the
   [installer guide](deployment/installer/README.md). Compare the embedded
   `release.json` digest before executing extracted code.
2. For a fresh host, use the guide's existing `node install.mjs` invocation with
   the Studio domain, ACME email, Registry domain, Registry sender, and exactly one
   Registry SMTP/Postmark transport. Confirm the installation directory was empty
   and mode 0700. Complete `/setup` once; do not retain its printed token in the
   operator record.
3. For an update, use the guide's existing invocation with the mode 0600 private
   smoke credentials file and separate data-backup and historical-key custody
   directories. Confirm the selected manifest authenticates the supported source
   release before continuing.
4. Keep the installer invocation attached until it returns `active`. It holds one
   host lock, stops public/worker admission, creates a quiesced backup, applies
   explicit Studio and Registry migrations, verifies keys and backup identities,
   privately smokes both services, then opens the proxy as its last effect.
5. Record the accepted manifest digest, generated backup `COMPLETE` marker and
   checksum result, final release state, and authenticated smoke result. Observe
   readiness, WebSocket reconnects, queue age, pool pressure, and error rate
   through the agreed post-deploy watch period.

A same-release retry resumes the durable journal. Preserve the installation's
`control` and release-generation directories and pass the same inputs. Never edit
`progress.json`, rewrite the highest accepted release, bypass signatures, run a
migration at ordinary server startup, or start an old writer against a migrated
schema.

There is no implemented installer rollback or recovery-downgrade command in this
checkpoint. Once a release is accepted, selecting an older signed manifest is
refused; after migration begins, the supported response is to resolve the fault
and resume that exact release. If the release cannot be forward-completed, keep
admission closed and use the [combined restore procedure](BACKUPS.md) to create an
empty, distinct quarantined target from the pre-update backup and its independently
held custody. That restore is recovery evidence, not an activation command: it
leaves HTTP and workers closed, and no automated previous-release activation path
exists yet. Escalate this gap rather than changing protected state or starting the
target manually.

### Managed deployment status

Managed client/backend promotion, provider release rollback, traffic switching,
and a recovery-downgrade caller are pending. Before use, the estate must encode
signed image selection, the same migration compatibility gate, single-origin
session/CSRF/WebSocket behavior, retained old client assets, and a provider-tested
rollback that cannot reconnect an incompatible writer. IaC validation alone does
not validate this runbook.

## Tuesday 15:00–16:00 UTC migration

Routine code with proven adjacent-image expand/contract compatibility may deploy
outside this window. Any migration without that proof uses the announced Tuesday
window; the hour does not itself stop old writers.

1. At least one week ahead, announce the UTC start/end, affected services, expected
   interruption, owner, status location, and abort criteria. At least 24 hours
   ahead, confirm staffing and that no conflicting release or recovery is active.
2. Before 15:00, authenticate the signed release and supported source, confirm every
   database affected by the change is accounted for and record the other
   environment as explicitly out of scope; verify PITR lag and the newest
   independently validated generation for each, and confirm custody of every
   historical PII/integration/blind-index root and Registry private configuration.
3. At 15:00, run the signed self-host update invocation. Its implementation stops
   Traefik, Studio web/workers, and Registry HTTP/cleanup before capture; closes
   writer logins; rejects surviving sessions; and runs migrations only after the
   quiesced backup completes. Do not substitute a direct `migrate` command for
   this drain.
4. Require explicit migration, encryption verification, backup verification,
   private readiness/authentication, and Registry smoke success. Public admission
   is the installer's final effect. If any step fails, leave the window in incident
   state and replay the exact release after correction; follow the rollback limit
   above.
5. Before 16:00, either record successful activation and observations or announce
   the continuing incident. Do not reopen merely to meet the published end time.

The underlying schema rules, role enrollment, no-op behavior, and PostgreSQL-major
procedure are in [MIGRATIONS.md](MIGRATIONS.md). Managed scheduling, admission
controls, and provider identities remain unimplemented and require a live drill.

## Database failover

### Detection and containment

Treat failed readiness, database dependency alerts, connection-pool waiting, PITR
lag, or a provider failover notice as separate evidence. Record which of the four
databases is affected. Stop new deployments and migrations. If database identity,
role state, or write ordering is uncertain, close public admission and all workers;
do not let a healthy Registry result mask a failed Studio database, or vice versa.

The self-host Compose topology has one PostgreSQL container per application and no
automatic failover. Do not promote a copied volume or attach an old database while
writers run. Recover through the combined backup/restore boundary into a new
Compose project, using matching custody and current Registry reconciliation. The
restore refuses reused volumes/networks, populated targets, checksum/key mismatch,
unsafe privilege state, surviving sessions, corrupt referenced Registry objects,
and incomplete image custody. It ends with HTTP and workers closed.

A managed provider may keep a stable endpoint during failover or issue a new one;
no provider or command is selected here. Its procedure must prove the actual
post-failover database identity, TLS endpoint, schema fingerprint, role/CONNECT
quarantine, effective `work_mem`, PITR checkpoint continuity, and absence of old
primary writers before admission. If provider failover cannot satisfy the recovery
point, restore the selected authenticated PITR or independent dump into an isolated
target and follow the security/recovery quarantine below. Record component and
end-to-end RPO/RTO separately.

## Object-store outage

A failed `studio_dependency_ready{dependency="object_store"}` check, upload/read
error, replication lag, or stale authoritative reconciliation is an object-store
incident even if the database is healthy.

1. Identify Studio versus Registry and primary versus independent storage. Preserve
   the last validated object checkpoint and retention locks. Do not delete database
   rows, replay an event queue as a completeness proof, or advance a checkpoint
   from a heartbeat.
2. If writes or source/version authority are uncertain, stop proxy, Studio
   web/workers, and Registry HTTP/cleanup before further database references can be
   committed. Capture the outage interval and overlapping upload identities.
3. Restore or repair from authenticated immutable versions. Reconcile the complete
   authoritative key/version inventory with pagination and deletion markers, then
   read back and verify bucket, key, version, and content hash. A missing event must
   be found by reconciliation. Preserve the prior good checkpoint on any failure.
4. Verify every database asset reference against restored bytes for both Studio and
   Registry. Resume only after a fresh complete reconciliation, current lag within
   5 minutes, and a measured recovery within 4 hours.

The current self-host script validates objects only as part of the complete
combined restore; there is no tested object-only repair command. Managed object
versioning, immutable retention, cross-account recovery credentials, reconciler,
and outage drill remain pending.

## Dispatcher backlog

Use the metrics defined in [the observability guide](server/observability/README.md#operator-alerts): queue collection success, jobs by state, oldest-ready age,
expired leases, terminal failures, uncertain acknowledgements, worker errors,
dispatch results, and database pool waiting. Queue snapshots cover invitation and
audit-alert outboxes plus the declared message, webhook, export, and rollup tables;
a schema row does not prove a worker exists.

1. If collection fails, investigate database readiness, schema state, and the
   maintenance pool. Missing data is not an empty queue. If oldest ready exceeds
   five minutes, check that the worker process is running and admitted, then check
   pool saturation and the selected delivery provider without exposing payloads.
2. Correct the dependency and let the serial worker reclaim expired leases and its
   normal bounded retry policy operate. Observe ready age decreasing and new
   successful dispatches. Do not bulk-start workers while active leases or provider
   limits are unknown.
3. Treat `failed` and `uncertain` as terminal investigation states. Never clear
   `failed_at`, delete rows, edit attempt counts, or resend to silence an alert.
   For an uncertain delivery, use independent provider receipts and the stable
   message identity to decide whether it was accepted, and record that decision in
   the incident ledger. There is no implemented operator resolver in this
   checkpoint, so ambiguity remains held and is **never automatically retried**.
4. Close only after queue collection is current, ready age is back within threshold,
   expired leases are zero or explained, every terminal/uncertain item is recorded,
   and the causal worker/provider/pool signal has recovered.

Operator alerts are intended for `info@networkcanvas.com` because it is the
project-owned security address already published in [SECURITY.md](../../SECURITY.md)
and gives the small operating team one established destination without another
paid notification service. It must use monitoring-owned transport independent of
Studio's dispatcher and mail provider. This route is **not live or validated**:
confirm mailbox ownership and prove delivery to a synthetic receiver while Studio
and its mail provider are unavailable before enabling the real address.

## Annual KMS and application-key rotation

This procedure never retires historical material. The blind-index key is stable
across rotations. Until a reviewed retirement procedure exists, retain every root
and key proof indefinitely, including keys needed only by old backups or suppression
lookups.

1. Inventory the complete keyset: all PII and integration roots and key IDs, the
   unchanged blind-index root/key ID, archive encryption/authentication keys,
   second-provider recovery credentials, and account-recovery/MFA material. Copy
   them into encrypted operator custody outside the primary account, data archives,
   and worker write credentials. Verify custody digests and recovery access
   without placing material in the record.
2. Take the pre-rotation quiesced backup. Restore it in isolation using custody only,
   with primary-account credentials unavailable. Verify participant, OAuth and
   webhook decryption plus suppression/blind-index lookups. Independently omitted
   and substituted PII, integration, and blind-index roots must each refuse.
3. Stop old writers. Create a new application root and new current PII/integration
   key IDs; append them to the complete configuration and leave `blindIndex`
   unchanged. Distribute the complete keyset to the offline operator and every
   future replica before rotating data.
4. Run the built image's existing `encryption verify`. Then invoke its
   `rotate` operation with `--limit 100`, using the operator environment exactly
   as shown in the encryption guide. Save each returned JSON `cursor` unchanged
   and pass it as `--cursor` to the next invocation. Replay the last successful cursor after a
   failure. Continue until `passComplete` is true and the cursor is null; a full
   last page requires one additional call. Run `encryption verify` again. Exact
   container/environment examples and cursor semantics are in
   [the encryption guide](server/src/pii/README.md#migration-and-maintenance).

5. Take and independently restore a post-rotation backup. Require both old and new
   data to decrypt with the retained historical set and require all missing/wrong
   controls to fail. Resume writers only after every replica uses the complete
   configuration and the recovery evidence is retained.
6. Rotate the KMS backing key on its own annual schedule. Backing-key rotation must
   preserve the same application root bytes and IDs; it does not authorize an
   application-root change or blind-index change. Record provider key identity,
   policy, rotation evidence, and recovery test without recording ciphertext or
   credentials.

The application batch/verification commands and synthetic AWS KMS loader are
implemented. Managed KMS provisioning, schedule, key-policy custody, provider
rotation command, and primary-account-loss drill are pending; this runbook does
not invent them.

## Security incident and recovery quarantine

Follow the reporting and coordination policy in [SECURITY.md](../../SECURITY.md).
Do not put sensitive details in a public issue. Start the four-hour end-to-end RTO
clock when recovery is invoked, while preserving forensic evidence and the last
known-good backup/checkpoint identities.

1. Contain: close proxy/public admission; stop Studio web/workers and Registry
   HTTP/cleanup; prevent new database sessions for Studio runtime, maintenance and migrator
   identities and Registry operator identities. Prevent all publisher activity.
   Rotate exposed infrastructure credentials through their owning provider only after recording which recovery points they could affect.
2. Select an authenticated release and backup generation. Obtain Studio historical
   key custody, Registry private configuration, archive keys/recovery credentials,
   and a current, exhaustive Registry owner/operator/publisher reconciliation from
   independent operator custody. Hash-pin reconciliation independently.
3. From the backup configuration in an empty, distinct Compose project, run the
   existing command exactly as documented by `deployment/restore.sh`:

   ```sh
   sh deployment/restore.sh \
     /absolute/data-backup \
     /independent/keys.env \
     /independent/registry.env \
     /independent/reconciliation.json \
     RECONCILIATION_SHA256
   ```

   The script verifies all backup/image/custody hashes before writes, restores both
   databases and object stores, reapplies privilege boundaries, checks Registry
   migration/backup identities, recloses its writers, invalidates restored Registry
   sessions, magic links and active personal access tokens, reconciles current
   Registry authorization, and verifies referenced Registry blob hashes. It leaves
   public HTTP and every worker closed.

4. Reconcile Studio account, team membership, operator, integration, OAuth and
   deployment credential authorization against current trusted evidence. Invalidate
   restored sessions and one-time credentials. Current Studio reconciliation and
   bulk invalidation are not implemented in this checkpoint; do not reopen until a
   reviewed procedure supplies and records that evidence.
5. Hold every restored delivery queue. Compare provider receipts and independent
   records for work after the recovery point. Restored revoked credentials and
   already-sent work are mandatory negative controls. Any ambiguous send remains
   terminal and must never be automatically retried.
6. Require current migration/role/CONNECT evidence, no surviving old writers,
   complete historical-key verification, database content/count/sequence evidence,
   every referenced Studio and Registry object hash, authenticated Studio and
   Registry smoke, routing/TLS checks, and safely resumed worker proof. Record each
   component time and the single end-to-end RTO. A fingerprint or successful
   decryption alone cannot authorize reopening.

There is no implemented command that completes step 4 or reopens a restored stack.
The validated self-host boundary therefore ends in quarantine. Managed incident
containment, provider credential rotation, independent validator, failover, traffic
switch, and reopening procedures remain pending live qualification.

## Subprocessor and HECVAT evidence inventory

This is a factual code/config inventory for the future #1260 and HECVAT Lite
handoff, not a completed legal or security assessment. The current tree does not
define a managed estate, so hosting/database/object/backup/validator/monitoring/DNS
vendors and contracts remain unknown.

| Service or class                                                                                          | Current evidence                                                                                                                                                | Data/path and unresolved facts                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Self-host PostgreSQL, MinIO and Traefik                                                                   | Digest-controlled local containers in `docker-compose.yml` and Registry overlay                                                                                 | Operator-controlled infrastructure; not a Network Canvas-selected subprocessor. Host, residency, physical security and support depend on operator.                                    |
| Mail delivery                                                                                             | Studio and Registry accept one bounded SMTP transport or Postmark configuration                                                                                 | Sender, recipient, invitation/sign-in content and provider network metadata. Managed selection, account region, retention, DPA and subprocessor chain pending.                        |
| Google/Microsoft OAuth                                                                                    | Optional credentials and fixed callback configuration                                                                                                           | Provider processes OAuth identity/token data when enabled. Managed enablement, tenant, consent, contractual role and retention pending.                                               |
| AWS KMS                                                                                                   | Optional fixed-region KMS loader with exact key ARN and deployment encryption context                                                                           | Wrapped application roots and AWS request metadata; no ambient credential fallback. Account, region, key policy, audit retention and recovery custody pending.                        |
| Cloudflare telemetry relay and PostHog                                                                    | `STUDIO_TELEMETRY` defaults on; fixed redacted diagnostic payload goes through `ph-relay.networkcanvas.com`; [TELEMETRY.md](TELEMETRY.md) defines the allowlist | Relay still observes network address. Hosting region, downstream retention, contracts and whether managed production disables telemetry remain decisions.                             |
| GitHub/GHCR and Sigstore identity                                                                         | Signed release/installer/image distribution                                                                                                                     | Software artifacts and operator download metadata, not application research records by design. Organization controls, log retention and incident contacts still need HECVAT evidence. |
| Managed compute, PostgreSQL, object store, independent immutable backup, validator, metrics/logs, DNS/CDN | No selected estate in this checkpoint                                                                                                                           | Provider, US region, data categories, encryption, retention/deletion, subprocessors, support/SLA, breach terms, audit reports and account recovery are all pending.                   |

Before handoff, generate the final inventory from the deployed estate definition
and reconcile it with actual provider accounts, contracts, data-flow evidence, and
one-US-region configuration. Unknowns must remain marked unknown; repository
support for a provider protocol is not evidence that the provider is selected or
qualified.

## Evidence ledger

| Procedure                      | Repository evidence                                                                                      | Current operational status                                                                                          |
| ------------------------------ | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Signed self-host deploy/update | `deployment/installer/README.md`; `deployment/installer/operation.mjs`; installer command-boundary tests | Implemented and locally tested; no published signed production release or live deployment claimed.                  |
| Migration drain and checks     | `MIGRATIONS.md`; `deployment/migrate.yml`; installer operation                                           | Implemented self-host path; Tuesday managed window and adjacent-image production proof pending.                     |
| Backup/restore                 | `BACKUPS.md`; `deployment/backup.sh`; `deployment/restore.sh`; Registry recovery overlay                 | Combined self-host quarantine script implemented; populated activation and managed second-provider drills pending.  |
| Database/object failover       | readiness/metrics plus combined restore                                                                  | No self-host HA or tested object-only repair; managed providers unselected.                                         |
| Dispatcher backlog             | `server/observability/README.md`; operator rules; shared outbox engine                                   | Metrics and terminal uncertainty semantics implemented; operator resolver and live independent alert route pending. |
| Key rotation                   | `server/src/pii/README.md`; encryption CLI and restore tests                                             | Bounded application rotation implemented; managed KMS schedule/custody and live restore pending.                    |
| Security recovery              | `SECURITY.md`; restore and Registry `recover:verify`                                                     | Registry quarantine reconciliation implemented; Studio current-state reconciliation and safe reopen pending.        |
| Subprocessors/HECVAT           | runtime configuration and this inventory                                                                 | Preliminary only; final estate-derived list and vendor evidence pending.                                            |
