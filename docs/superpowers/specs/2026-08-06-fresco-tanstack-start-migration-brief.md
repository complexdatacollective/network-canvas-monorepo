# Fresco → TanStack Start: one-shot migration brief

**Date:** 2026-08-06
**Status:** Implementation brief — feasibility-gated. Executed; see
`2026-08-06-fresco-tanstack-start-findings.md` for results.
**Companion:** the 2026-08-06 feasibility assessment (rationale, risk register,
evidence) is not retained. References to it below are historical; the findings
document restates the parts that still matter. Read
`apps/fresco/CLAUDE.md` before starting.

## What this is

A single-branch port of `apps/fresco` from Next.js 16 (App Router,
`cacheComponents`, Turbopack) to TanStack Start, executed as one continuous
task rather than a sequence of shippable increments — because there are no
release seams: one image, one origin, one server, one mirrored tree.

It is **feasibility-gated**. The early phases exist to end the project cheaply
if it cannot work. Reaching a stop condition and reporting it is a **successful
outcome**, not a failure. Do not route around one.

The assessment's standing recommendation is _do not migrate now_. This brief
exists because the decision was taken to test that conclusion by building. Treat
the assessment's risk register as the list of things you are trying to find out,
not as obstacles to argue with.

## Hard rules

Violating any of these invalidates the result. If a task appears to require one,
**stop and report** rather than proceeding.

| #   | Rule                                                                                                                                                                                                   | Why                                                                                                                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Never edit anything under `packages/`.**                                                                                                                                                             | Blast radius: Architect, Interviewer, and three Playwright suites. A blocker that seems to require a package change is a stop-and-report finding — see Stop conditions. `@codaco/interview` already exports raw `src/` and works under Vite in two apps; it needs no new entrypoint. |
| 2   | **Never add app-specific `tsconfig` compiler options.** `apps/fresco/tsconfig.json` extends `@codaco/tsconfig/web.json` and must keep doing so.                                                        | `apps/fresco/CLAUDE.md`. `scripts/mirror-app.mjs` also asserts on the literal string `"@codaco/tsconfig/web.json"` and will throw if it changes.                                                                                                                                     |
| 3   | **Never use `any`. Never add a type assertion (`as`) without asking.**                                                                                                                                 | Repo standard. A port that only typechecks with assertions is a finding — record it.                                                                                                                                                                                                 |
| 4   | **Never disable or suppress a lint rule**, including the `zod`/`zod/mini` boundary and `no-process-env`.                                                                                               | These encode "is this tree client-reachable?", which is exactly the question the new framework answers differently. Needing to suppress one is signal, not noise.                                                                                                                    |
| 5   | **Preserve every URL exactly** (inventory below), including search-param names.                                                                                                                        | `/api/[version]/*` is scripted by researchers (`apps/fresco/docs/example-api-query.{R,py}`); interview and onboard URLs are handed to participants.                                                                                                                                  |
| 6   | **Preserve `Referrer-Policy: no-referrer` on `/interview/*` and `/onboard/*`.**                                                                                                                        | Deliberate privacy control: the interview ID in those URLs _is_ the unauthenticated participant access capability. See `apps/fresco/next.config.ts`.                                                                                                                                 |
| 7   | **The container contract is frozen**: one image, listens on `PORT=3000`, honours `PUBLIC_URL`, runs migrations at boot. **Do not add a service** to any `docker-compose.*.yml` — no Redis, no sidecar. | Self-hosters run these files. It is a compatibility surface.                                                                                                                                                                                                                         |
| 8   | **Work on a branch off `main`. Never commit to `main`.**                                                                                                                                               | Standard, and the branch is the artifact — see Reporting.                                                                                                                                                                                                                            |
| 9   | **Do not weaken the repo's constraints to make progress.** If the port only passes by loosening rules 2–4, that _is_ the finding.                                                                      | The repo's guardrails are the measurement instrument.                                                                                                                                                                                                                                |

## Stop conditions

Stop, write up what you found, and hand back. Do not continue past these.

1. **Spike S2 fails** — a delete-then-set of two cookies with different
   `sameSite` values in one server function does not produce both `Set-Cookie`
   headers (TanStack Router #5464). This breaks passkey auth silently.
2. **Spike S1 fails** — Prisma with `@prisma/adapter-pg` cannot be bundled, or
   the built `.output` server will not run under `node:lts-alpine`.
3. **Spike S3 fails** and no Nitro `routeRules` workaround exists — path-scoped
   response headers cannot be set, so rule 6 cannot be met.
4. **Any blocker that appears to require editing `packages/`.**
5. **Any blocker that appears to require a new runtime service** or a change to
   the container contract.
6. **The slice checkpoint (Phase B) cannot be reached** within its timebox.

## Decisions that are not yours

Escalate; do not choose. Continue on other work while waiting where possible.

- **The server-cache replacement** (Phase C, step 5). Three options are laid out
  in the assessment; the choice depends on a performance threshold that has not
  been set.
- **Dropping image optimisation.** 9 `next/image` sites. Plain `<img>` is the
  likely answer but it is a product regression.
- **Any URL change**, including search-param names.
- **Any type assertion** you believe is unavoidable.
- **Removing a feature to make the port work.** Report it as a finding instead.

## Phase A — Scratch spikes · 2–3 days · kill points

Build these in a scratch directory **outside the monorepo** so they cannot
contaminate it. Minimal apps, no Fresco code. Record a yes/no plus evidence for
each.

| Spike  | Question                                                            | Reproduce                                                                                                                                                                                                                                                    |
| ------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **S2** | Do two cookies with different attributes both survive one response? | `deleteCookie('challenge')` (set with `sameSite: 'strict'`) then `setCookie('auth_session', …, { sameSite: 'lax' })` in a single server function. This mirrors `apps/fresco/actions/webauthn.ts:209→271` and `:368→417`.                                     |
| **S1** | Does Prisma bundle, and does the output run in the container shape? | `prisma-client` ESM generator + `@prisma/adapter-pg` → `vite build` → `node .output/server/index.mjs` inside `node:lts-alpine`, with `prisma migrate deploy` at boot.                                                                                        |
| **S3** | Can response headers be scoped by path?                             | `Referrer-Policy: no-referrer` on `/interview/*` and `/onboard/*` only, with a different default elsewhere. Note that `setResponseHeaders` (plural) is a known open bug (#5407); the singular form reportedly works. Try Nitro `routeRules` as the fallback. |
| **S4** | Can a streaming response outlive its handler?                       | A `TransformStream` SSE response whose producer settles after the response headers are sent — the shape of `apps/fresco/app/api/export-interviews/batch/route.ts`, which uses `after()` for this today. Test on a Node server **and** on Netlify.            |
| **S7** | Does the Netlify path survive?                                      | `@netlify/vite-plugin-tanstack-start`, a branch preview, and the build-time-vs-boot-time migration question. Netlify is a product commitment, not a convenience.                                                                                             |

**Exit:** S1, S2, S3 green. S4 and S7 may be amber with a documented workaround.

## Phase B — The slice · 2–3 weeks · in place, on the branch

Port **six routes only**, in the real repo, against real code. This is the
feasibility measurement. Do not broaden it.

| Route                                                                                                                                              | Risk it retires                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `/signin` + session cookie + one passkey register and login                                                                                        | #5464 in situ; `lib/auth/session.ts`, `lib/auth/guards.ts`     |
| `/dashboard/interviews` — `getInterviews` (raw SQL, server-paginated), filter options, search-param state, the `@tanstack/react-table` client tree | The cache model; isomorphic loaders; `nuqs` → `validateSearch` |
| One mutation that must be visible immediately after it completes                                                                                   | Read-your-own-writes without a server cache                    |
| `/api/health` + `/api/[version]/interview`                                                                                                         | Exact URL preservation; the researcher-facing contract         |
| `/api/export-interviews/batch`                                                                                                                     | SSE + the Effect pipeline + the `after()` replacement          |
| A production build in the container shape, with the `no-referrer` rule applied                                                                     | `.output`, Prisma, Dockerfile `runner` stage                   |

**Deliberately excluded:** the setup wizard, participants, protocols, settings,
uploadthing, Storybook, and the entire `(interview)` surface. Volume, not
uncertainty — and `(interview)` carries the least feasibility risk in the app
(it is a client-side `<Shell>` mount from a package that already runs under Vite
in two apps) while carrying the most blast radius if it breaks.

**Write throwaway Playwright assertions as you go.** They seed the real suite
later. One rule, from day one: **assert only on rendered DOM (role + accessible
name), the user-visible URL, and database state read directly through Prisma.
Never on network shape** — Next Server Actions POST to the current URL with a
`Next-Action` header and reply with an RSC flight stream; Start server functions
POST to `/_serverFn/…` with JSON, so any `waitForResponse` assertion dies at the
moment of migration and silently stops proving anything.

**Exit checkpoint — all of:**

- `pnpm typecheck`, `pnpm lint`, `pnpm knip` clean, with no rule suppressions.
- The six routes work against real Postgres and MinIO.
- `docker compose -f apps/fresco/docker-compose.prod.yml up` serves the slice on
  `:3000`, honours `PUBLIC_URL`, and migrates on boot.
- `curl` of `/api/health` and `/api/[version]/interview` returns the same shape
  as `main`.
- A recorded answer to: **what replaced the server cache, and what did it cost?**

Stop here and report before starting Phase C.

## Phase C — Full port · continues on the same branch

Order matters. Two of these are deliberately counter-intuitive.

1. **Router skeleton + layouts.** Route groups `(blobs)` → `(blobs)`,
   `(interview)` → `(interview)`; `[id]` → `$id`. → _`/` redirects to
   `/dashboard`; typecheck green._
2. **Auth and session** — the foundation everything depends on. ~50 lines of
   `cookies()` + Prisma in `lib/auth/`. → _sign in, sign out, passkey register,
   passkey login._
3. **`app/api/*` → server routes**, exact URLs. 13 handlers, mostly standard
   `Request`/`Response` already. → _contract tests; `docs/example-api-query.{R,py}`
   still work._
4. **`actions/` → `createServerFn`.** 14 files, 58 functions. Near-mechanical:
   `'use server'` → `createServerFn({ method: 'POST' })`, `requireApiAuth()` →
   `.middleware([authed])`, same `{ error, data }` return. → _**the 45 vitest
   files mock Prisma and are framework-agnostic: run them, they are the cheapest
   signal on the branch.**_
5. **`queries/` and the cache replacement.** 10 `'use cache'` functions, 10
   `safeCacheTag` / 57 `safeUpdateTag` / 6 `safeRevalidateTag` sites. **Do
   `actions/` before this, not after** — actions are high-volume and
   low-uncertainty; queries cannot be ported at all, only replaced. This step
   needs the escalated decision. → _dashboard data correct; one deliberate
   cross-context staleness test._
6. **Dashboard pages → loaders.** Most are already
   `auth-gate → start promise → <Suspense>`, which maps onto `beforeLoad` +
   `loader` + `<Await>`.
7. **Setup wizard and `(blobs)`.**
8. **`(interview)` — last.** A lost in-flight interview network is unrecoverable
   research data. "Small, so do it first" is the wrong heuristic when blast
   radius is asymmetric.

## Phase D — Release path

- **`apps/fresco/Dockerfile`**, `runner` stage: `.next/standalone` → `.output`;
  drop the `.next/static` copy; `node server.js` → `node .output/server/index.mjs`.
  Everything else in that stage (the Prisma runtime overlay, `migrate-and-start.sh`,
  the non-root user, corepack) is framework-agnostic — leave it.
- **`apps/fresco/netlify.toml`**: `publish = ".next"` and the implicit Next
  Runtime plugin both go.
- **`scripts/mirror-app.mjs`**: `vendorSharedTsconfig` asserts on
  `"@codaco/tsconfig/web.json"`; `FRESCO_WORKSPACE_YAML`'s `allowBuilds` map
  needs entries for any new native dependency. Add `e2e/` to
  `APP_MIRROR_OVERRIDES.fresco.extraExcludes` if a suite directory now exists.
  **Do not change the script's core logic** — it is framework-agnostic and
  already correct.
- **`apps/fresco/package.json`**: remove `next typegen` from `postinstall`;
  update `build`, `build:branch-preview`, `build:platform`, `start`.
- Verify: `MIRROR_DRY_RUN=true node scripts/mirror-app.mjs --app apps/fresco …`
  produces a tree that builds.

## URL inventory — all of these must be preserved exactly

**Pages:** `/`, `/setup`, `/signin`, `/expired`, `/dashboard`,
`/dashboard/interviews`, `/dashboard/participants`, `/dashboard/protocols`,
`/dashboard/settings`, `/interview/[interviewId]`, `/interview/finished`,
`/onboard/error`, `/onboard/no-anonymous-recruitment`

**Route handlers:** `/reset`, `/interview/[interviewId]/sync`,
`/onboard/[protocolId]`, `/api/[version]/interview`,
`/api/[version]/interview/[interviewId]`, `/api/[version]/protocols-meta`,
`/api/assets/[key]`, `/api/export-interviews/batch`,
`/api/generate-test-interviews`, `/api/health`,
`/api/interviews/[interviewId]/finish`, `/api/storage/presign`,
`/api/uploadthing`

**Search params that are contract, not implementation:** `/setup?step=N`,
`/interview/[interviewId]?step=N`,
`/onboard/[protocolId]?participantIdentifier=…`

## Surface mapping

| Fresco                                                                         | TanStack Start                                                              | Notes                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `'use server'` in `actions/`                                                   | `createServerFn().validator().middleware().handler()`                       | Same `{ error, data }` return. Fresco calls these as imperative RPC (0 `useActionState`, 3 `<form action=>`), so the call sites barely change. **There is no `<form action={fn}>` equivalent** — the 3 sites need rewriting. |
| `requireApiAuth()` repeated ~60×                                               | one `authed` middleware                                                     | Structurally better; do not skip it.                                                                                                                                                                                         |
| `'use cache'` + `safeCacheTag` / `safeUpdateTag`                               | **nothing**                                                                 | No server cache primitive exists. Escalated decision, step 5.                                                                                                                                                                |
| async server component doing Prisma                                            | `createServerFn` called _from_ a loader                                     | Router loaders are **isomorphic** — Prisma cannot be called in one.                                                                                                                                                          |
| `app/api/x/route.ts` exporting `GET`/`POST`                                    | `createFileRoute('/api/x')({ server: { handlers } })`                       | Standard `Request`/`Response`. One handler file per route — watch for collisions.                                                                                                                                            |
| `cookies()` from `next/headers`                                                | `getCookie`/`setCookie` from `@tanstack/react-start/server`                 | Synchronous. Not callable from an isomorphic loader — go via a server function.                                                                                                                                              |
| `after()` (11–12 sites, mostly PostHog flush)                                  | no equivalent                                                               | Fire-and-forget is fine on the Node server. The export route is the hard one.                                                                                                                                                |
| `next.config.ts` `headers()`                                                   | `requestMiddleware` + `setResponseHeader` (singular), or Nitro `routeRules` | Rule 6. Plural form is broken (#5407).                                                                                                                                                                                       |
| `nuqs` (19 imports, **one** adapter mount in `components/Providers/index.tsx`) | `validateSearch`                                                            | The 3 `createSearchParamsCache` uses are RSC-bound and must go.                                                                                                                                                              |
| `next/image` (9 sites)                                                         | plain `<img>`, pending escalation                                           | No component, no server resizer.                                                                                                                                                                                             |
| `next/navigation`, `next/link`                                                 | TanStack Router equivalents                                                 | Consider a `~/lib/router` shim first — it collapses ~33 files to ~5.                                                                                                                                                         |
| `@t3-oss/env-nextjs` in `env.js`                                               | `@t3-oss/env-core`                                                          | `process.env` (server) and `import.meta.env.VITE_*` (client) are different objects. Do not read env at module scope — it risks inlining secrets into the client bundle.                                                      |
| `import 'server-only'` (21 sites)                                              | `@tanstack/react-start/server-only` or `*.server.*` naming                  | Import Protection is on by default but marked experimental, with prior leakage regressions. Audit the client bundle.                                                                                                         |
| `uploadthing/next` `createRouteHandler`                                        | `uploadthing/server` `createRouteHandler`                                   | The published TanStack guide references removed APIs at a version 73 minors stale. Ignore it; use the generic entry point.                                                                                                   |
| `@storybook/nextjs-vite` + `stubUseServer` plugin                              | `@storybook/react-vite`                                                     | The stub plugin becomes unnecessary. Lowest-risk item.                                                                                                                                                                       |
| `@posthog/nextjs-config`                                                       | `@posthog/rollup-plugin`                                                    | Clean 1:1.                                                                                                                                                                                                                   |

## Standing checks

Run after every meaningful step, not at the end:

```bash
pnpm typecheck
pnpm lint
pnpm knip
pnpm --filter fresco test    # 45 files, Prisma mocked, framework-agnostic
```

A stale `tsconfig.tsbuildinfo` produces phantom type errors — delete it before
trusting a confusing `tsc` result.

## Reporting

The branch is the artifact. When you stop — at a stop condition, at the Phase B
checkpoint, or at completion — produce:

1. **`git diff --stat main...<branch>`**, and a breakdown of how much of the diff
   was mechanical translation versus redesign. This is the headline number: it
   is what turns the assessment's 56–89 engineer-day estimate into evidence.
2. **Answers to the spike questions**, with the evidence.
3. **Every guardrail you came close to breaking**, and what you did instead. A
   place where the only way forward was a `packages/` edit, an `as`, a
   suppressed lint rule, or a loosened tsconfig is a first-class finding.
4. **What the server cache was replaced with, and what it cost.**
5. **Anything the assessment got wrong.** It was written from static analysis;
   you are the first thing to actually run it.

Delete the branch once the findings are recorded, unless the decision is taken
to ship it. It rots against TanStack Start's release cadence — 12 releases in
the 24 days before this was written — not against `main`, which has seen 9
commits to `apps/fresco` in its entire monorepo history.
