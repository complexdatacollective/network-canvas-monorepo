# Requirements

What Studio needs of a host, and what it needs of each service you swap in for
one of its own. Numbers below are from the stack as it ships — measured on a
running instance, not estimated.

Individual variables are not repeated here. They are in
[`api/.env.example`](../../api/.env.example) and in the
[Environment](../../README.md#environment) section of the app's README, which
are generated from the server's environment catalogue and stay current with it.

## The host

### CPU, memory and disk

| Resource | Minimum | Recommended  |
| -------- | ------- | ------------ |
| CPU      | 2 vCPU  | 4 vCPU       |
| Memory   | 2 GB    | 4 GB         |
| Disk     | 20 GB   | 40 GB and up |

**Memory.** The seven long-running containers use about **750 MB** between them with the
instance idle: roughly 240 MB each for `api` and `worker` (Node), 130 MB for
`traefik`, 105 MB for `postgres`, and under 20 MB each for `web`, `valkey` and
`garage`. 2 GB leaves the rest for Postgres's cache and concurrent interviews;
4 GB is where you want to be for a department running studies in parallel. The
managed platform runs an 8 GB class server.

**CPU.** Nothing here is CPU-bound at rest. Two cores is enough for a small
instance; four gives Postgres and the Node processes room during a protocol
import, an export, or a burst of interview sync.

**Disk.** The images are about **2.7 GB** unpacked — `studio-api` is 1.75 GB of
that, `postgres` 425 MB, `traefik` 230 MB, `studio-web` 111 MB, and `valkey`,
`garage` and the bootstrap image the remainder. An upgrade keeps the previous
generation until you prune, so budget for two: about 4.5 GB before any data.
What grows after that is interview assets in the object-store volume and the
database; 20 GB is a floor rather than a plan.

If you back up to this host before sending backups elsewhere, count a full copy
of the database and object store on top.

### Docker

**Docker Engine 25.0 or newer, with Compose v2.23.1 or newer.** The floor is
Compose's: the stack keeps its Traefik routing table and Garage configuration
in inline `configs: content:` blocks so that a self-hoster downloads two files
rather than four, and versions before v2.23.1 cannot read them.

```bash
docker version --format '{{.Server.Version}}'
docker compose version --short
```

### Network

| Direction | What                                                     | Why                                                                  |
| --------- | -------------------------------------------------------- | -------------------------------------------------------------------- |
| Inbound   | TCP **80** and **443** from the internet                 | 443 serves the instance; 80 answers the ACME challenge and redirects |
| DNS       | An `A`/`AAAA` record for `STUDIO_HOSTNAME` pointing here | Traefik proves control of the name over HTTP to get a certificate    |

Port 80 is not optional even though every request is redirected from it: the
HTTP-01 challenge is answered there, ahead of the redirect. Nothing else is
published — the database, the object store and the rate-limit store (which
also carries the doorbell) are reachable only from the stack's own network.

**TLS** is obtained and renewed automatically by Traefik from Let's Encrypt
over ACME HTTP-01, with no DNS credentials. The certificate and account live in
the `traefik-acme` volume. If your institution terminates TLS at its own proxy
instead, see [the ingress swap](./swap.md#the-ingress).

### Outbound hosts

The complete list of fixed hosts. The rest are the ones you choose, below;
anything else an instance appears to contact is worth investigating.

<!-- outbound-hosts start -->

| Host                           | Why                                                                              | When                                     |
| ------------------------------ | -------------------------------------------------------------------------------- | ---------------------------------------- |
| `ghcr.io`                      | Container images. Public packages, so no registry credentials are needed         | `docker compose pull`, and a first start |
| `acme-v02.api.letsencrypt.org` | TLS certificates over ACME HTTP-01                                               | First start, and on renewal              |
| `releases.networkcanvas.com`   | The version manifest the update check reads, to tell owners a new version exists | Once a day, from the worker              |
| `ph-relay.networkcanvas.com`   | Analytics and error reporting, through the Codaco-managed relay                  | Only while `STUDIO_TELEMETRY` is on      |

<!-- outbound-hosts end -->

The same list is checked in as
[`outbound-hosts.txt`](./outbound-hosts.txt), one host per line, which
[#1897](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1897)'s
CI job uses as its allowlist; a test fails if that file and this table disagree.

**The other outbound hosts are yours to choose.** They are not on the list
because there is no fixed value to name:

- **The SMTP host** in `SMTP_URL`. See
  [Run the stack](./run.md#8-configure-mail).
- **Any service you [swapped in](./swap.md)** for one of the stack's own: the
  host in `DATABASE_URL`, in `S3_ENDPOINT`, or in `REDIS_URL`. For Azure Blob
  Storage it is the storage account's blob endpoint, normally
  `<account>.blob.core.windows.net` — the host in `AZURE_STORAGE_ACCOUNT_URL`,
  or the one the connection string names. A managed identity gets its tokens
  from the Azure host's own metadata endpoint, so it adds no host to allow.

Two things worth knowing before your firewall team asks:

- **The update check is not configurable.** A daily job on the worker fetches
  `https://releases.networkcanvas.com/studio/manifest.json` with a plain `GET`
  carrying nothing about your instance, and tells installation owners when a
  newer version exists. An institution that must stop it blocks the host; there
  is no switch
  ([#1901](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1901)).
- **`STUDIO_TELEMETRY=false` stops the relay completely**, because no client is
  constructed at all rather than constructed and muted. It is on by default.

## What a swapped-in element must provide

Each of these replaces one service in the stack. The swap itself is in
[Swap an element](./swap.md); this is the contract.

### A database

- **Postgres 18.** Every process stays closed on a database whose schema is not
  this build's — `api` answers with the maintenance page and `worker` runs no
  jobs — until `migrate` brings it up to date, and the schema is generated for
  this major. See
  [the major-upgrade page](./postgres-major-upgrade.md) for moving between
  majors.
- **The login needs `CREATEROLE` the first time `migrate` runs.** It creates
  two `NOLOGIN` roles — `studio_app` and `studio_maintenance` — and grants the
  login the right to assume them. The server never runs as the login itself:
  every pool starts its session as one of those roles, which is what stops it
  bypassing row-level security. The default login on Neon, RDS and Supabase
  holds `CREATEROLE`; where yours does not, create the two roles once as an
  administrator (the SQL is in [swap.md](./swap.md#a-managed-database)) and
  re-run.
- **No `options` parameter in `DATABASE_URL`.** The pools set Postgres's
  `options` startup parameter themselves, to `-c role=…`; one in the URL would
  override it and silently drop that protection, so it is refused at boot.
- **No password in `DATABASE_URL` either.** It lives in the
  `secrets/postgres-password` file secret, which `DATABASE_PASSWORD_FILE`
  names. A URL carrying one as well is refused at boot.
- **A direct connection, or a session-mode pooler.** Transaction-mode pooling
  (PgBouncer in transaction mode, Cloudflare Hyperdrive) is not yet supported
  for the API and the worker. Both keep state on a connection beyond one
  transaction: the `options` startup parameter above, named prepared
  statements, the worker's `LISTEN`, and the session advisory lock `migrate`
  takes.
- **TLS is recommended**, and required by
  [#1900](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1900)
  wherever the database is not on a private network you control:
  `?sslmode=require`, or `?sslmode=verify-full` to authenticate the server too.
- The database and its backups must be on **encrypted storage**, with the
  backup files themselves encrypted (#1900).

### An object store

Studio talks to its object store through one small interface, with one
implementation per kind of store. There are two:

- **Any S3-compatible store** — `STUDIO_OBJECT_STORE=s3`, as `.env.example`
  ships. Garage, Cloudflare R2, MinIO and AWS S3 all work.
  Google Cloud Storage works through its S3-interoperable XML API, with an
  HMAC key as the access key pair and `https://storage.googleapis.com` as
  `S3_ENDPOINT`; it is not one of the stores this is run against.
- **Azure Blob Storage** — `STUDIO_OBJECT_STORE=azure-blob`. See
  [the Azure swap](./swap.md#azure-blob-storage).

Whichever you choose, this is what Studio needs of it — and all it needs:

- **Content-addressed writes.** Every asset is stored once, under
  `assets/<sha256 of its bytes>`. Uploading the same bytes again finds the
  object already there and leaves it alone, media type included; nothing is
  ever rewritten in place.
- **Streaming reads**, with the stored content type and length, for
  `/storage/:hash`. A missing object must come back as "not found", which
  Studio answers as a 404, rather than as an error.
- **A probe of the bucket or container**, which `/readyz` reports as
  `objectStore`. When it is unreachable, missing, or refuses the credentials,
  readiness names the object store as the failing check.
- **Staged files under `staging/`.** A file an author adds while editing a
  stage is held in the store, under `staging/<team>/<id>`, until they save or
  cancel that stage. Studio writes the object, copies it to its
  content-addressed key when the stage is saved, and deletes it once it is
  saved or cancelled. The worker lists the `staging/` prefix to delete what
  was abandoned. Nothing else is listed or deleted: assets under `assets/` are
  never removed.
- **The bucket or container already exists.** Studio never creates one.

No lifecycle rules are required, no bucket policy API, no presigning, and no
public access: assets are served through Studio.

**If the bucket keeps versions**, a delete only hides an object: on S3 it adds
a delete marker and the bytes stay as a noncurrent version, and Azure blob
versioning keeps the deleted blob as a previous version. Staged files are
deleted all the time, so add a lifecycle rule that expires noncurrent (or
previous) versions under the `staging/` prefix, or they are kept for as long
as the bucket keeps versions.

Both the API and the worker use the object store, so both need the same
credentials. Without an object store, an author can still stage an API key,
but adding a file to a stage is refused.

#### S3-compatible stores

Seven S3 operations and no others:

| Operation       | Used for                                                               |
| --------------- | ---------------------------------------------------------------------- |
| `HeadBucket`    | Readiness: does the bucket answer with these credentials?              |
| `HeadObject`    | Does this content-addressed object already exist?                      |
| `PutObject`     | Storing an asset's bytes, or a staged file's                           |
| `GetObject`     | Serving them back on `/storage/:hash`, and reading a staged file       |
| `CopyObject`    | Copying a staged file to its asset key when the stage is saved         |
| `DeleteObject`  | Removing a staged file that was saved, cancelled or abandoned          |
| `ListObjectsV2` | The worker finding abandoned staged files, under the `staging/` prefix |

An IAM policy therefore grants `s3:GetObject`, `s3:PutObject`,
`s3:DeleteObject` and `s3:ListBucket`: `s3:ListBucket` on the bucket itself
(`arn:aws:s3:::your-bucket`), where it covers both `ListObjectsV2` and the
`HeadBucket` readiness probe, and the other three on its objects
(`arn:aws:s3:::your-bucket/*`). `HeadObject` needs `s3:GetObject`, and
`CopyObject` needs `s3:GetObject` and `s3:PutObject`, so neither adds an
action. [Upgrading](./upgrade.md#before-you-pull-new-images) from a release
that did not stage files in the store means adding `s3:DeleteObject`, and
`s3:ListBucket` if the policy lacks it. No multipart upload. Two further
requirements:

- **Path-style addressing** (`<endpoint>/<bucket>/<key>`). `S3_ENDPOINT` is the
  service address, not a per-bucket hostname.
- **`S3_REGION` must be the region the store signs for**, which is not always
  the region in the endpoint's name — R2 signs for `auto`. A mismatch is a
  signature failure on every request rather than a slow one.

With `STUDIO_OBJECT_STORE=s3`, the five `S3_*` variables are all-or-nothing:
a partial configuration fails at boot.

An instance with no object store at all leaves `STUDIO_OBJECT_STORE` unset
and every `S3_*` and `AZURE_*` variable empty — clearing the `S3_*` values
alone, beside the shipped `STUDIO_OBJECT_STORE=s3`, is a partial S3
configuration and fails at boot. Without a store, asset routes refuse with 503
and readiness leaves the object store out rather than reporting it failed.

#### Azure Blob Storage

- **One container**, named by `AZURE_STORAGE_CONTAINER`.
- **A managed identity holding Storage Blob Data Contributor on that
  container**, with `AZURE_STORAGE_ACCOUNT_URL` naming the account — no
  account keys. `AZURE_CLIENT_ID` picks a user-assigned identity. A host outside
  Azure uses `AZURE_STORAGE_CONNECTION_STRING` instead of the account URL.
- **What Studio calls:** a blob's properties, upload, download, delete
  (`deleteIfExists`) and a flat listing (`listBlobsFlat`), and the container's
  properties for readiness. Storage Blob Data Contributor covers all of them.
  There is no server-side copy: saving a staged file reads it back and writes
  it to its asset key.
- **No `S3_*` variable set alongside it.** A mixed configuration is refused at
  boot, as is one missing the container or naming both an account URL and a
  connection string.

#### What these are run against

Garage, in the stack and in development; Cloudflare R2, by the managed
platform; and Azurite, Microsoft's Blob Storage emulator, in development and
CI. Every implementation passes the same contract tests, so the two kinds of
store cannot drift apart.

### A rate-limit store

**Redis 7-compatible.** It holds sliding-window counters and the audit
denial window, and carries a doorbell between API replicas (below). It holds
nothing that has to last: no persistence, no backup, no durability
requirement. The limiter fails open when it is unreachable, and readiness
reports `limiter: degraded` rather than failing.

The commands Studio issues:

| Where                                        | Commands                                                                                 |
| -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| On every connection, as it opens             | `CLIENT SETNAME`, `INFO`                                                                 |
| Directly                                     | `EVAL`, `SCAN`, `PING`                                                                   |
| Inside the sliding-window script             | `TIME`, `ZREMRANGEBYSCORE`, `ZCARD`, `ZRANGE … WITHSCORES`, `ZADD`, `PEXPIRE`, `HINCRBY` |
| Inside the denial-window and summary scripts | `EXISTS`, `HGET`, `HINCRBY`, `HSET`, `HSETNX`, `HGETALL`, `RENAME`, `DEL`, `PEXPIRE`     |
| Between API replicas, on one channel         | `PUBLISH`, `SUBSCRIBE`, and `PING` on the subscribed connection                          |

Studio's Redis client names each connection as it opens (`studio-rate-limit`,
`studio-doorbell` and `studio-doorbell-publish`), so `CLIENT LIST` shows which
is which, and asks `INFO` whether the server is ready before it sends anything
else. Those two are the only ones a server may refuse: one that refuses
`CLIENT SETNAME` is used anyway, and so is one whose access rules deny `INFO`
(the client logs a warning). One that has renamed or removed `INFO` is not:
the connection never becomes ready. Every other command in the table is
required.

The channel is `studio:protocol-events`, and it is not configurable.
Publishing says that a protocol's edits, locks or editors changed, and each
replica reads the new state from Postgres when it hears it, so no protocol
content passes through the store. A replica that misses a message catches up
on its next five-second poll, so a store that drops or delays messages slows
live updates and cannot lose one. The same poll is how replicas keep up with
each other when there is no store at all. `SUBSCRIBE` holds a connection of
its own per replica; a proxy in front of the store must allow a long-lived
subscribed connection. A replica whose subscription is down reports
`doorbell: degraded` on `/readyz`, which still answers 200.

Server-side scripting must be available: atomicity is the script, which is what
makes the answer the same whether one API container is running or two. Each
script addresses two keys at once, so a cluster would need both in one hash
slot — a single logical database is what this expects.

`REDIS_URL` names the store, and is the only part of this you configure. **The
limits themselves are constants of the build**, in
[`api/src/rate-limit/scopes.ts`](../../api/src/rate-limit/scopes.ts):
they are not settings, there is nothing to put in `.env`, and there is no
supported way to change them on a self-hosted instance. A wrong number here is
a security decision rather than a preference, and each is a ceiling a
legitimate burst does not reach rather than a budget anyone should feel.

Every scope, as `count/window` — a count of calls over a whole number of
seconds, minutes or hours:

<!-- rate-limits start -->

| Scope                        | Limit     | What it protects                                                          |
| ---------------------------- | --------- | ------------------------------------------------------------------------- |
| `sign_in_address`            | `10/10m`  | Credential stuffing from one host, without locking out a shared address   |
| `sign_in_email`              | `5/10m`   | One account, against attempts spread across many addresses                |
| `invitation_accept`          | `10/10m`  | A team invitation token, against being brute-forced through its link      |
| `participant_redeem_address` | `20/10m`  | Participation links, loosely: a lab runs several interviews from one host |
| `participant_redeem_link`    | `5/10m`   | One participant's own link, against repeated redemption                   |
| `participant_sync`           | `600/1m`  | Interview sync, against a script replaying a session                      |
| `participant_session`        | `60/1m`   | Reading an interview, against a script repeating the protocol's assembly  |
| `rpc_user`                   | `600/1m`  | The instance, against one runaway client                                  |
| `rpc_team`                   | `3000/1m` | The instance, against a whole team at once                                |
| `storage_read`               | `2000/5m` | Asset delivery, generously: an interview fetches every stimulus it shows  |
| `public_api`                 | `300/1m`  | `/api/v1`, leaving the instance responsive while a script pages results   |
| `api_docs`                   | `30/1m`   | `/api/v1/docs`, against the reference page becoming a bandwidth amplifier |
| `ws_upgrade`                 | `30/1m`   | Reconnection, against a flapping client becoming a connection storm       |

<!-- rate-limits end -->

An anonymous study's link is shared by everyone who takes part, so it is
counted against the redeeming address only, never per link.
If one of these costs you something real — a teaching lab behind a single
address, a cohort redeeming links together — that is worth telling us about,
because the number is then probably wrong for everyone in your position and not
only for you.

### An ingress

Reproduce the routing table exactly — it is drawn in
[the topology diagrams](../topology.md#request-routing), tabulated with a worked
nginx example in [the ingress swap](./swap.md#the-ingress), and summarised here:

| Matches                          | Goes to    | Constraint                                                   |
| -------------------------------- | ---------- | ------------------------------------------------------------ |
| `/healthz`, `/readyz`            | `api:3000` | Never behind the maintenance page, at the highest precedence |
| `/ws`                            | `api:3000` | Exactly this path; must proxy the WebSocket upgrade          |
| `/rpc/…`, `/api/…`, `/storage/…` | `api:3000` | Maintenance page on 502 and 503, both answered as 503        |
| everything else, including `/`   | `web:80`   | Single-page app; `web` serves the shell for non-file routes  |

One hostname serves all of it, so the browser stays same-origin and cookies and
WebSockets need no cross-origin configuration.

**Forwarded headers.** The proxy must set `X-Forwarded-For` and
`X-Forwarded-Proto`, and `TRUSTED_PROXIES` must name its address or CIDR. Unset,
forwarded headers are not read at all: safe, but every client then shares one
rate-limit bucket and the audit log records the proxy rather than the caller.
List only proxies that **overwrite** the header rather than appending to
whatever a client sent.
