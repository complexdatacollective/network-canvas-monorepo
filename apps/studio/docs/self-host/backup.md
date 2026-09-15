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

# 2. The object store: a mirror of the garage-data volume.
docker run --rm \
  -v studio_garage-data:/data:ro \
  -v "$PWD/backup:/backup" \
  alpine tar czf /backup/garage-data.tar.gz -C /data .

# 3. The keyring.
cp secrets/studio-secrets-key backup/studio-secrets-key
```

Then encrypt `backup/` and send it off the host. It has left nothing behind on
this machine that a lost host would not take with it.

The volume is `studio_garage-data` because the compose file names the project
`studio`; `docker volume ls` confirms it. If you have
[swapped in a managed bucket](./swap.md), that step is your provider's mirroring
or versioning instead, and there is no volume to copy.

**Take it while the instance is closed** where you can — step 1 of
[the upgrade sequence](./upgrade.md) exists partly for this. A scheduled backup
of a live instance is fine for the database, which is dumped in one consistent
snapshot, and fine for the object store, which is written additively.

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
`apps/studio/server/src/jobs/handlers/protocol-store-gc.ts` — so raising it
means building your own `studio-api` image from a patched checkout. Backing up
daily is much the easier answer.

## Restoring

Same order. Into a **fresh** database rather than over a live one: the schema is
created by the dump, and restoring across an existing one is how a half-restored
instance happens.

```bash
set -a && . ./.env && set +a

# Stop everything that writes.
docker compose stop api worker

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
  -v studio_garage-data:/data \
  -v "$PWD/backup:/backup:ro" \
  alpine sh -c 'rm -rf /data/* && tar xzf /backup/garage-data.tar.gz -C /data'
docker compose start garage

# 3. The keyring.
cp backup/studio-secrets-key secrets/studio-secrets-key
chmod 644 secrets/studio-secrets-key   # readable by the container; secrets/ itself is 700

docker compose up -d api worker
curl https://studio.example.org/readyz
```

`globals.sql` will report that roles it is creating already exist, on a host
that has run Studio before. That is expected and not a failure.

If readiness comes back with a schema complaint, the backup was taken by a
different build from the one the images now carry: put the matching image
digests in `.env`, or run `docker compose run --rm migrate` to bring the
restored database forward to this build. Never restore a backup and then serve
it with a build that refuses its fingerprint — the refusal is the protection.

**Practise this before you need it.** A backup nobody has restored is a
hypothesis.
