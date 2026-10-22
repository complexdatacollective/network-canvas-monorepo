---
'@codaco/studio-api': minor
---

A self-hosted instance can now be upgraded with `upgrade.sh`, a script that
runs the documented upgrade sequence against the stack: it puts the two new
image digests in `.env`, closes the instance, replaces every API replica, the
worker and `web`, runs `migrate`, waits for every replica to report its schema
ok, and reopens it. When a step fails before `migrate` has changed the
database, or `migrate` refuses, it puts the previous images back and reopens
the instance on them. When a step fails after `migrate` has changed the
database, it leaves the new images in place with maintenance mode on, because
the previous release cannot serve that database. Its exit code and last line
say which of these happened. It takes no backup: take one before running it.
`COMPOSE` names the Compose command when it is not `docker compose`. The
self-host guide's Upgrade page describes it.
