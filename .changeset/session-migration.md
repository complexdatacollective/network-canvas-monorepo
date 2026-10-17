---
'@codaco/protocol-validation': minor
'fresco': minor
'@codaco/interviewer': minor
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

Migration is all or nothing, so no data is ever left half-migrated:

- Fresco migrates every protocol and interview in one transaction when it
  starts after an upgrade. If any interview cannot be migrated, nothing is
  changed and Fresco does not start; the log names each interview that failed,
  with its protocol and the reason, and the previous version can be restored
  on the unchanged data.
- Interviewer migrates each stored protocol together with all its interviews
  when it starts. If any interview cannot be migrated, that protocol and all
  its interviews are kept exactly as they were, and the app tries again each
  time it starts. The protocol's card shows that it is not available, a notice
  says that its interviews are waiting for an update, and its responses stay
  on the data screen.
