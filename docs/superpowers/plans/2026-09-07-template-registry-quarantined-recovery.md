# Template Registry quarantined recovery

The offline recovery command operates only on an already restored, isolated
Registry database. It never starts the HTTP app, mailer, cleanup worker, or
object-store writer, and it does not create schemas or migrate the restored
target.

Before it changes restored authentication state, the command pins an owner
connection and an independently configured backup LOGIN. It proves the
versioned schema, migration evidence, enrolled runtime roles, exact database
admission, and backup read-only capability on those actual connections. The
restored target must keep serving logins quarantined while this runs.

The command accepts a current operator reconciliation document from outside the
restored database. The document is exhaustive for restored publishers and
operators: it names each publisher's current suspension state and the complete
set of enabled operators. In one owner transaction it rejects missing or extra
identities, invalidates sessions, magic-link verification rows, and personal
access tokens, then applies the current suspension/operator states. It verifies
every retained artifact's immutable content hash and manifest root before the
transaction commits. A mismatch rolls back all invalidation and reconciliation.

Successful completion remains a quarantine proof, not an admission action. The
installer/runtime must separately perform its existing serving-role startup
verification before any HTTP or worker admission. Managed provisioning,
restoration transport, and live reopening remain outside this slice.
