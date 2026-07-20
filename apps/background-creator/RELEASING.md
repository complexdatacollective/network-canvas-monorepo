# Releasing Network Canvas Background Creator

> **Web-only static Vite app.** Background Creator is a browser-based editor for
> sociogram background images. Unlike Architect and Interviewer it is not a
> PWA — there is no service worker, no install prompt, and no update
> indicator; a deploy is live for every visitor on their next page load.

## Versioned beta releases (changeset-driven)

Background Creator is on a `1.0.0-beta.N` line. It is `private` and in the
changeset `ignore` list, so the library `changeset version` never touches it — a
dedicated lane handles it instead. The base `1.0.0` is fixed (change it with a
manual `package.json` edit, e.g. to graduate out of beta); a changeset's
`major`/`minor`/`patch` type only categorises the release notes, it does not
move the base while in beta.

1. **Author a changeset.** Run `pnpm changeset` and select
   `@codaco/background-creator` (see the `creating-a-changeset` skill). Select
   no other product or library in that file—CI (`pnpm check:changesets`)
   rejects it.
2. **The "Release Background Creator" PR.** On every push to `main`, the
   Background Creator entry in the `product-release-pr` matrix increments
   `-beta.N`, updates `CHANGELOG.md`, deletes the consumed Background Creator
   changesets, and opens or updates its release PR. The PR is withdrawn when no
   Background Creator changesets are pending.
3. **Merge to release.** Merging the PR bumps `package.json` on `main`; the
   `apps-release-detect` job sees the version change and
   `apps-release-background-creator` builds, deploys to Netlify **production**,
   and creates the prerelease GitHub release
   `@codaco/background-creator@<version>` with the CHANGELOG notes.

Netlify's Git integration builds pull-request previews and reports their URLs
directly on the PR. Production is deployed only when the Release Background
Creator PR merges.

## How CI builds

```bash
pnpm exec turbo run build --filter=@codaco/background-creator
```

The app's `build` command is a plain Vite production build into `dist/`. The
`public/_redirects` SPA fallback and `public/_headers` cache/security rules are
copied into `dist/` by Vite and applied by Netlify at deploy time.

## Manual setup required (one-time)

CI deploys production releases to a Netlify **site that must already exist** —
netlify-cli can't create one. Netlify's Git integration uses the same linked
site for pull-request previews. To configure it:

1. Create a new Netlify site for Background Creator and connect it to this
   repository so Netlify builds pull-request previews. Its versioned build
   settings live in `netlify.toml` in this directory; set `apps/background-creator`
   as the package directory and keep the repository root as the build base.
2. Note its Site ID (Site settings → General → Site details).
3. Add it as the repo secret `NETLIFY_SITE_ID_BACKGROUND_CREATOR`. The
   `NETLIFY_AUTH_TOKEN` secret is already shared across all Netlify deploys in
   this repo (docs, architect, interviewer, networkcanvas.com) — no new token
   needed.
4. Optionally create a separate `background-creator-dev` site linked to this
   repository that deploys every push to `main`, mirroring the developer sites
   the other apps keep — it lets developers review the current state of `main`
   before approving an app release, independent of the changeset-driven
   production release above.
5. If Background Creator needs its own custom domain, configure it in the
   Netlify site's domain settings; nothing in CI needs to change for that.

Until the secret is set, the `apps-release-background-creator` production
deploy will fail at the `netlify-cli deploy` step with a `site not found` style
error. The Git-connected preview deploys and the rest of CI are unaffected.
