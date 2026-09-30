# Stack secrets

Two files, read by `docker-compose.yml` as Compose file secrets and mounted
read-only under `/run/secrets` in the containers that need them. Nothing here
is committed — everything but this file and `.gitignore` is ignored.

The directory is mode `700` and the files inside it are `644`. The Studio
containers run as an unprivileged user and Compose bind-mounts each file into
them as it is on the host, so a file only its owner can read (`600`) fails
every process that needs it with `EACCES`; the private directory is what keeps
other host users out. Docker Desktop on macOS maps file ownership and hides
the mistake — a Linux host does not.

They are files rather than variables in `.env` so they stay out of
`docker inspect`, out of every process environment, and out of any log line
that prints one.

| File                 | Read by                                | Generate with          |
| -------------------- | -------------------------------------- | ---------------------- |
| `postgres-password`  | `postgres`, `api`, `worker`, `migrate` | `openssl rand -hex 32` |
| `studio-secrets-key` | `api`, `worker`, `migrate`             | see below              |

```bash
openssl rand -hex 32 > postgres-password
```

`postgres-password` is the password for the `POSTGRES_USER` login. Postgres
takes it through `POSTGRES_PASSWORD_FILE` and the server through
`DATABASE_PASSWORD_FILE`, which is why `DATABASE_URL` in the compose file
carries no password — a URL that carries one as well is refused at boot.
Postgres strips trailing newlines from the file and so does the server, so a
file written by a shell redirection works.

`studio-secrets-key` is the keyring every stored secret is encrypted under
(#1900): one or more `id:base64(32 bytes)` entries, the first being current.
Its generation command arrives with that issue.

**Back the keyring up with the database.** A dump restored without it recovers
no secrets — webhook signing secrets, protocol asset API keys and stored OAuth
tokens are all unreadable without the key they were written under.

The development lane writes both files with fixed development values if they
are absent, so `pnpm --filter @codaco/studio-server dev` needs no setup. Those
values are published and are for local containers only.
