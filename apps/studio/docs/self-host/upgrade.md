# Upgrade

One sequence for every release, whether or not it carries a schema change.
Maintenance mode is always entered: `migrate` on a current database is a no-op,
so a code-only release spends seconds closed rather than skipping the window
altogether and being the one release that behaves differently.

Run these from the directory holding `docker-compose.yml` and `.env`. Nothing
here needs a checkout of the source, Node, pnpm or any tool but Docker: every
command is a command of the images you are deploying.

## Before you pull new images

A release can change what Studio asks of the services you run yourself, or of
the files you downloaded. Read its release notes for that before step 1. The
release that lets you run more than one API asks for two changes, and brings
two more things worth knowing before you start.

**Download `docker-compose.yml` again.** Its Traefik service now reads the
list of API servers from a config of its own, which
[Running more than one API](./run.md#running-more-than-one-api) builds on.
With the older file a second replica starts but gets no traffic, and nothing
reports it. Keep your `.env` and `secrets/` as they are:

```bash
curl -O https://raw.githubusercontent.com/complexdatacollective/network-canvas-monorepo/main/apps/studio/docker-compose.yml
```

If you had changed your copy of the file, make the same changes to the new
one.

**Let the object store delete and list.** A release that stages files in the
object store needs the access key (or, on Azure, the identity) to be able to
delete and list as well as read and write, and the `worker` now uses it too,
to clear away staged files that were abandoned.

- **S3 and S3-compatible stores.** Add `s3:DeleteObject` to the policy of the
  access key in `S3_ACCESS_KEY_ID`, beside the `s3:GetObject` and
  `s3:PutObject` it already has, and `s3:ListBucket` if it is not there yet.
  `s3:ListBucket` is granted on the bucket (`arn:aws:s3:::your-bucket`) and
  the others on its objects (`arn:aws:s3:::your-bucket/*`). Garage, in the
  stack, needs nothing: `garage-init` gives its key read, write and owner on
  the bucket, which covers both.
- **A bucket that keeps versions.** Add a lifecycle rule that expires
  noncurrent versions under `staging/`, as
  [the requirements](./requirements.md#an-object-store) explain. Without it,
  every staged file Studio deletes stays in the bucket as an old version.
- **Azure Blob Storage.** Nothing, if the identity holds Storage Blob Data
  Contributor, as [the swap guide](./swap.md#azure-blob-storage) asks: that role
  already includes delete and list.

Make the change first and the upgrade after it. An upgrade does not check the
policy. A key that cannot delete still lets authors add files to a stage and
save it, but the API refuses to discard a staged file, and staged files are
never cleared away from the bucket. The API and the worker log a warning for
each one they could not delete, so the logs show it.

**An instance with no object store** can no longer stage a file at all: adding
a file to a stage is refused, without the offer to try again, while staging
an API key still works. Before this release such a file could be staged but
never saved, because the save was refused, so nothing an author could finish
before is lost.

**Expect `migrate` to build an index.** This release's migration indexes the
lock entries in `protocol_events`, the table that holds every protocol's edit
history. It runs inside the maintenance window, with every API replica
stopped, so nothing is waiting on it. On an instance with a very long edit
history it makes step 5 take longer, and the window with it.

## The sequence

Put the new image digests in `.env` (`STUDIO_API_IMAGE` and
`STUDIO_WEB_IMAGE`) first, then:

<!-- upgrade-sequence start -->

```bash
docker compose run --rm --no-deps api maintenance on
# wait until /readyz names maintenance mode — see step 2
docker compose stop $(docker compose config --services | grep '^api') worker
# take your backup now — see ./backup.md
docker compose pull
docker compose up -d web $(docker compose config --services | grep '^api') worker
docker compose run --rm migrate
# wait until every api replica reports its schema ok — see step 6
docker compose run --rm --no-deps api maintenance off
```

<!-- upgrade-sequence end -->

Then confirm the instance is back:

```bash
curl https://studio.example.org/readyz
# {"status":"ok","checks":{"db":"ok","limiter":"ok","objectStore":"ok","schema":"ok","maintenance":"ok","doorbell":"ok"}}
```

`docker compose config --services | grep '^api'` lists every API replica:
`api`, and `api-b` or any other you have added as a service of its own in
`docker-compose.override.yml`, as long as its name starts with `api`. So the
same lines work however many replicas you run, and every one of them is
stopped for the backup and started on the new image. It sees the override
only because Compose reads that file on its own when no `-f` is given: if you
run Compose with `-f`, pass the same flags to every command here or set
`COMPOSE_FILE`, as
[Running more than one API](./run.md#running-more-than-one-api) describes.
Replicas made with `--scale` are not supported, because `docker compose exec`
reaches only the first container of a scaled service.

This block is not only documentation. Studio's release test runs these lines
exactly as written against a running instance, with the backup page's commands
in place of the backup comment, and a wait for what each of the other two
comments names in its place. While they run it reads `/readyz` and one API
route a few times a second, and fails if, from the moment `/readyz` first
names maintenance mode (it must within three seconds of the first command
returning) until the last command
starts, either answered 200, the API route answered with anything but the
maintenance page, `/readyz` gave a reason other than maintenance mode, or the
readings stopped for more than five seconds. It checks what those two routes
answered when it asked, not every request. It also fails if an `api` or
`worker` container is still running when the backup starts, or if the ones
`stop` stopped had to be killed rather than finishing on their own, or if a
replica has not reported its schema ok two minutes after `migrate` returned.

Step by step:

1. **`maintenance on`** closes the instance to users. Every API, RPC, WebSocket
   and storage request except `/healthz` and `/readyz` receives the maintenance
   page with 503, no procedure runs, and the worker stops fetching jobs. The
   API reads the flag within a second; the worker checks it every second.
   `--no-deps` because this only writes a flag to the database: it needs no
   other service started on its account. A reason is optional —
   `maintenance on Upgrading to 1.4` — and `/readyz` repeats it.
2. **Wait for the flag to land, stop every API replica and the `worker`, then
   back up.** The rule for the backup: **take it when nothing that can write
   to the database is running.** Closing the instance is not enough for that. The flag stops
   the API admitting new requests and the worker claiming new jobs, but a
   request the API accepted just before it read the flag, or a job the worker
   was already running, still runs to its end, and can commit after the dump
   has started. The live database would then hold a write the backup lacks:
   a rollback would lose it, and restoring a mail job that was mid-send can
   send it again.

   So, in order:

   - wait until `curl https://studio.example.org/readyz` names maintenance
     mode (the first line of the table below), which takes up to a second. It
     proves the API has read the flag, so from here it answers every new
     request with the maintenance page, and the stop below waits only for the
     requests already running;
   - the `stop` line stops every API replica and the worker, and each
     finishes what it is doing before it exits: an API the requests it has
     already accepted, the worker the jobs it is running. The command
     returns once all of them have exited. The worker gives a job 25
     seconds; one still running then is interrupted, and runs again once the
     instance reopens. While the API is down Traefik serves the maintenance
     page from `web`, so users see no difference.

     Every replica has to stop, not only `api`. One left running goes on
     writing while the backup is taken, and after `migrate` it is an old
     build on a new schema: closed, while Traefik still sends it requests.

   Then nothing that writes to the database is running, and the backup holds
   every write the instance accepted. [Back up and restore](./backup.md) is
   the order to take it in.

3. **`pull`** fetches the image digests `.env` names. Change
   `STUDIO_API_IMAGE` and `STUDIO_WEB_IMAGE` before this step, not after.
4. **`up -d`** replaces `web`, every API replica and the `worker` with
   containers built from those images, and starts the ones step 2 stopped.
   Named rather than a bare `up -d` so the backing services are not touched.
   Until the new `api` answers, Traefik serves the static maintenance page
   from `web` — which depends on nothing that is being upgraded — so the page
   is visible for the whole window however it started. The new `api` and
   `worker` start against a database `migrate` has not moved yet. They do not crash or restart over it: they
   wait, closed — `api` answers with the maintenance page and `worker` claims
   no jobs — until the schema is theirs.

   **If you replaced Traefik with a proxy of your own, reload it here.** A
   replacement is a new container with a new address, and a proxy that reaches
   `api` and `web` by their Compose service names looked those names up once,
   when it loaded its configuration — nginx does, and so do most others. It
   goes on sending every request to an address that is nobody's, answering 502
   for as long as it is left alone, and no later step of this sequence
   disturbs it. `docker compose exec <your proxy> nginx -s reload`, or the
   equivalent for whatever you run, and it picks the new addresses up. Traefik
   needs nothing here: it resolves per request.

5. **`migrate`** applies every migration this release carries that the
   database does not have yet, all in one transaction, and prints
   `Applied <versions>.` When the database already has them all — an upgrade
   from the release just before a code-only one — it prints `Schema current.`
   and changes nothing. Either way it exits 0. Within a few seconds the new
   `api` and `worker` see a schema they recognise — and stay closed, because
   the flag is still set.
6. **Check every replica, then `maintenance off`.** Before you reopen, ask
   each API replica whether it is ready apart from the flag:

   ```bash
   for api in $(docker compose config --services | grep '^api'); do
     docker compose exec -T "$api" node -e "fetch('http://127.0.0.1:3000/readyz').then(r => r.json()).then(r => console.log('$api', JSON.stringify(r.checks)))"
   done
   ```

   Each line should say `"schema":"ok"`, with `maintenance` the only check
   that fails. A replica that says `not this build's schema` has not seen the
   migration yet, or is still on the old image: wait a few seconds and ask
   again, and if it still says so, run `docker compose up -d <that replica>`.
   Then `maintenance off` reopens the instance, and readiness passes again
   within a second or two.

**Edit locks.** A lock on a protocol section is a row in the database, kept
alive by the editor's connection and renewed every ten seconds by each API
replica that editor is connected to, so it survives a restart of the API. An
API container that stops gives no locks back. Its editors reconnect, to
another replica or to the same one once it is back, and their locks carry on
as long as they are back within thirty seconds of the last renewal, which can
be as little as twenty seconds after the container stopped. The maintenance
window in the sequence above stops every replica and usually lasts longer, so
expect locks to lapse during an upgrade: an editor's next save is refused,
and they take the section again.

**Staged files.** A file an author has added to a stage but not yet saved is
held in the object store, and an API key in the database, sealed under the
keyring. Neither lives in the container, so both survive a restart. The
worker's hourly collection clears them away only once no replica has heard
from the author's browser tab for five minutes.

`maintenance on|off` is a command of the `studio-api` image, like `serve`,
`worker` and `migrate`, and it is the only way the flag is set: nothing in the
app or its API can open or close the instance.

**A long migration.** Every pending migration runs in one transaction, so a
migration that builds an index on a large table holds a lock on that table
until it commits, and the window lasts that long. A release whose migration
should have its index built concurrently says so in its release notes; build it
by hand before step 1, as those notes describe, and the window stays short.

### While it is closed

`/readyz` answers 503 throughout, and its `maintenance` check says why:

```bash
curl https://studio.example.org/readyz
# {"status":"failing","checks":{…,"maintenance":"failed: maintenance mode is on: Upgrading to 1.4"}}
```

| `maintenance` says                                   | Means                                                                                                   |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `failed: maintenance mode is on` (`: <your reason>`) | Step 1 set the flag and step 6 has not cleared it.                                                      |
| `failed: a schema migration is running`              | `migrate` holds the schema lock. Wait for it.                                                           |
| `failed: the database schema is not this build’s`    | This image and the database are from different releases. Run `migrate` with this image.                 |
| `failed: the database has no Studio schema`          | A new, empty database. Run `migrate`.                                                                   |
| `failed: the server is starting`                     | The process has not finished its first checks. Seconds — except before the first `migrate` (see below). |

On a database `migrate` has never set up — a first start, before
[Run step 6](./run.md#6-create-the-schema-and-read-what-it-prints) — the
Studio roles do not exist yet, so `/readyz` reports `db` and `schema` as
`failed: the database has not been set up for Studio yet` and `maintenance` as
`failed: the server is starting`, and stays that way until `migrate` runs. That
is not a fault: `migrate` is the remedy.

The flag is checked first, so during an upgrade you see the first line until
step 6, whatever else is true. The other four close the instance on their own
whenever the flag was not set: under any of them the API refuses every new
HTTP and WebSocket request but `/healthz` and `/readyz`, so a half-upgraded
database is never served. A
protocol-builder WebSocket that was already open closes when the flag is set
or the schema changes. It stays open while only the migration lock is held —
a `migrate` with nothing to apply holds it for milliseconds on every deploy —
because a write it sends then runs before or after the migration's
transaction, never inside a half-applied one.

## When `migrate` refuses

`migrate` compares the database's migration history with the release before it
changes anything. If the two do not belong together it refuses, exits non-zero
and changes nothing, and its message names the remedy:

- **Migrated by a newer Studio.** The database records a migration this image
  does not carry: a newer release upgraded it. Deploy that release or a newer
  one, or restore the backup taken before that upgrade.
- **Edited or reordered history.** A migration this image carries is not the
  one the database recorded applying at that position. The image is not a
  release of the history this database carries — a locally built one, for
  example. Deploy the released image.
- **A database this build did not create.** It has Studio's tables but no
  migration history, so something other than `migrate` built it. Studio cannot
  upgrade it.

Until `migrate` succeeds the instance stays closed — the new `api` waits for
its schema — so a refusal leaves users looking at the maintenance page, never
at a half-upgraded instance.

## Rollback

**Restore the backup from step 2 and start the previous image digests.** That
is the whole procedure, and it is the only one claimed:

1. Put the digests you replaced back in `.env` (`STUDIO_API_IMAGE` and
   `STUDIO_WEB_IMAGE`).
2. Follow [Restoring](./backup.md#restoring) with the backup from step 2. It
   restores into a fresh database, starts `web`, `api` and `worker` from the
   digests `.env` now names, and ends with `maintenance off`. That last line
   is what reopens the instance: the backup was taken after step 1, so the
   restored database still has maintenance mode on, and without it the
   instance would stay closed with `/readyz` naming maintenance mode.
3. Confirm `/readyz` answers `ok`.

Studio's release test performs this rollback after each upgrade it runs —
the restore block as written, with the previous digests — and fails unless the
instance reopens with every row it had before the upgrade.

Putting the old digests back in `.env` and running `up -d` alone works only
when the upgrade applied no migration — `migrate` printed `Schema current.` in
step 5. That depends on the version you upgraded from, not only on the release:
moving from 1.0 to a code-only 1.2 still applies whatever 1.1 added. When it
applied one, the previous build does not serve a database the new `migrate`
has moved forward: its `api` waits, closed, naming the schema, and its
`migrate` refuses the history as newer. For the same reason Studio does not
offer rolling upgrades: the window in step 4 is real, and the maintenance
page is what covers it.

Keep the digests you are replacing. `docker compose config --images` before
step 3 prints what is running.
