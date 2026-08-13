# Releasing Network Canvas Interviewer

> **Web-only, offline-first PWA.** Network Canvas Interviewer ships as a `vite-plugin-pwa`
> progressive web app — the Electron desktop build and Capacitor tablet build
> have been retired. There is no installer, no code signing, and no
> auto-updater feed; the app updates by the browser fetching a new service
> worker, same mechanism as Architect (another `vite-plugin-pwa` app in
> this monorepo).

## Stable releases (changeset-driven)

Network Canvas Interviewer is a private package in the normal Changesets lane.
It uses standard semantic versioning: the `major`/`minor`/`patch` selected in a
changeset controls the next version, and the normal generated **Version
Packages** PR updates its `package.json` and `CHANGELOG.md` alongside any
affected libraries or Architect.

1. **Author a changeset.** Run `pnpm changeset` and select
   `@codaco/interviewer` (see the `creating-a-changeset` skill). The same
   changeset may also name `@codaco/architect` and/or library packages because
   they share the normal release lane. Select no Documentation or Website
   package in that file—CI (`pnpm check:changesets`) rejects cross-lane
   changesets.
2. **The "Version Packages" PR.** On every push to `main`,
   `changesets/action` runs the repository's `pnpm version-packages` command,
   applies the requested semver bumps, updates changelogs, consumes the
   changesets, and opens or updates `changeset-release/main`.
3. **Merge to release.** Merging the PR bumps `package.json` on `main`; the
   `apps-release-detect` job sees the version change and
   `apps-release-interviewer` builds, deploys to Netlify **production**, and
   creates the stable GitHub release `@codaco/interviewer@<version>` with the
   CHANGELOG notes.

Netlify's Git integration builds pull-request previews and reports their URLs
directly on the PR. Production is no longer deployed on every push to `main`—it
is deployed only when the Version Packages PR containing an Interviewer version
bump merges.

## Hotfix releases (when main is ahead)

The changeset lane always builds main, so it can only ship a patch together
with everything else merged since the last release. When main carries work that
is not ready to go out, release from the previous tag instead:

1. Cut the branch from the released tag and cherry-pick the fix:

   ```bash
   git switch -c hotfix/interviewer-8.1.3 '@codaco/interviewer@8.1.2'
   git cherry-pick <sha>
   ```

   Land the same fix on main through the usual pull request as well — the
   hotfix branch is a delivery vehicle, not the source of truth.

2. Bump `apps/interviewer/package.json` to the hotfix version and add the
   matching `## <version>` section to `CHANGELOG.md`; `scripts/release-notes.mjs`
   reads that section for the GitHub release. Do **not** run
   `changeset version` on the branch — it would consume changesets that belong
   to main's next release.
3. Push the branch, then run the **Hotfix Release** workflow **from main**,
   with `app: interviewer` and `source_ref` set to the hotfix branch. It runs
   typecheck and tests across the app's whole workspace dependency closure,
   builds with PostHog source maps, deploys to Netlify production, and cuts
   `@codaco/interviewer@<version>`.

   The lane only ships the newest line: `.github/scripts/resolve-hotfix-release.mjs`
   refuses a version older than the current release, because each app has one
   production site and `netlify deploy --prod` always replaces what is live.
   A branch that needs an older line published needs a separate channel, not
   this lane.

4. **Record the released version on main** in a follow-up PR, whenever the
   hotfix version is higher than main's current one:
   - bump `package.json` and `CHANGELOG.md` to the hotfix version;
   - remove **only** `'@codaco/interviewer'` from the changeset the hotfix
     consumed, deleting the file only if the app was its sole target. Normal-lane
     changesets may also name libraries, the other app, and Fresco, and those
     packages still need their bumps from main's next release.

   Recording is what keeps main releasable: the lane is tag-driven and
   self-healing (`.github/scripts/detect-app-release.sh`), so if main later
   versions itself to the number already tagged, the guard skips it and main's
   release never deploys. If main is somehow already ahead of the hotfix
   version, leave it alone — nothing needs recording, and downgrading main would
   make its next changeset release calculate from the wrong baseline.

**Setup:** the workflow is gated on the `interviewer-hotfix-production` GitHub
environment. Give that environment required reviewers, or any dispatch deploys
straight to production — the job definition comes from main, but the tree it
builds (and the build scripts it runs) come from the branch being released.

## Developer site

The separate `.dev` Netlify site is intentionally linked to this repository and
deploys every push to `main`. It lets developers review the current state of
`main` before approving an app release; it is independent of the changeset-driven
production release above.

Netlify uses `apps/interviewer` as the package directory and keeps the repository
root as the build base. Its versioned build settings live in `netlify.toml` in
this directory. The developer build uses the same canonical `build` command and
PWA assertion as CI. It also gives Node a larger heap because `@codaco/interview`
declaration bundling can exceed Node's default heap during a clean build.

## How CI builds

```bash
pnpm exec turbo run build --filter=@codaco/interviewer
```

The app's `build` command runs Vite and then `scripts/assert-pwa-build.mjs`, which
fails the build if the service worker, manifest, or icons are missing from
`dist/`, or if a critical JS chunk (the interview engine, mapbox-gl, the entry
point) got silently dropped from the workbox precache manifest. A deploy that
passes this assertion is one that will actually boot offline; treat an assertion
failure as a hard release blocker, not a warning to route around.

## Manual setup required (one-time)

CI deploys production releases to a Netlify **site that must already exist** —
netlify-cli can't create one. Netlify's Git integration uses the same linked site
for pull-request previews. To configure it:

1. Create a new Netlify site for Network Canvas Interviewer and connect it to
   this repository so Netlify builds pull-request previews.
2. Note its Site ID (Site settings → General → Site details).
3. Add it as the repo secret `NETLIFY_SITE_ID_INTERVIEWER`. The
   `NETLIFY_AUTH_TOKEN` secret is already shared across all Netlify deploys in
   this repo (docs, architect, networkcanvas.com) — no new token needed.
4. If Network Canvas Interviewer needs its own custom domain, configure it in the
   Netlify site's domain settings; nothing in CI needs to change for that.

Until the secret is set, the `apps-release-interviewer` production deploy will
fail at the `netlify-cli deploy` step with a `site not found` style error. The
Git-connected preview deploys and the rest of CI are unaffected.

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

## PostHog source maps

Only the production release job sets `POSTHOG_PERSONAL_API_KEY` and
`POSTHOG_PROJECT_ID` (repository secrets shared with Architect and Documentation;
the personal API key needs the _error tracking: write_ and _organization: read_
scopes). Their presence is what switches source-map upload on: the build emits
`hidden` maps, `@posthog/rollup-plugin` injects the chunk ids PostHog matches on,
uploads the maps, and deletes them from `dist/` — so the exceptions `posthog-js`
reports symbolicate to real source while the deploy still ships no maps. Every
other build — local, PR, Netlify preview, the `.dev` site — has no credentials
and emits no maps at all.

A failed upload fails the build rather than deploying unsymbolicated. Both
variables are part of the Turbo cache key for `build`, so a production build can
never replay a cached artefact whose maps were never uploaded, and
`scripts/assert-pwa-build.mjs` fails if a map is left behind in `dist/assets`
(the workbox precache globs only `js`/`css`/`html`, so a stray map would ship
silently otherwise).

## What used to be here

Earlier alpha builds shipped an Electron desktop app (macOS/Windows/Linux,
SQLCipher-encrypted storage, `electron-updater` auto-update) and a Capacitor
tablet build (iPadOS/Android). Both were retired when interviewer moved to
the web-only offline-first PWA architecture (see
`docs/superpowers/specs/2026-07-01-interviewer-v8-pwa-design.md`). If you're
looking for the old signed-installer / GitHub-Releases / auto-updater-feed
release process, it no longer applies — this file now describes the only
release path.
