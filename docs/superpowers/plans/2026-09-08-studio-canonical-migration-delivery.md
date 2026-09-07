# Studio canonical migration delivery

PR #1718 integrates encrypted private data, first-owner setup, runtime roles,
read-only backups and audit-alert delivery with the canonical migration sequence
through `0007_legacy_index_remediation_guard`. This is a repository delivery
checkpoint for #1243, not a managed deployment or disaster-recovery qualification.

The canonical composition `c0577bd2f4b3df699669d03e64385e0d07f77d9b` contains
PII readiness/remediation `e15be348d3908db14a1797f498cccd2af9a09b73` and the final
audit migration sequence. The current-main merge `e66be8bf13abf2be23892e7af52323049656c05f`
adds the already merged experiment clock-fixture correction. All migration files
remain byte-identical to that canonical composition. Migrations 0004–0006 were
finalized together before mainline delivery; their earlier unpublished draft
forms must not be shipped as independent intermediate releases. Migration 0007
must accompany the legacy remediation contract so runtime writers cannot forge
the reserved classified identifier that readiness accepts.

Final integration reproduced a backup-command failure with the intended writer
logins set to NOLOGIN. The command now uses the existing shared backup verifier
and performs complete schema/enrollment checks on its same bounded read-only
connection. Only this operator path accepts closed enrolled logins; ordinary
runtime admission retains the strict default. Closed logins still undergo all
capability checks. The Compose operator service receives the complete explicit
enrollment. No migration-engine security module or artifact module was deleted
as part of this correction.

Verification on Node 24.18.0:

- Studio server: 1,891 tests passed on isolated PostgreSQL 18 with prepared
  transactions enabled; one intentional performance-test skip.
- Studio client: 365 tests passed; client and server production builds passed.
- Studio sync: 459 tests passed on a separate PostgreSQL 18.4 fixture, including
  real large-object, parameter, catalog, read-only and transaction guard tests.
- Client/server/sync types, Knip, targeted lint, formatting, changeset-lane and
  generated schema-document checks passed.
- Earlier independent canonical-migration checks passed 62 tests, including
  fresh installation, upgrade from 0006, reserved-ID write refusal and owner
  remediation. The complete final server run includes these checks again.
- The closed-login backup control demonstrates an actual forbidden direct write
  before confirming that the operator command rejects it, then confirms recovery
  after the grant is revoked. Read-only and large-object controls verify effective
  privileges, not merely declared role flags.

Live browser review used the production client/server builds with a separate
freshly migrated PostgreSQL database, distinct restricted runtime logins,
synthetic owner credentials, no mail transport and telemetry disabled. Chromium
confirmed invalid-token refusal, successful owner creation and password sign-in,
permanent setup closure, persisted in-app alert preferences after reload and
disabled email preferences when delivery is unavailable. Desktop (1440px) and
mobile (390px) screens were inspected; the mobile page had no horizontal overflow
and the browser reported no uncaught page errors. No real email was sent.

Review of the operator instructions also corrected the pre-OAuth continuation
step: a legacy batch can return `passComplete: false` with a null `afterId` while
participant conversion or contact-index classification remains. The documented
loop now repeats without `--after-id` until those phases reach OAuth traversal.

Visual classification conservatively selected all three existing PNG suites.
Inspection dismissed those candidates: the global matches are Studio-only
deployment/configuration/ERD files and Knip entry declarations; shared-package
changes are PostgreSQL schemas, policies and server guards. There is no lockfile
diff against main and no changed rendered dependency in Architect, Interview or
Interviewer. Studio setup and alert-settings component tests and the live local
screen review pass separately from those three products' PNG baselines.

Current-head external review and required CI still gate the PR merge. KMS,
Registry, final installer/recovery activation, immutable artifact publication,
managed infrastructure, provider-account-loss recovery and live operator alert
delivery remain separate unfinished work. The old release-callers worktree's
shared migration-wrapper conflict remains pending its specific approval.
