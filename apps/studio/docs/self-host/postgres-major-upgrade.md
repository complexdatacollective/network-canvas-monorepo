# Upgrading Postgres to a new major

The stack pins a Postgres major by image digest, and Postgres will not start on
a data directory written by a different major. Moving between majors is a dump
and a restore, never an in-place start on the old volume.

The shape of it, and the reason for each step:

1. **Dump with the new major's client binaries.** `pg_dump` from a newer
   release can read an older server; the reverse is not true, and a dump taken
   by the old client can contain constructs the new server rejects.
2. **Restore into a new, empty volume.** The old one is never written to.
3. **Switch the pinned image digest** to the new major.
4. **Keep the old volume until you have verified the new one.** It is the whole
   rollback: put the two lines back and the previous major starts on untouched
   data.

Take a full [backup](./backup.md) first. This procedure is a second copy of the
database, not a substitute for one.

## The procedure

Run from the directory holding `docker-compose.yml`. `18` and `19` below stand
for the major you are on and the major you are going to.

```bash
set -a && . ./.env && set +a
docker compose run --rm --no-deps api maintenance on
docker compose stop api worker
```

**Dump, using the new major's client.** A throwaway container of the new image
on the stack's network, so the client is version 19 and the server is still 18:

```bash
mkdir -p pgupgrade
docker run --rm --network studio_default \
  -e PGPASSWORD="$(cat secrets/postgres-password)" \
  -v "$PWD/pgupgrade:/out" \
  postgres:19-alpine sh -c \
  "pg_dumpall -h postgres -U $POSTGRES_USER --globals-only > /out/globals.sql &&
   pg_dump -h postgres -U $POSTGRES_USER -Fc $POSTGRES_DB > /out/studio.dump"
```

**Point the stack at a new major and a new volume.** Two edits to
`docker-compose.yml`, and they are the only edits this procedure makes:

```yaml
postgres:
  image: postgres:19-alpine@sha256:… # was 18
  volumes:
    - postgres-data-19:/var/lib/postgresql # was postgres-data

volumes:
  traefik-acme:
  postgres-data: # keep this line: the old volume stays declared and untouched
  postgres-data-19:
  garage-data:
```

**Start the new server and restore into it.**

```bash
docker compose up -d postgres
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d postgres < pgupgrade/globals.sql
docker compose exec -T postgres pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner < pgupgrade/studio.dump
```

**Bring the instance back and check it.**

```bash
docker compose up -d api worker
docker compose run --rm migrate          # a no-op on a current database
docker compose run --rm --no-deps api maintenance off
curl https://studio.example.org/readyz
```

Then sign in, open a study and a protocol, and confirm the data is what you
expect.

## Afterwards

**Only once you are satisfied**, reclaim the old volume:

```bash
docker volume rm studio_postgres-data
rm -rf pgupgrade
```

Until then it is an untouched copy of the database as the previous major left
it, and rolling back is putting the image digest and the volume name back and
running `docker compose up -d postgres api worker`.

Both the dump files and the volume you keep are full copies of the database:
hold them to the same rule as a backup — encrypted storage, and removed when
they are no longer the safety net.
