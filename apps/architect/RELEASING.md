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
it uses no `globIgnores`.

## PostHog source maps

Only the production release job sets `POSTHOG_PERSONAL_API_KEY` and
`POSTHOG_PROJECT_ID` (repository secrets shared with Interviewer and
Documentation; the personal API key needs the _error tracking: write_ and
_organization: read_ scopes). Their presence is what switches source-map upload
on: the build emits `hidden` maps, `@posthog/rollup-plugin` injects the chunk ids
PostHog matches on, uploads the maps, and deletes them from `dist/` — so the
exceptions `posthog-js` reports symbolicate to real source while the deploy still
ships no maps. Every other build — local, PR, Netlify preview, the `.dev` site —
has no credentials and emits no maps at all.

A failed upload fails the build rather than deploying unsymbolicated. Both
variables are part of the Turbo cache key for `build`, so a production build can
never replay a cached artefact whose maps were never uploaded, and
`scripts/assert-pwa-build.mjs` fails if a map is left behind in `dist/assets`.
