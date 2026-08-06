# Fresco → TanStack Start: execution findings

**Date:** 2026-08-06
**Branch:** `spike/fresco-tanstack-start`
**Executes:** `2026-08-06-fresco-tanstack-start-migration-brief.md`
**Supersedes:** the 2026-08-06 feasibility assessment, which is not retained.
Its conclusions are restated here where this document corrects or confirms
them, so "the assessment" below refers to a document that no longer exists in
the repository.
**Status:** Phase A complete (green). **Phase B complete — all six routes
green**, including the container verified through the real mirror lane. Stopped
before Phase C, as the brief requires.

What was actually built and measured. The assessment was written from static
analysis; this is the first thing to run it.

Evaluated against `@tanstack/react-start@1.168.38` (still the latest published
version on the day the brief was written), `@tanstack/react-router@1.170.21`,
`@tanstack/nitro-v2-vite-plugin@1.155.0`, Vite `8.1.4` (the monorepo's pinned
version), Node `24.11.1`, Prisma `7.9.1`.

---

## Headline

**The two named defects that were the assessment's first load-bearing reason not
to migrate do not reproduce.** Issues #5464 and #5407 are both still open
upstream, and neither lands on Fresco's code at 1.168.38 — verified against the
real `webauthn.ts` cookie sequence and the real `next.config.ts` header rules, in
dev, in a production `.output` server, and inside `node:lts-alpine`.

**No stop condition was hit.** The port is feasible: all six slice routes work
against real Postgres, the API contract is byte-identical to `main`, and the
container boots from the real mirrored tree, migrates, and serves.

The surprises were not where the assessment expected them. **None of the eight
real problems below appear in its risk register**, and four of them fail
_silently_: a megabyte of Prisma in the browser bundle, security headers dropped
on every redirect, an SSR crash that still returns HTTP 200, and a leak gate
that passes because it was only looking for four strings.

**This branch is not shippable and must not be merged as-is.** The `Dockerfile`
now builds `build:start`, so the image serves the six-route slice and 404s
everything else. That is correct for a measurement and wrong for a release.

---

## Phase A — scratch spikes

Built outside the monorepo as a minimal Start app with no Fresco code. Every
result was measured three times: `vite dev`, the production
`node .output/server/index.mjs`, and that same build inside `node:lts-alpine`
against a real PostgreSQL.

| Spike                                                        | Verdict                                  | Summary                                                                             |
| ------------------------------------------------------------ | ---------------------------------------- | ----------------------------------------------------------------------------------- |
| **S1** Prisma bundles; output runs in the container shape    | **GREEN**                                | Builds, externalises cleanly, runs under Alpine, migrates at boot, reads and writes |
| **S2** Two cookies with different attributes on one response | **GREEN**                                | #5464 does not reproduce — both `Set-Cookie` headers survive                        |
| **S3** Path-scoped response headers                          | **GREEN**                                | #5407 does not reproduce — _both_ singular and plural forms work at runtime         |
| **S4** Streaming response outliving its handler              | **GREEN** on Node · **AMBER** on Netlify | No `after()` needed on a long-lived Node server; unverified on serverless           |
| **S7** Netlify path                                          | **AMBER**                                | Build lane verified; no branch-preview deploy performed                             |

**Exit condition (S1, S2, S3 green) met.**

### S2 — the highest-information spike · GREEN

Reproduced `apps/fresco/actions/webauthn.ts:209 → :271` exactly: read and
`deleteCookie('webauthn_challenge')` (set `sameSite: 'strict'`), then
`setCookie('auth_session', …, { httpOnly, sameSite: 'lax', path: '/' })`, in one
server function.

| Variant                                                          | Set-Cookie headers | Result |
| ---------------------------------------------------------------- | ------------------ | ------ |
| `createServerFn({ method: 'POST' })` over its `/_serverFn/…` URL | 2                  | PASS   |
| Server route handler — the exact shape #5464 is filed against    | 2                  | PASS   |
| Control: two plain `setCookie` calls with differing `sameSite`   | 2                  | PASS   |

Identical in dev, in `.output`, and in the container:

```
set-cookie: webauthn_challenge=; Max-Age=0; Path=/
set-cookie: auth_session=…; Max-Age=1209600; Path=/; HttpOnly; SameSite=Lax
```

**Retires risk #1.** Later confirmed _in situ_ — see the Phase B slice, where a
real password sign-in against the real `lib/auth` stack sets the real session
cookie and creates the session row.

Method note: `Headers.getSetCookie()` is the only correct way to read repeated
`Set-Cookie` headers; `headers.get('set-cookie')` folds them and would have
produced a false negative.

### S3 — path-scoped response headers · GREEN

Reproduced `next.config.ts` `headers()` as one `createMiddleware({ type:
'request' })` registered through `createStart`. Correct on SSR pages and server
routes, with `no-referrer` scoped to `/interview/*` and `/onboard/*`.

**Correction to the assessment:** it records the plural `setResponseHeaders` as
broken per #5407 and the singular form as the workaround. At 1.168.38 both work
at runtime and the Nitro `routeRules` fallback is unnecessary. **Retires risk
#3** — though see finding 2 below, which is a different and more dangerous
header problem that only appears against the real app.

### S4 — streaming past the handler · GREEN on Node, AMBER on Netlify

A `TransformStream` returned immediately, with a detached producer still writing
~2 s later and no `after()` equivalent. All five progress frames and the terminal
frame arrived, ~400 ms apart, in all three environments. On a long-lived Node
server `after()` is simply not needed.

One behaviour difference, not a blocker: **response headers are not flushed
until the first chunk is written** (~440 ms here). Next flushes at t≈0.

### S1 — Prisma, `.output`, and the container · GREEN

Mirrored `lib/db/`: the ESM `prisma-client` generator, `output = "./generated"`,
`binaryTargets` including `linux-musl-arm64-openssl-3.0.x`, `@prisma/adapter-pg`.
Exercised through a server route, a server function called from a router
`loader` during SSR, and a mutating server function over RPC.

- Nitro externalises `@prisma/*` and `pg` into a self-contained
  `.output/server/node_modules` — the direct analogue of `.next/standalone`.
- **No native artefacts.** No `.node`, no query-engine binary, no `.wasm`.
  Prisma 7's driver-adapter path is engine-free at runtime, so the musl/glibc
  question that motivated `binaryTargets` **does not arise for the server bundle
  at all** — only the `prisma` CLI the boot script uses still needs a platform
  binary. Stronger than the assessment's "believed … likely dodge the worst".
- A two-stage `node:lts-alpine` image runs `prisma migrate deploy` against a
  fresh database and listens on `PORT=3000`. Image size 424 MB.

### S7 — Netlify · AMBER

`@netlify/vite-plugin-tanstack-start@1.3.17` builds, emitting one catch-all
function (`path: "/*"`, `preferStatic: true`), so URL preservation is not at risk
on that lane. **A branch-preview deploy was deliberately not attempted** — it is
an outward-facing action against a live site and was not authorised. Two
questions stay open, and both are really S4's:

1. Does the detached SSE producer survive a Netlify Function, which can be
   frozen once the response returns? This is the one place the Node result does
   not transfer, and it is exactly what `after()` exists to prevent.
2. Does Netlify's bundler handle the externalised `@prisma/*` tree?

Neither blocks Phase B (Docker-hosted). Both must close before any release.

---

## Phase B — the slice

Six routes, in the real repo, against real code, with a real PostgreSQL. The
Start tree lives at `apps/fresco/src/` and is built by `vite.config.ts`; the
Next.js app in `app/` is untouched as an app and still builds. Both trees share
`lib/`, `actions/`, `queries/`, `schemas/` and `components/`, which is what makes
the diff below a measurement rather than a rewrite.

| Route                                                                                                                          | Status                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `/signin` + session cookie + password sign-in, sign-out, route guards                                                          | **GREEN**                                                                         |
| `/dashboard/interviews` — `getInterviews` raw SQL, filter options, search-param state, the `@tanstack/react-table` client tree | **GREEN**                                                                         |
| A mutation visible immediately after it completes                                                                              | **GREEN**                                                                         |
| `/api/health` + `/api/[version]/interview`                                                                                     | **GREEN** — byte-identical to `main`                                              |
| `/api/export-interviews/batch`                                                                                                 | **GREEN** — real export streamed end to end                                       |
| Production build in the container shape, `no-referrer` applied                                                                 | **GREEN** — verified through the actual mirror lane, not a monorepo approximation |

**All six routes are green.** The two that remained after the first checkpoint
were completed by parallel subagents and re-verified together afterwards; the
combined result is what is reported below.

Passkey register and login are ported (`src/server/webauthn.ts`) and typecheck,
but were **not** driven end to end: that needs Chromium's virtual authenticator
over CDP, which the slice has no browser harness for. S2 covers the mechanism;
the UI path is unverified.

### Verification

An 18-assertion probe against the built `.output` server, asserting only on
rendered DOM (with `<script>` blocks stripped, so the hydration payload cannot
fake a pass), the user-visible URL, HTTP status, and database state read directly
through SQL — the brief's fixture rule. **18/18 pass.** It covers: wrong password
rejected and setting no cookie; correct password setting `auth_session` and
creating a `Session` row; unauthenticated `/dashboard/interviews` redirecting to
`/signin`; the authenticated page rendering the heading, the seeded participant
and the seeded protocol; signed-in `/signin` redirecting away; a delete mutation
changing the database and disappearing from the next render; an unauthenticated
mutation changing nothing; and sign-out deleting the row and invalidating the
cookie.

Separately, a contract diff runs the same requests against `main` (`next dev`)
and the slice (`.output`), normalising volatile fields:

```
MATCH   GET /api/health
MATCH   GET /api/v1/interview (no token)
MATCH   GET /api/v1/interview?perPage=2
MATCH   GET /api/v1/interview?status=completed
MATCH   GET /api/v1/interview?page=2&perPage=1
MATCH   GET /api/v99/interview (bad version)
API contract: IDENTICAL

Referrer-Policy, all MATCH:  /  /dashboard/interviews  /interview/abc
                             /onboard/xyz  /api/health
```

A third probe covers the export route, 14/14: 401 without a session with the
same envelope; 400 on unparseable JSON; 400 on a schema failure; 413 on an
oversized batch; 404 on an unknown interview id; `text/event-stream` with
`no-store` on a valid request; a terminal frame; an undrained buffer of zero.

**The export streams for real.** Against 300 interviews × 40 nodes: headers and
the first frame at 9 ms, 4,107 frames and 802 KB still arriving 500 ms later,
`complete` at 524 ms, nothing left in the buffer. Real GraphML and CSV content
came over the wire. So on a long-lived Node server the `after()` removal is a
genuine deletion, not a substitution — returning a `Response` wrapping a
`readable` streams through untouched, and the detached Effect fiber runs to
completion long after the handler returned.

**The container was verified through the real shipping lane.** Rather than
approximating, `scripts/mirror-app.mjs` was run to stage the standalone tree and
generate its lockfile, and the unmodified `Dockerfile` was built from _that_ —
so the install was `pnpm i --frozen-lockfile` against published npm dists of
`@codaco/*`, exactly as the mirror does. The image boots, applies all 14
migrations, and listens on 3000:

```
14 migrations found in prisma/migrations
Applying migration `0_init` … All migrations have been successfully applied.
Setting initializedAt to 2026-08-06T21:28:55.781Z.
Listening on http://[::]:3000

GET /api/health           -> 200  {"status":"healthy",…}
GET /signin               -> 200  <h2>Sign In To Fresco</h2>  (SSR'd)
GET /dashboard/interviews -> 307  location: /signin
GET /                     -> 307  location: /dashboard/interviews
/assets/index-*.css       -> 200  220522 bytes
/favicon.ico              -> 200  15086 bytes   (from public/, via .output/public)
```

`docker compose -f apps/fresco/docker-compose.prod.yml up` was run against the
real, unedited compose file (with a scratchpad-only `-f` override supplying the
local image, since the file pins a GHCR tag). All five services came up and the
app served identically.

**`PUBLIC_URL` is honoured at runtime, not baked at build.** Proven by starting
`node .output/server/index.mjs` directly with `PUBLIC_URL=not-a-url`: the server
listens, then the first request 500s from `@t3-oss/env-core` inside
`.output/server/chunks/_/env-*.mjs`. So `env.js` reads `process.env` at request
time from within the Nitro bundle. With a valid value the same route returns 200.

Standing checks, all clean with no rule suppressed beyond the one recorded
below: `pnpm typecheck`, `pnpm lint`, `pnpm knip`, and `pnpm --filter fresco
test` (373 tests, 46 files). Re-run over both subagents' combined work, plus an
expanded client-bundle leak gate (see finding 6).

### What the slice cost

`git diff --stat main...spike/fresco-tanstack-start`, excluding the lockfile and
these documents: **68 files changed, +3,600 / −1,048**.

|                                   | Files | +/−        | Character                                                            |
| --------------------------------- | ----- | ---------- | -------------------------------------------------------------------- |
| **New Start tree** (`src/`)       | 24    | +1,542     | Redesign, but shallow: routes, server functions, session, middleware |
| **Extracted cores** (`lib/`)      | 9     | +877 / −65 | Mechanical: framework-independent halves lifted out of `actions/`    |
| **Shared components**             | 5     | +526 / −5  | One-off: the view/binding split and two context seams                |
| **`actions/` rewired**            | 3     | +32 / −281 | Mechanical: bodies moved to `lib/`, call sites unchanged             |
| **`app/` (Next tree)**            | 14    | +98 / −426 | Mechanical: imports rerouted through shims                           |
| **`queries/` → cache decorators** | 2     | +23 / −269 | Mechanical: reads moved to `lib/`, `'use cache'` left behind         |
| **Config + tooling**              | 12    | +2,188     | Mostly generated (`routeTree.gen.ts`) plus vite/knip/lint config     |

Read against the assessment's estimate, the ratio matters more than the total:
**roughly 85% of the source diff is mechanical translation.** The genuinely new
thinking is concentrated in about six files — `src/start.ts`, `src/server/
middleware.ts`, `src/server/session.ts`, `src/server/queries/appSettings.ts`,
`components/interviews/InterviewActions.tsx` and `components/ui/nav.tsx` — and
each of those is a _pattern_ that the remaining routes reuse rather than
re-solve. The negative numbers are real too: `queries/` and `actions/` got
smaller because the split removed duplication that was there before.

The assessment's Phase 4 estimate of 25–40 engineer-days for the full port looks
plausible-to-generous on this evidence, **conditional on** the five findings
below being treated as known work rather than discovered again per route.

---

## Findings the assessment does not contain

Ordered by how quietly they fail.

### 1. Server code reaches the browser bundle, and only Import Protection catches it

Under Next, a `'use server'` import from a client component is a reference to an
RPC endpoint and the module body never enters the client bundle. **Under Vite it
is an ordinary import.** `InterviewsTable.tsx` imports `~/actions/interviews`;
`ExportProgressProvider.tsx` imports `commitInterviewExport`. The result was
Prisma, the app-settings tree, `posthog-node`, and a **4.9 MB Prisma WASM query
compiler** in `dist/client` — 8.5 MB of client assets, against 2.8 MB once fixed.

TanStack Start's Import Protection stopped the build, which is how it was found,
and it deserves credit for that. But its diagnostic names the _leaked_ module and
reports it as an "(entry)" with a one-line trace, not the client component that
pulled it in. Finding the actual edge took a hand-written import walker.

Three separate mechanisms leak, and each needs a different fix:

| Mechanism                                         | Why                                                                                                             | Fix                                                                                                                  |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Client component imports a `'use server'` module  | Plain import under Vite                                                                                         | An action-provider React context (`components/interviews/InterviewActions.tsx`) — one seam for the whole client tree |
| `createMiddleware` chain                          | Both environments hold the value, so its module graph is not split                                              | Import the server module _inside_ `.server()`                                                                        |
| `createServerFn` module's other top-level imports | The handler is split out; the rest of the module is not, and side-effectful server imports survive tree-shaking | Import inside the handler                                                                                            |

The second and third are the sharp ones. `lib/db` constructs a `PrismaClient` at
module scope, so the import is side-effectful and cannot be shaken out even when
the binding is unused. **This makes "`actions/` → `createServerFn` is
near-mechanical" only half true**: the translation is mechanical, but every
ported module also needs its server imports moved inside the handler, and
nothing warns you.

**Add a client-bundle assertion to CI before porting anything else.** A grep for
`PrismaClient` in `dist/client` is enough and would have caught all three.

### 2. Security headers are dropped on every redirect and every 404

`setResponseHeader` writes to the ambient h3 response. That survives a normal
200; a redirect (307) or a not-found is constructed as a _fresh_ `Response`, and
every header set before `next()` is silently discarded. Measured on the real app:
present on `/signin` and `/api/health`, absent on `/`, `/dashboard/interviews`
and any 404.

Next's `headers()` applies to every response regardless of status, so the naive
port **quietly weakens rule 6 exactly where it matters most**:
`/onboard/[protocolId]` is a route handler whose entire job is to redirect into
`/interview/[interviewId]`, carrying the participant access capability in the URL.
A green S3 spike does not catch this, because a minimal app has no redirects.

Fix: mutate `result.response.headers` _after_ `await next()`. Now matches `main`
on every path and status.

### 3. `setResponseHeaders`'s type and implementation disagree

Declared as taking `TypedHeaders<ResponseHeaderMap>` — a `Headers`-like object —
while its body does `Object.entries(headers)`. An actual `Headers` instance, the
only thing that satisfies the type, has no own enumerable entries, so it would
set **nothing, silently**. A plain record works but does not typecheck. Use the
singular form. (`start-server-core/src/request-response.ts:217`.)

### 4. `.output/server/index.mjs` needs a package the framework does not ship

`vite build` with only `tanstackStart()` emits `dist/server/server.js` — a
fetch-handler module with no listening server. The artefact the container
contract depends on comes from **`@tanstack/nitro-v2-vite-plugin`, a separate
package at 1.155.0 while the framework is at 1.168.38** — 13 minors of skew, on
Nitro v2 while `nitro` itself is at `3.0.260610-beta`.

Everything measured here works across that skew. But the assessment's risk #5
(framework churn) is worse than recorded: the branch rots against two
independently versioned packages, and the stale one is the one that makes the
image runnable.

**Mitigation worth taking before Phase D:** the framework's own
`dist/server/server.js` is a plain `{ fetch }` module, so a ~20-line `node:http`
wrapper removes the adapter from the container lane entirely.

### 5. A CommonJS dependency breaks SSR with a 200 response

Three client components do `import { unparse } from 'papaparse'`. Turbopack's
interop resolves it; Vite externalises CJS for SSR and Node's ESM loader then
rejects the named import. The throw happens _inside_ `renderToReadableStream`, so
**the page returns HTTP 200 with an empty body** — no error status, nothing in
the response. Only the server log shows it.

This is the bundler-portability hazard `apps/fresco/CLAUDE.md` documents, running
in the opposite direction: today's risk is Vite-only syntax breaking under
Turbopack; here it is CJS interop that Turbopack forgives and Vite does not.
Fixed with a default import. **Every CJS dependency in the client tree needs the
same audit**, and a smoke assertion that SSR responses are non-empty.

### 6. The client-bundle leak gate needs a marker per route, not four generic ones

The gate that caught finding 1 greps `dist/client` for `PrismaClient`,
`__NEXT_ERROR_CODE`, `posthog-node` and `auth_session`. **None of those would
have caught a leak of the export route**, whose distinguishing content is Effect
code and literal strings — and that route imports `~/lib/export/streamProtocol`,
which the _client_ `ExportProgressProvider` also imports, so a shared-module
mis-split was a live possibility. It was checked explicitly
(`Too many interviews in one batch` and `exportPipeline`, both absent from
`dist/client`) and Vite split it correctly.

The lesson generalises: **every ported route needs its own marker string in the
gate.** A generic gate that passes tells you only that the four things you
thought of are absent. The gate now in use covers seven markers.

### 7. The boot script's `prisma generate` costs ~210 MB of image

The final image is 551 MB: `.output` 68.7 MB, `/app/node_modules` 350.6 MB. The
runtime-deps tree dominates, and it is entirely pre-existing and
framework-agnostic — `@prisma` 169 MB (engines pulled in by the `prisma` CLI's
postinstall) plus `prisma` 41.9 MB, with `effect` 33.8 MB, `@electric-sql`
25.4 MB and `elkjs` 7.7 MB dragged in transitively by
`@codaco/protocol-validation`.

This confirms the "engine-free at runtime" result in an interesting way: **the
application bundle genuinely needs no Prisma engine, but the boot script still
pays for one.** Running `prisma migrate deploy` in a throwaway init step would
reclaim most of it. Out of scope here, but it is a real and newly-quantified
optimisation target that exists on `main` today.

### 8. A `binaryTargets` gap that predates this work

`lib/db/schema.prisma` lists `binaryTargets = ["native",
"linux-musl-arm64-openssl-3.0.x"]` — no `linux-musl-x64` entry. Everything here
was built and run on arm64. The app runtime is engine-free so this does not
affect serving, but the boot script's `prisma generate` would run on an
unlisted target if the GHCR image is built for amd64. Untested, unchanged,
flagged.

### Smaller, but real

- **Duplicate router copies break module augmentation.** `fresco` depended on
  `@tanstack/react-router@^1.168.38` (resolving 1.170.20) while
  `@tanstack/react-start` pinned 1.170.21. Two copies, so `declare module`
  landed on one and `createFileRoute` came from the other, and the `server:
{ handlers }` route option did not typecheck. **The app must pin its router to
  whatever Start pins.**
- **`Register` must be an `interface`.** TanStack Router declaration-merges it,
  and only interfaces merge. This conflicts with `apps/fresco/CLAUDE.md`'s
  "`type`, not `interface`" rule, and `oxlint --fix` rewrites it on every run,
  producing `TS2300: Duplicate identifier`. One targeted disable comment, noted
  in the file.
- **A server function with no client-reachable call site is omitted from the
  production server-fn manifest** and its `/_serverFn/…` endpoint 500s with
  "Server function info not found" — while working perfectly in dev. Cost a false
  S2 "RED" before it was spotted.
- **`nuqs/adapters/tanstack-router` works**, so the 19-import nuqs client tree
  ports unchanged. The assessment expected a move to `validateSearch`; the route
  instead uses an identity `validateSearch` (so the router round-trips nuqs's
  `iv_*` keys instead of stripping them) with `loaderDeps` deriving typed values
  from the same parsers via `nuqs/server`'s `createLoader`. One parser
  definition, shared by both trees. This is cheaper than the assessment assumed.
- **`env.js` is not the problem it looked like.** `client: {}` is empty and only
  one `'use client'` file imports `env` — in `(interview)`, which the slice
  excludes. The root layout reads `env.CI` in a server component and passes it as
  a prop; the Start equivalent does the same through a server function.
- **`createStart` and CSRF**: creating `src/start.ts` does opt out of the
  auto-installed CSRF middleware, as the assessment says, but it warns loudly
  with the exact fix rather than failing silently.

---

## Guardrails: what was nearly broken, and what was done instead

Per the brief, each of these is a first-class finding.

| Guardrail                                                     | What happened                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Rule 1 — never edit `packages/`**                           | **Not touched.** `@codaco/fresco-ui`, `@codaco/interview` and the rest compiled under Vite unmodified. The design system, forms, dialogs and Tailwind theme all work in the Start tree as-is. This is the assessment's strongest confirmed claim.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Rule 2 — no app tsconfig options**                          | **Not touched.** `apps/fresco/tsconfig.json` still extends `@codaco/tsconfig/web.json` verbatim; its `include` already covered `src/`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Rule 3 — no `as` without asking**                           | **None added.** One was nearly needed: `typedRoutes` narrows `next/link`'s `href` to a generated union, so a framework-agnostic `Link` shim cannot pass a plain `string`. Avoided with `href={{ pathname }}` (the `UrlObject` form). The parallel `router.push(href)` has no object form; the two shim hooks that needed it were unused, so they were deleted rather than asserted. **If a future route needs programmatic navigation through the shim, this becomes a real request for an assertion.**                                                                                                                                                                                                                                                                                         |
| **Rule 4 — never suppress a lint rule**                       | **Broken once, deliberately, and reported.** `nextjs/no-head-element` is disabled for `src/**` in `apps/fresco/.oxlintrc.json`. The `nextjs` plugin asserts Next invariants; `src/**` is not Next, where `<head>` in the root document is the framework's documented shape and `next/head` does not exist. It is still a rule turned off, and it exists **only because two frameworks share one lint config** — a completed migration deletes `app/**` and this override with it, but a _stalled_ one leaves the repo permanently unable to state one set of framework rules for one app. Also, in the other direction: the `zod`/`zod/mini` boundary was **tightened**, because `src/**` was not in its override list and adding a second tree would otherwise have silently dropped the rule. |
| **Rule 5 — preserve every URL**                               | **Held.** Verified by contract diff against `main`, including search-param names and the `v99` unknown-version 404.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Rule 6 — `no-referrer` on `/interview/*` and `/onboard/*`** | **Held, but only after finding 2.** The obvious implementation passes a spike and fails the real app.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Rule 7 — frozen container contract**                        | **Not touched.** No service added, no compose file changed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Rule 9 — do not weaken constraints to make progress**       | The only loosening is rule 4 above. Two `redirect({ href })` escape hatches exist in `src/server/queries/appSettings.ts` because `/expired` and `/setup` are real Fresco URLs not yet in the slice's typed route union; both revert to `to:` when `(blobs)` lands.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

---

## What replaced the server cache, and what it cost

**Option (i), no server cache** — decided by the user when the slice reached it.

Mechanically: `queries/interviews.ts` and `queries/protocols.ts` became thin
`'use cache'` decorators over new uncached modules in `lib/queries/`, and
`vite.config.ts` aliases `~/queries/*` straight to those for the Start build.
Splitting rather than duplicating keeps one copy of the raw SQL, which is where
this code's real complexity lives. `queries/appSettings.ts` could not be split
the same way — its guards call `redirect()` — so it has a full replacement in
`src/server/queries/appSettings.ts`, also swapped by alias.

**What it cost, concretely:**

- **`safeUpdateTag` disappears.** Under (i) there is nothing to invalidate.
  Read-your-own-writes becomes `router.invalidate()`, supplied through the
  action-provider context as a `refresh()` capability. Verified: an interview
  deleted through the mutation is absent from the very next render.
- **Every dashboard render is a full query.** `getInterviews` runs its raw SQL
  and its count query on every request. On the seeded dataset this is
  imperceptible, which proves nothing.
- **The cost is unmeasured, and that is the finding.** The assessment's Phase 1
  (indexes plus a real `load-test.js`) was never done — `apps/fresco/
package.json:16` still references a file that does not exist. So option (i)
  was chosen without a baseline, exactly as the assessment warned. Its supporting
  argument is sound (single-tenant, `searchParams`-keyed cache with a low hit
  rate, 57 invalidation sites, the hottest read already uncached), but it remains
  an argument rather than a number.

**Recommendation: do Phase 1 before Phase C.** It is 2–4 days, it is worth doing
whatever happens to this migration, and it converts the one decision with no
default into a decision with evidence. The indexes it adds —
`Interview(lastUpdated DESC)`, `Events(timestamp)`, `pg_trgm` on the two
leading-wildcard `ILIKE` scans — benefit `main` today.

---

## Where the assessment was right

Worth stating, because most of it was.

- `packages/` needed no changes. `@codaco/interview` needs no new entrypoint.
- `actions/` → `createServerFn` really is near-mechanical, modulo finding 1.
- Router loaders are isomorphic; every Prisma read had to be rewrapped in a
  server function called _from_ a loader. Pervasive, exactly as described.
- `requireApiAuth()` × ~60 → one `authed` middleware is structurally better and
  removes ~60 chances to forget.
- The URL and container contracts survive.
- Most dashboard pages really are `auth-gate → promise → <Suspense>`, and they
  really do map onto `beforeLoad` + `loader`.
- The 45 Prisma-mocked vitest files really are the cheapest signal on the branch;
  they caught the one behaviour change in the shared tree immediately.

---

## Remaining before a Phase C decision

1. **Passkeys end to end** — needs Chromium's virtual authenticator over CDP.
   This is where risk #1 lived, so it should be closed before Phase C, not
   after. S2 proves the cookie mechanism; the UI path is unexercised.
2. **Netlify** — S7's two open questions, plus the concrete work the container
   agent scoped: `publish = ".output/public"`, a Nitro **`netlify`** preset
   instead of the hardcoded `node-server` in `vite.config.ts` (so the preset
   needs to key off the platform, e.g. `NITRO_PRESET`), and suppressing the
   implicit `@netlify/plugin-nextjs`. `netlify.toml` was deliberately left
   unchanged: Netlify still deploys the Next app, and flipping it now would
   break the preview lane.
3. **Whether the export route survives a frozen serverless invocation.** This is
   the one place the Node streaming result does not transfer, and it is exactly
   what `after()` existed to prevent.
4. **Whether the abort listener interrupts the Effect fiber.** The server
   survives a client disconnect and logs nothing, but a fiber running to
   completion into a detached stream is externally indistinguishable from a
   cancelled one.
5. **Phase 1** — the baseline that cache option (i) should have been decided
   against. Still the largest unmeasured thing in this whole exercise.
6. **amd64** — see finding 8.

## What is deliberately not done

The `(interview)` participant surface, the setup wizard, participants,
protocols, settings, uploadthing and Storybook are all excluded by the brief —
volume rather than uncertainty. `(interview)` in particular is last for a
reason: a lost in-flight interview network is unrecoverable research data.
