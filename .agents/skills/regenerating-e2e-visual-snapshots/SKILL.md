---
name: regenerating-e2e-visual-snapshots
description: 'Regenerate, inspect, and adopt the committed Playwright PNG baselines for Architect, Interview, or Interviewer using the dedicated GitHub Actions workflow. Use when an intentional UI change causes E2E pixel diffs, when a generated release PR fails a visual comparison, when CI opens a child baseline-update PR, or when the canonical Linux images cannot be produced locally. Keywords: regenerate snapshots, update snapshots, visual baseline, pixel baseline, Playwright image, screenshot diff, summary-print.png, codebook.png, snapshot update PR.'
---

# Regenerating E2E visual snapshots

Produce platform-canonical PNGs in CI, inspect them, and adopt only the
intended baseline changes. Keep generation separate from normal verification.

## Guardrails

- Confirm that the rendered change is intended before replacing a baseline. A
  failed pixel comparison is evidence to investigate, not permission to accept
  every generated image.
- Use `.github/workflows/regenerate-e2e-visual-snapshots.yml`. Its sole job is
  to run the selected suite's minimal Playwright capture selectors and upload
  the generated PNGs. Do not add lint, typecheck, unit, functional, matrix,
  ARIA, or other quality checks to this workflow.
- Treat the capture cases themselves as the image generator: they include only
  the setup and interactions needed to reach each captured state.
- Do not use `pnpm generate:interface-images`. That separate
  `@codaco/interface-images` pipeline creates cached WebP stage thumbnails for
  Architect and the documentation site; it does not create committed E2E
  baselines.
- Do not update Interview ARIA snapshots here. Regenerate those locally with a
  targeted `*-matrix` Playwright project after verifying the DOM change.
- Never commit Playwright report `actual`, `diff`, or failure screenshots as
  baselines without visually inspecting them.

## Respond to a release E2E failure

The complete Architect, Interview, and Interviewer E2E suites run in CI only for
the generated library branch `changeset-release/main`, the independent product
branches `changeset-release/architect`, `changeset-release/interviewer`,
`changeset-release/documentation`, and `changeset-release/website`, and merge
groups whose package or product versions trigger a release. The required
`quality` check conditionally waits for all three E2E results in those cases.
Ordinary PRs skip E2E and never inherit an older E2E result.

The release automation explicitly dispatches CI after creating or updating a
generated release branch, so a normal release PR does not need a manual E2E
trigger.

When an E2E suite reports a visual-snapshot failure on a generated release PR,
CI invokes this workflow for that suite's focused capture cases. If generation
succeeds and produces changed committed PNGs, a trusted follow-up job opens or
updates one repository-wide PNG-only PR:

- The snapshot PR targets `main` from the stable `e2e-snapshots/main` branch.
- A repository-wide concurrency group serialises updates, and each run restores
  already-proposed PNGs before adding another suite so concurrent release gates
  accumulate in one PR instead of replacing or duplicating changes.
- Every affected release PR links to the shared snapshot PR.
- Merging it accepts the reviewed baselines on `main`; release automation then
  refreshes every generated release branch and reruns its E2E gate.

Canonical captures must not encode values that differ only because a generated
release branch bumped package metadata. Mask such a value while asserting it
semantically before capture; otherwise a baseline produced for one product gate
can make a sibling gate fail after the shared PR merges.

Inspect every changed image before merging the snapshot PR. Functional or
environmental failures do not start regeneration. If the focused generator
produces no PNG changes, CI does not open a PR. Merge-group failures do not open
snapshot PRs because they are not tied to an open generated release PR.

## Generate manually in CI

1. Commit and push the rendering change to a feature branch. The workflow
   checks out the selected ref, so unpushed code cannot affect its images.
2. Dispatch the workflow from GitHub Actions, selecting `architect`,
   `interview`, or `interviewer`, or run:

   ```sh
   branch=$(git branch --show-current)
   gh workflow run regenerate-e2e-visual-snapshots.yml \
     --ref "$branch" \
     -f suite=architect
   ```

   Substitute `suite=interview` for Interview matrix pixels or
   `suite=interviewer` for Interviewer captures.

3. Find and watch the new workflow-dispatch run:

   ```sh
   gh run list \
     --workflow regenerate-e2e-visual-snapshots.yml \
     --branch "$branch" \
     --event workflow_dispatch \
     --limit 5
   gh run watch <run-id> --exit-status
   ```

4. Download the matching artifact into a temporary directory:

   ```sh
   artifact_dir=$(mktemp -d)
   gh run download <run-id> \
     --name e2e-visual-snapshots-architect \
     --dir "$artifact_dir"
   ```

   Use `e2e-visual-snapshots-interview` for Interview or
   `e2e-visual-snapshots-interviewer` for Interviewer.

GitHub can dispatch a workflow only after that workflow exists on the default
branch. On the PR that first introduces this workflow, use the pinned local
Docker command below or inspect the `actual` PNG from the ordinary failing CI
artifact. Do not temporarily add generation to the normal quality workflow.

## Inspect and adopt

The workflow re-captures EVERY snapshot in the suite, so most artifact files
are byte-identical to the committed baselines. List what actually changed by
running a byte comparison from the suite's `visual-snapshots/` parent (a
`CHANGED` file with no committed counterpart is a new snapshot; a committed
PNG absent from the artifact belongs to a removed capture — delete it
deliberately):

```sh
# from the repo root; shown for Interview — for the other suites substitute
# the package dir from the canonical-location list below (apps/architect,
# apps/interviewer)
snapshots=packages/interview/e2e/visual-snapshots
cd "$snapshots"
for f in $(cd "$artifact_dir/$snapshots" && find . -name '*.png'); do
  cmp -s "$f" "$artifact_dir/$snapshots/$f" || echo "CHANGED: $f"
done
```

Interview's map-based Geospatial captures come back byte-different on every
run — sub-threshold Mapbox render noise that still passes `toHaveScreenshot`.
Do not adopt them unless the Geospatial interface itself intentionally
changed.

Inspect every generated image against its committed baseline. Check the region
that was expected to change and scan the rest for shifted layout, missing
assets, fallback fonts, loading states, or browser-specific regressions.

Copy each approved PNG individually into its canonical location:

- Architect: `apps/architect/e2e/visual-snapshots/chromium/`
- Interview: `packages/interview/e2e/visual-snapshots/{chromium,firefox,webkit}-matrix/`
- Interviewer: `apps/interviewer/e2e/visual-snapshots/chromium/`

Each artifact preserves its full repository-relative canonical path so the
automatic follow-up can validate it as data without trusting metadata from the
failing branch. Do not copy unrelated files or whole report directories.

Review the resulting scope before staging:

```sh
git status --short
git diff --stat -- \
  apps/architect/e2e/visual-snapshots \
  packages/interview/e2e/visual-snapshots \
  apps/interviewer/e2e/visual-snapshots
```

Commit intended baseline updates separately from the rendering fix when
practical. Run the relevant normal E2E suite or let the PR's regular E2E job
verify the committed baselines; keep those checks outside the regeneration
workflow.

## Local Docker fallback

The package commands use the same narrow selectors as the manual workflow:

```sh
pnpm --filter @codaco/architect test:e2e:update-snapshots
pnpm --filter @codaco/interview test:e2e:update-snapshots
pnpm --filter @codaco/interviewer test:e2e:update-snapshots
```

All three use pinned Playwright Docker images. Architect baselines are amd64
truth; its command pins `linux/amd64` and may fail under QEMU on Apple Silicon.
Prefer the CI workflow in that case. Interview generates only its three visual
projects; it does not run the functional/ARIA matrix projects. Interviewer
selects only the tagged visual capture cases.
