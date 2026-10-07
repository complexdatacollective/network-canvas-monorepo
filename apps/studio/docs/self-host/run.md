# Run the stack

From nothing to a signed-in owner. No repository checkout, and nothing on the
host but Docker.

Check [Requirements](./requirements.md) first: host size, Docker Engine 25.0
with Compose v2.23.1 or newer, ports 80 and 443, a hostname that already
resolves to this machine, and the outbound hosts the instance contacts.

## 1. Make a directory and download the two files

Everything lives here. The compose file resolves `secrets/` and reads `.env`
relative to it, so run every command on this page from this directory.

```bash
mkdir -p /opt/studio && cd /opt/studio
curl -O https://raw.githubusercontent.com/complexdatacollective/network-canvas-monorepo/main/apps/studio/docker-compose.yml
curl -o .env https://raw.githubusercontent.com/complexdatacollective/network-canvas-monorepo/main/apps/studio/.env.example
```

## 2. Fill in `.env`

Open it: every variable is there with a comment saying what it is. Seven need a
value from you, and five of those are generated.

**The hostname and the certificate contact.** `STUDIO_HOSTNAME` must already
resolve to this host — Traefik proves control of it over HTTP to get a
certificate, so a name that does not point here yet will not get one.
`ACME_EMAIL` is where Let's Encrypt sends expiry warnings.

```
STUDIO_HOSTNAME=studio.example.org
ACME_EMAIL=admin@example.org
```

**The signing secret.** It signs sessions and magic-link tokens; changing it
later signs every open session out.

```bash
openssl rand -base64 32          # → BETTER_AUTH_SECRET
```

**The object store's credentials.** The first takes Garage's key format —
`GK` followed by 24 hex characters — and the rest are 32 random bytes each.

```bash
echo "GK$(openssl rand -hex 12)" # → S3_ACCESS_KEY_ID
openssl rand -hex 32             # → S3_SECRET_ACCESS_KEY
openssl rand -hex 32             # → GARAGE_RPC_SECRET
openssl rand -hex 32             # → GARAGE_ADMIN_TOKEN
```

Leave `S3_REGION`, `S3_BUCKET`, `POSTGRES_USER` and `POSTGRES_DB` as they come.
Leave `DATABASE_URL`, `S3_ENDPOINT`, `REDIS_URL` and the Azure Blob Storage
lines commented out — each one points Studio at a service of your own instead
of the stack's, and [swap an element](./swap.md) is where that belongs.

Pin the two image variables to a digest rather than a tag on a real instance.
A tag can be moved, and an instance that pulls a moved tag has upgraded without
being told to:

```
STUDIO_API_IMAGE=ghcr.io/complexdatacollective/studio-api@sha256:…
STUDIO_WEB_IMAGE=ghcr.io/complexdatacollective/studio-web@sha256:…
```

## 3. Write the two secret files

These are files rather than variables so they stay out of `docker inspect`, out
of every process environment, and out of any log line that prints one. Compose
mounts them read-only under `/run/secrets`.

```bash
mkdir -p secrets && chmod 700 secrets
openssl rand -hex 32 > secrets/postgres-password
echo "k1:$(openssl rand -base64 32)" > secrets/studio-secrets-key
chmod 644 secrets/postgres-password secrets/studio-secrets-key
```

**The directory is private and the files are readable — not the other way
round.** The Studio containers run as an unprivileged user, and Compose
bind-mounts each file into them exactly as it is on the host: a file only its
owner can read is a file the container cannot read either, and `migrate`,
`api` and `worker` refuse to start with `EACCES` on `/run/secrets/…`. Mode
`700` on `secrets/` is what keeps other users on the host out — nobody can
reach a file through a directory they cannot enter, and the bind mount does
not go through the directory — while `644` on the files is what lets the
container read them. `chmod 600` on the files is the mistake that breaks the
stack on every Linux host whose operator is not the container's user id.

`postgres-password` is the password for the `POSTGRES_USER` login. Postgres
takes it through `POSTGRES_PASSWORD_FILE` and the server through
`DATABASE_PASSWORD_FILE`, which is why `DATABASE_URL` carries no password — a
URL that carries one as well is refused at boot. Both strip trailing newlines,
so a file written by a shell redirection is fine.

`studio-secrets-key` is the **keyring** every stored secret is encrypted under:
one or more `id:base64(32 bytes)` entries, separated by commas or newlines, the
first being the current one. The `k1` above is the entry's id — a label of up to
64 letters, digits, `.`, `_` and `-`, starting with a letter or digit, that you
will recognise later; it never contains a `:`. One entry is what you start
with. To rotate, add a new entry at the front, restart the stack, and run
`docker compose run --rm --no-deps api rotate-secrets`, which re-encrypts every
stored secret under the new entry and reports success only once it has counted
that nothing is left under the old one; remove the old entry after that. Every
Studio process refuses to start while a stored secret names an entry the
keyring no longer holds, so a rotation finished out of order is caught before
anything is served.

> **Back the keyring up with the database, from the day you create it.** A dump
> restored without it recovers no secrets: webhook signing secrets, protocol
> asset API keys and stored OAuth tokens are all unreadable without the key
> they were written under. See [Back up and restore](./backup.md).

## 4. Point DNS at the host and open the ports

`STUDIO_HOSTNAME` must have an `A` (or `AAAA`) record for this machine, and
ports **80 and 443** must be reachable from the internet. Port 80 is not
optional: the ACME HTTP-01 challenge is answered on it, ahead of the redirect
to HTTPS. Nothing else is published — the database, the object store and
Valkey (the rate-limit store, and the doorbell the API replicas ring each
other on) are reachable only from the stack's own network.

## 5. Start it

```bash
docker compose up -d
```

**`api` and `worker` start closed until the next step has run.** There is no
schema yet, so `api` answers every request with the maintenance page and
`worker` runs no jobs. That is expected. Until `migrate` has run, `/readyz`
fails with:

```json
{
  "status": "failing",
  "checks": {
    "db": "failed: the database has not been set up for Studio yet",
    "schema": "failed: the database has not been set up for Studio yet",
    "maintenance": "failed: the server is starting"
  }
}
```

(with the object store, rate-limit store and doorbell checks beside them).
The database is reachable; the roles Studio connects as do not exist until
`migrate` creates them, and the server does not finish starting until they
do. Both processes
check again every few seconds and open by themselves once `migrate` has run,
with no restart.

## 6. Create the schema, and read what it prints

```bash
docker compose run --rm migrate
```

It creates the bucket, applies every migration this build carries — on a new
database, all of them, which is what creates the schema — and, because the
instance has no owner yet, issues the first-run setup token and prints it:

```text
────────────────────────────────────────────────────────────────────────
FIRST-RUN SETUP TOKEN

  8bN9Zh-zDAIg9Zmu5RoMs6Mn2_CCJ-rHG1EFc6nz6Qs

Open https://studio.example.org/setup and enter it to create the first owner
account and name this instance.

This is the only time it is shown. Run the schema step again to issue a
new one; once an owner exists, no token is issued and setup is closed.
────────────────────────────────────────────────────────────────────────
```

Only a hash of the token is stored, so nothing on the server can print it a
second time. **If you lose it, run `docker compose run --rm migrate` again**:
against a database that still has no owner it issues a fresh token and prints
it. Against one that has an owner it issues nothing, and `/setup` is closed for
good — re-running a deploy can never reopen it.

Confirm the stack is healthy before you go on:

```bash
curl https://studio.example.org/readyz
# {"status":"ok","checks":{"db":"ok","limiter":"ok","objectStore":"ok","schema":"ok","maintenance":"ok","doorbell":"ok"}}
```

## 7. Finish setup in the browser

Open `https://studio.example.org/setup`, paste the token, give the instance a
name, and create the owner's account. You land signed in as the owner. The
token is spent, and `/setup` answers as a not-found from then on.

That is the instance running. The name you gave is reported by the app's
`status` procedure and by `/api/v1/status`.

## 8. Configure mail

Studio sends sign-in links and team invitations, and until a transport is
configured they queue and **nobody can sign in by magic link**. Set both
variables or neither: `EMAIL_FROM` without `SMTP_URL` is refused at boot.

```
SMTP_URL=smtp://user:password@smtp.example.org:587
EMAIL_FROM=studio@studio.example.org
```

[Resend](https://resend.com)'s SMTP endpoint is one option that works: host
`smtp.resend.com`, port 587 (or 2587, and 465 or 2465 for implicit TLS), the
username `resend`, and an API key as the password. It is what the managed
service uses.

```
SMTP_URL=smtp://resend:re_your_api_key@smtp.resend.com:587
EMAIL_FROM=studio@your-verified-domain.example
```

Only the `worker` process reads these two, because it is the process that sends
every message Studio sends. Apply a change to them with:

```bash
docker compose up -d worker
```

Whichever provider you use, its host is one of the instance's
[outbound hosts](./requirements.md#outbound-hosts) — it must be reachable from
this machine, and it is yours to choose, like the host of any service you
swap in.

## Running more than one API

One `api` container is enough for most instances, and nothing in this guide
needs more. Run a second to keep serving through the loss of one container:
while one replica is down, the other answers. Studio needs no sticky sessions
for this: any replica can serve any request, and an editor whose connection
ends reconnects to whichever replica Traefik picks next, keeping the section
they were editing. It is not seamless: editors on the replica that went away
see a reconnect, and for the few seconds before Traefik notices it has gone,
some requests sent to it get the maintenance page and need trying again. An
upgrade still stops every replica for its maintenance window (see
[Upgrade](./upgrade.md)).

What makes that safe is that nothing an editor needs lives only inside one
container. Edit locks, and who is connected, are rows in Postgres. A file an
author has added to a stage but not yet saved is held in your object store
under `staging/`, and an API key in Postgres, sealed under your keyring.
Valkey carries a doorbell, on the `studio:protocol-events` channel, that one
replica rings when a protocol changes so the others tell their editors at
once. Each replica also checks the database every five seconds, so a Valkey
outage slows live updates and loses none. Because of the staged files, the
object store credentials must allow delete and list as well as read and write
(see [an object store](./requirements.md#an-object-store)), and the `worker`
needs them too, as it clears away staged files that were abandoned.

When an editor's connection closes, the replica it was on waits twenty
seconds for them to come back before it gives their locks up. If by then they
have a live connection on any replica, nothing is given up. A replica that is
stopping gives nothing up at all: its editors' locks stay theirs while they
reconnect, for up to thirty seconds after the last renewal.

Each replica is another Node process, of about 240 MB at rest, and opens up
to 11 Postgres connections: a pool of 10, and one for its readiness check.
The `worker` opens up to 11 as well. Postgres allows 100 by default, so count
11 for each replica and the worker, and leave a few for `migrate` and your
backups. A managed database may allow fewer.

Running more than one needs the `docker-compose.yml` from the release that
added it, or a later one: earlier copies have no separate server list for
Traefik. If yours
is older, download it again before you start, and carry over any changes you
had made to your copy:

```bash
curl -O https://raw.githubusercontent.com/complexdatacollective/network-canvas-monorepo/main/apps/studio/docker-compose.yml
```

Adding a replica is two edits. Create `docker-compose.override.yml` beside
`docker-compose.yml`, which Compose reads on its own:

<!-- two-api-override start -->

```yaml
services:
  api-b:
    extends:
      file: docker-compose.yml
      service: api

configs:
  traefik-api-servers:
    content: |
      http:
        services:
          api:
            loadBalancer:
              healthCheck:
                path: /healthz
                interval: 5s
                timeout: 3s
              servers:
                - url: "http://api:3000"
                - url: "http://api-b:3000"
```

<!-- two-api-override end -->

`api-b` is `api` with a different name: the same image, environment and
secrets. Keep the name starting with `api`: the upgrade and restore commands
find every replica that way. The second block replaces the server list as a
whole, so it names every replica, and so does the next replica you add.
Studio's own stack test builds its two-replica stack from this block, as
written.

Then start the new replica, and recreate Traefik so it reads the new list:

```bash
docker compose up -d api-b
docker compose up -d --force-recreate traefik
```

Traefik reads its server list from a file Compose writes when it creates the
container, and `up -d` alone does not recreate a running container whose
config changed, so without the second command Traefik goes on sending every
request to `api`. Recreating Traefik closes the connections open through it,
and editors' browsers reconnect.

The block also adds a health check, which one replica does not need: Traefik
asks each server's `/healthz` every five seconds and stops sending requests to
one that does not answer, so a stopped replica leaves rotation. `/healthz`
says only that the process is alive. It is not `/readyz`, which also fails
during maintenance and whenever the database is unreachable, and would then
take every replica out at once. So a replica stays in rotation until it stops,
and the editors on it then reconnect to the other.

The upgrade sequence and the restore already stop and start every service
whose name starts with `api`, so they need no change for a second replica.

If you front the stack with your own proxy, as in
[Swap an element](./swap.md#the-ingress), list each replica as a
`server` line in its `upstream` block and leave out any session affinity.

## Where to go next

- [Back up and restore](./backup.md) — do this before the instance carries
  anything you would miss.
- [Upgrade](./upgrade.md) — the six commands, for every release.
- [Swap an element](./swap.md) — a managed database or bucket, Azure Blob
  Storage, or your own reverse proxy.
