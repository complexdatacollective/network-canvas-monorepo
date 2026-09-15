# Upgrade

One sequence for every release, whether or not it carries a schema change.
Maintenance mode is always entered: `migrate` on a current database is a no-op,
so a code-only release spends seconds closed rather than skipping the window
altogether and being the one release that behaves differently.

Run these from the directory holding `docker-compose.yml` and `.env`.

## The sequence

```bash
docker compose run --rm --no-deps api maintenance on
# take your backup now — see ./backup.md
docker compose pull
docker compose up -d web api worker
docker compose run --rm migrate
docker compose run --rm --no-deps api maintenance off
```

Then confirm the instance is back:

```bash
curl https://studio.example.org/readyz
# {"status":"ok","checks":{"db":"ok","schema":"ok","objectStore":"ok"}}
```

Step by step:

1. **`maintenance on`** closes the instance to users. Every API, RPC, WebSocket
   and storage request except `/healthz` and `/readyz` receives the maintenance
   page with 503, no procedure runs, and the worker stops fetching jobs while
   in-flight ones finish. `--no-deps` because this only writes a flag to the
   database: it needs no other service started on its account.
2. **Back up.** Now, while nothing is writing. [Back up and
   restore](./backup.md) is the order to do it in.
3. **`pull`** fetches the image digests `.env` names. Change
   `STUDIO_API_IMAGE` and `STUDIO_WEB_IMAGE` before this step, not after.
4. **`up -d web api worker`** replaces the three containers built from those
   images. Named rather than a bare `up -d` so the backing services are not
   touched. While `api` is being replaced it answers nothing, and Traefik
   serves the static maintenance page from `web` — which depends on nothing
   that is being upgraded — so the page is visible for the whole window however
   it started.
5. **`migrate`** applies the schema this build expects, once. It is a no-op on
   a current database and exits 0.
6. **`maintenance off`** reopens the instance. Readiness passes again.

`maintenance on|off` is a command of the `studio-api` image, like `serve`,
`worker` and `migrate`. Its implementation lands with
[#1901](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1901);
until that merges the command exists and refuses, naming the issue, rather than
reporting an unknown command — so a deployment that runs it learns that the
sequence is right and this build cannot do it yet, not that it typed something
wrong.

## Rollback

**Restore the backup into a fresh database and start the previous image
digests.** That is the whole procedure, and it is the only one claimed.

Rolling back by putting the old digests in `.env` and running `up -d` alone is
not enough whenever the release carried a schema change: both images correctly
refuse the other's fingerprint, so the previous build will not serve a database
the new `migrate` has moved forward. Rolling upgrades are not claimed either,
for the same reason — the window in step 4 is real and the maintenance page is
what covers it.

Keep the digests you are replacing. `docker compose config --images` before
step 3 prints what is running.
