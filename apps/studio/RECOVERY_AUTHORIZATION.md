# Recovery authorization

Keep the restored target isolated after database, object, schema, and key
verification. Studio runtime and maintenance services and every enrolled writer
login remain closed throughout both authorization commands.

First run the offline `recovery:reconcile-authorization` server command with
separate owner and backup connections in `STUDIO_RECOVERY_DATABASE_URL` and
`STUDIO_RECOVERY_BACKUP_DATABASE_URL`. Supply a private, regular reconciliation
artifact through `STUDIO_RECOVERY_RECONCILIATION_PATH` and its independently
recorded SHA-256 through `STUDIO_RECOVERY_RECONCILIATION_SHA256`.

For a production image, keep the restored database under the quarantine
overlay and run the bundled commands through the normal image entrypoint. Put
the command environment in an operator-owned mode-0600 file outside the Studio
checkout. It must contain the two recovery database URLs, the explicit allowed
and administrative login lists, the digest, and this container path:

```dotenv
STUDIO_RECOVERY_DATABASE_URL=postgresql://studio_migrator:...@postgres:5432/studio
STUDIO_RECOVERY_BACKUP_DATABASE_URL=postgresql://studio_backup_login:...@postgres:5432/studio
STUDIO_DATABASE_ALLOWED_LOGINS=["studio_migrator","studio_runtime","studio_maintenance_runtime","studio_backup_login"]
STUDIO_DATABASE_ADMINISTRATIVE_LOGINS=["studio_migrator"]
STUDIO_RECOVERY_RECONCILIATION_PATH=/recovery-evidence/reconciliation.json
STUDIO_RECOVERY_RECONCILIATION_SHA256=<independently-recorded-lowercase-sha256>
```

Keep both recovery commands inside this fail-closing operator wrapper. It
closes every Studio writer login, drains its sessions, and stops the private
web and worker processes before the command and again on success, failure, or
a signal. A closure failure makes the whole invocation fail.

```sh
# BEGIN RECOVERY_AUTHORIZATION_GUARD
close_recovery_admission() {
  close_failed=0
  if ! docker compose exec -T postgres psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c 'BEGIN; ALTER ROLE studio_runtime NOLOGIN; ALTER ROLE studio_maintenance_runtime NOLOGIN; ALTER ROLE studio_migrator NOLOGIN; COMMIT;' >/dev/null
  then close_failed=1
  fi
  if ! docker compose exec -T postgres psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "SELECT pg_catalog.pg_terminate_backend(activity.pid, 5000) FROM pg_catalog.pg_stat_activity activity JOIN pg_catalog.pg_roles login ON login.oid = activity.usesysid WHERE login.rolname = ANY(ARRAY['studio_runtime','studio_maintenance_runtime','studio_migrator']) AND activity.pid <> pg_catalog.pg_backend_pid();" >/dev/null
  then close_failed=1
  fi
  if ! docker compose exec -T postgres psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "DO \$\$ BEGIN IF EXISTS (SELECT 1 FROM pg_catalog.pg_stat_activity activity JOIN pg_catalog.pg_roles login ON login.oid = activity.usesysid WHERE login.rolname = ANY(ARRAY['studio_runtime','studio_maintenance_runtime','studio_migrator'])) THEN RAISE EXCEPTION 'Studio writer session survived recovery quarantine'; END IF; END \$\$;" >/dev/null
  then close_failed=1
  fi
  docker compose stop studio worker >/dev/null 2>&1 || close_failed=1
  return "$close_failed"
}
run_closed_recovery_command() (
  set -eu
  cleanup_recovery_command() {
    command_exit=$?
    trap - EXIT HUP INT TERM
    if ! close_recovery_admission; then command_exit=1; fi
    exit "$command_exit"
  }
  trap cleanup_recovery_command EXIT
  trap 'exit 1' HUP INT TERM
  close_recovery_admission
  # The recovery command uses the owner connection. Open only that operator;
  # runtime and maintenance remain NOLOGIN and the backup identity stays
  # read-only. The cleanup trap closes the operator again.
  docker compose exec -T postgres psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c 'ALTER ROLE studio_migrator LOGIN;' >/dev/null
  "$@"
  close_recovery_admission
  trap - EXIT HUP INT TERM
)
# END RECOVERY_AUTHORIZATION_GUARD
```

Mount the private evidence directory read-only. From `apps/studio`, with the
quarantined PostgreSQL service already running, invoke the exact image digest
recorded by `STUDIO_IMAGE`. The directory and artifact may remain operator
owned and mode `0700`/`0600`: map the one-shot container process to the host
operator UID and GID rather than weakening those permissions.

The restore script writes the verified image overlay to
`deployment/recovery-images.yml`. Keep any caller-supplied `COMPOSE_FILE` while
adding that overlay and the quarantine layer; an explicit `-f` list would
replace `COMPOSE_FILE` and could silently select mutable image tags.

```sh
RECOVERY_ENV=/absolute/private/recovery-command.env
RECOVERY_EVIDENCE_DIR=/absolute/private/recovery-evidence
# BEGIN RECOVERY_COMPOSE_OVERLAYS
RECOVERY_COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
case ":$RECOVERY_COMPOSE_FILE:" in
  *":deployment/recovery-images.yml:"*) ;;
  *) RECOVERY_COMPOSE_FILE="$RECOVERY_COMPOSE_FILE:deployment/recovery-images.yml" ;;
esac
case ":$RECOVERY_COMPOSE_FILE:" in
  *":deployment/quarantine.yml:"*) ;;
  *) RECOVERY_COMPOSE_FILE="$RECOVERY_COMPOSE_FILE:deployment/quarantine.yml" ;;
esac
export COMPOSE_FILE="$RECOVERY_COMPOSE_FILE"
# END RECOVERY_COMPOSE_OVERLAYS
run_closed_recovery_command docker compose \
  run --user "$(id -u):$(id -g)" \
  --rm --no-deps --env-from-file "$RECOVERY_ENV" \
  -v "$RECOVERY_EVIDENCE_DIR:/recovery-evidence:ro" \
  studio recovery:reconcile-authorization \
  > "$RECOVERY_EVIDENCE_DIR/reconciliation-receipt.json"
```

The receipt is the command's only stdout record; bounded operational
diagnostics remain on stderr. Preserve the receipt before continuing.

The strict version 1 artifact has a validity window no longer than 24 hours. It
binds the immutable initial Studio instance tuple and exhaustively inventories
current users, login accounts, teams, memberships, study grants, active
webhooks, active schedules, and published message templates. Credentials and
webhook secrets appear only as exact SHA-256 fingerprints. The command refuses
an absent required identity or authority. `activeScheduleIds` records the
active schedule inventory only; it does not authorize recurrence, channels,
participant time zones, settings, or pending occurrences to resume. Recovery
pauses every restored schedule and cancels every still-`scheduled` occurrence,
including schedules present in the artifact. Select a sufficiently current
authenticated backup or complete a separately reviewed repair while quarantine
remains in force, then generate and pin fresh evidence before retrying.

One transaction recovery-disables every restored user, deletes sessions and
one-time verifications, cancels pending invitations, revokes personal access
tokens and interview links, expires edit leases, removes stale account links
and grants, disables stale webhooks, pauses every restored schedule, cancels
pending schedule occurrences, retires stale published message templates, and
marks every nonterminal restored delivery uncertain. Its receipt records the
evidence hash and actual destination database and schema fingerprint. This step
cannot admit a user or reopen a service.

After retaining that receipt, create a new canonical version 1 artifact from the
independently controlled current authority source. `eligibleUserIds` is the
explicit subset of inventoried users allowed to authenticate after recovery.
Historical users and teams may remain for retained study and audit data, while
users outside that list remain recovery-disabled and stale account, membership,
grant, and integration authority remains removed.

Sign the artifact's exact bytes with the independently held Ed25519 recovery
authority key. Run `recovery:authorize-current` with the same database
connections, artifact, and digest plus:

- `STUDIO_RECOVERY_AUTHORITY_KEY_ID`
- `STUDIO_RECOVERY_AUTHORITY_PUBLIC_KEY`
- `STUDIO_RECOVERY_RECONCILIATION_SIGNATURE`

Add those three values to the same private command environment file, replace
`reconciliation.json` with the newly signed current-authority artifact, update
its independently recorded digest, and run the second bundled entrypoint:

```sh
run_closed_recovery_command docker compose \
  run --user "$(id -u):$(id -g)" \
  --rm --no-deps --env-from-file "$RECOVERY_ENV" \
  -v "$RECOVERY_EVIDENCE_DIR:/recovery-evidence:ro" \
  studio recovery:authorize-current \
  > "$RECOVERY_EVIDENCE_DIR/current-authorization-receipt.json"
```

Signature verification happens before any database connection. The transaction
then requires the exact current inventory, prior credential and delivery
invalidation, matching instance identity, closed enrolled writers, no other
client sessions or prepared transactions on the restored target, and a current
owner/backup view of the same database. It enables only signed eligible users.
It never creates missing authority, overwrites a secret, deletes historical
users or teams, changes a database role, starts a worker, or opens HTTP.

Preserve both receipts with the recovery record. The second receipt includes the
evidence and public-key hashes, key identifier, validity interval, instance
tuple, eligible users, and destination database/schema identity. The configured
public key is independent only while its operator custody remains trustworthy;
the signature does not protect against replacement of both the artifact and the
trust anchor, and neither receipt is a production-readiness or reopening proof.

Once the separate reopening decision and authenticated team-administrator smoke
have succeeded, explicitly review recurrence, channels, participant time
zones, settings, and the cancelled occurrence plan, then create fresh current
schedule evidence and re-enable schedules through the normal operator path.
Also explicitly configure new restored-activity alert recipients and delivery
channels. Recovery removes the restored recipient and channel settings because
they are absent from signed authorization evidence. Historical delivery
receipts remain retained but uncertain; do not treat them as proof that an old
destination is currently authorized or reachable.

## Offline evidence format and tooling (version 1)

The release image includes `recovery:evidence`. It neither loads Studio's
configuration nor connects to a database or network. Run it on the independent
authority workstation, using the retained image digest and `--network none`.
Keep that workstation's inventories and signing key under custody separate
from the database backups. Never reconstruct current authority by exporting
only the restored database: that would authenticate the stale state itself.

The command accepts these exact argument lists:

```text
recovery:evidence schema
recovery:evidence prepare INPUT_JSON CANONICAL_OUTPUT
recovery:evidence sign CANONICAL_INPUT EXPECTED_SHA256 PRIVATE_KEY_PEM KEY_ID SIGNATURE_OUTPUT
recovery:evidence verify CANONICAL_INPUT SIGNATURE_INPUT TRUSTED_KEY_ID TRUSTED_PUBLIC_KEY
```

`schema` prints the complete version 1 JSON Schema derived from the same strict
runtime validator. `prepare` also enforces the cross-record rules below,
canonicalizes an independently assembled JSON inventory, writes mode-0600
bytes without a trailing newline, and prints its lowercase SHA-256. Ordinary
input whitespace and member order are accepted; duplicate members, invalid
UTF-8, NULs, lone surrogates, unknown fields, and excessive nesting are refused.
`sign` accepts an unencrypted PKCS#8 PEM Ed25519 private key, checks the pinned
digest and canonical form, then writes a versioned JSON signature receipt.
`verify` requires the independently retained public key and key identifier;
it does not trust those fields merely because they appear in the receipt.
All three commands reject future-issued and expired evidence. Recovery checks
freshness again in its authorization transaction.

Every input must be a nonempty private regular file (no group/other permission
bits), at most 64 MiB; symlinks are refused. Outputs must not exist and are
created with mode 0600. Keep the parent directory mode 0700. A failed write can
leave an incomplete private output; remove it after inspection before retrying.
Only receipts/digests or the schema appear on stdout. Failure reports a bounded
code on stderr, never inventory content, credentials, paths, or key bytes.

For example, with independently prepared `current-authority.json` and an
already enrolled authority key in the private directory:

```sh
# Run on the independent authority workstation, not the restored server.
RECOVERY_EVIDENCE_DIR=/absolute/private/recovery-evidence
recovery_evidence() {
  docker run --rm --network none --user "$(id -u):$(id -g)" \
    -v "$RECOVERY_EVIDENCE_DIR:/evidence" \
    "$STUDIO_IMAGE" recovery:evidence "$@"
}
recovery_evidence schema > "$RECOVERY_EVIDENCE_DIR/authorization-v1.schema.json"
recovery_evidence prepare /evidence/current-authority.json /evidence/reconciliation.json
# Independently record and transfer the printed digest. Use its exact value here.
recovery_evidence sign /evidence/reconciliation.json "$EXPECTED_SHA256" \
  /evidence/recovery-authority.pem "$TRUSTED_KEY_ID" /evidence/signature.json
recovery_evidence verify /evidence/reconciliation.json /evidence/signature.json \
  "$TRUSTED_KEY_ID" "$TRUSTED_PUBLIC_KEY"
```

The independently enrolled public key is the raw 32-byte Ed25519 public key,
encoded as unpadded canonical base64url (43 characters), not PEM or the whole
SPKI envelope. The key identifier is 1–64 characters matching
`[A-Za-z0-9][A-Za-z0-9._:-]*`. The signature is Ed25519 over the exact canonical
artifact bytes, with no prehash or domain prefix; encode its 64 bytes as
unpadded canonical base64url (86 characters). The signature receipt contains
exactly `format: "studio-recovery-authorization-signature"`, `version: 1`,
`sha256`, `authorityKeyId`, `authorityPublicKey`, and `signature`. Map its digest
and signature to `STUDIO_RECOVERY_RECONCILIATION_SHA256` and
`STUDIO_RECOVERY_RECONCILIATION_SIGNATURE`. Configure the two authority values
from independent custody, matching the receipt; do not enroll a replacement
trust anchor from a recovery receipt. Transfer only the artifact, receipt, and
public trust anchor to the restored host. Retain the private key independently.

### Complete inventory shape

All properties shown below are required, including empty arrays and explicit
nulls. This illustrative inventory is structurally complete; replace its
identities and dates using the independent current authority inventory. Empty
inventories authorize nothing in those categories. To represent accounts,
grants, webhooks, or templates, use the field definitions immediately below.

```json
{
  "format": "studio-recovery-authorization-reconciliation",
  "version": 1,
  "issuedAt": "2026-09-13T11:00:00Z",
  "expiresAt": "2026-09-13T13:00:00Z",
  "instance": {
    "name": "Studio",
    "initialOwnerUserId": "owner",
    "initialTeamId": "team",
    "completedAt": "2026-09-01T00:00:00Z"
  },
  "users": [{ "id": "owner", "email": "owner@example.com", "emailVerified": true }],
  "eligibleUserIds": ["owner"],
  "accounts": [],
  "teams": [{ "id": "team", "slug": "team" }],
  "memberships": [{ "id": "membership", "teamId": "team", "userId": "owner", "roles": ["owner"] }],
  "studyGrants": [],
  "activeWebhookSubscriptions": [],
  "activeScheduleIds": [],
  "publishedMessageTemplateIds": []
}
```

- `accounts` entries contain `id`, `userId`, `issuer`, `accountId`, `providerId`,
  and `credentialSha256` (64 lowercase hexadecimal characters).
- `studyGrants` entries contain UUID `id`, `teamId`, UUID `studyId`, `userId`,
  `role` (`manager`, `protocol_designer`, `coordinator`, or `data_viewer`), and
  boolean `piiAccess`.
- `activeWebhookSubscriptions` entries contain UUID `id`, `teamId`, and
  `configurationSha256` (64 lowercase hexadecimal characters).
- `activeScheduleIds` and `publishedMessageTemplateIds` contain UUID strings.
- Other identifiers are nonempty strings of at most 255 UTF-16 code units;
  `instance.name` is 1–120, email is a valid address at most 320. The initial
  owner/team identifiers may be null or refer to retained historical identities.
- Every array has at most 250,000 items; `eligibleUserIds` is nonempty.
  Membership roles are a unique subset of `owner`, `admin`, `member`, length 1–3.
- All record IDs are unique within their inventory. Emails are unique after
  trimming and lowercasing; team slugs, eligible IDs, schedule/template IDs,
  `(issuer, accountId)`, `(teamId, userId)` memberships, and `(studyId, userId)`
  grants must also be unique.
- Accounts and eligible IDs refer to inventoried users. Memberships and grants
  refer to inventoried teams/users, and webhooks to inventoried teams.
  The artifact's dates use ISO 8601 with an explicit offset; expiry must follow
  issue time by no more than 24 hours. Nested containers are limited to 64.

Canonical serialization recursively sorts object keys by ECMAScript UTF-16
lexicographic order, preserves array order, and uses ECMAScript `JSON.stringify`
for strings, booleans, numbers and null. There are no spaces, BOM, or trailing
newline. Encode as UTF-8 and SHA-256 those exact bytes. Preparation uses the
shared Studio canonicalizer; do not substitute a serializer that sorts arrays,
normalizes Unicode or dates, escapes non-ASCII differently, or adds a newline.

### Credential and webhook fingerprint preimages

These fingerprints bind existing durable credential/configuration bytes; they
do not decrypt or rotate them. Assemble their inputs from the independent
current-authority source, including its encrypted token/secret bytes and key
metadata. Plaintext passwords and decrypted tokens are never fingerprint inputs.
`password` below is the stored password hash. Do not publish these preimages.

For `credentialSha256`, SHA-256 the UTF-8 bytes of `JSON.stringify` of the
following object, **in this insertion order**, without a newline. This preimage
uses insertion order rather than the inventory's recursive key sorting:

```javascript
{
  password: row.password,
  access: row.access_token?.toString('base64') ?? null,
  accessKeyId: row.access_key_id,
  accessAlgorithm: row.access_algorithm,
  accessExpiresAt: row.access_expires_at?.toISOString() ?? null,
  refresh: row.refresh_token?.toString('base64') ?? null,
  refreshKeyId: row.refresh_key_id,
  refreshAlgorithm: row.refresh_algorithm,
  refreshExpiresAt: row.refresh_expires_at?.toISOString() ?? null,
  id: row.id_token?.toString('base64') ?? null,
  idKeyId: row.id_key_id,
  idAlgorithm: row.id_algorithm,
  scope: row.scope
}
```

For `configurationSha256`, use the same digest/encoding procedure on this
object, **in this insertion order**:

```javascript
{
  studyId: row.study_id,
  url: row.url,
  description: row.description,
  eventTypes: row.event_types,
  secret: row.secret_ciphertext.toString('base64'),
  secretKeyId: row.secret_key_id,
  secretAlgorithm: row.secret_algorithm
}
```

Use standard padded base64 for the binary fields in these preimages, not
base64url. Missing nullable database values are JSON null, never omitted or
undefined. Convert expiry timestamps to UTC `Date.toISOString()` including
milliseconds; preserve URL, description, scope, ciphertext and event-type
array order exactly. Return the digest in lowercase hex. Account IDs,
user/provider/issuer bindings and webhook IDs/team bindings live in the outer
inventory and are compared separately. Fingerprints do not replace those
identity comparisons.
