---
'@codaco/studio-api': minor
---

The reference stack now runs Garage 2.4.1, and Garage sets itself up. On every
start it applies its single-node layout, imports the `S3_*` access key and
creates the bucket, so the `garage-init` one-shot is gone, along with Garage's
admin API and the `GARAGE_ADMIN_TOKEN` variable it needed. Garage now has a
health check, and `api`, `worker` and `migrate` wait for it to pass. An access
key no longer has to use Garage's own `GK…` format: any ID of at least eight
letters, digits, `-`, `_` or `.`, with a secret of at least 16 characters,
works.

Upgrading keeps the existing Garage volume as it is. You can delete
`GARAGE_ADMIN_TOKEN` from `.env`, and `docker compose up -d --remove-orphans`
removes the stopped `garage-init` container earlier runs left behind. If
`S3_SECRET_ACCESS_KEY` has changed since the key was first imported, Garage
now refuses to start and names the key. Before, it kept the old secret without
saying so.
