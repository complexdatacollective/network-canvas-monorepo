---
name: ci-and-e2e-policy
description: 'Use when working on CI configuration in the network-canvas monorepo, or when interpreting a CI result — which E2E suites run and why, how the two-job pixel/native split works, verdict reuse on generated release branches, Storybook interaction-test determinism, Chromatic and TurboSnap wiring, and the E2E visual snapshot baseline workflow. Keywords: CI, quality gate, E2E selection, affected E2E, release-e2e-policy, e2e-native, merge group, Chromatic, TurboSnap, preview-stats.json, optimizeDeps, test:storybook, visual baseline, snapshot PR, E2E status comment.'
---

# CI and E2E policy

How this repository decides what CI runs, and the constraints that keep each
suite deterministic.

#### Storybook interaction tests

`test:storybook` (`vitest run --project=storybook`) executes every story's
play function and assertions in a real browser. Five workspaces define it:
`@codaco/architect`, `@codaco/fresco-ui`, `@codaco/interview`,
`@codaco/interviewer`, and `fresco`. The `test-storybook` CI job runs them
through Turbo and the `quality` gate requires it. Chromatic does not replace
this: it has no project for Architect or Fresco, and TurboSnap only
re-captures the stories a pull request changed.

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

Chromatic runs from `.github/workflows/chromatic.yml` as three independent
projects: `@codaco/fresco-ui`, `@codaco/interview`, and
`@codaco/interviewer`. The workflow uses Turbo's package graph and the Git diff
to run only affected projects, including downstream consumers (a Fresco UI
change affects all three; an Interview change also affects Interviewer). Each
job uses its matching `CHROMATIC_PROJECT_TOKEN_FRESCO_UI`,
`CHROMATIC_PROJECT_TOKEN_INTERVIEW`, or
`CHROMATIC_PROJECT_TOKEN_INTERVIEWER` repository secret.

Each project's `build-storybook` script must emit `preview-stats.json` with
Storybook's `--stats-json` option. Its `chromatic` script uploads the prebuilt
`storybook-static` directory with `--only-changed` and the correct
`--storybook-base-dir`; these inputs and the workflow's full Git history are
required for TurboSnap. Keep Interview's `.storybook/static/**` directory in
its Chromatic externals so static-asset changes invalidate the relevant
stories.

#### Affected E2E checks

CI runs the Architect, Interview, and Interviewer E2E suites on feature PRs
targeting `main` when the cumulative PR diff touches the suite subject or
anything in its workspace dependency closure. A change to `@codaco/interview`,
for example, runs all downstream suites; an Architect-only change runs
Architect E2E. The classifier treats `docs/`, `.changeset/`, and Markdown as
inert, and fails closed for root configs, workflows, scripts, the lockfile,
unrecognised paths, or unreadable history.

Generated release branches (`changeset-release/*`) keep their release-aware
selection: only suites whose subjects ship in that release lane run. The normal
Changesets lane (`changeset-release/main`) runs all three because it versions
libraries, Architect, and Interviewer; the Documentation, Website, and Studio
lanes run none. The mapping and feature-PR classifier live in
`scripts/release-e2e-policy.mjs`, with tests derived from the real package.json
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
`E2E_JOB_NAMES` in `scripts/release-e2e-policy.mjs` requires both to be green
before a verdict can be reused. The capture helpers throw when
`E2E_PIXEL_LANE=native` is set, so a mis-tagged visual test fails loudly
instead of silently comparing container baselines against a runner's fonts.
Feature PRs never inherit an E2E verdict from an earlier commit: suite
selection uses the cumulative merge-base-to-current-head diff, so every
required verdict describes the exact head under review.

Each PR run upserts one sticky **E2E status** comment (the informational
`e2e-report` job): a single Status/Name/Report/Reason table over all six
suite jobs, where Reason is the policy's per-suite selection explanation
(the witness changed path, lane membership, or reuse). Only FAILED jobs
publish their Playwright report, to GitHub Pages at
`https://complexdatacollective.github.io/network-canvas-monorepo/<job-name>/<branch-slug>/`;
each branch keeps only its latest run's report, and a later green run removes
the stale one. Every report run also sweeps directories whose slug matches no
live branch, so reports for merged or deleted branches disappear on the next
publish from any branch.

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
`scripts/release-e2e-policy.mjs` and
`docs/superpowers/specs/2026-07-17-release-e2e-equivalence-reuse-design.md`).

Merge groups run only a lightweight `quality` acknowledgement. The main
ruleset requires every pull request to pass its full `quality` check before it
can enter the queue, so merge-group commits deliberately do not repeat lint,
tests, typechecking, builds, E2E, or Chromatic. GitHub still requires the
`quality` context to be reported on the merge-group SHA; the acknowledgement
exists only to satisfy that protocol and does not revalidate the combined
queue commit.

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
