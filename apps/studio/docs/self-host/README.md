# Self-hosting Network Canvas Studio

Studio runs as a Docker Compose stack. You download two files, write two
secrets, and run two commands; the second prints a token that opens the
first-run screen where you create the owner account. There is no repository to
clone, nothing to build, and no pnpm, Node or drizzle-kit on the host — for
this or for any operation on these pages.

The compose file you run is the compose file the managed service runs.

## What you are running

Nine service blocks: seven long-running containers and two one-shots.

| Service       | What it is                                                                          |
| ------------- | ----------------------------------------------------------------------------------- |
| `traefik`     | the only published ports. Terminates TLS, gets the certificate, routes by path      |
| `web`         | nginx serving the built client and the maintenance page. It proxies nothing         |
| `api`         | the Studio server: HTTP, the RPC surface, the public API and the WebSocket          |
| `worker`      | background jobs, cron schedules and every message Studio sends. No published port   |
| `postgres`    | Postgres 18. All of Studio's data                                                   |
| `garage`      | the S3-compatible object store interview assets live in                             |
| `valkey`      | Redis-compatible. Rate-limit counters, and nothing else — no persistence, no backup |
| `migrate`     | one-shot. Creates this build's schema, and prints the first-run setup token         |
| `garage-init` | one-shot. Creates the bucket and its access key. `migrate` runs it for you          |

`postgres`, `garage` and `valkey` are each swappable for a managed service by
setting one variable, and `traefik` is swappable for an institution's own
reverse proxy. See [swap an element](./swap.md).

The [topology diagrams](../topology.md) draw the stack and the routing table.

## The two files

Everything you run comes from these, side by side in one directory:

```bash
curl -O https://raw.githubusercontent.com/complexdatacollective/network-canvas-monorepo/main/apps/studio/docker-compose.yml
curl -o .env https://raw.githubusercontent.com/complexdatacollective/network-canvas-monorepo/main/apps/studio/.env.example
```

`docker-compose.yml` is the deployment. `.env` is everything about this
instance: the hostname, the image versions, the credentials the containers
share. Two values are **not** in it — the database password and the secrets
keyring are files under `secrets/`, so they stay out of `docker inspect`, out
of every process environment, and out of any log line that prints one.

## The pages

| Page                                                  | What it covers                                                                                            |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| [Requirements](./requirements.md)                     | Host sizing, Docker versions, ports, DNS, every outbound host, and what a swapped-in service must provide |
| [Run the stack](./run.md)                             | From nothing to a signed-in owner                                                                         |
| [Back up and restore](./backup.md)                    | What to copy, in what order, and why a database without its keyring is not a backup                       |
| [Upgrade](./upgrade.md)                               | The five commands, and rollback                                                                           |
| [Swap an element](./swap.md)                          | A managed database, bucket or Redis, and your own reverse proxy                                           |
| [Postgres major upgrade](./postgres-major-upgrade.md) | Moving from one Postgres major to the next without losing the volume you came from                        |

Read [Requirements](./requirements.md) first if you are deciding whether a host
will do; go straight to [Run the stack](./run.md) if it will.
