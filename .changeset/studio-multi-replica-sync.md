---
'@codaco/studio-api': minor
---

Studio can run more than one API container. Any replica serves any request, so
no sticky sessions are needed, and an editor's connection can end on one replica
and resume on another.

Until now an editor's locks, the list of who was connected, and a protocol file
imported but not yet saved all lived inside the one API process that had
received them, so a second replica could not see them and a deploy discarded
them. Locks and connections are now recorded in the database, and imports are
held in the object store under `staging/`, with any API keys inside them sealed
under the keyring. An author keeps the section they are editing across a rolling
deploy or the loss of a replica, and a staged import is finished by whichever
replica the author reaches next.

Live updates reach editors on every replica. A replica that commits a change
rings a doorbell over Valkey, and the others read the new state from the
database; each also checks every five seconds, so a Valkey outage slows updates
down and loses none. `/readyz` now answers 503 with `draining` while a replica
shuts down, and the compose stack's Traefik checks each API replica's `/healthz`.

To run a second replica, add it to the compose stack and to Traefik's server
list as `docs/self-host/run.md` describes; the stack runs one API unless you do.

Action needed when upgrading: the object-store access key, or on Azure the
managed identity, must now be able to delete and list as well as read and write.
On S3 that is `s3:DeleteObject` and `s3:ListBucket` beside the permissions it
already has; on Azure, Storage Blob Data Contributor already includes both. The
worker needs the same access as the API, because it clears abandoned imports.
The upgrade and requirements guides say where to make the change.
