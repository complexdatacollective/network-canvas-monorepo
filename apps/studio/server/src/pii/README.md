# Studio encrypted storage

The server stores participant contacts, names and the complete sensitive
attribute bag as authenticated ciphertext. Better Auth's OAuth access, refresh
and ID tokens and webhook signing secrets use a separate integration key
namespace. This is the storage, authorization and maintenance integration for
[#1258](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1258).
The remaining deployment and product integrations are listed below; this module
alone does not qualify a managed deployment or complete that issue.

The accepted threat statement is:

> A database compromise exposes no participant contact details. A full application-server compromise does.

`participant_code`, consent, sessions and collected network data are outside
this encrypted tier. Researcher login names/emails, Better Auth session tokens
and password hashes retain the authentication system's existing contract.

## Keys and envelopes

`loadEncryptionKeys(configuration, loadRootKey)` validates the complete keyset.
The injected loader returns a 32-byte root for an opaque reference;
`createBase64RootKeyLoader` requires canonical padded base64. A KMS loader can
replace it without changing stored data. A configuration may reference one root
in all three independently versioned namespaces:

- `pii` selects participant encryption, purpose `pii-enc`.
- `integration` selects credential encryption, purpose `integration-enc`.
- `blindIndex` selects deployment-wide address indexing, purpose `pii-index`.

HKDF-SHA256 derives 32 bytes with an empty salt and the UTF-8 JSON info tuple
`["studio-encryption.v1", purpose, keyId, ...scope]`. Participant PII and webhook
credentials use the scope `["team", teamId]`. OAuth accounts belong to users,
so their credential scope is `["account", userId, accountRowId]`. Blind indexes use
`["deployment"]`. JSON arrays frame the tuples unambiguously, including IDs
containing delimiter characters. `accountRowId` is the globally unique
`account.id` primary key, not the provider's external `account.accountId`:
different providers can issue the same external ID to the same user.

AES-256-GCM uses a fresh random 12-byte nonce and a full 16-byte authentication
tag. Stored values carry `algorithm: "aes-256-gcm.v1"`, the namespace's key ID,
and one `bytea` envelope: `version byte (1) || nonce || ciphertext || tag`.
Participant AAD is the UTF-8 JSON tuple
`[teamId, studyId, participantId, columnName]`. Integration AAD is
`["webhook", teamId, subscriptionId, "secret_ciphertext"]` or
`["oauth", userId, accountRowId, columnName]`. UUID-shaped study, participant,
and webhook subscription identifiers are lowercased before both encryption and
the frozen read-boundary context, matching the database spelling of UUIDs
accepted by the API. Team, user, and account row IDs are case-sensitive text
and retain their exact spelling, even when shaped like UUIDs.

`encryptParticipant(target, plaintext, keyId)` requires an explicit selected
PII key. The participant table has one algorithm/key pair for the entire row:
choose `keys.currentId('pii-enc')` once for a new row or full-row replacement,
then use it for every encrypted field and persist that same metadata pair.
Partial updates must retain the stored row key ID. Rotation must re-encrypt all
non-null participant ciphertext fields together and atomically update the
row-wide metadata; writing one field with the new current key would leave the
other fields unreadable. An unavailable selected key refuses the write.

Email addresses are trimmed, lowercased and validated. Phone input must contain
an explicit international `+` prefix; formatting punctuation is removed before
checking the E.164 digit shape. No country is inferred. The blind index is the
full 32-byte HMAC-SHA256 of the normalized address. Its key ID is stored
separately from encryption IDs on participants, delivery records and opt-outs.

Encryption rotation never changes an index. Global suppression queries every
retained index version: an erased address cannot be recovered from its HMAC to
reindex it. Switching the current index is therefore a distinct operation;
old index keys and suppression entries must remain available. A holder of an
index key can test guessed addresses throughout the deployment.

## Startup and backup verification

`initializeEncryption({maintenancePool, configuration, loadRootKey})` is a fatal
boot gate after schema validation and before authentication, workers or traffic.
It verifies the actual `studio_maintenance` database role, checks every stored
key reference, and verifies durable non-PII HMAC proofs of all historical key
material. Merely reusing a configured key ID with the wrong root fails. Startup
never registers a missing proof for an ID already used by ciphertext/indexes.
Unused newly configured IDs receive proofs in the same locked transaction.

The Node entrypoint runs this gate before constructing authentication, starting
workers or accepting traffic. Local development waits for a current schema;
missing or mismatched keys are fatal in every mode. The operator command uses
the same gate with the maintenance pool. The static Netlify function has no
database, authentication or decrypting worker and reads no encryption settings.

Set `STUDIO_ENCRYPTION_KEYSET` to JSON such as:

```json
{
  "roots": [{ "id": "root-2026", "reference": "STUDIO_ENCRYPTION_ROOT_2026" }],
  "pii": {
    "current": "2026",
    "keys": [{ "id": "2026", "rootId": "root-2026" }]
  },
  "integration": {
    "current": "2026",
    "keys": [{ "id": "2026", "rootId": "root-2026" }]
  },
  "blindIndex": {
    "current": "contact-v1",
    "keys": [{ "id": "contact-v1", "rootId": "root-2026" }]
  }
}
```

The named `STUDIO_ENCRYPTION_ROOT_2026` secret must contain a newly generated
32-byte root encoded as canonical base64. Store it in the deployment's secret
facility and independent operator backup custody. Neither the JSON above nor
the repository supplies a production root. Only explicitly referenced
`STUDIO_ENCRYPTION_ROOT_*` variables are read; unrelated environment values are
unavailable to the loader. Never pass roots as command-line arguments.

Proofs are immutable and retained after live rotation. Automatic key retirement
is deliberately unsupported: until a future explicit operator retirement
procedure exists, retain every recorded root, including roots needed only by
historical backups or erased-address suppression. Store backups of the keyset
configuration and all required roots in independent, operator-owned custody.
No third party holds an escrow copy. Retain old PII/integration keys at least
until every dependent PITR/dump backup expires; a retained index can require a
root indefinitely. A database backup without its matching roots cannot restore
contacts or integration credentials. Object-store backups and content-hash
recovery are separate requirements.

The explicit synthetic-data seed registers the same proofs under the actual
maintenance role before writing ciphertext. It restores its owner role before
seeding and preserves the evidence tables during a reseed. Its public keyset
in `development.ts` is selected only with explicit `STUDIO_DEV_DEFAULTS=true`
and a verified local database. All seed/reset entrypoints use the same resolver
and require configured roots for remote targets. The operator encryption
command always requires explicit roots, even when that development flag is set.

## Authorized reads and writes

`participants.ts` rechecks and locks live team membership and the study's
explicit `pii_access` grant. Team ownership alone does not grant PII access.
Whole-record writes encrypt all sensitive fields and store normalized indexes
in one audited transaction. Reads lock and recheck the precise ciphertext and
its identity, decrypt inside the audit transaction, and return plaintext only
after commit. Denied reads record no participant ID, contact or name. Equality
lookup returns only the stable participant handle and checks retained index
versions under the same explicit grant and RLS. It commits a lookup audit with
the contact kind and result count, never the address or blind index.

`auth/encrypted-adapter.ts` is Better Auth's live persistence adapter. It
seals token values before Drizzle sees them, handles nested `includeAccounts`
results, and uses an identity-bound locked read plus immutable credential audit
before returning a token. OAuth has no authoritative team; the separate
`credential_audit_events` log records stable user/account IDs, action, outcome,
request ID and time. Runtime roles may insert but cannot enumerate or mutate
that log. HTTP ownership remains Better Auth's real session/account check,
verified through its token endpoint. Unused bulk secret operations and account
identity reassignment fail closed. The existing Drizzle multi-operation
transaction mode remains disabled; each credential write/read has its own real
SQL transaction and required audit.

`webhooks.ts` permits configuration access only after locking a current team
administrator. A delivery read additionally proves the exact unexpired
maintenance-worker lease and an active subscription. Rotation requires the
actual maintenance database role. Secrets and PII never enter audit payloads,
job payloads or delivery rows.

The internal engine requires explicit audited boundaries and exposes no raw
decrypt function. Its callback is one-shot, revoked after the boundary, and its
buffer is zeroed on audit failure. Inputs are copied before asynchronous
authorization. This is a server boundary, not a sandbox against malicious
application code that already holds roots.

## Migration and maintenance

Migration `0002_pii_encryption` preserves old OAuth plaintext columns solely for
an offline conversion, adds authenticated token columns, decodes delivery and
opt-out hex indexes into identical binary bytes, and merges duplicate team
opt-outs into global suppression using the earliest recorded decision. Legacy
index IDs are explicitly unverified; startup refuses them rather than blessing
an unknown historical key. Existing unversioned databases remain governed by
the migration foundation's export/restore rule and are never silently adopted.

Any legacy OAuth value refuses normal boot. `initializeCredentialMigration`
permits only that legacy condition while retaining all key-proof checks.
`migrateLegacyOAuthBatch` converts at most 100 accounts per call. It locks the
row, seals the old values, clears plaintext and appends the immutable audit in
one transaction; failure preserves the original data. Runtime database triggers
forbid introducing any new legacy plaintext.

`rotateEncryptionBatch` processes at most 100 participant, webhook or OAuth
records per call. A returned cursor binds the selected current encryption IDs
and is safe to persist and replay. Failed records leave earlier committed work
idempotent. Reads are audited before replacement; the final locked comparison
refuses overwriting a concurrent update. Closed studies permit only the actual
maintenance role to rewrite encrypted representation, leaving identity,
handles, scheduling and provenance frozen. Old writers must be stopped before
a rotation is declared complete; a remaining-row scan restarts a pass if an old
replica wrote behind the cursor. No roots or proof evidence are removed.

The built image exposes `encryption verify`, `encryption rotate --limit 100`
and `encryption migrate-legacy --limit 100`. Locally the equivalent is
`pnpm --filter @codaco/studio-server encryption <operation>`; the script loads
only the deployment `.env`, and requires just `DATABASE_URL` and the encryption
settings. It does not require mail, OAuth provider or session-signing settings.

Each operation returns one JSON result. Save a rotation result's `cursor` and
pass its JSON unchanged as `--cursor` on the next invocation. For legacy
conversion, pass a non-null `afterId` as `--after-id`. Repeat until `remaining`
is zero; a null cursor with remaining legacy rows means start another pass.
Failure exits nonzero with a fixed diagnostic and leaves the last returned
cursor safe to replay. Commands never start listeners or background dispatchers.

For an ordinary rotation, first stop old writers, create a new root and new
PII/integration key IDs, retain every historical entry and leave `blindIndex`
unchanged. Deploy the complete keyset to the operator and all replicas, run
verification and bounded rotation, then resume traffic using the new current
IDs. Annual managed rotation and a pre-rotation backup restore belong in the
managed operations schedule. Self-host operators choose their cadence.

`__tests__/restore.test.ts` takes a real `pg_dump` of an isolated schema,
rotates the source to a new root, and restores the old dump into a new database.
It verifies participant/OAuth/webhook recovery, unchanged global suppression,
absence of protected plaintext/root material in the dump, and refusal of
missing historical IDs or wrong roots. It uses the repository's local/CI
`postgres:18` Docker service and its matching PostgreSQL clients. Restored reads
use the production application and maintenance pool constructors. This is
engineering restore evidence using the development superuser. A managed
non-superuser backup needs its own verified backup identity: the schema owner
faces forced RLS, and the runtime maintenance role deliberately cannot read
the global credential audit. Do not broaden runtime grants to bypass that
deployment requirement.

## Integration still required before issue closure

- Provision deployment roots and independent operator backups, configure the
  managed annual rotation schedule, and verify the deployment's backup identity.
- Route future participant RPC/REST, exports and messaging features through
  these stores. They must mask by projecting `participant_code` before any
  decrypt, and use the worker-only global suppression check. This slice adds no
  unrelated participant API or full messaging/webhook dispatcher.
- Repeat the pre-rotation/correct-key/missing-key/wrong-root restore against the
  deployed backup mechanism and run the full object-store restore drill.
  Confirm encrypted provider volumes/storage and log redaction on the
  managed deployment and document those requirements for self-hosting.

Run `pnpm --filter @codaco/studio-server test src/pii` for the engine and real
Postgres integration tests. Deliberate production defects must make the
security assertions fail before those assertions are accepted.
