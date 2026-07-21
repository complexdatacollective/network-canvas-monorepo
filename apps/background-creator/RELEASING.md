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

## Provisioning (one-time)

The `apps-release-background-creator` job deploys **by Site ID** —
`netlify deploy --no-build --prod --dir=apps/background-creator/dist --site=$NETLIFY_SITE_ID_BACKGROUND_CREATOR`
— so it needs a Netlify site to exist but **not** a Git connection: CI uploads
the prebuilt `dist/` directly (the `_redirects` SPA fallback and `_headers`
rules ride along inside it). Pull-request previews come from a separate,
Git-connected `bg-creator-dev` site.

Done:

1. **Production site** `bg-creator` (team `network-canvas`, Site ID
   `8ce0d202-ec6f-4a81-8c42-3c11e3180d33`), created with
   `netlify sites:create --name bg-creator --account-slug network-canvas`. It is
   a bare deploy target — its own build settings never run, since CI deploys a
   prebuilt directory.
2. **Repo secret** `NETLIFY_SITE_ID_BACKGROUND_CREATOR` set to that Site ID via
   `gh secret set`. The `NETLIFY_AUTH_TOKEN` secret is already shared across
   every Netlify deploy in this repo (docs, architect, interviewer,
   networkcanvas.com) — no new token needed.
3. **Preview site** `bg-creator-dev` (`bg-creator.networkcanvas.dev`),
   Git-connected to this repository, already builds pull-request previews and
   every push to `main`, mirroring the other apps' developer sites.

Remaining (Netlify UI):

4. **Custom domain.** Attach `https://bg-creator.networkcanvas.com` to the
   `bg-creator` site in its domain settings (the `networkcanvas.com` DNS zone
   lives in Netlify too); nothing in CI changes for it. Until then, production
   releases land on `https://bg-creator.netlify.app`. Once the domain is live,
   add the `bg-creator.networkcanvas.com` link to the "Use the Background
   Creator" section of
   `apps/documentation/docs/design-protocols/key-concepts/responsive-svg-backgrounds.en.mdx`,
   which currently describes the tool without pointing at the not-yet-live URL.

Because the site and secret above are in place, the production deploy resolves
the Site ID normally. Were the secret ever unset, the `netlify-cli deploy` step
would fail with a `site not found` style error while preview deploys and the
rest of CI stayed unaffected.
