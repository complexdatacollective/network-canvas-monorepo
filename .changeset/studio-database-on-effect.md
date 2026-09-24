---
'@codaco/studio-server': minor
'@codaco/studio-sync': minor
---

Studio's server now reaches its database through one client per role, and
every command runs inside a single transaction scoped to the team it acts on.
A command cannot open a team's transaction without first proving it may act in
that team, so an authorization check can no longer be skipped by a code path
that forgot it. The protocol commands now check a caller's access to the
protocol inside the same transaction as the edit, so access revoked while a
request is in flight can no longer let that edit through.

`DATABASE_URL` must now be a `postgres://` URL. A bare socket path, a keyword
connection string, a URL with credentials but no host, or an `sslmode` other
than `disable`, `require`, `verify-ca` or `verify-full` is refused at boot with
a message naming what to use instead. A Unix socket is written with `localhost`
as the host and the socket's directory in the `host` parameter —
`postgres://studio@localhost/studio?host=/var/run/postgresql` — so a password
from `DATABASE_PASSWORD_FILE` has somewhere to go.

The development seed moved to `scripts/seed/` and now writes its protocols,
network summaries and audit history through the same code a running server
does, instead of copies of it.
