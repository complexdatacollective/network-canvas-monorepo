# Recovery authorization

Keep the restored target isolated after database, object, schema, and key
verification. Studio runtime and maintenance services and every enrolled writer
login remain closed throughout both authorization commands.

First run the offline `recovery:reconcile-authorization` server command with
separate owner and backup connections in `STUDIO_RECOVERY_DATABASE_URL` and
`STUDIO_RECOVERY_BACKUP_DATABASE_URL`. Supply a private, regular reconciliation
artifact through `STUDIO_RECOVERY_RECONCILIATION_PATH` and its independently
recorded SHA-256 through `STUDIO_RECOVERY_RECONCILIATION_SHA256`.

The strict version 1 artifact has a validity window no longer than 24 hours. It
binds the immutable initial Studio instance tuple and exhaustively inventories
current users, login accounts, teams, memberships, study grants, active
webhooks, active schedules, and published message templates. Credentials and
webhook secrets appear only as exact SHA-256 fingerprints. The command refuses
an absent required identity or authority. Select a sufficiently current
authenticated backup or complete a separately reviewed repair while quarantine
remains in force, then generate and pin fresh evidence before retrying.

One transaction recovery-disables every restored user, deletes sessions and
one-time verifications, cancels pending invitations, revokes personal access
tokens and interview links, expires edit leases, removes stale account links
and grants, disables stale webhooks, pauses stale schedules, retires stale
published message templates, and marks every nonterminal restored delivery
uncertain. Its receipt records the evidence hash and actual destination database
and schema fingerprint. This step cannot admit a user or reopen a service.

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
