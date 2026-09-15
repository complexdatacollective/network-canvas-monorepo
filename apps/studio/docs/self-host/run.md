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

Open it: every variable is there with a comment saying what it is. Six need a
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
Leave `DATABASE_URL`, `S3_ENDPOINT` and `REDIS_URL` commented out — each one
points Studio at a service of your own instead of the stack's, and
[swap an element](./swap.md) is where that belongs.

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
mkdir -p secrets
openssl rand -hex 32 > secrets/postgres-password
echo "k1:$(openssl rand -base64 32)" > secrets/studio-secrets-key
chmod 600 secrets/postgres-password secrets/studio-secrets-key
```

`postgres-password` is the password for the `POSTGRES_USER` login. Postgres
takes it through `POSTGRES_PASSWORD_FILE` and the server through
`DATABASE_PASSWORD_FILE`, which is why `DATABASE_URL` carries no password — a
URL that carries one as well is refused at boot. Both strip trailing newlines,
so a file written by a shell redirection is fine.

`studio-secrets-key` is the **keyring** every stored secret is encrypted under:
one or more `id:base64(32 bytes)` entries, separated by commas or newlines, the
first being the current one. The `k1` above is the entry's id — any label of
letters, digits, `.`, `_` and `-` that you will recognise later, and never
containing a `:`. Rotation adds a second entry at the front; one is what you
start with. The reader that uses it lands with
[#1900](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1900)
(PR
[#1914](https://github.com/complexdatacollective/network-canvas-monorepo/pull/1914));
the file must exist now regardless, because the stack mounts it as a declared
secret and Compose resolves every declared secret before it starts anything.

> **Back the keyring up with the database, from the day you create it.** A dump
> restored without it recovers no secrets: webhook signing secrets, protocol
> asset API keys and stored OAuth tokens are all unreadable without the key
> they were written under. See [Back up and restore](./backup.md).

## 4. Point DNS at the host and open the ports

`STUDIO_HOSTNAME` must have an `A` (or `AAAA`) record for this machine, and
ports **80 and 443** must be reachable from the internet. Port 80 is not
optional: the ACME HTTP-01 challenge is answered on it, ahead of the redirect
to HTTPS. Nothing else is published — the database, the object store and the
rate-limit store are reachable only from the stack's own network.

## 5. Start it

```bash
docker compose up -d
```

**`api` and `worker` restart in a loop until the next step has run**, and
`docker compose ps` says `Restarting (1)`. That is expected: there is no schema
for them to verify yet. It stops the moment `migrate` has run.

## 6. Create the schema, and read what it prints

```bash
docker compose run --rm migrate
```

It creates the bucket, applies this build's schema, and — because the instance
has no owner yet — issues the first-run setup token and prints it:

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
# {"status":"ok","checks":{"db":"ok","schema":"ok","objectStore":"ok"}}
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
this machine, and it is the only one of them that is yours to choose.

## Where to go next

- [Back up and restore](./backup.md) — do this before the instance carries
  anything you would miss.
- [Upgrade](./upgrade.md) — the five commands, for every release.
- [Swap an element](./swap.md) — a managed database or bucket, or your own
  reverse proxy.
