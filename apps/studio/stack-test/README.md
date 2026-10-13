# The stack test

Four bash scripts that stand the reference stack up, exercise it, and tear it
down — once as a self-hoster runs it, once for each documented swap with the
swapped element replaced by a stub, and once with a second API replica added.
CI runs exactly these scripts, as the `studio-stack` job in
`.github/workflows/ci-and-release.yml`; nothing about a CI run differs from a
run on your machine except which images are in the daemon's cache.

Two more variants prove what leaves the machine, with telemetry off and with
it on. `egress.sh` runs them in place of `assert.sh`, and CI runs them as the
`studio-egress` job; see [What leaves the machine](#what-leaves-the-machine).

```bash
apps/studio/stack-test/build.sh                          # both images, once
apps/studio/stack-test/up.sh     --variant reference
apps/studio/stack-test/assert.sh --variant reference
apps/studio/stack-test/participants.sh --variant reference  # optional, see below
apps/studio/stack-test/down.sh   --variant reference
```

Requires Docker and `openssl`, and nothing else — no pnpm, no Node, no
checkout state beyond this directory and the compose files beside it — except
for `participants.sh`, which needs the workspace installed and Playwright's
Chromium (`pnpm --filter @codaco/studio-web exec playwright install chromium`).
Ports **80**, **443** and **127.0.0.1:8443** must be free.

Compose **v2.24.4** or newer, which is above the v2.23.1 the stack itself
requires: the overrides use `!override` and `!reset` to empty a `depends_on`
map and a `ports` list that a merging override would otherwise keep. That is a
floor on testing this, not on deploying it — a self-hoster deleting a service
by hand needs neither.

| Variant                 | What is replaced                    | With                                                                  |
| ----------------------- | ----------------------------------- | --------------------------------------------------------------------- |
| `reference`             | nothing                             | —                                                                     |
| `external-postgres`     | the `postgres` service              | a Postgres on a separate Docker network, named by `DATABASE_URL`      |
| `external-bucket`       | the `garage` service                | a second Garage on that network, named by the five `S3_*`             |
| `external-bucket-azure` | the `garage` service                | Azurite on that network, selected by `STUDIO_OBJECT_STORE=azure-blob` |
| `external-redis`        | the `valkey` service                | a second Valkey on that network, named by `REDIS_URL`                 |
| `own-proxy`             | the `traefik` service and its ports | nginx carrying the configuration block from `docs/self-host/swap.md`  |
| `two-api`               | nothing: a second `api` is added    | `api-b` and a server list naming both, from `docs/self-host/run.md`   |
| `telemetry-off`         | every route off the machine         | a sink, with `STUDIO_TELEMETRY=false`                                 |
| `telemetry-on`          | every route off the machine         | a sink, with `STUDIO_TELEMETRY=true` and no OpenTelemetry endpoint    |

## What the scripts do

**`build.sh`** builds `studio-api:ci` and `studio-web:ci` from the monorepo
root — the same two `docker build` invocations `dev:stack` runs. Set
`BUILD_CACHE_FROM` and `BUILD_CACHE_TO` to pass `--cache-from` / `--cache-to`
through to buildx; `{target}` in either is replaced with the target's name, so
one value gives the two images separate cache scopes.

**`up.sh --variant <name>`** writes the two file secrets (only if absent, so a
`dev` or `dev:stack` value you already have is kept), writes `.work/.env.ci`
with every variable `.env.example` names, starts the stack, runs
`docker compose run --rm migrate`, captures the first-run setup token it prints
to `.work/setup-token`, and waits for `/readyz` through the variant's ingress.
It sets `STUDIO_TELEMETRY=false` for every variant except `telemetry-on`, so a
run sends nothing to Codaco's PostHog project; the default, telemetry on, is
the `telemetry-on` variant's to exercise, against a sink.

**`assert.sh --variant <name>`** makes the same assertions for every variant,
deliberately: a swapped element has to meet the contract the element it
replaced met, so a swap is proved by the same list passing rather than by a
shorter one. Each variant adds only a structural check that the service it
replaced is really gone. (`two-api` replaces nothing, so its check is that both
replicas exist, each reports its doorbell subscribed, and its maintenance
window stops both.) Every assertion prints what it checked and the value it
saw; a failure exits non-zero after printing `docker compose ps` and the
last 200 lines of the logs.

**`down.sh --variant <name>`** removes every container, both networks and all
of the volumes. `--profile migrate` is why it works: in `external-bucket-azure`
`migrate` depends on the variant's own one-shot, so Compose creates that as an
ordinary container and a plain `down` leaves it holding the network.

**`participants.sh --variant <name>`** walks a participant through an
interview on the built images (#1899). `api/scripts/e2e-participant-links.ts`
publishes the lean e2e protocol (`packages/protocols/e2e/interviewer-e2e`)
through the server's own protocol store and creates a live managed study with a
participant link and a live anonymous study with its link, printing both
tokens. It runs in a Node container on the stack's network, because Postgres
publishes no port, and reads the stack's own secrets. The Playwright spec in
`web/e2e` then opens each link, answers every stage, reloads mid-interview to
check the answers were saved, finishes, and reopens the link to find the
already-finished notice. CI runs it for the reference variant.

Everything generated lands in `.work/`, which is gitignored: the environment
file, the captured token, `migrate`'s output, and own-proxy's nginx
configuration and certificate. `down.sh` adds `<variant>-ps.txt` and
`<variant>-logs.txt` — written before it tears anything down, because that is
the last moment the containers exist — and `up.sh` clears the previous run's
files rather than `down.sh` deleting them, so a variant that failed is still
explainable after it has been cleaned up.

## Notes on the variants

**The stubs are on their own Docker network** (`studio-ci-external`,
172.31.244.0/24), and each variant attaches to it only the Studio processes
that have to reach the service it replaced — `api`, `worker` and `migrate` for
the database, the bucket and the blob container; `api` and `worker` alone for
the rate-limit store, which `migrate` never opens a connection to. That is
what makes a swap a real one: the stack reaches the institution's service
across a boundary rather than over the bridge its own services share, and
nothing on that boundary is in `TRUSTED_PROXIES`.

**`external-bucket`'s stub bootstraps itself the way the stack's Garage
does**: the same image and digest, started with the same
`--single-node --default-bucket` flags and the same `GARAGE_DEFAULT_*`
environment keys, fed from the `S3_*` values the swap names, and the same
health check, which `migrate` waits on. There is no bootstrap script to keep in
step. Its region is deliberately not the stack Garage's, so a request still
being signed for the store it replaced would fail rather than pass by
coincidence.

**`external-bucket-azure` swaps the provider, not only the address.** Azure
Blob Storage does not speak S3, so this variant sets `STUDIO_OBJECT_STORE` to
`azure-blob`, names the container, and authenticates with a connection string
— the guide's fallback for a host with no managed identity, which a CI runner
is. It also empties every `S3_*` value, as the guide tells an Azure
deployer to: the server refuses any of them beside `azure-blob`, and an empty
access key is what turns off the compose file's `S3_ENDPOINT` default of the
stack's Garage. The stub is Azurite serving one generated account, set through
`AZURITE_ACCOUNTS`, which also disables the emulator's well-known
`devstoreaccount1` — so, like external-bucket's region, a request signed for
any other store fails rather than passing by coincidence. Studio never creates
the container, so a one-shot does, in the `migrate` profile so that the first
`migrate` waits on it: it runs from the `studio-api` image, which already carries
`@azure/storage-blob`, with its script inline in the override.

**`own-proxy` extracts its nginx configuration from `docs/self-host/swap.md` at
run time.** A copy in this directory would drift from the block an institution
pastes, and then the variant would be testing the copy. `up.sh` fails loudly if
that block stops parsing or loses one of the lines it checks for. Only the
hostname is substituted; the generated certificate is mounted at the two paths
the guide's `ssl_certificate` lines already name, so those lines are tested as
written.

`own-proxy` is the only variant with an **upgrade** window as well as a
maintenance one, because it is the only one where they differ. Stopping and
starting a container keeps its address; replacing it, which is what step 4 of
[Upgrade](../docs/self-host/upgrade.md) does, does not — and nginx resolved the
names in its `upstream` block once, when it loaded. It then answers 502 until
it is reloaded. That reload is a documented step of the upgrade sequence
because of this, and this variant is what holds the sequence to it.

`own-proxy` also runs a one-shot client container on the external network. It
exists for a single assertion — what address the API records for a request —
which cannot be made from this host: a request through the published port
arrives as the stack network's own gateway, which is inside `TRUSTED_PROXIES`,
and Studio then correctly records no client address at all. A container out
there has an address the ingress can forward and Studio will believe, which is
the shape every real request has.

**`external-redis` proves the store by being refused by it.** `/readyz`
reporting `limiter: ok` is a PING and nothing more, and the limiter fails open
— so a store that answered PING and dropped every script would leave every
other assertion in this suite green. Every variant therefore signs in until the
sign-in limit refuses it, and asserts that the refusal lands on the eleventh
attempt; then that the limiter's `studio:rl:*` keys are in the store
`REDIS_URL` names, which for this variant is the stub and for the others is the
stack's own Valkey, and that every API replica is subscribed to the
`studio:protocol-events` doorbell in that same store.

The eleventh because the limits are **constants of the build** —
`sign_in_address` is `10/10m` — and not a knob the stack offers, so there is
no value for this suite to turn down and none it needs to. Asserting which
attempt is refused rather than that some attempt was is what makes it an
assertion about the limiter at all. The attempts use a different address each
time, because `sign_in_email` is `5/10m` and would otherwise refuse the sixth
and prove a different limit.

**`two-api` is the multi-replica claim, tested from outside.** Its override is
the `docker-compose.override.yml` block in
[Run](../docs/self-host/run.md#running-more-than-one-api), which `lib.sh`
extracts between its `<!-- two-api-override -->` markers into
`.work/two-api.override.yml` on every use, the way `own-proxy` takes its nginx
block from the swap guide; `variants/two-api.yml` is empty. The block adds
`api-b` with Compose's `extends`, so the second replica is the first with
nothing changed but its name, and replaces the Traefik server list with one
naming both, with a health check: the edits the guide asks of a self-hoster,
and no sticky sessions. `up.sh` fails unless each replica answers its own
`/readyz` from inside its container.

After the common assertions it runs two scenarios, both on the unary plane,
because that is the one a shell can speak and it holds the same lease as a
WebSocket does.

The first is an editor across a replica stop, with `curl` alone. The first
replica is the only one up, and an editor's tab takes a section's lock on it.
The second replica then starts, and the first stops, as a lost host or a
restart would stop it. The tab goes on working against the second replica,
one call every five seconds, until forty seconds have passed since the first
stopped. A lock's lease is thirty seconds, renewed every ten by each replica
that has heard from its owner in the last five minutes, so a save made at that
point is written only if the second replica really took the renewals over,
and is refused as `NotLockHolder` if it did not.

The second is the relay. With both replicas up again, and both subscribed to
the doorbell, a second tab watches the protocol on `api-b` while the editor
saves on `api`, each call made with `node` from inside that replica's
container so Traefik cannot put both on one replica. The watcher must receive
the new revision, and the run prints how long after the save it arrived: a few
milliseconds through the doorbell, or up to five seconds if only the safety
poll carried it.

A WebSocket reconnecting to another replica is covered by the API's own
multi-replica tests, which can age rows and crash a replica deterministically;
what only a real stack can show is that the ingress, the health check and the
replicas agree.

The scenarios never sleep to wait for state. Where the first has to wait for
the ingress to stop sending requests to the replica that was stopped, it polls
for a run of consecutive good answers, because Traefik alternates between
servers until its next health check and a single good answer proves nothing.
The one team it needs is inserted as a row, because no HTTP route creates a
team.

## What leaves the machine

```bash
apps/studio/stack-test/build.sh
apps/studio/stack-test/up.sh     --variant telemetry-off
apps/studio/stack-test/egress.sh --variant telemetry-off
apps/studio/stack-test/down.sh   --variant telemetry-off
```

and the same with `telemetry-on`. This is #1897's proof that a running stack
contacts nothing outside
[`docs/self-host/outbound-hosts.txt`](../docs/self-host/outbound-hosts.txt).

**Nothing can leave except through the sink.** Both variants run the
production `docker-compose.yml` with `egress.yml` over it, and without
`docker-compose.local.yml`, so Traefik asks Let's Encrypt for its certificate
exactly as a deployment does. `egress.yml` makes the stack's only network
internal and publishes no port, so no container has a route off the machine;
requests reach Traefik from `egress-client`, a curl container on that same
network, through `ingress_curl` in `lib.sh`. Every service is given the sink as
its DNS server. Docker still answers the stack's own service names itself and
forwards every other name to the sink, which records it and answers with its
own address. So a lookup of any host outside the stack reaches the sink and is
recorded, and a connection to an address, with no lookup first, has no route
at all. The sink runs on the `studio-api` image, so it needs no image of its
own.

**The sink stands in for every host Studio contacts.** It records each DNS
question, the server name in each TLS ClientHello on 443, the `Host` of each
HTTP request on 80, and each message delivered over SMTP on 25. It never
completes a TLS handshake, so nothing Studio sends over HTTPS is read, and the
real hosts are never contacted. `SMTP_URL` names `smtp.egress-sink.test`, which
the sink answers like any other name.

**What `egress.sh` does.** After checking that every container is attached
only to internal networks and that every service resolves through the sink, it completes first-run setup,
signs the owner in with a password, invites a member, creates a protocol,
takes a section's lock and saves an edit. Then it waits for the invitation
email to reach the sink and the `invitation-delivery` job to complete, and
makes the daily update check due now so the worker runs it and contacts
`releases.networkcanvas.com`. With telemetry on, it waits until a TLS
connection names `us.i.posthog.com`. It then watches until 60 seconds have
passed since sign-in, several times the longest OpenTelemetry export interval
Studio uses (Effect's defaults: one second for logs, five for traces, ten for
metrics). Last, a lookup made from the API container has to reach the
sink, so a sink that died part way through cannot pass for one that saw
nothing.

**What it asserts.** Every host looked up or named in a connection is in
`outbound-hosts.txt` or is the SMTP host. With telemetry off, no telemetry or
analytics host was contacted. With telemetry on, `us.i.posthog.com` was, and
it is the only telemetry or analytics host that was. The update-check host,
the ACME host and the SMTP host must all have been contacted in both variants,
so neither variant can pass by recording nothing. The capture is kept as
`.work/<variant>-egress.jsonl`.

## Adding a variant

Add a `variants/<name>.yml` override, add the name to `VARIANTS` in `lib.sh`,
and add the four script invocations to the `studio-stack` job. The last part is
not optional and not left to memory:
`scripts/ci/ci-workflow.test.mjs` reads this directory and fails if no job
runs a variant, so a variant that exists but is not run in CI is a red test
rather than silent coverage that was never there. The egress variants are the
exception to the job: they are the `studio-egress` job's matrix, and
`egress_variant` in `lib.sh` names them.
