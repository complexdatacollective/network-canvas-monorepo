# @codaco/studio-sync

The Studio sync protocol's core, promoted from the ADR acceptance-gate spike
([#1247](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1247),
[spike findings](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1247#issuecomment-5219652417)).
Per the ADR, the apply engine is a shared, isomorphic workspace package
versioned in lockstep with the `studio.sync.v1` subprotocol.

## Modules (per-subpath imports, no barrel)

- `@codaco/studio-sync/apply` — the shared apply engine both sides run:
  section-document commands (`set`/`unset`/`insertItem`/`removeItem`/`moveItem`),
  canonical key-sorted serialization, and sha256 content/manifest hashing
  (via `@noble/hashes`, so it runs identically in the browser and Node).
- `@codaco/studio-sync/server` — the server half: the lease state machine
  (every transition one atomic conditional statement; epoch fencing), the
  idempotent commit path (client_seq + log unique constraint, per-draft
  serialization via the draft-head row lock), and manifest-hash resume.
- `@codaco/studio-sync/postgres-pool` — the shared Node pool factory:
  preserves URL connection settings, pins and verifies an optional startup
  role, bounds connection waits to 10 seconds and pool capacity to 1–32
  (default 10), and calls the idle-error logger without connection details.
- `@codaco/studio-sync/client` — the client half: optimistic local echo,
  pending queue, suffix rollback on rejection, reconnect with retransmission.
- `@codaco/studio-sync/schema` — the Postgres schema (drafts, immutable
  content-addressed sections, manifests, leases, command log).
- `@codaco/studio-sync/email-sender` — the Node `EmailSender` contract,
  single-recipient/header validation and SMTP adapter.
- `@codaco/studio-sync/postmark-email-sender` — the Postmark adapter for the
  same port, plus its configuration schema. Studio selects it with
  `POSTMARK_SERVER_TOKEN`, optional `POSTMARK_MESSAGE_STREAM` (default
  `outbound`) and `EMAIL_FROM`; setting `SMTP_URL` instead retains SMTP.
  Configuring both transports is refused.

The server/schema/postgres-pool modules depend on `pg`; client code must
import only `./apply` and `./client`.

## Email delivery boundary

Both adapters accept one plain-text message and return an accepted receipt
only when the recipient is confirmed. `EmailReceipt.messageId` is the RFC
`Message-ID` supplied by the caller (or generated for a new send). Callers
retrying a durable delivery must retain that ID. Postmark supports this header
through its [single-email API](https://postmarkapp.com/developer/user-guide/send-email-with-api/send-a-single-email);
the API's separate `MessageID` tracking UUID is validated and discarded. A
stable RFC header is not a provider idempotency guarantee.

Postmark uses the fixed `https://api.postmarkapp.com/email` endpoint with
server-token authentication, disabled open/link tracking, no redirects and no
automatic retries. Each send owns its socket, with a 10-second connection
deadline, a 30-second total deadline, an 8 KiB header limit and a 16 KiB
response-body limit. `close()` cancels in-flight requests and refuses new ones.
Its configuration accepts visible ASCII tokens of at most 256 characters and
stream IDs of at most 30 ASCII letters, digits, underscores or hyphens, starting
with a letter. Provision a transactional stream and a verified sender identity.

The only delivery errors are `EMAIL_DELIVERY_RETRYABLE`,
`EMAIL_DELIVERY_PERMANENT` and `EMAIL_DELIVERY_UNCERTAIN`; they retain no raw
provider response, credential, message content, recipient or cause. HTTP 4xx
responses are permanent rejection except 429 (retryable) and 408 (uncertain).
Postmark's explicit 503/code 100 maintenance rejection is retryable; generic
5xx, 500/code 101, response loss, and malformed or contradictory success
receipts remain uncertain under its documented
[API error semantics](https://postmarkapp.com/developer/api/overview).
Uncertainty is terminal for automatic dispatch: a provider may have accepted
the message, so an operator/researcher must reconcile it before a manual send.
The invitation dispatcher already persists these dispositions; other delivery
consumers must use the same port and retain that distinction.

## Conformance suite

```bash
pnpm --filter @codaco/studio-sync test
```

Pure suites (apply-engine properties, canonicalization) always run. The
DB-backed suites — every specified failure mode: sleep/wake takeover, late
heartbeats, expiry-window writes, duplicate-tab takeover,
disconnect-during-commit, manifest linearity under concurrency, golden
transcripts, and a randomized interleaving property — need a reachable
Postgres and skip with a notice otherwise:

```bash
docker run -d -e POSTGRES_PASSWORD=spike -p 54318:5432 postgres:18
```

(`PGPORT` overrides the port. Each test file creates its own scratch
database as the `postgres` superuser — point it at a disposable instance,
never a real one.)

## Status

Landed ahead of protocol milestones still to come: WebSocket/SSE transport,
presence, undo, and the versioned message schemas. The two open design notes
from the spike (release expires the lease in place; explicit duplicate-tab
takeover as its own transition) are carried here as implemented, pending
team discussion on #1247.
