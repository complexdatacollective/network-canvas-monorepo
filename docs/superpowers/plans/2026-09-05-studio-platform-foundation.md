# Studio platform foundation completion

Status: In implementation. No completion or production-readiness verdict yet.

## Objective and authority

Complete the unfinished engineering in [platform foundation #1243](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1243), using independently reviewable pull requests, adversarial reviews, required checks, the merge queue, and post-merge ancestry verification.

On 2026-09-05 Josh authorized implementation, subagents, creating and merging PRs, the necessary encryption/key-recovery, template-registry, and notification prerequisites, and managed hosting up to **$100 per month in total**. Production is `networkcanvas.studio`; staging is `studio.networkcanvas.dev`. Adding both to Netlify is authorized. The client may be hosted there; the persistent Node/WebSocket backend still follows the accepted architecture. Credentials remain outside this plan and chat.

Billing remains explicitly deferred by the epic. [#1253](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1253) still requires the PI's cost-recovery target and institutional purchasing evidence. This effort supplies infrastructure costs, preserves the commercial route gates, and does not invent those business decisions.

## Evidence at intake

Repository baseline: `b5b4bc551e` on `origin/main`, 2026-09-05. Live issue bodies, child relationships, open PRs, package scripts, runtime seams, and CI were inspected together.

| Item                         | Intake state | Evidence and remaining work                                                                                                                                                           |
| ---------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #1244 scaffold               | Closed       | Client/server diamond, RPC/sync leaf packages, source-first builds, and CI quality tasks exist.                                                                                       |
| #1245–#1248 ADRs             | Closed       | Vite SPA, persistent Hono/Node backend, Postgres plus S3, server-authoritative sync, separate RPC/public API/sync contracts. Hosting must preserve these decisions.                   |
| #1249 tenancy                | Closed       | App and maintenance roles, RLS policies, scoped stores, and conformance tests exist. New tables and workers must preserve the same enforcement.                                       |
| #1561 app shell              | Closed       | Deployment-mode route gates and researcher shell exist; `/setup` remains a placeholder.                                                                                               |
| #1250 self-host distribution | Open         | Dockerfile embeds both deployables, but there are no published Studio images, versioned migrations, production Compose, bootstrap admission, or web/worker role split.                |
| #1251 managed infrastructure | Open         | No managed estate is defined or qualified. Netlify configuration is a branch-preview mechanism. Live provisioning and recovery evidence are required, not just configuration files.   |
| #1252 observability          | Open         | Request IDs reach audit storage but not structured logs/response headers. Liveness exists; readiness, metrics, telemetry, shared dispatch, and researcher alert delivery are missing. |
| #1253 commercial boundary    | Deferred     | Business inputs remain open; no speculative billing columns.                                                                                                                          |

The specifications refer to prerequisite behavior that is not yet in the code. In particular, #1258's PII crypto/key-presence/rotation mechanisms, #1284's registry deployable, and #1305's general email port do not exist. The audit alert table has no production enqueue path. These are tracked as required dependencies rather than assumed shipped functionality.

## Delivery sequence

1. **Versioned migrations and explicit runtime entrypoint (#1250).** Generate migrations from the assembled Drizzle schema; version raw-SQL sidecars, roles, grants, policies, triggers, and fingerprint together. Serialize explicit migration runs. Never migrate automatically at boot. Prove fresh install, repeated invocation, stale-schema refusal, rollback on failure, and preservation across a real schema upgrade.
2. **Shared dispatcher foundation (#1252).** Extract invitation delivery's lease/claim/heartbeat/backoff/drain mechanism. Preserve maintenance-role verification and distinct uncertain outcomes. Audit every existing and planned consumer, convert live dispatchers, and make domain differences explicit. Do not promise exactly-once SMTP delivery across an ambiguous provider acceptance.
3. **Observability and delivery (#1252).** Add bounded, redacted request correlation; liveness/readiness; protected Prometheus metrics; event-loop, pool, WebSocket and queue instrumentation; one PostHog opt-out mechanism and removable exception hooks. Add required enqueue/recipient/channel-delivery seams and researcher in-app/email delivery. Operator signals never use researcher recipients.
4. **Bootstrap and runtime roles (#1250).** Add durable first-instance ownership and name, token-protected one-time bootstrap, invitation-only self-host admission, and read-only diagnostics. Establish the initial owner's team as part of bootstrap. Implement `STUDIO_ROLE=web|worker|both` after the shared dispatcher, preserving one WebSocket-serving replica and documented in-process denial limits.
5. **Required production prerequisites.** Implement the parts of #1258, #1284, #1305, and audit producer wiring needed by these delivery criteria. Review their source issue requirements before edits. Keep registry storage separate, PII keys out of database backups, and notification outcomes durable per recipient/channel.
6. **Self-host artifact and release qualification (#1250).** Publish signed GHCR images and CycloneDX SBOMs with Studio releases. Ship generated environment configuration, Traefik/Postgres/private-MinIO Compose, correct effective Postgres tuning, encrypted-storage requirements, migration/backup/restore/major-upgrade guides, fresh-owner and prior-image upgrade checks, and running-image telemetry-egress verification.
7. **Managed estate and operational qualification (#1251).** Select a US-region managed container/Postgres topology within the authorized total budget, including staging, the registry, independent backups, and a reserve for usage. Define the estate as code; preserve independent client/backend releases and single-origin session/CSRF/WebSocket behavior. Provision and qualify encrypted storage, role grants, effective tuning, PITR, independent encrypted dump recovery, DB-plus-key restore, and release behavior. Do not equate IaC validation with a live acceptance result.
8. **Closeout.** Reconcile every acceptance criterion with merged code, tests, and live evidence. Check current PR heads, review threads, queue results, and `origin/main` ancestry. Update issue state only when its complete criteria are met. Leave deferred billing and any unmet external criterion explicitly open.

## Review and verification

Each implementation runs in an isolated feature worktree with user commit attribution. The orchestrator reviews complete diffs and dependency interactions before delivery. A second agent performs adversarial review; implementation authors address confirmed findings and prove new security/data-preservation assertions can fail. Required types, lint, Knip, schema guards, focused tests, and selected CI/E2E checks must pass before merging.

Database integration suites must use isolated database names/instances or run serially; fixed-name Studio Sync suites can collide across worktrees. Generated schema artifacts are reviewed and regenerated with the migration that owns their change. Rendered changes use the Network Canvas UI skill and visual-baseline policy; unrelated app baselines are not rewritten.

Particular failure cases to review:

- Untrusted request IDs, raw URL paths, exception messages, or metric labels leaking identifiers or secrets.
- Role settings that look correct on `studio_app` but do not apply when the login switches to that role. Verify `SHOW work_mem` through the actual app pool.
- Duplicate external sends after ambiguous acceptance, process death, lease loss, or partial multi-recipient delivery.
- Bootstrap races, invitation bypasses, secret configuration persisted by setup, or setup reappearing after restart.
- Migration sidecars changing privileges or fingerprints without a versioned upgrade path.
- Healthy liveness hiding failed readiness; readiness calls hanging or making external telemetry calls.
- A client-only release restarting the backend, discarding old hashed client assets needed by open editors, multiple WebSocket replicas, schema migrations running on ordinary deploy, or rollback selecting an incompatible image.
- Backups that restore rows without usable keys, share the primary provider's failure domain, or have never been restored.

## Operational decisions and pending qualification

- Proposed migration window: Tuesdays **15:00–16:00 UTC**, announced in advance. This overlaps US and South African working hours and leaves several working days for follow-up. Routine compatible code releases can occur outside this window.
- Operator alert channel: email to an explicitly configured operations recipient; no participant/researcher recipient reuse. Destination ownership and successful routing must be recorded before production qualification.
- Managed logs and metrics: 30 days, with participant identifiers and payloads excluded. Managed residency: one US region; the identical self-host artifact is the alternative for other residency needs.
- Provider PITR target: RPO ≤5 minutes and RTO ≤4 hours, verified by an initial and then quarterly recorded restore drill. Recover the database and usable PII/integration keys together; wrong-key and missing-key controls must refuse startup. Record the independent encrypted logical backup's achieved RPO separately; it does not inherit the provider PITR target.
- Managed key rotation: annual, with the bounded maintenance re-encryption job proved idempotent. The blind-index key remains stable across encryption-key rotations.
- Required runbooks: deploy/rollback, announced migration window, database failover, object-store outage, dispatcher backlog, key rotation, and security incident. The last links to the repository's disclosure policy. Generate the subprocessor inventory from the estate definition and carry the one-US-region statement into the #1260 subprocessor list and HECVAT Lite handoff.
- A cost estimate must cover the whole estate and satisfy the Postgres tuning, PITR, and independent-backup requirements before provisioning. If the $100 limit cannot satisfy those requirements, report the specific conflict instead of weakening them silently.

## Delivery record

No implementation PR has been merged for this execution yet. Record each slice's PR, exact head, tests, adversarial findings, and merge ancestry here as it completes.

Baseline verification: all 54 Studio server test files passed (1,169 tests) against the existing local PostgreSQL and MinIO services. Independent plan review added exact recovery/rotation/runbook criteria and old-client asset retention. Live Netlify inventory confirms the existing `networkcanvas-studio` project already owns `networkcanvas.studio`; preserve its routing until the replacement deployment has passed qualification.
