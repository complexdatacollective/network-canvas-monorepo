---
'@codaco/studio-server': minor
'@codaco/studio-rpc': minor
---

Add `study.shell`, the one read the study routes need before they can render:
the study, the team that owns it, the caller's effective permissions, that
team's other studies for the switcher, and the counts the sidebar shows.

Its input names a study and no team, because a researcher opening a link to a
study has no team to send. The server resolves the tenant from the caller's own
memberships — ids only, the one read allowed before a tenant is pinned — and
probes each of their teams for the study, the session's active team first so the
common case is a single probe. Every field in the response is read after the
pin, inside one transaction.

A study that does not exist and a study in someone else's team are refused
identically, and by construction rather than by a matching pair of branches:
the search space is exactly the caller's own teams, so there is no state in
which the two can be told apart.
