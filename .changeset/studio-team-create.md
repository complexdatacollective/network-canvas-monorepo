---
'@codaco/studio-api': minor
'@codaco/studio-web': minor
'@codaco/studio-contract': minor
'@codaco/studio-sync': minor
---

Researchers can create a team. "Create a team" in the header's team switcher
asks for a name, makes the researcher the new team's owner and opens it. On the
managed service any signed-in researcher can create a team; on a self-hosted
instance only the instance's owner can, and the entry is not shown to anyone
else. Creating a team is recorded in the team's activity log as "Team created",
counted as a `team_created` usage event, and limited to five per researcher per
hour (`team_create`).
