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
   CHANGELOG notes. For an 8.x version, `apps-release-interviewer-subpath-dist`
   then attaches the `/v8/` tarball Interviewer 9 bundles (see
   [Sub-path dist tarball](#sub-path-dist-tarball)).

Netlify's Git integration builds pull-request previews and reports their URLs
directly on the PR. Production is no longer deployed on every push to `main`—it
is deployed only when the Version Packages PR containing an Interviewer version
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
   git switch -c hotfix/interviewer-8.1.3 '@codaco/interviewer@8.1.2'
   git cherry-pick <sha>
   ```

   Land the same fix on main through the usual pull request as well — the
   hotfix branch is a delivery vehicle, not the source of truth.

2. Bump `apps/interviewer/package.json` to the hotfix version and add the
   matching `## <version>` section to `CHANGELOG.md`; `scripts/release/release-notes.mjs`
   reads that section for the GitHub release. Do **not** run
   `changeset version` on the branch — it would consume changesets that belong
   to main's next release.
3. Push the branch and open its merge-back pull request into `main` NOW
   (step 5 merges it after release, but the PR must exist first): its
   Netlify deploy preview is the certification candidate. Run the release
   smoke test against that preview with the hotfix's bumped version (see
   Release smoke testing below) and proceed only on a certifying pass.

4. Run the **Hotfix Release** workflow **from main**,
   with `app: interviewer` and `source_ref` set to the hotfix branch. It runs
   typecheck and tests across the app's whole workspace dependency closure,
   builds with PostHog source maps, deploys to Netlify production, and cuts
   `@codaco/interviewer@<version>`. An 8.x hotfix also gets its `/v8/` tarball
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

5. **Merge the hotfix branch into main.** The pull request already exists
   from step 3 — merging the branch itself rather than re-applying its
   content matters: the normal lane refuses
   to deploy a tree that does not contain the newest released commit, so a
   cherry-pick — which makes a different commit — leaves main blocked. The
   merge brings the version bump and CHANGELOG with it. While you are there,
   remove **only** `'@codaco/interviewer'` from the changeset the hotfix consumed,
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
`interviewer-hotfix-production` environment, but a workflow file cannot enforce
its own protection: GitHub runs whichever copy of the YAML lives on the ref a
dispatch selects, so a branch copy with the guard and the `environment:` line
deleted would run instead. Only repository configuration closes that, and it is
what makes this lane safe to have:

1. Create the `interviewer-hotfix-production` environment.
2. Give it **required reviewers**, so a dispatch pauses for a human.
3. Restrict its **deployment branches** to `main`, so a job reaching for it from
   any other ref is refused.
4. Hold the deploy credentials (`NETLIFY_AUTH_TOKEN`, `NETLIFY_SITE_ID_INTERVIEWER`,
   the PostHog pair) as **environment** secrets rather than repository secrets,
   so a workflow copy that drops the `environment:` line gets nothing. Note the
   normal release lane reads the same names at repository scope today, so this
   step is a wider change than the hotfix lane alone — until it happens, steps
   2 and 3 are the protection.

**If a dispatch fails.** The tag is claimed before the production deploy, so a
run that goes red after tagging has left `@codaco/interviewer@<version>` pointing at
a version that may never have gone live. That state deliberately blocks later
releases rather than letting one quietly overwrite an unrecorded deploy. Check
what production is actually serving, then either re-run the deploy or delete the
tag before re-dispatching:

```bash
git push --delete origin '@codaco/interviewer@<version>'
```

## Sub-path dist tarball

Interviewer 9 serves Interviewer 8 at `/v8/` from its own deploy, so schema 8
protocols and the interviews already collected with them keep working beside
it. Interviewer 9 does not build Interviewer 8: it bundles a tarball attached
to an 8.x GitHub release, pinned by URL and sha256 in
`apps/interviewer/legacy-interviewer.json` on the schema-9 line.

The **App Sub-path Dist** workflow (`.github/workflows/app-subpath-dist.yml`,
`app: interviewer`; Architect uses the same workflow) makes that tarball. It
builds a released tag with `INTERVIEWER_BASE_PATH=/v<major>/` and attaches
`interviewer-v<major>-dist.tgz` (and its `.sha256`) to the tag's release:

```text
@codaco/interviewer@8.5.0  ->  interviewer-v8-dist.tgz  (base /v8/, caches interviewer-v8-*)
```

- **When it runs.** `apps-release-interviewer` and the Hotfix Release workflow
  chain it after every 8.x release, and the maintenance lane after every
  maintenance release. It is chained by `workflow_call` because a release
  created with `GITHUB_TOKEN` fires no tag or release event. It runs in its
  own job, so a failure never turns a release that has already shipped red.
  Dispatch it by hand from main (with `app: interviewer`) to retry. A chained
  run also receives the commit the lane built and released, and refuses a tag
  that points anywhere else: the tarball is built from the tag's tree, so it
  must be the released one. Only tags whose build reads
  `INTERVIEWER_BASE_PATH` are eligible (8.5.0 onwards). A release lane skips
  an older tag with a notice; a dispatch for one fails. A release that has the
  tarball but not its `.sha256` (a run that stopped between the two uploads)
  fails the run; dispatch it with `replace` to rebuild.
- **What a `/v8/` build is.** The same app, built under the base: Vite `base`,
  wouter's router base, manifest `start_url`, `scope` and `id`, and every
  service-worker route rebased to `/v8/`; caches named `interviewer-v8-*`; the
  manifest named "Interviewer 8" with no file handler. It is the interview
  alone: Interviewer 9 starts, resumes and reviews schema 8 interviews through
  its own `/interview/<id>` route, which frames `/v8/interview/<id>` (with
  `?mode=review` for a review) in a full-viewport same-origin iframe and hands
  over the lock's key by `postMessage`, so the researcher unlocks once, in
  Interviewer 9 (the contract is written out in
  `src/lib/interviewer9Embed.ts`). A top-level load of `/v8/interview/<id>`
  is replaced with `/interview/<id>`, and every other `/v8/` address with `/`.
  Framed, every way out of the interview posts `interviewer8:closed` to
  Interviewer 9 instead of navigating. Both apps use the one `interviewer` IndexedDB
  database: Interviewer 9 owns it (it declares the higher Dexie versions and
  runs every upgrade) and writes schema 8 rows in Interviewer 8's format, and
  the `/v8/` build writes nothing but the session row of the interview it is
  running, reading its lock rules from Interviewer 9's `'device'` settings
  row. Nothing is handed back. Every other address, an interview it cannot
  run, and every way out of an interview return to Interviewer 9; Home, the
  data view, Settings and onboarding are left out of the build. It is never
  offered for installation and hides the update pill and release notes; the
  lock is managed in Interviewer 9. `scripts/build.mjs` drops `_headers`
  and `_redirects` (Interviewer 9 owns the `/v8/` hosting rules: they must let
  only the same origin frame `/v8/*`, as `Content-Security-Policy:
frame-ancestors 'self'`, never a wider value, and must not send
  `X-Frame-Options: DENY` there; the build's own `<meta>` policy says
  `frame-ancestors 'self'`, but browsers ignore that directive in a meta
  policy, so the app itself only renders nothing when another origin frames
  it) and writes
  `dist-info.json`, and `scripts/assert-pwa-build.mjs` holds the shape. CI's
  quality-support job builds it on every pull request, and
  `pnpm --filter @codaco/interviewer test:e2e:subpath` drives it end to end.
- **Layout.** The archive root is the dist root (`index.html`, `sw.js`,
  `manifest.webmanifest`, `assets/`) plus `dist-info.json`
  (`{ tag, version, commit, base, cachePrefix }`), so the bundler extracts it
  straight into `dist/v8`. It has no `_headers`, `_redirects` or source maps.
  `scripts/release/package-app-subpath-dist.mjs` checks the shape again before
  packing (assets under the base, manifest `start_url` and `scope` equal to the
  base, a precache under the `interviewer-v<major>-` prefix Interviewer 9's
  worker treats as foreign) and rewrites `dist-info.json` from the released
  tag and commit.
- **Deterministic packing, not a reproducible build.** The archive is packed
  with `tar --sort=name --mtime=@0 --owner=0 --group=0 | gzip -n`, so the same
  dist always packs to the same bytes. The build itself is not reproducible:
  its precache id is random outside turbo. So the workflow **never replaces**
  an attached tarball unless it is dispatched with `replace`. A replaced
  tarball breaks the pin, and Interviewer 9's production build verifies the
  pin's sha256, so it would fail until the pin is bumped.
- **No PostHog.** The build gets no PostHog credentials, so it emits and
  uploads no source maps. Exceptions from `/v8/` are not symbolicated.
- **The pin.** The run's summary prints the pin, ready to paste:

  ```json
  {
    "v8": {
      "version": "8.5.0",
      "url": "https://github.com/complexdatacollective/network-canvas-monorepo/releases/download/%40codaco%2Finterviewer%408.5.0/interviewer-v8-dist.tgz",
      "sha256": "<64 hex characters>",
      "cachePrefix": "interviewer-v8-"
    }
  }
  ```

  The URL is the asset's `browser_download_url` as GitHub reports it. The
  workflow downloads it and checks its sha256 before printing. To ship it,
  update `legacy-interviewer.json` on the line that bundles it, in a pull
  request with an `'@codaco/interviewer': patch` changeset. Users get the new
  Interviewer 8 when that line next releases.

The job that builds runs the tag's code, so it holds a read-only token. Only
the publish job uploads, with `contents: write`. It runs nothing from the tag:
it downloads the packed artifact, re-verifies it, and uploads through the REST
API, never with `softprops/action-gh-release`, which would rewrite an existing
release's name, body and "Latest" flag.

## Maintenance releases (older major lines)

Once Interviewer 9 is production, an Interviewer 8 fix cannot go through the
normal or hotfix lane, because both deploy to the one production site and
refuse a version older than the newest release. The **App Maintenance
Release** workflow (`.github/workflows/app-maintenance-release.yml`,
`app: interviewer`) releases an older line instead. It tags the release,
creates a GitHub release that is never "Latest", and attaches the line's
sub-path tarball. It deploys nothing.

1. Cut the branch from the line's newest tag, cherry-pick the fix, and bump
   `apps/interviewer/package.json` and `CHANGELOG.md` by hand. Do not run
   `changeset version`, for the reason given under hotfix releases:

   ```bash
   git switch -c maintenance/interviewer-8.5.1 '@codaco/interviewer@8.5.0'
   git cherry-pick <sha>
   ```

2. Push the branch, then run the workflow **from main** with `app:
interviewer` and `source_ref` set to it. The `verify` job runs typecheck and
   tests across Interviewer's workspace dependency closure, then a
   `/v<major>/` build, because a maintenance branch gets no pull-request CI.
   After approval, the `release` job checks the version again, writes the
   notes since the line's previous release, claims the tag atomically, and
   creates the release. If the release is not created after the claim, the
   job deletes the tag again so the run can be repeated. A run that died
   before that cleanup (a lost runner or a timeout) leaves the tag with no
   release. Re-running it, or dispatching it again, deletes a tag that sits on
   the verified commit and has no release, then claims it again. This job
   holds the write token and runs nothing from the branch.
   `resolve-hotfix-release.mjs` in its line scope (`SCOPE=line`) requires:
   - a version newer than every release on its own major line;
   - a major below the newest release overall;
   - a tree that contains the line's newest tag.

   A maintenance tag that became the newest overall would leave production
   behind its own newest tag, and `app-release-guard.sh` would then skip every
   later release from main.

3. **Bump the pin** on the newer line to the tarball the run's summary prints
   (see [Sub-path dist tarball](#sub-path-dist-tarball)). Until that line
   releases, users keep the previous Interviewer 8.

There is **no merge back to main**. Main is on the newer major, and a merge
would bring this line's `package.json` and CHANGELOG into it. Land the fix on
main separately if it applies there too.

The in-app update check (fresco-ui's `selectLatestForApp`) picks the highest
version on the running app's major, so an 8.x maintenance release is never
offered to Interviewer 9 as an update, even though GitHub lists it first.
Inside Interviewer 9 the `/v8/` app shows no update pill at all: it changes
only when Interviewer 9 redeploys with a new pin.

The workflow has its own concurrency group per app. It does not share
`apps-release-@codaco/interviewer` with the other lanes: that group keeps only
one pending run, so a maintenance run waiting for approval could make a normal
release be dropped.

**Setup (load-bearing).** The `interviewer-maintenance-release` environment
has **required reviewers**, and its **deployment branches** are restricted to
`main`; keep them so. The reason is the same as for the hotfix lane: a
workflow file cannot enforce its own protection. The environment holds no
secrets, because the lane deploys nothing.

## Bundled Interviewer 8 (`/v8/`)

Interviewer 9 serves Interviewer 8 at `/v8/` from its own deploy, so schema 8
interviews keep running in Interviewer 8's interview screen. Only that screen
is used: every interview is started, resumed and reviewed through
`/interview/<id>`, which hosts a schema 8 interview in a same-origin iframe
at `/v8/interview/<id>` (with the same query) and hands it the unlock by
`postMessage` (`src/lib/interviewer8Embed.ts`), so the researcher unlocks
once, in Interviewer 9. Both majors share the one `interviewer` database.
`public/_headers` lets only this origin frame `/v8/*`
(`frame-ancestors 'self'`, checked by `scripts/assert-pwa-build.mjs`), and
this app's CSP allows `frame-src 'self'`. Interviewer 9 does not build
Interviewer 8. Each 8.x release attaches a build of itself made for `/v8/`,
`interviewer-v8-dist.tgz`, to its GitHub release (the **App Sub-path Dist**
workflow on the 8.x line), and `legacy-interviewer.json` in this directory
pins one of them:

```json
{
  "v8": {
    "version": "8.5.0",
    "url": "https://github.com/complexdatacollective/network-canvas-monorepo/releases/download/%40codaco%2Finterviewer%408.5.0/interviewer-v8-dist.tgz",
    "sha256": "<64 lowercase hex characters>",
    "cachePrefix": "interviewer-v8-"
  }
}
```

Until a release is pinned the file reads `{ "v8": null }`.

**What the build does.** `scripts/build.mjs` reads the pin through the
app-generic `scripts/buildtime/legacy-app.ts` (shared with Architect), runs
Vite, then has `scripts/buildtime/bundle-legacy-app.mjs` fetch the tarball,
check its sha256, refuse any entry that is not a plain file or directory or
would land outside the extraction directory, check `dist-info.json`
(`{tag, version, commit, base, cachePrefix}`) and the build itself against the
pin, drop its `_headers`, `_redirects` and source maps, and move it to
`dist/v8`. It runs after Vite has generated the service worker, so none of it
enters this app's precache (`globIgnores` repeats that). The same decision
sets the `__INTERVIEWER_V8__` define, so the app starts, resumes and reviews
schema 8 interviews exactly when `dist/v8` holds Interviewer 8. With an empty
pin the build bundles nothing, leaves no `dist/v8`, and the app shows schema 8
protocols as unavailable for interviews (their data can still be exported, and
they can be deleted).

The tarball comes from `INTERVIEWER_LEGACY_V8_TARBALL` when that names a local
copy, then from `node_modules/.cache/interviewer-legacy/<sha256>.tgz`, then
from the pinned URL (with retries; the download is cached). Whichever it is
must match the pin's sha256. Node's `fetch` ignores `HTTPS_PROXY` unless
`NODE_USE_ENV_PROXY=1`, so in a proxied sandbox download the asset yourself
and point `INTERVIEWER_LEGACY_V8_TARBALL` at it, or set
`INTERVIEWER_SKIP_LEGACY_V8=true` to build without Interviewer 8.

**The release guard.** The production builds in `apps-release-interviewer`
and the hotfix lane set `INTERVIEWER_REQUIRE_LEGACY_V8=true`, which fails the
build while nothing is pinned (and refuses `INTERVIEWER_SKIP_LEGACY_V8`), and
both lanes check `dist/v8` again before anything is tagged or deployed.
**Interviewer 9 cannot release until an Interviewer 8 build is pinned.** Both
variables are in the turbo cache key for `build`, so a required build never
replays one that bundled nothing; the pin file is a build input, so a new pin
never replays a cached `dist/v8`.

**Updating the pin** — after any 8.x release whose fix should reach `/v8/`:

1. Wait for the App Sub-path Dist run that the 8.x release lane chains (or
   dispatch it from main with the released tag). Its step summary prints the
   pin, ready to paste.
2. On the Interviewer 9 line, replace `legacy-interviewer.json` with that JSON
   and add a `patch` changeset for `@codaco/interviewer` saying which
   Interviewer 8 is now served at `/v8/`.
3. If that Interviewer 8 was built with a different
   `@codaco/protocol-validation` than the one the
   `protocol-validation-schema-8` alias in `package.json` names (15.0.0, the
   version Interviewer 8.4.0 ships), move the alias to it. Importing a schema
   8 file validates it with that alias, so an imported protocol is one the
   served Interviewer 8 would have imported.
4. Build once locally (`pnpm --filter @codaco/interviewer build`): it
   downloads the tarball, verifies it against the pin, and
   `assert-pwa-build.mjs` checks `dist/v8`.
5. Merge, and release Interviewer 9 as usual. `/v8/` changes only when
   Interviewer 9 is redeployed.

Never replace an uploaded tarball without updating the pin: the sub-path build
is not bit-for-bit reproducible, so a rebuilt asset no longer matches the
pinned sha256 and every later Interviewer 9 build fails until the pin is
bumped. The dist workflow refuses to replace one unless `replace` is set.

**The contract between the two builds**, checked by `assert-pwa-build.mjs`:

- Interviewer 8's worker precaches under `interviewer-v8-`. This app's cache
  reclaimer keeps `appCachePrefix: 'interviewer-'` (so it still reclaims older
  root 8.x caches) and is told that `interviewer-v8-` caches and `/v8/` windows
  belong to another worker (`foreignCachePrefixes`, `foreignScopePaths` in
  `vite.config.ts`). The pin's `cachePrefix`, the prefix in `dist/v8/sw.js`
  and the reclaimer's foreign prefixes must all agree.
- This app's worker does not answer `/v8` or `/v8/` navigations and does not
  cache images or fonts under `/v8/` (or from other origins). Its
  `/interview/` and `/assets/` routes match only those top-level paths.
  Workbox serialises each route's matcher into `sw.js`, so these exclusions
  are literals in `vite.config.ts`.
- `public/_redirects` sends every path under `/v8/` to Interviewer 8's shell
  before its own catch-all. It has no `/v8 /v8/ 301`: Netlify ignores a
  trailing slash when matching, so that rule would loop whenever nothing is
  bundled at `/v8/`, and Netlify already takes `/v8` to `dist/v8/index.html`
  when it exists. `public/_headers` holds Interviewer 8's shell, worker,
  manifest and icons (every stable path of this app, rebased under `/v8/`) to
  no-store and `/v8/assets/*` to a year's immutable cache, since Netlify reads
  neither file from inside `dist/v8`.
- `vite preview` applies no `_redirects`, so `vite.config.ts` adds a preview
  middleware (`scripts/buildtime/legacy-app-preview-plugin.ts`) that does the
  same for `dist/v8`, whenever it exists. An e2e spec can put a stub
  `dist/v8/index.html` there and navigate to `/v8/…`.

**Offline.** Interviewer 8 is never in this app's precache. Once this app has
rendered, its own worker is ready and active (a released 8.x root worker
would reclaim Interviewer 8's precache) and the browser is idle, it registers
`/v8/sw.js` with scope `/v8/` in the background, once per page load
(`src/lib/pwa/legacyInterviewerServiceWorker.ts`). When that worker is already
registered, it checks it for an update instead, so a deploy that changes the
pin downloads the new build on devices that never visit `/v8/`; the new build
waits and Interviewer 8 applies it on its next load. Interviewer 8's worker
downloads its own precache and keeps it across Interviewer 9 releases; its
cache name changes only when the pin changes. The status row, Settings and
each schema 8 card show whether the pinned build's precache is installed.

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

## Release smoke testing

Before approving a release, run the agent-driven release smoke test
(Claude Code: invoke `/interviewer-release-test` — the
`interviewer-release-test` skill, which launches the saved
`interviewer-release-test-workflow` in `.claude/workflows/` and carries the
launch/report/follow-up procedure). **Certification targets the release
candidate's own deployment, not the developer site**: for a normal release
that is the Version Packages PR's Netlify deploy preview (its tree carries
the bumped version, so pass `args: { url: <preview>, expectedVersion:
<bumped version> }`) — the developer site still serves `main`'s pre-bump
version until that PR merges, so it can neither serve nor certify the
version being shipped. Without `args`, the workflow drives
`https://interviewer.networkcanvas.dev` — the current state of `main` —
which is the right target for ad-hoc health checks between releases. Either
way it runs every core user journey with headless Playwright: protocol management, a
complete interview conducted entirely offline (the committed release-smoke
walker over the fourteen-stage, two-language schema 9 fixture protocol,
proving the precache serves the whole engine without network and that the
schema 9 runtime works offline), session and data management, export in every
format combination, device-lock enrolment through revocation, service-worker
and offline behaviour, and settings. Each journey runs in its own isolated
browser profile; every reported failure is independently re-examined by a
second agent, and a failure no verifier could adjudicate still blocks at
blocker/major severity — reported explicitly as unverified, and capping the
run at `INCOMPLETE` — rather than being trusted; the run returns a verdict
of `PASS`,
`PASS_WITH_ISSUES`, `INCOMPLETE`, or `BLOCK` (or `BLOCKED` when preflight
cannot reach the target or its tooling), plus a markdown summary and an
evidence directory of screenshots.

For the changeset lane the candidate is the Version Packages PR's deploy
preview, as described above — never `main`'s developer site, which cannot
serve the bumped version before that PR merges. A **hotfix** likewise ships
its own tree: open the hotfix branch's pull request into `main` (the
merge-back the hotfix procedure requires anyway) BEFORE dispatching the
Hotfix Release workflow — its Netlify deploy preview is the candidate.
Certify that preview via
`args: { url: "…", expectedVersion: "<the hotfix's bumped version>",
hotfix: true }` (the `hotfix` flag permits the documented dev-protocol
schema-skew skip that only an older release line legitimately hits),
then dispatch; never certify a hotfix against the developer site, and never
dispatch production before the preview has its verdict.

The workflow concentrates on what the Playwright E2E suite deliberately does
not cover — the suite blocks service workers and never touches the deployed
bits, while this gate conducts its interview offline against them. It needs a checkout of this
monorepo with dependencies installed (it installs Playwright's chromium on
first use). When certifying, always pass both `url` (the candidate's deploy
preview) and `expectedVersion` (the version that preview's tree ships) so a
stale or wrong deployment cannot produce the verdict — the binding is
enforced in code, preflight refuses a mismatch, and a run without
`expectedVersion` is marked `certifying: false` in its result and summary. Pass
`args: { journeys: ["data-export"] }` to re-run a
subset. Journeys are tiered across models for token efficiency (most run on
Sonnet; the full interview walk and all failure verifiers run on Opus);
`args: { model: "…" }` overrides the journey tier wholesale, while verifiers
stay pinned so the gate keeps its rigor.

## How CI builds

```bash
pnpm exec turbo run build --filter=@codaco/interviewer
```

The app's `build` command runs Vite and then `scripts/assert-pwa-build.mjs`, which
fails the build if the service worker, manifest, or icons are missing from
`dist/`, or if a critical JS chunk (the interview engine, mapbox-gl, the entry
point) or responsive stage-preview image got silently dropped from the Workbox
precache manifest, or if any of the dev-only Development protocol (its JSON or
media, matched by content) is in `dist/`. A deploy that passes this assertion is
one that will actually boot and render the interview menu offline; treat an
assertion failure as a hard release blocker, not a warning to route around.
The assertion also validates the emitted `_headers`: the service worker, HTML shell (including
requested SPA deep links), manifest, and stable icons must use
`no-store, no-cache, max-age=0, must-revalidate`, while only content-hashed
`/assets/*` may use a one-year immutable cache. The generated worker assertion
also ensures its image runtime cache excludes every stable PWA icon, because
Cache API writes would otherwise bypass those HTTP directives.

The production custom domain is fronted by Cloudflare, so this repository rule
is necessary but cannot override an account-level Browser Cache TTL rule. Keep
Cloudflare set to **Respect Existing Headers** (with no cache rule that replaces
these origin directives), and verify `/`, `/sw.js`, `/index.html`, and
`/manifest.webmanifest` return the no-store policy after each release. A
response with a positive browser `max-age` is a release blocker even when the
build assertion passed, because it means an intermediary replaced the emitted
contract.

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

- On a fresh navigation outside an active interview, the pre-render startup
  check activates a waiting worker while the static loading screen remains
  visible. Startup then continues on the same navigation; activation never
  calls `reload()`.
- An update the hourly poll surfaces later in a long-lived session, or one that
  arrives after any app UI has rendered, stays in the **update available** state
  until the researcher opens the version indicator and chooses **Install and
  reload**. Neither `AppUpdateProvider` nor `vite-plugin-pwa` may reload the
  page independently.
- While an interview is in progress (`/interview/*`), the fresh-load activation
  check is skipped. The update can only reload that active interview if the
  researcher explicitly chooses **Install and reload**; it never happens
  automatically.
- After a user-requested reload, the version indicator shows the recently
  updated state and exposes the changelog for the running version.

Because of this, a production deploy is not instantaneous for already-open
tabs: they keep running their current build until the researcher explicitly
installs the update. There is no forced-update mechanism and none should be
added — see the interview-active guard above.

The worker deliberately uses `clientsClaim: false`, a build-scoped precache,
and no blanket `cleanupOutdatedCaches`. Turbo's task fingerprint names deployed
build artifacts, so two same-version developer deployments with different
assets cannot prune each other's caches. Service-worker activation advances
every client already using the registration, even without `clientsClaim`; it
does not reload those documents. The new worker therefore resolves an older
interview's exact content-hashed JS/CSS URLs across retained precaches, while
HTML navigation fallbacks remain pinned to the active worker's own precache.
This keeps the older loaded bundle usable offline without risking an ambiguous
`index.html` match. Each page also reports its compiled build ID to the worker.
The worker reclaims only precaches that no responsive open page has leased;
any legacy, frozen, or nonresponding page blocks cleanup, and an installing or
waiting worker blocks it as well. This preserves open work without allowing
old build caches to accumulate indefinitely.
`scripts/assert-pwa-build.mjs` verifies these generated-worker invariants.

## PostHog source maps

Only the production release job sets `POSTHOG_PERSONAL_API_KEY` and
`POSTHOG_PROJECT_ID` (repository secrets shared with Architect and Documentation;
the personal API key needs the _error tracking: write_ and _organization: read_
scopes). Their presence is what switches source-map upload on: the build emits
`hidden` maps, the shared Vite hook uploads them, and deletes them from `dist/` —
so the exceptions `posthog-js` reports symbolicate to real source while the
deploy still ships no maps. The hook processes the completed output directory
so maps for Web Workers emitted as parent-build assets are included too. Every
other build — local, PR, Netlify preview, the `.dev` site — has no credentials
and emits no maps at all.

A failed upload fails the build rather than deploying unsymbolicated. Both
variables are part of the Turbo cache key for `build`, so a production build can
never replay a cached artefact whose maps were never uploaded, and
`scripts/assert-pwa-build.mjs` fails if a map is left behind anywhere in `dist`
(the Workbox precache globs do not include maps, so a stray map would ship
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
