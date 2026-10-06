# Upgrade

One sequence for every release, whether or not it carries a schema change.
Maintenance mode is always entered: `migrate` on a current database is a no-op,
so a code-only release spends seconds closed rather than skipping the window
altogether and being the one release that behaves differently.

Run these from the directory holding `docker-compose.yml` and `.env`. Nothing
here needs a checkout of the source, Node, pnpm or any tool but Docker: every
command is a command of the images you are deploying.

## The sequence

Put the new image digests in `.env` (`STUDIO_API_IMAGE` and
`STUDIO_WEB_IMAGE`) first, then:

<!-- upgrade-sequence start -->

```bash
docker compose run --rm --no-deps api maintenance on
# take your backup now — see ./backup.md
docker compose pull
docker compose up -d web api worker
docker compose run --rm migrate
docker compose run --rm --no-deps api maintenance off
```

<!-- upgrade-sequence end -->

Then confirm the instance is back:

```bash
curl https://studio.example.org/readyz
# {"status":"ok","checks":{"db":"ok","limiter":"ok","auth":"ok","objectStore":"ok","schema":"ok","maintenance":"ok"}}
```

This block is not only documentation. Studio's release test runs these lines
exactly as written against a running instance, with the backup page's commands
in place of the comment, and fails if the instance answered a request between
the first command and the last.

Step by step:

1. **`maintenance on`** closes the instance to users. Every API, RPC, WebSocket
   and storage request except `/healthz` and `/readyz` receives the maintenance
   page with 503, no procedure runs, and the worker stops fetching jobs while
   in-flight ones finish. `--no-deps` because this only writes a flag to the
   database: it needs no other service started on its account. A reason is
   optional — `maintenance on Upgrading to 1.4` — and `/readyz` repeats it.
2. **Back up.** Now, while nothing is writing. [Back up and
   restore](./backup.md) is the order to do it in.
3. **`pull`** fetches the image digests `.env` names. Change
   `STUDIO_API_IMAGE` and `STUDIO_WEB_IMAGE` before this step, not after.
4. **`up -d web api worker`** replaces the three containers built from those
   images. Named rather than a bare `up -d` so the backing services are not
   touched. While `api` is being replaced it answers nothing, and Traefik
   serves the static maintenance page from `web` — which depends on nothing
   that is being upgraded — so the page is visible for the whole window however
   it started. The new `api` and `worker` start against a database `migrate`
   has not moved yet. They do not crash or restart over it: they wait, closed
   — `api` answers with the maintenance page and `worker` claims no jobs —
   until the schema is theirs.

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
   `Applied <versions>.` On a code-only release there are none: it prints
   `Schema current.` and changes nothing. Either way it exits 0. Within a few
   seconds the new `api` and `worker` see a schema they recognise — and stay
   closed, because the flag is still set.
6. **`maintenance off`** reopens the instance. Readiness passes again within a
   second or two.

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

| `maintenance` says                                   | Means                                                                                   |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `failed: maintenance mode is on` (`: <your reason>`) | Step 1 set the flag and step 6 has not cleared it.                                      |
| `failed: a schema migration is running`              | `migrate` holds the schema lock. Wait for it.                                           |
| `failed: the database schema is not this build’s`    | This image and the database are from different releases. Run `migrate` with this image. |
| `failed: the database has no Studio schema`          | A new, empty database. Run `migrate`.                                                   |
| `failed: the server is starting`                     | The process has not finished its first checks yet. Seconds.                             |

The flag is checked first, so during an upgrade you see the first line until
step 6, whatever else is true. The other four close the instance on their own
whenever the flag was not set — a half-upgraded database is never served.

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

**Restore the backup into a fresh database and start the previous image
digests.** That is the whole procedure, and it is the only one claimed.

Putting the old digests back in `.env` and running `up -d` alone works only
for a code-only release. When the release carried a schema change, the
previous build does not serve a database the new `migrate` has moved forward:
its `api` waits, closed, naming the schema, and its `migrate` refuses the
history as newer. Rolling upgrades are not claimed either, for the same reason
— the window in step 4 is real, and the maintenance page is what covers it.

Keep the digests you are replacing. `docker compose config --images` before
step 3 prints what is running.
