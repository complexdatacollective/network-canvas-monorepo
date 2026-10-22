---
'@codaco/studio-api': minor
---

A self-hosted instance can now deploy each new Studio release on its own with
`auto-update.sh`, run hourly from cron beside `upgrade.sh`. It finds the newest
published `studio@` release, and when `.env` does not already run its images it
checks both are signed by the release workflow, records a GitHub deployment,
and runs `upgrade.sh`. Any upgrade that does not succeed marks the deployment
failed and halts later runs until the operator removes `.auto-update-halted`.
The self-host guide's Automatic updates page describes it.
