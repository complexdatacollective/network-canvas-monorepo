# Distribution recovery fixture uses Registry reconciliation v3

The populated fixture now constructs four bounded inventory digests from independent fixture facts before seeding or backup. Entry ownership is bound to the actual artifact root produced by the exchange validator. Empty recovery uses the same v3 format. No approval facts are read from the restored database.

Validation: three real PostgreSQL Registry fixture tests pass, including exact user/publisher/entry facts, artifact-root digest sensitivity and transactional rollback on the last insert. Studio server and Registry typechecks, focused lint and Knip pass (two existing configuration hints). Registry integration parent is 5c5e68dbe27a7a30bda265f31f52d87e287d1448; numbered migrations are unchanged by this fixture adaptation.

Full populated Docker recovery qualification remains a separate Linux gate and has not been claimed by these focused checks.
