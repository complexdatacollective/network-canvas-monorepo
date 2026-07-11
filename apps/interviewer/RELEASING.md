# Releasing Network Canvas Interviewer

> **Web-only, offline-first PWA.** Network Canvas Interviewer ships as a `vite-plugin-pwa`
> progressive web app — the Electron desktop build and Capacitor tablet build
> have been retired. There is no installer, no code signing, and no
> auto-updater feed; the app updates by the browser fetching a new service
> worker, same mechanism as Architect (another `vite-plugin-pwa` app in
> this monorepo).

## Versioned beta releases (changeset-driven)

Network Canvas Interviewer is on a `8.0.0-beta.N` line. It is `private` and in the changeset
`ignore` list, so the library `changeset version` never touches it — a dedicated
lane handles it instead. The base `8.0.0` is fixed (change it with a manual
`package.json` edit, e.g. to graduate out of beta); a changeset's `major`/
`minor`/`patch` type only categorises the release notes, it does not move the
base while in beta.

1. **Author a changeset.** Run `pnpm changeset` and select
   `@codaco/interviewer` (see the `creating-a-changeset` skill). Never mix an
   app and a library in one changeset — CI (`pnpm check:changesets`) rejects it.
2. **The "Release apps (beta)" PR.** On every push to `main`, the
   `apps-release-pr` job increments `-beta.N`, updates `CHANGELOG.md`, deletes the
   consumed changesets, and opens/updates a summary PR. This PR is the release
   gate; it is torn down automatically when no app changesets are pending.
3. **Merge to release.** Merging the PR bumps `package.json` on `main`; the
   `apps-release-detect` job sees the version change and `apps-release-interviewer`
   builds, deploys to Netlify **production**, and creates the prerelease GitHub release
   `@codaco/interviewer@<version>` with the CHANGELOG notes.

Pull requests still get a preview deploy (`deploy-interviewer-preview`),
aliased `pr-<number>` and posted as a comment. Production is no longer deployed
on every push to `main` — only on a Release apps PR merge.

## Developer site

The separate `.dev` Netlify site is intentionally linked to this repository and
deploys every push to `main`. It lets developers review the current state of
`main` before approving an app release; it is independent of the changeset-driven
production release above.

Netlify uses `apps/interviewer` as the package directory and keeps the repository
root as the build base. Its versioned build settings live in `netlify.toml` in
this directory. The developer build uses the same dependency build and
`build:web` PWA assertion as CI. It also gives Node a larger heap because
`@codaco/interview` declaration bundling can exceed Node's default heap during a
clean build.

## How CI builds

```bash
pnpm exec turbo run build --filter=@codaco/interviewer^...   # workspace deps
pnpm --filter=@codaco/interviewer build:web                   # vite build + PWA assertion
```

`build:web` (not the plain `build` script) is what CI runs — it chains
`scripts/assert-pwa-build.mjs`, which fails the build if the service worker,
manifest, or icons are missing from `dist/`, or if a critical JS chunk (the
interview engine, mapbox-gl, the entry point) got silently dropped from the
workbox precache manifest. A deploy that passes this assertion is one that
will actually boot offline; treat an assertion failure as a hard release
blocker, not a warning to route around.

## Manual setup required (one-time)

CI deploys to a Netlify **site that must already exist** — netlify-cli can't
create one. Before the preview and production deploys will work:

1. Create a new Netlify site for Network Canvas Interviewer (Netlify dashboard or
   `netlify sites:create`). Don't point it at a repo for auto-build; CI
   supplies the build.
2. Note its Site ID (Site settings → General → Site details).
3. Add it as the repo secret `NETLIFY_SITE_ID_INTERVIEWER`. The
   `NETLIFY_AUTH_TOKEN` secret is already shared across all Netlify deploys in
   this repo (docs, architect, networkcanvas.com) — no new token needed.
4. If Network Canvas Interviewer needs its own custom domain, configure it in the
   Netlify site's domain settings; nothing in CI needs to change for that.

Until the secret is set, `deploy-interviewer-preview` and the
`apps-release-interviewer` production deploy will fail at the `netlify-cli deploy`
step with a `site not found` style error — the rest of CI (quality gate,
typecheck, tests) is unaffected.

## Service worker update propagation

The service worker (`registerType: 'prompt'`, see `vite.config.ts`) does not
self-apply on every visit. `AppUpdateProvider` (`src/components/AppUpdate/AppUpdateProvider.tsx`)
polls for a new version hourly and on load, driving the shared `@codaco/fresco-ui`
update indicator (`AppUpdatePill`, rendered in `StatusRow`):

- A pending update present at (or detected shortly after) a fresh load, while
  no interview is in progress, is applied automatically — a reload lands the
  researcher on the newest version, and the version indicator then shows a
  "was updated" state with the changelog.
- An update the hourly poll surfaces later in a long-lived session, or one that
  arrives while an interview is in progress, is not reloaded under the
  researcher — it surfaces on the version indicator as an "update available"
  control that opens a dialog with the release changelog and an **Install and
  reload** action.
- While an interview is in progress (`/interview/*`), auto-apply is withheld —
  the update is held until the researcher returns to the dashboard, so a reload
  never interrupts data collection.

Because of this, a production deploy is not instantaneous for already-open
tabs: a researcher mid-session on the previous build keeps running it until
they leave the interview and either the auto-apply or the "update available"
control catches up. There is no forced-update mechanism and none should be
added — see the interview-active guard above.

## What used to be here

Earlier alpha builds shipped an Electron desktop app (macOS/Windows/Linux,
SQLCipher-encrypted storage, `electron-updater` auto-update) and a Capacitor
tablet build (iPadOS/Android). Both were retired when interviewer moved to
the web-only offline-first PWA architecture (see
`docs/superpowers/specs/2026-07-01-interviewer-v8-pwa-design.md`). If you're
looking for the old signed-installer / GitHub-Releases / auto-updater-feed
release process, it no longer applies — this file now describes the only
release path.
