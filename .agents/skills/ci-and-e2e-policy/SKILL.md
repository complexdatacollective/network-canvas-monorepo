---
name: ci-and-e2e-policy
description: 'Use when working on CI configuration in the network-canvas monorepo, or when interpreting a CI result — which E2E suites run and why, how the two-job pixel/native split works, verdict reuse on generated release branches, Storybook interaction-test determinism, Chromatic and TurboSnap wiring, and the E2E visual snapshot baseline workflow. Keywords: CI, quality gate, E2E selection, affected E2E, release-e2e-policy, e2e-native, merge group, Chromatic, TurboSnap, preview-stats.json, optimizeDeps, test:storybook, visual baseline, snapshot PR, E2E status comment, integration branch, schema-9, pull_request branches.'
---

# CI and E2E policy

How this repository decides what CI runs, and the constraints that keep each
suite deterministic.

#### Which pull requests get CI

Pull requests into `main` and into long-lived integration branches run the same
CI. Name an integration branch `integration/<name>`; schema-version branches
(`schema-<n>`, such as `schema-9`) are covered too. The trigger is a branch
pattern (`pull_request: branches: [main, 'integration/**', 'schema-*']` in
`.github/workflows/ci-and-release.yml`), so a new branch that follows the
convention needs no workflow change. GitHub reads the workflow from the pull
request's merge with its base, so the integration branch itself must contain
this trigger: cut a new one from `main`, and merge the change into an older one
before expecting CI on its pull requests.

A pull request into an integration branch gets full CI but no merge queue and no
required checks, because the rulesets target only `main`: `quality` is advisory
there, and the pull request merges when its author decides. `push` stays
`[main]`, so no release, publish, deploy or mirror job ever runs for an
integration base. One branch can back pull requests into several bases, so
nothing that remembers earlier runs, reports or release PRs may key on the
branch alone: runs are titled `PR #<n> → <base> · <title>` (the workflow's
`run-name`) and are matched on that title, Pages reports are keyed by pull
request number, and a generated release branch counts as a release PR only when
it targets `main`. Chromatic runs only for the Version Packages PR into `main`;
see "Chromatic and TurboSnap" below.

#### Storybook interaction tests

`test:storybook` (`vitest run --project=storybook`) executes every story's
play function and assertions in a real browser. Seven workspaces define it:
`@codaco/architect`, `@codaco/art`, `@codaco/fresco-ui`, `@codaco/interview`,
`@codaco/interviewer`, `@codaco/protocol-builder`, and `fresco`. The
`test-storybook` CI job runs them through Turbo in three legs (fresco-ui;
interview; the other five) and the `quality` gate requires it. fresco-ui's
stories also run in Firefox, but in CI only on generated release PRs
(`STORYBOOK_FIREFOX`, read by its `vitest.config.ts`). Chromatic does
not replace this: it has no project for Architect, Fresco or Protocol Builder,
and it runs only when someone requests a review of a release.

A workspace joins that set by declaring the script and taking a leg in
`STORYBOOK_SHARDS` (`scripts/ci/test-shards.mjs`). The guard suite fails while
a workspace declares the script but has no leg, because every leg would negate
it and nothing would run it. `turbo.json` defines `test:storybook`
generically, and each leg runs the affected suites of its bucket. Confirm a
workspace is in by reading the task list rather than the workflow:
`pnpm exec turbo run test:storybook --dry=json` and keeping the tasks whose
`command` is a real command — turbo lists a task for every workspace, with
`<NONEXISTENT>` as the command where the script is absent.

Every story also runs the right-to-left mirror check (`mirrorAddon` from
`@codaco/storybook-config/i18n`, listed first in the preview's `addons` so its
`afterEach` runs after the accessibility audit, on by default through the
preview's `mirror` tag): the story is remounted in each direction
and the two layouts compared with `@codaco/e2e-helpers/direction-audit`. It
roughly doubles a Storybook's run time. A story opts out with `!mirror` and a
comment; stories that render through Storybook's `useArgs` must, because a
remount outside Storybook's own render cannot call preview hooks.

Two constraints keep these suites deterministic, both documented at length in
the configs themselves. Each project's `optimizeDeps.include` must list every
dependency reachable only through Storybook's virtual project-annotations
module — an incomplete list re-optimises mid-run and fails the whole suite with
"Failed to fetch dynamically imported module" on a cold cache while passing on
a warm one, so always verify against a cleared
`node_modules/.cache/storybook/*/*/sb-vitest`. And the CI job runs Turbo with
`--concurrency=1`, because suites run in parallel starve each other's browsers
on a four-core runner.

#### Chromatic and TurboSnap

Chromatic reviews the rendering of a release once, after the release has
settled, rather than on every pull request or every push. It has three
projects: `@codaco/fresco-ui`, `@codaco/interview`, and `@codaco/interviewer`.
Each job in `.github/workflows/chromatic.yml` uses its matching
`CHROMATIC_PROJECT_TOKEN_FRESCO_UI`, `CHROMATIC_PROJECT_TOKEN_INTERVIEW`, or
`CHROMATIC_PROJECT_TOKEN_INTERVIEWER` repository secret.

The review process for a Version Packages PR:

1. When the release is ready, request the review:
   `gh workflow run chromatic.yml --ref changeset-release/main`. The workflow
   has no other trigger and refuses every other branch, because builds on
   other branches spend snapshots and set baselines that no release check
   reads.
2. A build whose changes nobody has accepted fails. Accept or deny each change
   in Chromatic, or fix the code in a pull request to `main`. Then run the
   workflow again.
3. When every project passes, the workflow re-runs the failed jobs of the
   release PR's CI run for that head. The `version-packages-freshness` job
   step "Refuse a release PR whose visual review has not passed" finds the
   successful run for the exact head, and `quality` passes. The step runs in
   the merge group as well, so the queue checks the head that it merges.
4. Every push to `main` regenerates the release branch, so request the review
   again for the head that will merge. Changes accepted on an earlier head of
   the branch are not reported again, because Chromatic carries accepted
   baselines from the latest build on a branch across force-pushes.

Until the repository variable `CHROMATIC_RELEASE_REVIEW` is set to
`required`, a missing review is reported as a warning and does not block the
merge. Set it once the workflow has been verified against an account that has
snapshots left.

Baselines need no builds on `main`. The merge queue merges with a merge
commit, so the release head approved in Chromatic becomes an ancestor of
`main`, and the next release branch, which is regenerated from `main`, finds
that build as its ancestor build. Do not change the queue's merge method to
squash or rebase without revisiting this.

Chromatic exits 0 when the account is over its snapshot limit, and its log
then says "Billed snapshot limit reached" and "No tests run". The step
"Confirm Chromatic tested the stories" (`scripts/ci/chromatic-observability.mjs`)
fails such a build, and a build whose project has UI Tests turned off, so that
neither can count as a review.

Because Chromatic builds its three Storybooks only during a release review, the
`quality-support` step "Build the Storybooks" runs `build-storybook` for them
and for `@codaco/protocol-builder`, which has no Chromatic project, on every
pull request (cached through Turbo). Without that step nothing in CI would
build them before a release: `turbo run build --filter='./packages/*'` skips a
package with no `build` script, and `test:storybook` serves stories through
Vite's dev server rather than producing the static bundle. Nor does
`test:storybook` read the generated docs entries — a CSF file with
`tags: ['autodocs']` and no story exports is reported as a skipped file and
contributes no test — so a Storybook whose docs cannot be built is green
there. A workspace that gains a Storybook needs a filter in that step too.

Each project's `build-storybook` script must emit `preview-stats.json` with
Storybook's `--stats-json` option. Its `chromatic` script uploads the prebuilt
`storybook-static` directory with `--only-changed` and the correct
`--storybook-base-dir`; these inputs and the workflow's full Git history are
required for TurboSnap. Keep Interview's `.storybook/static/**` directory in
its Chromatic externals so static-asset changes invalidate the relevant
stories. Do not add `--exit-zero-on-changes`: the review depends on a build
with unaccepted changes failing.

TurboSnap compares a build with its ancestor build, which is normally the
previous release, so it recaptures only the stories that a change since then
can reach. It recaptures a whole project when anything imported by that
project's `.storybook/preview` file has changed. The import chain from the
preview through `tooling/storybook/src/i18n.tsx` reaches all of
`@codaco/shared-consts`, so most releases recapture every story. Chromatic CLI
18.15.1 or later is required: earlier versions could not pair the workspace
manifests with the root `pnpm-lock.yaml`, and they recaptured every story
whenever any `package.json` changed. The version bumps on the release branch
itself are not dependency changes.

Chromatic captures every story in an unfocused background tab. There
`document.hasFocus()` is false and `:focus` / `:focus-visible` never match,
even though `element.focus()` still sets `document.activeElement` and fires
`focus`. A play function that focuses a trigger and then waits for
focus-gated UI (Base UI tooltips and popovers open on focus only while the
trigger matches `:focus-visible`) passes `toHaveFocus()` and then times out
in Chromatic while staying green under `test:storybook`, whose Playwright
focus emulation reports every page as focused. Drive such stories through
hover (JS-dispatched pointer events ignore window focus), or keep the
keyboard story and exclude it from Chromatic with
`parameters.chromatic.disableSnapshot`, which also skips its play function.

Hover-first plays race React's passive effects. Storybook starts the play as
soon as the story has committed, before `useEffect` callbacks run in their
scheduler task; Base UI attaches a tooltip trigger's `mouseenter` listener in
one and blocks hover until it fires, so `userEvent.hover` on the first line of
a play is swallowed and the tooltip never opens. Playwright-driven input in
`test:storybook` is slow enough to cross the gap; Chromatic's JS-dispatched
events are not. Await `awaitPassiveEffects()` from
`packages/fresco-ui/src/storybook-support` before the first synthetic
interaction of such a play.
Confirm a Chromatic result really ran before trusting it: a build over the
account's monthly snapshot limit reports success while running a handful of
tests or none at all (`Running N tests (skipping M tests)`, or "did not run"
on the build page).

#### Affected E2E checks

CI runs the Architect, Interview, and Interviewer E2E suites on feature PRs
(into `main` or an integration branch) when the cumulative PR diff touches the
suite subject or anything in its workspace dependency closure. A change to `@codaco/interview`,
for example, runs all downstream suites; an Architect-only change runs
Architect E2E. The classifier treats `docs/`, `.changeset/`, and Markdown as
inert, and fails closed for root configs, workflows, scripts, the lockfile,
unrecognised paths, or unreadable history.

Generated release branches (`changeset-release/*`) keep their release-aware
selection: only suites whose subjects ship in that release lane run. The normal
Changesets lane (`changeset-release/main`) runs all three because it versions
libraries, Architect, and Interviewer; the Website lane runs Interview because
its protocol previews ship `@codaco/interview`; the Documentation and Studio
lanes run none. The mapping and feature-PR classifier live in
`scripts/ci/release-e2e-policy.mjs`, with tests derived from the real package.json
dependency graph. The required `quality` check requires exactly the suites the
policy selects.

Each suite runs as **two jobs**. `<suite>-e2e` runs inside the pinned
Playwright image and compares the committed PNG baselines; `<suite>-e2e-native`
runs everything else on a plain runner, where it gets the Turbo remote cache
the container is structurally denied. The pinned image is required for
rasterising pixels and nothing else — Architect's JSON stage snapshots come
from IndexedDB protocol JSON rather than the DOM, and Interview's ARIA
snapshots are accessibility-tree text that is already regenerated on developer
macOS hosts and compared in Linux CI. The split key is the selector each
suite's `test:e2e:update-snapshots` script already uses (`--grep @visual`, or
`--project=*-visual` for Interview), so the lanes cannot drift from the
regeneration workflow. Both halves are required by `quality`, and
`E2E_JOB_NAMES` in `scripts/ci/release-e2e-policy.mjs` requires both to be green
before a verdict can be reused. The capture helpers throw when
`E2E_PIXEL_LANE=native` is set, so a mis-tagged visual test fails loudly
instead of silently comparing container baselines against a runner's fonts.
Interview's pixel lane captures only `chromium-visual` on feature PRs. The
`firefox-visual` and `webkit-visual` captures (two thirds of the lane) run on
generated release PRs, where the lane always runs in full, and in benchmark
dispatches. A Firefox- or WebKit-only image change therefore surfaces on the
release PR, whose snapshot-failure path opens the baseline-update PR described
below. The native lane's Firefox and WebKit functional tests still run on every
selected PR.

Feature PRs never inherit an E2E verdict from an earlier commit: suite
selection uses the cumulative merge-base-to-current-head diff, so every
required verdict describes the exact head under review.

Each PR run upserts one sticky **E2E status** comment (the informational
`e2e-report` job): a single Status/Name/Report/Reason table over all six
suite jobs, where Reason is the policy's per-suite selection explanation
(the witness changed path, lane membership, or reuse). Only FAILED jobs
publish their Playwright report, to GitHub Pages at
`https://complexdatacollective.github.io/network-canvas-monorepo/<job-name>/<branch-slug>-pr<number>/`;
each pull request keeps only its latest run's report (the number is in the key
because one branch can back pull requests into several bases), and a later
green run removes the stale one, along with any report the same branch
published under the older number-less key. Every report run also sweeps
directories that match no live branch and no open pull request, so reports for
merged or deleted branches disappear on the next publish from any branch.

Generated release branches use equivalence reuse: a suite is skipped when the
newest equivalent native pull-request verdict across the generated release
branches is successful and the diff since that commit touches only paths that
provably cannot affect the suite — files in workspace packages outside the
suite subject's declared workspace dependency closure (dependencies,
devDependencies, peerDependencies, optionalDependencies), or the inert
`docs/`, `.changeset/`, `*.md` set. Every guard fails closed: an unfetchable
commit, Actions-API doubt, a fork head, a conclusive failure as the newest
verdict, or any unrecognised path (root configs, `.github/`, `scripts/`, the
lockfile) re-runs the suite. Force-pushed refreshes of a release PR after
unrelated merges to `main` therefore keep their E2E verdicts without
re-running, while any change that ships in the lane re-runs as before (see
`scripts/ci/release-e2e-policy.mjs`).

Merge groups run only a lightweight `quality` acknowledgement. The main
ruleset requires every pull request to pass its full `quality` check before it
can enter the queue, so merge-group commits deliberately do not repeat lint,
tests, typechecking, builds, E2E, or Chromatic. GitHub still requires the
`quality` context to be reported on the merge-group SHA; the acknowledgement
exists only to satisfy that protocol and does not revalidate the combined
queue commit. The one real merge-group check is `version-packages-freshness`:
it runs on every queue commit, decides by ancestry whether the tree contains
the open Version Packages PR's head (the queue batches up to five entries and
a group's ref names only its last PR, so the ref cannot say), and if so fails
when the merged tree still carries a normal-lane changeset — a stale Version
Packages merge makes `changesets/action` regenerate the PR instead of
publishing. An entry that lands a changeset on top of the release PR fails
and drops out, letting the release PR merge alone. `quality` consults the
verdict before the merge-group early exit.

The release jobs create and update generated branches with the fine-grained PAT
stored as `RELEASE_PR_TOKEN`. That causes the normal `pull_request` workflow to
start without manual approval. Do not add a separate workflow dispatch: it would
duplicate the native CI run and its selected E2E suites.

#### E2E visual snapshot baselines

When an intentional rendering change requires new committed Playwright PNGs,
invoke the `regenerating-e2e-visual-snapshots` skill. The manual
`Regenerate E2E Visual Snapshots` GitHub Actions workflow runs only the
selected Architect, Interview, or Interviewer capture code and uploads its
images; it does not run normal tests or quality jobs. Inspect every artifact
before committing selected baselines.

On a generated release PR, a visual-snapshot E2E failure automatically runs the
same focused generation-only workflow. If it produces changed baseline PNGs, a
trusted follow-up opens or updates one serialized PNG-only PR against `main`.
Failures from multiple release gates accumulate in that shared PR instead of
creating per-product copies. Review every image; merging the snapshot PR accepts
the baselines, refreshes every generated release branch from `main`, and reruns
their E2E gates. Functional failures do not start regeneration, and no PNG
changes means no snapshot PR.

Keep Interview ARIA snapshot updates in the targeted local matrix workflow.
Do not confuse E2E PNG baselines with `@codaco/interface-images`, whose
committed WebP files are generated locally for stage thumbnails and
documentation. CI and Netlify consume those files without regenerating them.

#### Video steps cannot run locally on arm64

Playwright's arm64 Linux Chromium crashes (`SIGILL`, reported as
`Target crashed`) as soon as a decoded video frame is presented — a visible
`<video>`, or `drawImage` of one onto a canvas. Decode itself is fine, and
Firefox and WebKit are unaffected. So on an Apple-silicon dev VM, any Chromium
step that presents a video frame crashes the page.

This is an environment limitation, diagnosed and recorded in
`dev-vm/README.md`'s troubleshooting list; it is not a product or test defect.
No CI e2e suite presents a video frame: Architect's video authoring is covered
only by the agent-driven `architect-release-test`, which uploads and shows the
sample protocol's videos and refuses to run its build on Linux arm64. Run that
from the macOS host or an x86-64 machine, and do not spend time re-diagnosing
the crash.
