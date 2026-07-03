# Releasing Architect (web)

> **Offline-first PWA** hosted on Netlify. The app updates by the browser
> fetching a new service worker (`vite-plugin-pwa`).

## Versioned beta releases (changeset-driven)

architect-web is on a `8.0.0-beta.N` line. It is `private` and in the changeset
`ignore` list, so the library `changeset version` never touches it — a dedicated
lane handles it instead. The base `8.0.0` is fixed (change it with a manual
`package.json` edit); a changeset's `major`/`minor`/`patch` type only categorises
the release notes, it does not move the base while in beta.

1. **Author a changeset.** Run `pnpm changeset` and select
   `@codaco/architect-web` (see the `creating-a-changeset` skill). Never mix an
   app and a library in one changeset — CI (`pnpm check:changesets`) rejects it.
2. **The "Release apps (beta)" PR.** On every push to `main`, the
   `apps-release-pr` job increments `-beta.N`, updates `CHANGELOG.md`, deletes the
   consumed changesets, and opens/updates a summary PR. This PR is the release
   gate; it is torn down automatically when no app changesets are pending.
3. **Merge to release.** Merging the PR bumps `package.json` on `main`; the
   `apps-release-detect` job sees the change and `apps-release` builds, deploys to
   Netlify **production** (site secret `NETLIFY_SITE_ID_ARCHITECT`), and creates
   the prerelease GitHub release `@codaco/architect-web@<version>` with the
   CHANGELOG notes.

Pull requests still get a preview deploy (`deploy-architect-preview`), aliased
`pr-<number>` and posted as a comment. Production is no longer deployed on every
push to `main` — only on a Release apps PR merge.
