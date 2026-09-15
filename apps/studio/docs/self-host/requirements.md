# Requirements

What Studio needs of a host, and what it needs of each service you swap in for
one of its own. Numbers below are from the stack as it ships — measured on a
running instance, not estimated.

Individual variables are not repeated here. They are in
[`server/.env.example`](../../server/.env.example) and in the
[Environment](../../README.md#environment) section of the app's README, which
are generated from the server's environment catalogue and stay current with it.

## The host

### CPU, memory and disk

| Resource | Minimum | Recommended  |
| -------- | ------- | ------------ |
| CPU      | 2 vCPU  | 4 vCPU       |
| Memory   | 2 GB    | 4 GB         |
| Disk     | 20 GB   | 40 GB and up |

**Memory.** The nine containers use about **750 MB** between them with the
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
published — the database, the object store and the rate-limit store are
reachable only from the stack's own network.

**TLS** is obtained and renewed automatically by Traefik from Let's Encrypt
over ACME HTTP-01, with no DNS credentials. The certificate and account live in
the `traefik-acme` volume. If your institution terminates TLS at its own proxy
instead, see [the ingress swap](./swap.md#the-ingress).

### Outbound hosts

The complete list. Anything else an instance appears to contact is worth
investigating.

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

**The fifth outbound host is yours: the SMTP host in `SMTP_URL`.** It is not on
the list because there is no fixed value to name. See
[Run the stack](./run.md#8-configure-mail).

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

- **Postgres 18.** Every process refuses a database whose schema fingerprint is
  not this build's, and the schema is generated for this major. See
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
- **TLS is recommended**, and required by
  [#1900](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1900)
  wherever the database is not on a private network you control:
  `?sslmode=require`, or `?sslmode=verify-full` to authenticate the server too.
- The database and its backups must be on **encrypted storage**, with the
  backup files themselves encrypted (#1900).

### An object store

Studio uses four S3 operations and no others:

| Operation    | Used for                                                  |
| ------------ | --------------------------------------------------------- |
| `HeadBucket` | Readiness: does the bucket answer with these credentials? |
| `HeadObject` | Does this content-addressed object already exist?         |
| `PutObject`  | Storing an asset's bytes                                  |
| `GetObject`  | Serving them back on `/storage/:hash`                     |

No multipart upload, no listing, no lifecycle rules, no bucket policy API, no
presigning. Two further requirements:

- **Path-style addressing** (`<endpoint>/<bucket>/<key>`). `S3_ENDPOINT` is the
  service address, not a per-bucket hostname.
- **`S3_REGION` must be the region the store signs for**, which is not always
  the region in the endpoint's name — R2 signs for `auto`. A mismatch is a
  signature failure on every request rather than a slow one.

The five `S3_*` variables are all-or-nothing: a partial configuration fails at
boot. With none of them set, asset routes refuse with 503 and readiness leaves
the object store out rather than reporting it failed.

Garage and Cloudflare R2 are the two stores this is run against — Garage in the
stack and in development, R2 by the managed platform.

### A rate-limit store

**Redis 7-compatible.** It holds sliding-window counters and the audit
denial window, and nothing else: no persistence, no backup, no durability
requirement. The limiter fails open when it is unreachable, and readiness
reports `limiter: degraded` rather than failing.

The commands Studio issues:

| Where                                        | Commands                                                                                 |
| -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Directly                                     | `EVAL`, `SCAN`, `PING`                                                                   |
| Inside the sliding-window script             | `TIME`, `ZREMRANGEBYSCORE`, `ZCARD`, `ZRANGE … WITHSCORES`, `ZADD`, `PEXPIRE`, `HINCRBY` |
| Inside the denial-window and summary scripts | `HINCRBY`, `HSET`, `HSETNX`, `HGETALL`, `DEL`, `PEXPIRE`                                 |

Server-side scripting must be available: atomicity is the script, which is what
makes the answer the same whether one API container is running or two. Each
script addresses two keys at once, so a cluster would need both in one hash
slot — a single logical database is what this expects.

`REDIS_URL` names it, and eleven `RATE_LIMIT_*` variables carry the limit for
each scope: `RATE_LIMIT_SIGN_IN_ADDRESS`, `RATE_LIMIT_SIGN_IN_EMAIL`,
`RATE_LIMIT_INVITATION_ACCEPT`, `RATE_LIMIT_PARTICIPANT_REDEEM_ADDRESS`,
`RATE_LIMIT_PARTICIPANT_REDEEM_LINK`, `RATE_LIMIT_PARTICIPANT_SYNC`,
`RATE_LIMIT_RPC_USER`, `RATE_LIMIT_RPC_TEAM`, `RATE_LIMIT_STORAGE_READ`,
`RATE_LIMIT_PUBLIC_API` and `RATE_LIMIT_WS_UPGRADE`. Each has a default and its
own catalogue entry; see
[`server/.env.example`](../../server/.env.example).

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
