---
'@codaco/studio-api': minor
---

Codaco's staging instance now deploys each new Studio release on its own with
`auto-update.sh`, run hourly from cron. It finds the newest published `studio@`
release, and when `.env` does not already run its images it checks both are
signed by the release workflow building that release's commit, records a GitHub
deployment, and runs that commit's `upgrade.sh` with its `docker-compose.yml`.
`upgrade.sh` gains `--compose`, which installs a release's compose file with its
images and restores the previous one on rollback. An upgrade that does not
succeed, or a run that dies during one, halts later runs until the operator
removes `.auto-update-halted`. docs/operations/staging-auto-update.md describes
it.
