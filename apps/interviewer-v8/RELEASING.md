# Releasing Interviewer v8

> **Web-only, offline-first PWA.** interviewer-v8 ships as a `vite-plugin-pwa`
> progressive web app — the Electron desktop build and Capacitor tablet build
> have been retired. There is no installer, no code signing, and no
> auto-updater feed; the app updates by the browser fetching a new service
> worker, same mechanism as architect-web (another `vite-plugin-pwa` app in
> this monorepo).

## Deploys are continuous, not versioned

There is no release step and no version bump to make — every push to `main`
that touches `apps/interviewer-v8` (or a workspace dependency it builds from,
e.g. `@codaco/interview`, `@codaco/fresco-ui`) deploys straight to production.
Every pull request that touches it gets a PR preview deploy, aliased
`pr-<number>`, posted as a comment on the PR.

Both are handled by [`.github/workflows/ci-and-release.yml`](../../.github/workflows/ci-and-release.yml):

- **`deploy-interviewer-v8-preview`** — runs on `pull_request`, gated on the
  `detect` job's `interviewer_v8` flag. Doesn't wait on `quality` to pass
  (so a broken lint/typecheck doesn't block seeing the preview), but does
  wait on the `quality` job to finish so it can reuse the turbo cache slot.
- **`deploy-interviewer-v8-prod`** — runs on push to `main`, gated on the same
  flag plus `quality` succeeding and the fresco-ui/interview Chromatic +
  interview e2e jobs not failing (interviewer-v8 depends on both packages).

Both jobs build the same way:

```bash
pnpm exec turbo run build --filter=@codaco/interviewer-v8^...   # workspace deps
pnpm --filter=@codaco/interviewer-v8 build:web                   # vite build + PWA assertion
```

`build:web` (not the plain `build` script) is what CI runs — it chains
`scripts/assert-pwa-build.mjs`, which fails the build if the service worker,
manifest, or icons are missing from `dist/`, or if a critical JS chunk (the
interview engine, mapbox-gl, the entry point) got silently dropped from the
workbox precache manifest. A deploy that passes this assertion is one that
will actually boot offline; treat an assertion failure as a hard release
blocker, not a warning to route around.

The built `apps/interviewer-v8/dist` is pushed with `netlify-cli`, same
pattern as architect-web's deploy steps in the same workflow.

## Manual setup required (one-time)

CI deploys to a Netlify **site that must already exist** — netlify-cli can't
create one. Before the deploy jobs above will work:

1. Create a new Netlify site for interviewer-v8 (Netlify dashboard or
   `netlify sites:create`). Don't point it at a repo for auto-build; CI
   supplies the build.
2. Note its Site ID (Site settings → General → Site details).
3. Add it as the repo secret `NETLIFY_SITE_ID_INTERVIEWER_V8`. The
   `NETLIFY_AUTH_TOKEN` secret is already shared across all Netlify deploys in
   this repo (docs, architect-web, networkcanvas.com) — no new token needed.
4. If interviewer-v8 needs its own custom domain, configure it in the
   Netlify site's domain settings; nothing in CI needs to change for that.

Until the secret is set, `deploy-interviewer-v8-preview`/`-prod` will fail at
the `netlify-cli deploy` step with a "site not found" style error — the rest
of CI (quality gate, typecheck, tests) is unaffected.

## Service worker update propagation

The service worker (`registerType: 'prompt'`, see `vite.config.ts`) does not
self-apply on every visit. `PwaUpdateBanner` (`src/components/PwaUpdateBanner.tsx`)
polls for a new version hourly and on load:

- If the pending update was already available when the tab was opened (within
  a ~20s window of load), it's applied silently — the researcher never sees a
  prompt for a version they never ran.
- If it arrives later, during an open session, a "new version available"
  banner offers a **Reload**.
- While an interview is in progress (`/interview/*`), neither path fires — the
  update is held until the researcher returns to the dashboard, so a reload
  never interrupts data collection.

Because of this, a production deploy is not instantaneous for already-open
tabs: a researcher mid-session on the previous build keeps running it until
they leave the interview and either the silent-apply or banner path catches
up. There is no forced-update mechanism and none should be added — see the
interview-active guard above.

## What used to be here

Earlier alpha builds shipped an Electron desktop app (macOS/Windows/Linux,
SQLCipher-encrypted storage, `electron-updater` auto-update) and a Capacitor
tablet build (iPadOS/Android). Both were retired when interviewer-v8 moved to
the web-only offline-first PWA architecture (see
`docs/superpowers/specs/2026-07-01-interviewer-v8-pwa-design.md`). If you're
looking for the old signed-installer / GitHub-Releases / auto-updater-feed
release process, it no longer applies — this file now describes the only
release path.
