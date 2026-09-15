# Swap an element

Four parts of the stack are meant to be replaced by an institution's own
service. Three are one line in `.env`; the fourth is a routing table.

| Element          | The swap                                | Then delete                                                                                |
| ---------------- | --------------------------------------- | ------------------------------------------------------------------------------------------ |
| Database         | `DATABASE_URL`                          | the `postgres` service and the `postgres-data` volume                                      |
| Object store     | `S3_ENDPOINT` and the four other `S3_*` | `garage`, `garage-init`, their two configs, the volume, and `migrate`'s `depends_on` entry |
| Rate-limit store | `REDIS_URL`                             | the `valkey` service and the `depends_on` entries naming it                                |
| Ingress          | reproduce the routing table below       | the `traefik` service, the `traefik-dynamic` config and the published ports                |

Deleting the replaced service is tidying, not part of the swap: each of the
three variables defaults to the stack's own service, so setting one points
Studio elsewhere without a line of `docker-compose.yml` changing. The contract
each replacement must meet is in [Requirements](./requirements.md).

## A managed database

```
DATABASE_URL=postgres://studio@postgres.example.org:5432/studio?sslmode=require
```

Three things that are easy to get wrong:

- **No password in the URL.** It stays in `secrets/postgres-password`, which
  `DATABASE_PASSWORD_FILE` still names; put the managed instance's password
  there. A URL carrying a password as well is refused at boot.
- **No `options` parameter.** Every pool sets Postgres's `options` startup
  parameter itself, to `-c role=…`, which is how the server runs as a NOLOGIN
  role that cannot bypass row-level security. An `options` in the URL would
  override it, so one in `DATABASE_URL` is refused at boot rather than silently
  losing that protection.
- **The login needs `CREATEROLE` the first time `migrate` runs.** It creates
  the two NOLOGIN roles the server assumes. The default login on Neon, RDS and
  Supabase has it; where yours does not, create them once as an administrator
  and re-run:

  ```sql
  CREATE ROLE studio_app NOLOGIN;
  CREATE ROLE studio_maintenance NOLOGIN;
  GRANT studio_app, studio_maintenance TO <login> WITH SET TRUE;
  ```

Use TLS. `sslmode=require` encrypts the connection; `sslmode=verify-full`
also authenticates the server, and is what you want wherever the database is
not on a private network you control.

Then delete the `postgres` service block and the `postgres-data` volume, and
remove the `depends_on` entries naming `postgres` from `api`, `worker` and
`migrate`.

## A managed bucket

All five or none: a partial configuration fails fast rather than half-working.

```
S3_ENDPOINT=https://s3.us-east-1.amazonaws.com
S3_REGION=us-east-1
S3_BUCKET=studio-assets
S3_ACCESS_KEY_ID=…
S3_SECRET_ACCESS_KEY=…
```

`S3_REGION` must be the region the store expects requests to be **signed** for,
which is not always the region in the endpoint's name — R2, for instance, signs
for `auto`. A mismatch is a signature failure on every request, not a slow
request.

Studio addresses the bucket **path-style** (`<endpoint>/<bucket>/<key>`), so the
endpoint is the service address and not a per-bucket hostname.

Then delete the `garage` and `garage-init` services, the `garage-config` and
`garage-init` configs, the `garage-data` volume, and the `garage-init` entry in
`migrate`'s `depends_on` — the two `GARAGE_*` variables are read only by those
containers. Your provider's own mirroring or versioning replaces the volume
copy in [Back up and restore](./backup.md).

## An external Redis

```
REDIS_URL=redis://redis.example.org:6379
```

Any Redis 7-compatible server. It holds rate-limit counters and nothing else:
it is deliberately ephemeral, needs no persistence and is never backed up, and
the limiter fails open — with readiness reporting `degraded` rather than
failing — when it cannot be reached. Then delete the `valkey` service and the
`depends_on` entries naming it in `api` and `worker`.

## The ingress

The one swap that is not a variable, because Traefik holds a routing table
rather than an address. Delete the `traefik` service, the `traefik-dynamic`
config and the published ports, publish `web` and `api` where your proxy can
reach them, and reproduce this table exactly.

### The routing table

| Matches                          | Goes to    | Notes                                                                 |
| -------------------------------- | ---------- | --------------------------------------------------------------------- |
| `/healthz`, `/readyz`            | `api:3000` | **Never** behind the maintenance page. Highest precedence             |
| `/ws`                            | `api:3000` | Exactly this path. Must proxy the WebSocket upgrade                   |
| `/rpc/…`, `/api/…`, `/storage/…` | `api:3000` | Maintenance page on 502 and 503, both answered as 503                 |
| everything else, including `/`   | `web:80`   | Single-page app: `web` serves its shell for routes that are not files |

Four rules that are not negotiable:

1. **The health paths bypass the maintenance page.** An upgrade script and the
   container runtime must read the real status and the named failing check. Put
   the page in front of these and an upgrade reports a healthy API that is not
   there.
2. **502 and 503 both answer 503.** A stopped API container is a connection
   error, which a proxy reports as 502; "bad gateway" is not what is happening,
   and 503 is what the API itself answers once maintenance mode exists, so a
   client and a monitor see one status for the whole window however it started.
3. **One hostname for everything.** The app, the API, the WebSocket and asset
   storage share an origin, which is what lets cookies and WebSockets work with
   no cross-origin configuration. Do not split the API onto a second name.
4. **Set `X-Forwarded-For` and `X-Forwarded-Proto`, and set `TRUSTED_PROXIES`
   to your proxy's address.** Unset, forwarded headers are not read at all —
   safe, but every client then shares one rate-limit bucket and the audit log
   records the proxy. List only proxies that **overwrite** the header rather
   than appending to whatever a client sent.

   ```
   TRUSTED_PROXIES=10.0.0.0/24
   ```

### A minimal nginx example

Everything above, and nothing else. `api` and `web` are the compose service
names, resolvable from a container on the stack's network; use host addresses
instead if your proxy runs outside it.

```nginx
upstream studio_api { server api:3000; }
upstream studio_web { server web:80; }

server {
    listen 443 ssl;
    http2 on;
    server_name studio.example.org;

    ssl_certificate     /etc/nginx/tls/fullchain.pem;
    ssl_certificate_key /etc/nginx/tls/privkey.pem;

    # Protocol assets and interview media are uploaded through /storage.
    client_max_body_size 512m;

    proxy_http_version 1.1;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # Exact matches, so these two can never fall into the block below. No
    # interception: the real status, always.
    location = /healthz { proxy_pass http://studio_api; }
    location = /readyz  { proxy_pass http://studio_api; }

    # One endpoint, and the only one that is upgraded. proxy_set_header does
    # not merge across levels, so the forwarded headers are repeated here.
    location = /ws {
        proxy_pass http://studio_api;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        "upgrade";
        proxy_read_timeout 3600s;
    }

    # Everything the server answers. A regex location so one block covers the
    # three prefixes; it is matched before the prefix location below.
    location ~ ^/(rpc|api|storage)(/|$) {
        proxy_pass http://studio_api;
        # `=503` rather than a bare `=`: a stopped container is a 502 here and
        # the instance is unavailable rather than misrouted.
        proxy_intercept_errors on;
        error_page 502 503 =503 @maintenance;
    }

    # The shell, the hashed assets, and every client-side route.
    location / {
        proxy_pass http://studio_web;
    }

    # Served by web, which depends on nothing an upgrade replaces. The rewrite
    # rather than a URI on proxy_pass: nginx refuses a proxy_pass with a URI
    # part inside a named location, and will not start at all if you write one.
    location @maintenance {
        rewrite ^ /maintenance.html break;
        proxy_pass http://studio_web;
    }
}

# The ACME challenge, and the redirect. Port 80 must stay reachable if you
# renew certificates over HTTP-01.
server {
    listen 80;
    server_name studio.example.org;
    location / { return 301 https://$host$request_uri; }
}
```

Check it the way the stack is checked: `/readyz` answers 200 with JSON, `/` is
the client shell, `/rpc` is a JSON 404 from the API, and with `api` stopped
`/rpc/status` is the maintenance page with 503 while `/readyz` is a plain 502.
