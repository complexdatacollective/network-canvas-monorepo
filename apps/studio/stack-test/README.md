# The stack test

Four bash scripts that stand the reference stack up, exercise it, and tear it
down — once as a self-hoster runs it, and once for each documented swap with
the swapped element replaced by a stub. CI runs exactly these scripts, as the
`studio-stack` job in `.github/workflows/ci-and-release.yml`; nothing about a
CI run differs from a run on your machine except which images are in the
daemon's cache.

```bash
apps/studio/stack-test/build.sh                          # both images, once
apps/studio/stack-test/up.sh     --variant reference
apps/studio/stack-test/assert.sh --variant reference
apps/studio/stack-test/down.sh   --variant reference
```

Requires Docker and `openssl`, and nothing else — no pnpm, no Node, no
checkout state beyond this directory and the compose files beside it. Ports
**80**, **443** and **127.0.0.1:8443** must be free.

Compose **v2.24.4** or newer, which is above the v2.23.1 the stack itself
requires: the overrides use `!override` and `!reset` to empty a `depends_on`
map and a `ports` list that a merging override would otherwise keep. That is a
floor on testing this, not on deploying it — a self-hoster deleting a service
by hand needs neither.

| Variant             | What is replaced                        | With                                                                 |
| ------------------- | --------------------------------------- | -------------------------------------------------------------------- |
| `reference`         | nothing                                 | —                                                                    |
| `external-postgres` | the `postgres` service                  | a Postgres on a separate Docker network, named by `DATABASE_URL`     |
| `external-bucket`   | the `garage` and `garage-init` services | a second Garage on that network, named by the five `S3_*`            |
| `external-redis`    | the `valkey` service                    | a second Valkey on that network, named by `REDIS_URL`                |
| `own-proxy`         | the `traefik` service and its ports     | nginx carrying the configuration block from `docs/self-host/swap.md` |

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

**`assert.sh --variant <name>`** makes the same assertions for every variant,
deliberately: a swapped element has to meet the contract the element it
replaced met, so a swap is proved by the same list passing rather than by a
shorter one. Each variant adds only a structural check that the service it
replaced is really gone. Every assertion prints what it checked and the value
it saw; a failure exits non-zero after printing `docker compose ps` and the
last 200 lines of the logs.

**`down.sh --variant <name>`** removes every container, both networks and all
of the volumes. `--profile migrate` is why it works: `migrate` depends on
`garage-init`, so Compose creates that as an ordinary container and a plain
`down` leaves it holding the network — the same trap `dev:stack:down` documents.

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
the database and the bucket; `api` and `worker` alone for the rate-limit store,
which `migrate` never opens a connection to. That is what makes a swap a real
one: the stack reaches the institution's service across a boundary rather than
over the bridge its own services share, and nothing on that boundary is in
`TRUSTED_PROXIES`.

**`external-bucket` bootstraps its stub with the stack's own `garage-init`
script**, referenced as a Compose config rather than copied, so there is one
bootstrap to keep in step rather than two. That script addresses the admin API
as `http://garage`, which is why the stub carries `garage` as a network alias
on the external network — where the stack's own Garage, disabled by a profile,
does not exist. Its region is deliberately not the stack Garage's, so a request
still being signed for the store it replaced would fail rather than pass by
coincidence.

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
stack's own Valkey.

The eleventh because the limits are **constants of the build** — `sign_in_address`
is `10/10m` — and not a knob the stack offers, so there is no value for this
suite to turn down and none it needs to. Asserting which attempt is refused
rather than that some attempt was is what makes it an assertion about the
limiter at all. The attempts use a different address each time, because
`sign_in_email` is `5/10m` and would otherwise refuse the sixth and prove a
different limit.

## Adding a variant

Add a `variants/<name>.yml` override, add the name to `VARIANTS` in `lib.sh`,
and add the four script invocations to the `studio-stack` job. The last part is
not optional and not left to memory:
`scripts/ci/ci-workflow.test.mjs` reads this directory and fails if the job
does not name every variant, so a variant that exists but is not run in CI is a
red test rather than silent coverage that was never there.
