---
'@codaco/protocol-validation': minor
'fresco': minor
'@codaco/interviewer': minor
---

Interview sessions are now migrated together with the protocol they were
recorded against. A schema migration step can declare how sessions change
across it, beside its protocol transform, and `migrateProtocolWithSessions`
returns the migrated protocol together with a migrator for the sessions
recorded against the original. The migrator moves each session's stage
metadata and resume position to where the migration put their stages, rewrites
any data the migration changes, and checks the result against the current
network and stage metadata schemas. It returns a failure for a session it
cannot migrate instead of throwing, so one damaged session does not stop the
rest.

Fresco migrates every interview of a protocol in the same transaction when it
migrates the protocol on deploy, and Interviewer does the same for its stored
sessions when it migrates stored protocols at launch. An interview that cannot
be migrated is left as it was, and the reason is logged.
