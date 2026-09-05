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
secrets use `["team", teamId]`; OAuth uses `["account", userId, accountId]`;
indexes use `["deployment"]`. The root itself is never an encryption/HMAC key.

AES-256-GCM uses a fresh random 12-byte nonce and a full 16-byte authentication
tag. A stored value has an algorithm (`aes-256-gcm.v1`), a namespace key ID and
one `bytea` envelope: `version byte (1) || nonce || ciphertext || tag`.
Participant AAD is `[teamId, studyId, participantId, columnName]`. Integration
AAD is `["webhook", teamId, subscriptionId, "secret_ciphertext"]` or
`["oauth", userId, accountId, columnName]`, encoded as UTF-8 JSON tuples.
Independent WebCrypto tests verify this format and derivation. The implementation
uses Node crypto and the existing Interviewer vault's authenticated-encryption
conventions; it introduces no custom cryptographic algorithms.

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
in `development.ts` is only for local synthetic fixtures; production startup
must never select it as a missing-secret fallback.

## Authorized reads and writes

`participants.ts` rechecks and locks live team membership and the study's
explicit `pii_access` grant. Team ownership alone does not grant PII access.
Whole-record writes encrypt all sensitive fields and store normalized indexes
in one audited transaction. Reads lock and recheck the precise ciphertext and
its identity, decrypt inside the audit transaction, and return plaintext only
after commit. Denied reads record no participant ID, contact or name. Equality
lookup returns only the stable participant handle and checks retained index
versions under the same explicit grant and RLS.

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

## Integration still required before issue closure

- Connect the agreed environment root loader and fatal key gate in every web
  and worker entrypoint; pass verified keys to the auth and maintenance services.
  The current storage slice supplies these functions, not deployment secrets.
- Expose the bounded maintenance operations in the operator command/image and
  record the managed annual rotation schedule. Self-host cadence remains the
  operator's choice.
- Route future participant RPC/REST, exports and messaging features through
  these stores. They must mask by projecting `participant_code` before any
  decrypt, and use the worker-only global suppression check. This slice adds no
  unrelated participant API or full messaging/webhook dispatcher.
- Run actual pre-rotation/correct-key/missing-key/wrong-root backup restores,
  database-only dump inspection, and the full deployment's object-store restore
  drill. Confirm encrypted provider volumes/storage and log redaction on the
  managed deployment and document those requirements for self-hosting.

Run `pnpm --filter @codaco/studio-server test src/pii` for the engine and real
Postgres integration tests. Deliberate production defects must make the
security assertions fail before those assertions are accepted.
