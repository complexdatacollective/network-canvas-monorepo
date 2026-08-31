# Releasing Architect

> **Offline-first PWA** hosted on Netlify. The app updates by the browser
> fetching a new service worker (`vite-plugin-pwa`).

## Stable releases (changeset-driven)

Architect is a private package in the normal Changesets lane. It uses standard
semantic versioning: the `major`/`minor`/`patch` selected in a changeset controls
the next version, and the normal generated **Version Packages** PR updates its
`package.json` and `CHANGELOG.md` alongside any affected libraries or
Interviewer.

1. **Author a changeset.** Run `pnpm changeset` and select
   `@codaco/architect` (see the `creating-a-changeset` skill). The same changeset
   may also name `@codaco/interviewer` and/or library packages because they share
   the normal release lane. Select no Documentation or Website package in that
   file—CI (`pnpm check:changesets`) rejects cross-lane changesets.
2. **The "Version Packages" PR.** On every push to `main`,
   `changesets/action` runs the repository's `pnpm version-packages` command,
   applies the requested semver bumps, updates changelogs, consumes the
   changesets, and opens or updates `changeset-release/main`.
3. **Merge to release.** Merging the PR bumps `package.json` on `main`; the
   `apps-release-detect` job sees the change and `apps-release-architect` builds,
   deploys to Netlify **production** (site secret
   `NETLIFY_SITE_ID_ARCHITECT`), and creates the stable GitHub release
   `@codaco/architect@<version>` with the CHANGELOG notes.

Netlify's Git integration builds pull-request previews and reports their URLs
directly on the PR. Production is no longer deployed on every push to `main`—it
is deployed only when the Version Packages PR containing an Architect version
bump merges.

## Hotfix releases (when main is ahead)

The changeset lane always builds main, so it can only ship a patch together
with everything else merged since the last release. When main carries work that
is not ready to go out, release from the previous tag instead:

1. Cut the branch from the released tag and cherry-pick the fix:

   ```bash
   git switch -c hotfix/architect-<version> '@codaco/architect@<previous>'
   git cherry-pick <sha>
   ```

   Land the same fix on main through the usual pull request as well — the
   hotfix branch is a delivery vehicle, not the source of truth.

2. Bump `apps/architect/package.json` to the hotfix version and add the
   matching `## <version>` section to `CHANGELOG.md`; `scripts/release-notes.mjs`
   reads that section for the GitHub release. Do **not** run
   `changeset version` on the branch — it would consume changesets that belong
   to main's next release.
3. Push the branch, then run the **Hotfix Release** workflow **from main**,
   with `app: architect` and `source_ref` set to the hotfix branch. It runs
   typecheck and tests across the app's whole workspace dependency closure,
   builds with PostHog source maps, deploys to Netlify production, and cuts
   `@codaco/architect@<version>`.

   A hotfix and a normal release for the same app hold one lock, so a dispatch
   made while a Version Packages release is deploying waits for it rather than
   racing it to the production site. On top of that the hotfix job re-checks
   the newest tag after building: a hotfix overtaken while it waited aborts
   instead of deploying, and needs re-cutting from the new tag.

   Watch the run to completion. GitHub keeps only one pending run per
   concurrency group, so if two hotfix dispatches for the same app queue behind
   a release that is already deploying, the earlier pending one is cancelled.
   Nothing silently ships in its place — a cancelled run is visible in Actions —
   but it does need re-dispatching.

   The lane only ships the newest line: `.github/scripts/resolve-hotfix-release.mjs`
   refuses a version older than the current release, because each app has one
   production site and `netlify deploy --prod` always replaces what is live.
   A branch that needs an older line published needs a separate channel, not
   this lane.

4. **Merge the hotfix branch into main.** Open a pull request from the hotfix
   branch itself rather than re-applying its content: the normal lane refuses
   to deploy a tree that does not contain the newest released commit, so a
   cherry-pick — which makes a different commit — leaves main blocked. The
   merge brings the version bump and CHANGELOG with it. While you are there,
   remove **only** `'@codaco/architect'` from the changeset the hotfix consumed,
   deleting the file only if the app was its sole target: normal-lane
   changesets may also name libraries, the other app, and Fresco, and those
   packages still need their bumps from main's next release.

   Both halves matter. Until the merge lands, `.github/scripts/app-release-guard.sh`
   skips main's release of this app — deploying a tree without the hotfix would
   take the fix off production behind a higher version number — and the tag
   guard would swallow a main release that later reaches the version already
   tagged. Once merged, the next push to main releases normally.

   If main is somehow already ahead of the hotfix version, still merge the
   branch: what unblocks the lane is the commit being in main's history, not
   the version number, and downgrading main's version would make its next
   changeset release calculate from the wrong baseline.

**Setup (one-time, and load-bearing).** The workflow declares the
`architect-hotfix-production` environment, but a workflow file cannot enforce
its own protection: GitHub runs whichever copy of the YAML lives on the ref a
dispatch selects, so a branch copy with the guard and the `environment:` line
deleted would run instead. Only repository configuration closes that, and it is
what makes this lane safe to have:

1. Create the `architect-hotfix-production` environment.
2. Give it **required reviewers**, so a dispatch pauses for a human.
3. Restrict its **deployment branches** to `main`, so a job reaching for it from
   any other ref is refused.
4. Hold the deploy credentials (`NETLIFY_AUTH_TOKEN`, `NETLIFY_SITE_ID_ARCHITECT`,
   the PostHog pair) as **environment** secrets rather than repository secrets,
   so a workflow copy that drops the `environment:` line gets nothing. Note the
   normal release lane reads the same names at repository scope today, so this
   step is a wider change than the hotfix lane alone — until it happens, steps
   2 and 3 are the protection.

**If a dispatch fails.** The tag is claimed before the production deploy, so a
run that goes red after tagging has left `@codaco/architect@<version>` pointing at
a version that may never have gone live. That state deliberately blocks later
releases rather than letting one quietly overwrite an unrecorded deploy. Check
what production is actually serving, then either re-run the deploy or delete the
tag before re-dispatching:

```bash
git push --delete origin '@codaco/architect@<version>'
```

## Developer site

The separate `.dev` Netlify site is intentionally linked to this repository and
deploys every push to `main`. It lets developers review the current state of
`main` before approving an app release; it is independent of the changeset-driven
production release above.

Netlify uses `apps/architect` as the package directory and keeps the repository
root as the build base. Its versioned build settings live in `netlify.toml` in
this directory. The developer build uses the same canonical `build` command and
PWA assertion as CI. It also gives Node a larger heap because shared package
declaration bundling can exceed Node's default heap during a clean build.

## How CI builds

Netlify preview builds and the CI release job run `pnpm exec turbo run build
--filter=@codaco/architect`. The app's `build` command runs Vite and then
`scripts/assert-pwa-build.mjs`. That assertion fails the build if `dist/` is
missing the service worker, manifest, or icons, or if any emitted JS chunk was
dropped from the workbox precache manifest (e.g. for exceeding the size limit) —
which would 404 offline and break the offline boot. Treat an assertion failure as
a hard release blocker. Architect asserts that _every_ chunk is precached because
it uses no `globIgnores`. The assertion also validates the emitted `_headers`:
the service worker, HTML shells, manifest, and stable icons must use
`no-store, no-cache, max-age=0, must-revalidate`, while only content-hashed
`/assets/*` may use a one-year immutable cache.

The production custom domain is fronted by Cloudflare, so this repository rule
is necessary but cannot override an account-level Browser Cache TTL rule. Keep
Cloudflare set to **Respect Existing Headers** (with no cache rule that replaces
these origin directives), and verify `/`, `/sw.js`, `/index.html`, and
`/manifest.webmanifest` return the no-store policy after each release. A
response with a positive browser `max-age` is a release blocker even when the
build assertion passed, because it means an intermediary replaced the emitted
contract.

## Service worker update propagation

The service worker (`registerType: 'prompt'`, see `vite.config.ts`) has two
deliberately different update paths:

- On a fresh navigation, the pre-render startup check activates a waiting
  worker while the static loading spinner remains visible. Startup then
  continues on the same navigation; activation never calls `reload()`.
- Once React has rendered, a newly discovered update remains in the **update
  available** state until the user opens the version indicator and chooses
  **Install and reload**. Neither `AppUpdateProvider` nor `vite-plugin-pwa` may
  reload the page independently.
- After that user-requested reload, the version indicator shows the recently
  updated state and exposes the release notes for the running version.

This means an already-open Architect tab continues running its current version
until the researcher explicitly installs the update. Do not add an automatic
post-render reload path: open editor drafts, dialogs, imports, and exports make
that data-destructive.

The worker deliberately uses `clientsClaim: false`, a release-versioned
precache, and no `cleanupOutdatedCaches`. Activating a release therefore does
not replace the controller or remove hashed lazy assets underneath another open
editor tab; that tab and its cache remain usable offline until it navigates.
`scripts/assert-pwa-build.mjs` verifies these generated-worker invariants.

## PostHog source maps

The public PostHog project key is a compiled-in constant shared by every
Network Canvas product (`@codaco/shared-consts`), so no workflow variable
configures it and no build can ship with analytics accidentally off. Local Vite
development mode never initializes analytics, and `VITE_DISABLE_ANALYTICS=true`
turns it off explicitly for e2e and preview builds.

Only the production release job sets `POSTHOG_PERSONAL_API_KEY` and
`POSTHOG_PROJECT_ID` (repository secrets shared with Interviewer and
Documentation; the personal API key needs the _error tracking: write_ and
_organization: read_ scopes). Their presence is what switches source-map upload
on: the build emits `hidden` maps, the shared Vite hook uploads them, and deletes
them from `dist/` — so the exceptions `posthog-js` reports symbolicate to real
source while the deploy still ships no maps. The hook processes the completed
output directory so maps for Web Workers emitted as parent-build assets are
included too. Every other build — local, PR, Netlify preview, the `.dev` site —
has no credentials and emits no maps at all.

A failed upload fails the build rather than deploying unsymbolicated. Both
variables are part of the Turbo cache key for `build`, so a production build can
never replay a cached artefact whose maps were never uploaded, and
`scripts/assert-pwa-build.mjs` fails if a map is left behind anywhere in `dist`.
