# Back up and restore

Nothing ships to do this for you: no script, no service, no packages in the
images. This page is the procedure, and the tools named are suggestions.

Three things to copy, in this order, every time:

1. **The database** — everything Studio knows.
2. **The object store** — the bytes interview assets and protocol sections are
   made of.
3. **The keyring** — `secrets/studio-secrets-key`.

**A database restored without its keyring recovers no secrets.** Webhook
signing secrets, protocol asset API keys and stored OAuth tokens are encrypted
under it, and nothing can read them back without the key they were written
under. The keyring is not a separate backup; it is part of this one.

All three go to **encrypted storage**, and the backup files themselves are
encrypted: that is a requirement of the deployment, not a preference
([#1900](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1900)).
The managed platform encrypts each dump with [`age`](https://age-encryption.org)
to the operators' key before it leaves the host, and keeps the database and
object store on encrypted volumes.

## Order, and why it is this one

The database first, then the object store. A section or asset written between
the two ends up in the object-store copy without being named by the dump, which
is an unreferenced object and harmless. Reverse the order and the dump can name
bytes the copy never captured, which is a manifest pointing at nothing.

The keyring last, because it changes only when you rotate it — but copy it
every time anyway, so that one restore never depends on finding two backups.

## Taking it

Run from the directory holding `docker-compose.yml`. The first line puts
`.env`'s values in your shell, so the commands below name the same database and
login the stack does.

<!-- backup-take start -->

```bash
set -a && . ./.env && set +a
mkdir -p backup

# 1. The database: the data, in the format pg_restore reads...
docker compose exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB" > backup/studio.dump

# ...and the cluster-level objects the dump does not carry: the login roles,
# and the studio_app and studio_maintenance roles the schema step created.
docker compose exec -T postgres \
  pg_dumpall -U "$POSTGRES_USER" --globals-only > backup/globals.sql

# 2. The object store: a mirror of the garage service's data volume.
docker run --rm \
  --volumes-from "$(docker compose ps -q garage):ro" \
  -v "$PWD/backup:/backup" \
  alpine tar czf /backup/garage-data.tar.gz -C /var/lib/garage .

# 3. The keyring.
cp secrets/studio-secrets-key backup/studio-secrets-key
```

<!-- backup-take end -->

Then encrypt `backup/` and send it off the host. It has left nothing behind on
this machine that a lost host would not take with it.

`--volumes-from` mounts whatever volume the `garage` container has, read-only,
at the path Garage keeps it (`/var/lib/garage`), so the command does not depend
on what Docker named the volume. If you have
[swapped in a managed bucket or Azure Blob Storage](./swap.md), that step is
your provider's mirroring or versioning instead, and there is no volume to
copy.

Studio's release test runs this block as written, inside the upgrade sequence,
for every release that changes the upgrade path.

**The backup an upgrade rolls back to is taken with nothing running that
writes to the database** — step 2 of [the upgrade sequence](./upgrade.md)
stops every API replica and the `worker` first, so that backup holds every
write the instance accepted before it closed. A scheduled backup of a live
instance is fine for the database, which is dumped in one consistent
snapshot, and fine for the object store, which is written additively; it is a
copy as of the moment the dump started.

**`staging/` is the one part of the object store that comes and goes.** It
holds files an editor has chosen in the protocol builder but not yet saved.
Studio deletes them once they are saved, cancelled or left behind. No saved
protocol points into `staging/`, so a copy that misses some of it loses no
saved work, and a restored instance clears out whatever is left there on its
own. You can leave `staging/` out of your object-store copy if your tool
makes that easy.

## How often, and the deadline that sets it

**Back up at least daily.** That is not a recommendation about how much work
you are willing to lose; it is a constraint the object store imposes.

Studio's protocol store sweeps unreferenced section documents once they are
older than a grace window, and that window is **72 hours**. A backup interval
longer than the grace can therefore capture a database that references bytes
already swept — the restore then produces a manifest naming a section that
exists nowhere. Three days against a daily backup is deliberate headroom: it
has to exceed the interval rather than match it, because a backup that runs
late or a sweep that runs just before one would otherwise close the gap.

If you must back up less often than daily, the grace has to be raised past your
interval first. Say so plainly: **it is a constant in the source today**, not a
variable — `PROTOCOL_STORE_GC_BOUNDS.sectionGraceMs` in
`apps/studio/api/src/jobs/handlers/protocol-store-gc.ts` — so raising it
means building your own `studio-api` image from a patched checkout. Backing up
daily is much the easier answer.

## Restoring

Same order. Into a **fresh** database rather than over a live one: the schema is
created by the dump, and restoring across an existing one is how a half-restored
instance happens. Set `.env`'s image digests to the release that took the
backup first — when you are [rolling back an upgrade](./upgrade.md#rollback),
the digests you replaced.

<!-- backup-restore start -->

```bash
set -a && . ./.env && set +a

# Stop everything that writes: every API replica and the worker.
docker compose stop $(docker compose config --services | grep '^api') worker

# 1a. A fresh, empty database.
docker compose exec -T postgres \
  psql -U "$POSTGRES_USER" -d postgres \
  -c "DROP DATABASE IF EXISTS $POSTGRES_DB" \
  -c "CREATE DATABASE $POSTGRES_DB"

# 1b. The cluster-level objects, then the data.
docker compose exec -T postgres \
  psql -U "$POSTGRES_USER" -d postgres < backup/globals.sql
docker compose exec -T postgres \
  pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner < backup/studio.dump

# 2. The object store.
docker compose stop garage
docker run --rm \
  --volumes-from "$(docker compose ps -aq garage)" \
  -v "$PWD/backup:/backup:ro" \
  alpine sh -c 'rm -rf /var/lib/garage/* && tar xzf /backup/garage-data.tar.gz -C /var/lib/garage'
docker compose start garage

# 3. The keyring.
cp backup/studio-secrets-key secrets/studio-secrets-key
chmod 644 secrets/studio-secrets-key   # readable by the container; secrets/ itself is 700

# Start the release .env names, then reopen the instance.
docker compose up -d web $(docker compose config --services | grep '^api') worker
docker compose run --rm --no-deps api maintenance off
```

<!-- backup-restore end -->

Then confirm it is back:

```bash
curl https://studio.example.org/readyz
# {"status":"ok","checks":{…}}
```

**The last line matters.** A backup taken during an upgrade — step 2 of
[the upgrade sequence](./upgrade.md) — was taken with maintenance mode on, so
the restored database has it on too, and the instance would stay closed, with
`/readyz` naming maintenance mode, until something turns it off. On a backup
taken while the instance was open, `maintenance off` changes nothing.

`globals.sql` will report that roles it is creating already exist, on a host
that has run Studio before. That is expected and not a failure.

If the images `.env` names are not the release that took the backup,
`/readyz` names the schema — `failed: the database schema is not this build’s`
— and the instance stays closed rather than serve it. Put the matching image
digests in `.env` and run the last two lines again, or run
`docker compose run --rm migrate` to bring the restored database forward to
this release. `migrate` refuses a backup taken by a newer release than the
images, naming it; deploy that release instead.

Studio's release test runs this block as written after each upgrade it
performs, to roll that upgrade back, and fails unless the instance reopens
holding every row it had before the upgrade.

**Practise this before you need it.** A backup nobody has restored is a
hypothesis.
