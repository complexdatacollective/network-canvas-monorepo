# Registry recovery qualification alignment

The distribution drill now writes strict Registry reconciliation v2 from facts fixed before the backup: user identity, verified mailbox, stable publisher UUID, and complete entry-to-publisher ownership. The empty Compose drill uses the same versioned contract with empty users and entries. Both are typechecked against the Registry contract and exercised through its actual parser.

The actual artifact builder and database seed are extracted into the existing qualification directory so the normal Registry test suite can exercise the exact code the release drill runs. The former seed fails on PostgreSQL with "cannot insert multiple commands into a prepared statement". Eight separate parameterized statements now run in one transaction. A final-insert failure proves earlier identities, credentials and artifact rows roll back; removing BEGIN makes this regression fail.

The former synthetic artifact fails current exchange admission because it declares generic binary media and omits its asset section. The same immutable canary bytes now declare CSV and have their network asset reference. The test checks byte/hash preservation through the actual artifact builder and validator.

Validation: 21 existing distribution boundary tests and 3 actual Registry fixture tests pass; Studio server and Registry types, scoped lint, Knip and diff checks pass. The initial SQL and media failures were reproduced before correction. This is qualification tooling only, so no changeset or rendered baseline change is needed. No numbered migrations changed. A full signed image install/upgrade/recovery release drill remains required; these focused checks do not claim it completed.
