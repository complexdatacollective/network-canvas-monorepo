---
'@codaco/protocol-validation': minor
---

Interview sessions are now migrated together with the protocol they were
recorded against. `migrateProtocolWithSessions` returns the migrated protocol
together with a migrator for the sessions recorded against the original. When
a migration step adds, removes or reorders stages, the migrator moves each
session's stage metadata and resume position with their stages, matched by
stage id: a session resumes at the same stage, or at the next one when its
stage was removed, and never at a stage inserted before its own. A step that
changes how a session represents its data declares a session step beside its
protocol transform, and the migrator runs it. Each migrated session is checked
against the current network and stage metadata schemas. A session that cannot
be migrated is reported, never thrown, with a reason; the new
`stages-unmatched` reason covers a step that changes the number of stages of a
protocol whose stages have no unique ids.
