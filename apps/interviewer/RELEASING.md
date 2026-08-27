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
way it runs every core user journey with headless Playwright: protocol management, the
full Sample Protocol interview, session and data management, export in every
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
its own tree: point the workflow at a deployment of the hotfix branch — for
example the Netlify deploy preview of its pull request into `main` — via
`args: { url: "…", expectedVersion: "<the hotfix's bumped version>" }`, and
never certify a hotfix against the developer site.

The workflow concentrates on what the Playwright E2E suite deliberately does
not cover — the suite blocks service workers and conducts a lean fixture
protocol, not the 30-stage Sample Protocol. It needs a checkout of this
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
