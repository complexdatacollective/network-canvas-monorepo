---
'@codaco/studio-api': minor
'@codaco/studio-web': minor
'@codaco/studio-contract': minor
'@codaco/studio-sync': minor
---

Studio can now be upgraded without losing data. Every release carries its
schema as numbered migrations, and `migrate` applies the ones a database has
not recorded yet, all in one transaction: on a new database it creates the
schema, on a current one it changes nothing, and on an older one it brings it
forward. It refuses, and changes nothing, a database a newer Studio has
migrated, one whose recorded migrations differ from the release's, or one with
Studio's tables and no migration history, and says what to do in each case.

An upgrade is one sequence of Docker commands, documented in the self-host
guide's upgrade page, for every release whether or not it changes the schema:

```bash
docker compose run --rm --no-deps api maintenance on
# take your backup now
docker compose pull
docker compose up -d web api worker
docker compose run --rm migrate
docker compose run --rm --no-deps api maintenance off
```

`maintenance on` closes the instance: every request except `/healthz` and
`/readyz` gets the maintenance page with 503, and the worker finishes the jobs
it is running and claims no more. An optional reason — `maintenance on
Upgrading to 1.4` — is repeated by `/readyz`. Jobs created while the instance
is closed wait and are worked once it reopens. `maintenance off` reopens it.
Nothing in the app or its API can open or close an instance; only the command
can.

The API and the worker no longer refuse to start on a database whose schema is
not theirs. They start closed — the maintenance page, no jobs — and open by
themselves once `migrate` has made the schema current, so an upgrade can start
the new images before it migrates. `/readyz` gains a `maintenance` check that
names why the instance is closed: maintenance mode, a migration in progress, a
schema from another release, a database with no Studio schema, or a server
still starting.

Studio now checks once a day for a newer release. A daily worker job fetches
`https://releases.networkcanvas.com/studio/manifest.json` with a plain `GET`
that carries nothing about the instance. When a newer version exists, the
installation's owner is emailed once for that version, with a link to the
upgrade guide, and sees a notice in the app with the release date and notes.
The check is not configurable; an institution that must stop it blocks the
host.

The backup page's object-store copy now reads the Garage container's volume
wherever Compose put it, rather than a volume name that only matched one
project directory.
