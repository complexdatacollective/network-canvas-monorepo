# Studio message link-capability prerequisite

## Problem

Issue #1306 requires every scheduled message for a wave to carry that wave's
single live participant link. `interview_links` currently retains only the
SHA-256 token digest. That is enough to redeem a presented capability, but a
later schedule worker cannot reconstruct the URL. Reissuing a link for each
occurrence would invalidate previously distributed links and violate #1297's
one-live-link contract.

## Bounded production design

Store the random 32-byte link secret as an authenticated encryption envelope on
the `interview_links` row alongside its existing digest. The envelope uses the
existing integration-key authority and binds its AAD to the team, link id and
`token_ciphertext` column. The token never appears in a queue column, audit
event, metric or log. Its only durable plaintext representation remains the URL
returned once to the authenticated link-issuance caller; message bodies contain
the URL only inside `message_deliveries.rendered_ciphertext`.

An audited link-issuance command locks the study, wave, participant and existing
live participant link. It requires a managed live or paused study and an
enrolled participant in that same study. A reissue revokes the old row before
inserting the new row, preserving the existing unique live-link index. The
command returns `<team_id>.<base64url-secret>` only after the audit event and
link row commit together. The RPC boundary uses the existing study visibility
middleware and rechecks the caller's current grant inside the command.

A bounded due-occurrence worker uses the shared outbox worker lifecycle. For
each due scheduled occurrence it locks the occurrence, active schedule,
participant and current live link. It refuses anonymous studies, withdrawn
participants, revoked or expired links, opted-out channels and unavailable
contacts. It resolves a published study override before a published team
default, renders the configured message with the study name and the same wave
link plus `?occurrence=<uuid>`, then seals the rendered bytes and inserts the
delivery through the existing audited enqueue path. The occurrence identity is
the durable idempotency key; concurrent workers cannot create two original
deliveries for one occurrence and channel. An occurrence that lacks one of its
required published channel templates moves to the durable `blocked` state and
writes an audit event, so it cannot monopolize the global oldest-due scan.
Every worker pass also expires a bounded page of stale scheduled occurrences
with the existing expiry audit event before resolving new work.

Capability decryption follows the protected-data two-phase pattern: snapshot
the envelope, authorize and audit the read while locking the current live link,
then decrypt. Before enqueue, re-lock and compare the exact link id, digest,
envelope, key and algorithm. A concurrent revocation or reissue therefore
creates no delivery with stale authority. Before provider handoff, the delivery
must still cite that same unrevoked, unexpired link. Reissue suppresses any
unsent delivery citing the revoked link; already handed-off deliveries retain
their factual outcome.

The final handoff runs in its own database transaction and commits before the
network call. It locks the delivery, the schema-scoped participant authority,
the participant, study, schedule, occurrence and link in that order, then reads
withdrawal and channel opt-out state and compares the active lease against the
database clock. Link issuance and provider callback opt-outs use the same
participant lock; a consent trigger makes every grant or withdrawal use it as
well. A writer that commits first is visible to the handoff recheck. A handoff
that commits first has crossed the documented irreversible boundary before a
later cancellation.

## Schema and recovery contract

The parent-sequenced migration after webhook adds nullable
`token_ciphertext bytea`, `token_key_id text`, and `token_algorithm text` to
`interview_links`, plus `interview_link_id uuid` on occurrence-backed
`message_deliveries`. The three envelope columns are all present or all absent;
new issuance always writes all three. Null remains admissible only because an
existing digest-only link cannot be backfilled without its secret. Such a link
continues to redeem when presented but cannot drive scheduled delivery; reissue
replaces it with an encrypted capability. Key identity, link ownership and
delivery/link/occurrence consistency are database constraints. Existing
`token_hash` remains the redemption lookup and is SHA-256 of the canonical
base64url secret text, never of ciphertext. No numbered migration is generated
on this branch.

Recovery inventory counts link envelopes as protected integration data. Key
rotation pages them by immutable link ID, authenticates the old envelope, rewraps
under the current integration key, and conditionally updates the exact old
envelope tuple. Authorization reconciliation revokes live links as it does
today; revoked ciphertext remains recoverable until ordinary retention removes
the link. Serving admission refuses incomplete or unknown-key link envelopes.

## Verification boundary

Real PostgreSQL tests must prove authenticated issue, due occurrence resolution,
encrypted-at-rest rendering and provider-fake delivery end to end; two
occurrences reuse one link; concurrent issuance leaves one live link; a
revocation between secret read and enqueue creates no work; pause, expiry,
withdrawal and opt-out races cannot cross provider handoff; recovery inventory
and rewrap include the new envelope; and logs, audits and observer labels never
contain the token or rendered URL.
