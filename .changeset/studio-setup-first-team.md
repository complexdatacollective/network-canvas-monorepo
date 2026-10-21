---
'@codaco/studio-api': minor
---

First-run setup on a self-hosted instance now creates the owner's first team,
named after the instance, with the owner as its Owner, so the owner lands in a
team instead of on "No team yet". The team, the owner's membership, the claim on
the instance and the team's "Team created" activity entry are written together:
if any of them fails, setup stays open and can be run again.
