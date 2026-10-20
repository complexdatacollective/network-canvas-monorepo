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
   `@codaco/architect@<version>` with the CHANGELOG notes. For an 8.x
   version, `apps-release-architect-subpath-dist` then attaches the `/v8/`
   tarball Architect 9 bundles (see [Sub-path dist tarball](#sub-path-dist-tarball)).

Netlify's Git integration builds pull-request previews and reports their URLs
directly on the PR. Production is no longer deployed on every push to `main`—it
is deployed only when the Version Packages PR containing an Architect version
bump merges.

Merge the Version Packages PR through the merge queue while it is current. If
main gains a normal-lane changeset after the PR head was generated, the merged
tree carries both the bumped versions and that changeset, and
`changesets/action` regenerates the PR instead of publishing the libraries —
the app lane still deploys (it is tag-driven), but the library versions this
release depends on never reach npm and the next release PR bumps past them.
The `version-packages-freshness` job refuses such a merge; wait for the bot to
regenerate the head and queue that. Pushes to main also run concurrently, so a
`release` job whose commit is no longer main's tip stops before
`changesets/action` runs (`.github/scripts/superseded-push-guard.sh`) rather
than regenerating a release PR that has already merged; release jobs run one
at a time, and a tip run with nothing left to version closes any release PR a
superseded run still managed to open. The app lane needs no
such check: `app-release-guard.sh` below already makes a superseded tree
harmless, and it skips with a warning that needs no follow-up.

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
   matching `## <version>` section to `CHANGELOG.md`; `scripts/release/release-notes.mjs`
   reads that section for the GitHub release. Do **not** run
   `changeset version` on the branch — it would consume changesets that belong
   to main's next release.
3. Push the branch, then run the **Hotfix Release** workflow **from main**,
   with `app: architect` and `source_ref` set to the hotfix branch. It runs
   typecheck and tests across the app's whole workspace dependency closure,
   builds with PostHog source maps, deploys to Netlify production, and cuts
   `@codaco/architect@<version>`. An 8.x hotfix also gets its `/v8/` tarball
   (see [Sub-path dist tarball](#sub-path-dist-tarball)).

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
   An older major line (8.x once 9.x is production) releases through the
   [maintenance lane](#maintenance-releases-older-major-lines) instead.

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

## Sub-path dist tarball

Architect 9 serves Architect 8 at `/v8/` from its own deploy, so researchers
can keep editing schema 8 protocols beside it. Architect 9 does not build
Architect 8: it bundles a tarball attached to an 8.x GitHub release, pinned by
URL and sha256 in `apps/architect/legacy-architect.json` on the schema-9 line.

The **Architect Sub-path Dist** workflow
(`.github/workflows/architect-subpath-dist.yml`) makes that tarball. It builds a
released tag with `ARCHITECT_BASE_PATH=/v<major>/` and attaches
`architect-v<major>-dist.tgz` (and its `.sha256`) to the tag's release:

```text
@codaco/architect@8.5.0  ->  architect-v8-dist.tgz  (base /v8/, caches architect-v8-*)
```

- **When it runs.** `apps-release-architect` and the Hotfix Release workflow
  chain it after every 8.x release, and the maintenance lane after every
  maintenance release. It is chained by `workflow_call` because a release
  created with `GITHUB_TOKEN` fires no tag or release event. It runs in its
  own job, so a failure never turns a release that has already shipped red.
  Dispatch it by hand from main to retry. A chained run also receives the
  commit the lane built and released, and refuses a tag that points anywhere
  else: the tarball is built from the tag's tree, so it must be the released
  one. Only tags whose tree can build under
  a sub-path are eligible (8.5.0 onwards, marked by
  `apps/architect/scripts/app-base-path.mjs`). A release lane skips an older
  tag with a notice; a dispatch for one fails.
- **Layout.** The archive root is the dist root (`index.html`, `sw.js`,
  `manifest.webmanifest`, `assets/`, `preview/`, `build-info.json`) plus
  `dist-info.json` (`{ tag, version, commit, base, cachePrefix }`), so the
  bundler extracts it straight into `dist/v8`. It has no `_headers` or
  `_redirects` (Architect 9 owns the `/v8/` hosting rules) and no source maps.
  `scripts/release/package-architect-subpath-dist.mjs` checks the shape again
  before packing: assets under the base, manifest `start_url` and `scope`
  equal to the base, and a precache under the `architect-v<major>-` prefix
  Architect 9's worker treats as foreign.
- **Deterministic packing, not a reproducible build.** The archive is packed
  with `tar --sort=name --mtime=@0 --owner=0 --group=0 | gzip -n`, so the same
  dist always packs to the same bytes. The build itself is not reproducible:
  its precache id is random outside turbo. So the workflow **never replaces**
  an attached tarball unless it is dispatched with `replace`. A replaced
  tarball breaks the pin, and Architect 9's production build verifies the pin's
  sha256, so it would fail until the pin is bumped.
- **No PostHog.** The build gets no PostHog credentials, as for the version
  archive below, so it emits and uploads no source maps. Exceptions from
  `/v8/` are not symbolicated.
- **The pin.** The run's summary prints the pin, ready to paste:

  ```json
  {
    "v8": {
      "version": "8.5.0",
      "url": "https://github.com/complexdatacollective/network-canvas-monorepo/releases/download/%40codaco%2Farchitect%408.5.0/architect-v8-dist.tgz",
      "sha256": "<64 hex characters>",
      "cachePrefix": "architect-v8-"
    }
  }
  ```

  The URL is the asset's `browser_download_url` as GitHub reports it. The
  workflow downloads it and checks its sha256 before printing. To ship it,
  update `legacy-architect.json` on the line that bundles it, in a pull request
  with an `'@codaco/architect': patch` changeset. Users get the new Architect 8
  when that line next releases.

The job that builds runs the tag's code, so it holds a read-only token. Only
the publish job uploads, with `contents: write`. It runs nothing from the tag:
it downloads the packed artifact, re-verifies it, and uploads through the REST
API. The upload does not use `softprops/action-gh-release`, because that action
would rewrite an existing release's name, body and "Latest" flag.

## Maintenance releases (older major lines)

Once Architect 9 is production, an Architect 8 fix cannot go through the
normal or hotfix lane, because both deploy to the one production site and
refuse a version older than the newest release. The **Architect Maintenance
Release** workflow (`.github/workflows/architect-maintenance-release.yml`)
releases an older line instead. It tags the release, creates a GitHub release
that is never "Latest", and attaches the line's sub-path tarball. It deploys
nothing.

1. Cut the branch from the line's newest tag, cherry-pick the fix, and bump
   `apps/architect/package.json` and `CHANGELOG.md` by hand. Do not run
   `changeset version`, for the reason given under hotfix releases:

   ```bash
   git switch -c maintenance/architect-8.5.1 '@codaco/architect@8.5.0'
   git cherry-pick <sha>
   ```

2. Push the branch, then run the workflow **from main** with `source_ref` set
   to it. The `verify` job runs typecheck and tests across Architect's
   workspace dependency closure, then a `/v<major>/` build, because a
   maintenance branch gets no pull-request CI. After approval, the `release`
   job checks the version again, writes the notes since the line's previous
   release, claims the tag atomically, and creates the release. If the release
   is not created after the claim, the job deletes the tag again so the run
   can be repeated. A run that died before that cleanup (a lost runner or a
   timeout) leaves the tag with no release. Re-running it, or dispatching it
   again, deletes a tag that sits on the verified commit and has no release,
   then claims it again.
   This job holds the write token and runs nothing from the branch.
   `resolve-hotfix-release.mjs` in its line scope (`SCOPE=line`) requires:
   - a version newer than every release on its own major line;
   - a major below the newest release overall;
   - a tree that contains the line's newest tag.

   A maintenance tag that became the newest overall would leave production
   behind its own newest tag, and `app-release-guard.sh` would then skip every
   later release from main.

3. **Bump the pin** on the newer line to the tarball the run's summary prints
   (see [Sub-path dist tarball](#sub-path-dist-tarball)). Until that line
   releases, users keep the previous Architect 8.

There is **no merge back to main**. Main is on the newer major, and a merge
would bring this line's `package.json` and CHANGELOG into it. Land the fix on
main separately if it applies there too.

The in-app update check (fresco-ui's `selectLatestForApp`) picks the highest
version on or above the running app's major. A maintenance release created
after 9.x is therefore never offered to Architect 9 as an update, even though
GitHub lists it first.

The workflow has its own concurrency group. It does not share
`apps-release-@codaco/architect` with the other lanes: that group keeps only one
pending run, so a maintenance run waiting for approval could make a normal
release be dropped.

**Setup (one-time, and load-bearing).** Create the
`architect-maintenance-release` environment with **required reviewers**, and
restrict its **deployment branches** to `main`. The reason is the same as for
the hotfix lane: a workflow file cannot enforce its own protection. The
environment holds no secrets, because the lane deploys nothing.

## Version archive

Released versions stay reachable at a per-major-version host so researchers on
an older protocol schema keep a working Architect after production moves on:

```text
@codaco/architect@8.2.5  ->  https://v8.architect.networkcanvas.com
```

The archive is keyed by **major version**, not by release, because major
versions track protocol schema versions: only the newest release on each major
line needs to stay reachable, so 8.3.0 replaces 8.2.5 at the same host. That
holds the host count to one per schema generation, which matters because a
Cloudflare zone allows 100 custom domains in total.

Run the **Architect Archive Release** workflow
(`.github/workflows/architect-archive-release.yml`) with the released tag. It is
not yet wired into the release lane — do it by hand after a release, or call the
workflow from another one. Integration is tracked in
[#1767](https://github.com/complexdatacollective/network-canvas-monorepo/issues/1767);
note that the archive must run _after_ the release tag is pushed, because the
newest-on-the-line guard reads tags.

The lane refuses a version that is not the newest on its major line, so
archiving an old patch cannot roll the host backwards; `force` overrides that
for repairs. It never touches the production site, the tags, or the GitHub
releases, so a failure here cannot block or undo a release.

Each archived line is a Cloudflare Worker serving static assets, with
`custom_domain: true` provisioning both the DNS record and the certificate.
Static asset requests are free and unlimited on both Workers plans, so the
archive costs nothing to run.

**Netlify cannot host this.** It overrides `Cache-Control` on `/sw.js` and
`/manifest.webmanifest` for any deploy that is not the site's production deploy,
serving `public,max-age=0,must-revalidate` whatever `_headers` says — so an
aliased Netlify deploy cannot satisfy the cache contract below. (The same
override applies to Architect's deploy previews, and `assert-pwa-build.mjs`
cannot catch it because it validates the emitted `_headers` file rather than
what the origin serves.)

Cloudflare honours those rules but differs in two other ways, both handled by
`scripts/write-cloudflare-archive-config.mjs` at deploy time — **never by
editing `public/_headers`**, whose shape is asserted for Netlify in
`scripts/buildtime/assert-pwa-cache-headers.mjs`:

- **`_headers` rules append rather than replace.** Netlify lets `/assets/*`
  override the blanket `/*` no-store; Cloudflare joins them into one header
  where `no-store` wins and every content-hashed asset becomes uncacheable. The
  transform strips `Cache-Control` from `/*` only.
- **`_redirects` is rejected**, because Cloudflare's asset layer already strips
  `/index` and `.html` and reads `/* /index.html 200` as an infinite loop. The
  SPA fallback is expressed as `not_found_handling` in the Wrangler config.

The workflow asserts the resulting contract against the live host after
deploying and fails the run if it does not hold.

**Setup (one-time, and load-bearing).** The deploy job declares the
`architect-archive` environment, but — exactly as for the hotfix lane above — a
workflow file cannot enforce its own protection: GitHub runs whichever copy of
the YAML lives on the ref a dispatch selects, so a branch copy with the
`environment:` line deleted would run instead. Only repository configuration
closes that:

1. Create the `architect-archive` environment.
2. Restrict its **deployment branches** to `main`, so a job reaching for it from
   any other ref is refused.
3. Hold `CLOUDFLARE_API_TOKEN` as an **environment** secret, not a repository
   secret. A repository secret is readable by any branch that can rewrite the
   scripts this workflow runs, and this token can edit DNS across the whole
   networkcanvas.com zone and deploy Workers to the account. Scope it to that
   zone with DNS:Edit, Zone:Read and Workers Routes:Edit, plus account-level
   Workers Scripts:Edit.
4. Optionally set the repository variable `CLOUDFLARE_ACCOUNT_ID`; a
   single-account token lets Wrangler resolve it on its own.

Required reviewers are worth considering but are not the load-bearing part
here: unlike the hotfix lane this one cannot change what production serves, so
the branch restriction and the environment-scoped secret are what matter.

## Bundled Architect 8 (`/v8/`)

Architect 9 serves Architect 8 at `/v8/` from its own deploy, so a researcher
can keep editing a schema 8 protocol in Architect 8 (and hand it back for an
upgrade) without leaving the site. Architect 9 does not build Architect 8.
Each 8.x release attaches a build of itself made for `/v8/`,
`architect-v8-dist.tgz`, to its GitHub release (the **Architect Sub-path
Dist** workflow on the 8.x line), and `legacy-architect.json` in this
directory pins one of them:

```json
{
  "v8": {
    "version": "8.5.0",
    "url": "https://github.com/complexdatacollective/network-canvas-monorepo/releases/download/%40codaco%2Farchitect%408.5.0/architect-v8-dist.tgz",
    "sha256": "<64 lowercase hex characters>",
    "cachePrefix": "architect-v8-"
  }
}
```

Until a release is pinned the file reads `{ "v8": null }`.

**What the build does.** `scripts/build.mjs` reads the pin through
`scripts/buildtime/legacy-app.ts` (at the repository root, shared with
Interviewer, which bundles Interviewer 8 the same way), runs Vite, then has
`scripts/buildtime/bundle-legacy-app.mjs` fetch the tarball, check its sha256,
refuse any entry that is not a plain file or directory or would land outside
the extraction directory, check `dist-info.json` (`{tag, version, commit,
base, cachePrefix}`) and the build itself against the pin, drop its
`_headers`, `_redirects` and source maps, and move it to `dist/v8`. It runs
after Vite has generated the service worker, so none of it enters this app's
precache (`globIgnores` repeats that). The same decision sets the
`__ARCHITECT_V8__` define, so the app offers "Keep editing as schema 8" and
"Open in Architect 8" exactly when `dist/v8` holds Architect 8. With an empty
pin the build bundles nothing, leaves no `dist/v8`, and the app offers only
the upgrade.

The tarball comes from `ARCHITECT_LEGACY_V8_TARBALL` when that names a local
copy, then from `node_modules/.cache/architect-legacy/<sha256>.tgz`, then from
the pinned URL (with retries; the download is cached). Whichever it is must
match the pin's sha256. Node's `fetch` ignores `HTTPS_PROXY` unless
`NODE_USE_ENV_PROXY=1`, so in a proxied sandbox download the asset yourself
and point `ARCHITECT_LEGACY_V8_TARBALL` at it, or set
`ARCHITECT_SKIP_LEGACY_V8=true` to build without Architect 8.

**The release guard.** The production builds in `apps-release-architect` and
the hotfix lane set `ARCHITECT_REQUIRE_LEGACY_V8=true`, which fails the build
while nothing is pinned (and refuses `ARCHITECT_SKIP_LEGACY_V8`), and both
lanes check `dist/v8` again before anything is tagged or deployed. **Architect
9 cannot release until an Architect 8 build is pinned.** Both variables are in
the turbo cache key for `build`, so a required build never replays one that
bundled nothing; the pin file is a build input, so a new pin never replays a
cached `dist/v8`.

**Updating the pin** — after any 8.x release whose fix should reach `/v8/`:

1. Wait for the Architect Sub-path Dist run that the 8.x release lane chains
   (or dispatch it from main with the released tag). Its step summary prints
   the pin, ready to paste.
2. On the Architect 9 line, replace `legacy-architect.json` with that JSON and
   add a `patch` changeset for `@codaco/architect` saying which Architect 8 is
   now served at `/v8/`.
3. Build once locally (`pnpm --filter @codaco/architect build`): it downloads
   the tarball, verifies it against the pin, and `assert-pwa-build.mjs` checks
   `dist/v8`.
4. Merge, and release Architect 9 as usual. `/v8/` changes only when Architect
   9 is redeployed.

Never replace an uploaded tarball without updating the pin: the sub-path build
is not bit-for-bit reproducible, so a rebuilt asset no longer matches the
pinned sha256 and every later Architect 9 build fails until the pin is bumped.
The dist workflow refuses to replace one unless `replace` is set.

**The contract between the two builds**, checked by `assert-pwa-build.mjs`:

- Architect 8's worker precaches under `architect-v8-`. This app's cache
  reclaimer keeps `appCachePrefix: 'architect-'` (so it still reclaims older
  root 8.x caches) and is told that `architect-v8-` caches and `/v8/` windows
  belong to another worker (`foreignCachePrefixes`, `foreignScopePaths` in
  `vite.config.ts`). The pin's `cachePrefix`, the prefix in `dist/v8/sw.js`
  and the reclaimer's foreign prefixes must all agree.
- This app's worker does not answer `/v8` or `/v8/` navigations and does not
  cache images or fonts under `/v8/`. Workbox serialises each route's matcher
  into `sw.js`, so these exclusions are literals in `vite.config.ts`.
- `dist/v8` is never in this app's precache (`globIgnores`, and the build
  writes it after the worker is generated). Instead, when a build bundles
  Architect 8, this app registers `/v8/sw.js` for the `/v8/` scope in the
  background (`src/utils/registerLegacyArchitectWorker.ts`): once per page
  load, after it has rendered, after its own worker is ready and when the
  browser is idle, unless `/v8/` already has that worker. Architect 8's worker
  then downloads and keeps its own precache, so Architect 8 works offline
  even for a researcher who has never opened `/v8/`, without slowing this
  app's start-up or its own offline download.
- `public/_redirects` sends every path under `/v8/` to Architect 8's shell
  before its own catch-all. It has no `/v8 /v8/ 301`: Netlify ignores a
  trailing slash when matching, so that rule would loop whenever nothing is
  bundled at `/v8/`, and Netlify already takes `/v8` to `dist/v8/index.html`
  when it exists. `public/_headers` holds
  Architect 8's shells, worker, manifest and preview to no-store and
  `/v8/assets/*` to a year's immutable cache, since Netlify reads neither file
  from inside `dist/v8`.
- `vite preview` applies no `_redirects`, so `vite.config.ts` adds a preview
  middleware that does the same for `dist/v8`, whenever it exists. An e2e spec
  can put a stub `dist/v8/index.html` there and navigate to `/v8/…`.

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
missing the service worker, manifest, or icons, or if any emitted JS chunk or
responsive screen-preview image was dropped from the Workbox precache manifest
(e.g. for exceeding the size limit) — which would 404 offline and break either
the offline boot or first rendering of screen thumbnails. It also fails if
any of the dev-only Development protocol (its JSON or media, matched by
content) is in `dist/`. Treat an assertion failure as a hard release blocker. Architect asserts that _every_ chunk in
`dist/assets` is precached: its `globIgnores` leaves out only the bundled
Architect 8 under `v8/` (see above). The assertion also validates the
emitted `_headers`:
the service worker, HTML shells (including requested SPA deep links), manifest,
and stable icons must use `no-store, no-cache, max-age=0, must-revalidate`, while
only content-hashed `/assets/*` may use a one-year immutable cache. The generated
worker assertion also ensures its image runtime cache excludes every stable PWA
icon, because Cache API writes would otherwise bypass those HTTP directives.

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
- The separate `/preview/` entry performs the same no-reload handoff before it
  renders, so its shell and deferred interface chunks use the same controller.
  Update discovery, installation, and activation remain bounded: on failure or
  timeout the preview proceeds instead of leaving the popup permanently blank.
  The opener keeps its payload handshake available for 55 seconds, covering the
  handoff's complete 46-second healthy worst case plus scheduling headroom.
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

The worker deliberately uses `clientsClaim: false`, a build-scoped precache,
and no blanket `cleanupOutdatedCaches`. Turbo's task fingerprint names deployed
build artifacts, so two same-version developer deployments with different
assets cannot prune each other's caches. Service-worker activation advances
every client already using the registration, even without `clientsClaim`; it
does not reload those documents. The new worker therefore resolves an older
tab's exact content-hashed JS/CSS URLs across retained precaches, while HTML
navigation fallbacks remain pinned to the active worker's own precache. This
keeps the older loaded bundle usable offline without risking an ambiguous
`index.html` match. Each page also reports its compiled build ID to the worker.
The worker reclaims only precaches that no responsive open page has leased;
any legacy, frozen, or nonresponding page blocks cleanup, and an installing or
waiting worker blocks it as well. This preserves open work without allowing
old build caches to accumulate indefinitely.
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
