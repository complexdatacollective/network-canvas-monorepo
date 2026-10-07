---
'@codaco/studio-api': minor
'@codaco/studio-sync': minor
---

Studio can run more than one API container. Any replica serves any request, so
no sticky sessions are needed, and an editor whose connection ends on one
replica picks up on another where they left off.

Until now an editor's locks, the list of who was connected, and the files and
API keys added to a stage but not yet saved all lived inside the one API
process that received them, so a second replica could not see them and a
restart lost them. Locks and connections are now rows in the database. A
staged file is held in the object store under `staging/`, and a staged API key
in the database, sealed under the keyring. An author keeps the section they
are editing through a rolling deploy or the loss of a replica, as long as they
reconnect within the 30-second lease, and whichever replica they reach next
can save the stage. When an editor's connection closes, their locks are given
up only after a 20-second grace, and only if they have not reconnected to any
replica by then.

Live updates reach editors on every replica. A replica that commits a change
rings a doorbell on the Valkey channel `studio:protocol-events`, and the
others read the new state from the database. Every replica also checks every
five seconds, so Valkey stays optional: without it, or while it is down,
updates between replicas arrive at that poll instead of at once, and none are
lost. `/readyz` gains a `doorbell` check, `degraded` (still 200) when Valkey is
configured but the replica is not subscribed, and answers 503 with `draining`
while a replica shuts down. The compose stack's Traefik now reads its API
server list from its own config and checks each replica's `/healthz`.

To run a second replica, add it to the compose stack and to Traefik's server
list, then recreate Traefik, as `docs/self-host/run.md` describes. The stack
runs one API unless you do. Transaction-mode connection pooling (PgBouncer in
transaction mode, Hyperdrive) is still not supported for the API and worker.

**Action needed when upgrading:**

- The object-store access key, or on Azure the managed identity, must now be
  able to delete and list as well as read and write, and the worker uses it
  too, to clear away staged files nobody saved. On S3, add `s3:DeleteObject`,
  and `s3:ListBucket` if the policy lacks it. On Azure, Storage Blob Data
  Contributor already includes both.
- If your bucket keeps object versions, add a lifecycle rule that expires
  noncurrent versions under `staging/`. A delete on a versioned bucket only
  hides the object, so without the rule every staged file stays as an old
  version.
- An instance with no object store can no longer stage a file: adding one to a
  stage is refused, while staging an API key still works. Before this release
  such a file could be staged but never saved, so nothing an author could
  finish before is lost.

The upgrade and requirements guides say where to make each change.

For `@codaco/studio-sync`: `renewHeld` now takes a list of owners rather than
one, renews all their leases in a single statement, and returns each renewed
lease's owner.
