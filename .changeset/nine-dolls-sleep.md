---
'@codaco/studio-server': minor
---

Studio ships a reference Docker Compose stack: Traefik as the only ingress,
the nginx client container, the API and the worker from one image, Valkey,
Postgres, and Garage as the S3-compatible object store, with `migrate` and a
Garage bootstrap as profile-gated one-shots. A self-hoster downloads the
compose file and the `.env.example` beside it, writes two file secrets, and
runs `docker compose up -d` then `docker compose run --rm migrate`. Every
third-party image is pinned by digest, Traefik's routing and Garage's
configuration are inline in the file, and the ingress, database, object store
and rate-limit store are each one block to swap for an institution's own
service.

One hostname serves the app, the API, the WebSocket and asset storage, so the
browser stays same-origin; while the API container is being replaced, the
static maintenance page is served from the client container with a 503, and
`/healthz` and `/readyz` pass through untouched so a deploy and the container
runtime always read the real status.

The database password is now delivered as a file secret: `DATABASE_PASSWORD_FILE`
names a file whose contents are inserted into a `DATABASE_URL` that carries no
password, so the password appears in neither `docker inspect` nor any process
environment. Setting both is refused at boot.

Local development is one command. `pnpm --filter @codaco/studio-server dev`
brings up the same stack's Postgres, Garage, Valkey and a Mailpit sink,
bootstraps the bucket, resets and seeds the database, and runs the server, the
worker and the client together; `dev:down` stops it. The hand-rolled
`dev-pg`/`dev-s3` containers and MinIO are gone, sign-in mail is delivered
through Mailpit rather than printed to the console, and a new
`STUDIO_TELEMETRY` variable carries the development opt-out ahead of the
reporting it will govern.
