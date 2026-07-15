# Releasing Architect

> **Offline-first PWA** hosted on Netlify. The app updates by the browser
> fetching a new service worker (`vite-plugin-pwa`).

## Versioned beta releases (changeset-driven)

Architect is on a `8.0.0-beta.N` line. It is `private` and in the changeset
`ignore` list, so the library `changeset version` never touches it — a dedicated
lane handles it instead. The base `8.0.0` is fixed (change it with a manual
`package.json` edit); a changeset's `major`/`minor`/`patch` type only categorises
the release notes, it does not move the base while in beta.

1. **Author a changeset.** Run `pnpm changeset` and select
   `@codaco/architect` (see the `creating-a-changeset` skill). Never mix an
   app and a library in one changeset — CI (`pnpm check:changesets`) rejects it.
2. **The "Release apps & documentation" PR.** On every push to `main`, the
   `apps-release-pr` job increments `-beta.N`, updates `CHANGELOG.md`, deletes the
   consumed changesets, and opens/updates a summary PR. This PR is the release
   gate; it is torn down automatically when no app changesets are pending.
3. **Merge to release.** Merging the PR bumps `package.json` on `main`; the
   `apps-release-detect` job sees the change and `apps-release-architect` builds,
   deploys to Netlify **production** (site secret `NETLIFY_SITE_ID_ARCHITECT`), and creates
   the prerelease GitHub release `@codaco/architect@<version>` with the
   CHANGELOG notes.

Netlify's Git integration builds pull-request previews and reports their URLs
directly on the PR. Production is no longer deployed on every push to `main` —
only on a Release apps & documentation PR merge.

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
