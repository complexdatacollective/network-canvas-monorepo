---
'@codaco/studio-server': minor
'@codaco/studio-client': minor
---

Studio now ships as two container images instead of one. `studio-api` carries
the server, and its entrypoint chooses the process: `serve` for HTTP, RPC and
the WebSocket endpoint, `worker` for background jobs, and `migrate`, which
creates the schema in an empty database from statements the build renders — so
a deployment no longer needs a repository checkout to provision one.
`maintenance on|off` and `rotate-secrets` are named but not yet implemented and
exit with a message saying so. `studio-web` is nginx serving the built client,
its hashed assets under a year-long immutable cache, and a static maintenance
page for the seconds an upgrade replaces the API.

The server no longer serves the client in any topology, and the Netlify entry
point and its configuration are gone with it. The gate that used to refuse the
other deployment's page paths at the HTTP layer is now the client's alone: a
route belonging to one topology answers with a branded not-found screen on the
other, and an address that matches no route at all gets the same screen instead
of the router's default text. `CLIENT_DIST` is removed.

`migrate` applies everything in one transaction, so a run that fails part-way
leaves the database as it found it rather than in a state the next run would
refuse. A process that will not boot against a database now prints remedies it
can actually run: the image's commands in a container, the repository's scripts
in a checkout.

Both processes answer `GET /healthz` (liveness) and `GET /readyz`, which
reports each dependency — the database, the schema fingerprint, the object
store, and, on the worker, the job queue — and answers 503 naming the
one that failed. The worker serves them on a loopback-only listener, on the new
`WORKER_HEALTH_PORT` (default 3001), so a container healthcheck can ask a
process that answers nothing else whether it is working.

The protocol store now keeps an unreferenced section for three days rather than
one, so the window always exceeds the daily backup interval.
