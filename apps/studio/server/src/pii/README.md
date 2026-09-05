# Studio encryption foundation

This directory implements the cryptographic foundation for
[#1258](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1258).
It is server-internal and is not yet connected to startup, a database, an API,
Better Auth, the dispatcher, or a rotation job. It does **not** complete #1258 or
establish the application's end-to-end PII protection guarantees.

The accepted threat statement for the completed implementation is:

> A database compromise exposes no participant contact details. A full application-server compromise does.

## Keys and stored format

`loadEncryptionKeys(configuration, loadRootKey)` validates the entire keyset
before loading secrets. The injected function returns a 32-byte root for an
opaque reference. `createBase64RootKeyLoader` adapts an environment reader and
requires canonical padded base64; neither module reads `process.env`. A KMS
adapter can replace that loader without changing ciphertext or callers.

A new deployment can reference one root in all three namespaces. Historical
roots remain addressable during rotation. Each namespace independently selects
a current key ID and maps its readable key IDs to root references:

- `pii` selects participant encryption (`pii-enc`).
- `integration` selects credential encryption (`integration-enc`).
- `blindIndex` selects deployment-wide address indexing (`pii-index`).

The root is never used directly for encryption or HMAC. HKDF-SHA256 derives 32
bytes with an empty salt and the UTF-8 JSON info tuple
`["studio-encryption.v1", purpose, keyId, ...scope]`. Participant PII and webhook
credentials use the scope `["team", teamId]`. OAuth accounts belong to users,
so their credential scope is `["account", userId, accountId]`. Blind indexes use
`["deployment"]`. JSON arrays frame the tuples unambiguously, including IDs
containing delimiter characters.

AES-256-GCM uses a fresh random 12-byte nonce and a full 16-byte authentication
tag. Stored values carry `algorithm: "aes-256-gcm.v1"`, the namespace's key ID,
and one `bytea` envelope: `version byte (1) || nonce || ciphertext || tag`.
Participant AAD is the UTF-8 JSON tuple
`[teamId, studyId, participantId, columnName]`. Integration AAD is
`["webhook", teamId, subscriptionId, "secret_ciphertext"]` or
`["oauth", userId, accountId, columnName]`.

This uses the AES-GCM nonce, AAD, and tag approach already tested in
`apps/interviewer/src/lib/vault/crypto.ts`, with the binary envelope specified by
#1258. Studio derives its data keys from deployment roots; it does not need the
browser vault's passphrase/WebAuthn enrollment or AES-KW wrapping of random DEKs.
WebCrypto interoperability tests independently exercise the stored AES-GCM
format, HKDF contexts, and HMAC output. No custom cryptographic algorithms are
implemented here.

Email normalization trims and lowercases a valid address. Phone input must have
an explicit international `+` prefix; whitespace, parentheses, dots, and hyphens
are removed before checking the E.164 digit shape. The module does not infer a
country or verify that a number is allocated or reachable. The blind index is
the complete 32-byte HMAC-SHA256 of the normalized address. Participant and
integration encryption rotation do not change it. Index rotation is a separate
migration across every consumer, including erased participants' opt-outs.

A deployment-scoped index lets an attacker holding the index key test whether
a guessed address exists anywhere on the instance. The key remains on the
server; cross-team suppression requires this scope.

## Read integration contract

`createDataProtection` requires separate injected participant and integration
read boundaries. There is no default boundary or exported raw decrypt
function. The constructor and derived keys belong only inside this server
boundary; they are not an RPC or shared-package API.

The production participant boundary must authorize the exact frozen target,
invoke its one-shot read callback inside the transaction, append the required
audit event, and commit before resolving. Integration reads need the equivalent
credential-specific permission and audit policy. Plaintext is returned only
after the supplied boundary resolves. A failed boundary rejects and zeroes the
decrypted buffer it received; a captured callback cannot decrypt again after
the boundary ends. Input target and ciphertext are copied before asynchronous
authorization to prevent caller mutation from redirecting the approved read.

These are integration hooks, not an implementation of `pii_access`, an audit
store, or a security sandbox. A malicious application caller can construct a
permissive boundary, and code inside an authorized boundary can copy plaintext.
The next slice must own the factory, restrict imports to that audited service,
and test the real authorization/transaction path. Never log plaintext or place
it in errors, job payloads, audit events, or delivery rows. Denied application
reads must project `participant_code` without decrypting and redacting PII.

## Required integration before #1258 can close

1. Wire the environment/KMS seam into every database-enabled web and worker
   startup. Refuse missing roots and unknown stored participant/integration key
   IDs. **ID presence is insufficient:** a wrong root under an existing ID is
   still wrong. Persist non-PII cryptographic verification evidence for each
   required key so startup and restore drills reject same-ID wrong material
   before serving traffic. No startup verification is implemented here.
2. Migrate delivery and opt-out indexes from hex `text` to `bytea`, reconcile
   opt-outs with deployment-wide address suppression, and persist independently
   versioned index/integration key metadata. Preserve participant ciphertext /
   index and algorithm/key CHECK constraints. Complete this before production
   writes, including the integration credential envelope storage migration.
3. Add the real participant write and audited-read service. Encrypt the whole
   sensitive attribute JSON bag, bind every column to its row, and prove exact
   normalized email/phone lookup under RLS as `studio_app`. Verify permissions
   and PII-free masking through RPC, public API, exports, and notifications.
4. Route webhook secret writes/reads and Better Auth OAuth token writes/reads
   through the integration namespace. `account.accessToken`, `refreshToken`,
   and `idToken` are still plaintext in the existing schema. `session.token`
   and password hashes remain under Better Auth's existing lifecycle.
5. Implement idempotent maintenance rotation that reads old IDs and writes the
   current ID while preserving all row metadata constraints. Managed PII and
   integration rotation is annual; self-host cadence is the operator's choice.
   Index rotation requires rebuilding indexes and preserving suppression joins;
   it must never happen implicitly with encryption rotation.
6. Pair database backups with the configuration and all necessary root material
   in operator-controlled backup custody. Retain historical PII and integration
   keys until every dependent PITR/dump backup expires, even after live rows have
   rotated. A retained index key can also require retaining an older root. Test
   a pre-rotation restore, a correct-key restore, a missing-key restore, and a
   same-ID wrong-root restore against real encrypted fixtures. Backups have no
   third-party key escrow. Object-store backup and hash recovery remain an
   additional deployment requirement beyond the database/key pair.
7. Prove participant erasure never decrypts data; database-only dump fixtures
   contain no contact plaintext, webhook secrets, or usable OAuth tokens; and
   actual denied/read/send/error/log paths cannot leak decrypted PII. Verify
   encrypted Postgres volumes and object storage in the deployment and document
   the same requirement for self-hosting.

Key loss has no recovery. It loses encrypted contacts and sensitive attributes,
and encrypted integration credentials must be replaced. It does not lose
`participant_code`, sessions, consent records, or network data. The application
does not encrypt interview-response data under these keys.

## Existing paths accounted for

The whole `apps/` and `packages/` search for AES-GCM, Node cipher calls, and
contact blind-index generation found these deliberately separate paths:

- Interviewer vault and its consumers: browser-owned passphrase/WebAuthn keys
  and existing on-device data; no Studio adoption is appropriate.
- Interview Anonymisation and the protocol-validation test helper: a
  participant-held passphrase feature explicitly outside #1258.
- `db/seed/rng.ts` and its three calls in `db/seed/messaging.ts`: synthetic
  development-only hex indexes using a public constant. They remain in place
  until the schema/seed migration above and must never protect production
  contacts. No production Studio encryption path is being replaced in this
  first foundation slice.

Run the focused suite with
`pnpm --filter @codaco/studio-server test src/pii`. It covers every participant
AAD axis, independent WebCrypto verification, context and purpose separation,
key rotation, malformed envelopes, normalized blind indexes, and the read
boundary's rejection and mutation cases. The test-only permitted boundary is
never a production adapter.
