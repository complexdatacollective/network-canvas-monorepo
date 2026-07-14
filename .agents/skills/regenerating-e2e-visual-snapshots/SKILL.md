---
name: regenerating-e2e-visual-snapshots
description: 'Regenerate, inspect, and adopt the committed Playwright PNG baselines for Architect or Interview using the dedicated GitHub Actions workflow. Use when an intentional UI change causes E2E pixel diffs, when CI supplies a new Architect codebook or printable-summary image, when Interview matrix visual baselines need refreshing, or when Apple Silicon cannot produce the canonical amd64 images locally. Keywords: regenerate snapshots, update snapshots, visual baseline, pixel baseline, Playwright image, screenshot diff, summary-print.png, codebook.png.'
---

# Regenerating E2E visual snapshots

Produce platform-canonical PNGs in CI, inspect them, and commit only the
intended baseline changes. Keep generation separate from normal verification.

## Guardrails

- Confirm that the rendered change is intended before replacing a baseline. A
  failed pixel comparison is evidence to investigate, not permission to accept
  every generated image.
- Use `.github/workflows/regenerate-e2e-visual-snapshots.yml`. Its sole job is
  to run the minimal Playwright capture selectors and upload the generated
  PNGs. Do not add lint, typecheck, unit, matrix, ARIA, or other quality checks
  to this workflow.
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

## Generate in CI

1. Commit and push the rendering change to a feature branch. The workflow
   checks out the selected ref, so unpushed code cannot affect its images.
2. Dispatch the workflow from GitHub Actions, selecting `architect` or
   `interview`, or run:

   ```sh
   branch=$(git branch --show-current)
   gh workflow run regenerate-e2e-visual-snapshots.yml \
     --ref "$branch" \
     -f suite=architect
   ```

   Substitute `suite=interview` when refreshing Interview matrix pixels.

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
     --name architect-visual-snapshots \
     --dir "$artifact_dir"
   ```

   Use `interview-visual-snapshots` for Interview.

GitHub can dispatch a workflow only after that workflow exists on the default
branch. On the PR that first introduces this workflow, use the pinned local
Docker command below or inspect the `actual` PNG from the ordinary failing CI
artifact. Do not temporarily add generation to the normal quality workflow.

## Inspect and adopt

Inspect every generated image against its committed baseline. Check the region
that was expected to change and scan the rest for shifted layout, missing
assets, fallback fonts, loading states, or browser-specific regressions.

Copy each approved PNG individually into its canonical location:

- Architect: `apps/architect/e2e/visual-snapshots/chromium/`
- Interview: `packages/interview/e2e/visual-snapshots/{chromium,firefox,webkit}-matrix/`

The Architect artifact contains PNGs at its root. The Interview artifact keeps
the three `*-matrix` directories. Do not copy unrelated files or whole report
directories.

Review the resulting scope before staging:

```sh
git status --short
git diff --stat -- \
  apps/architect/e2e/visual-snapshots \
  packages/interview/e2e/visual-snapshots
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
```

Both use pinned Playwright Docker images. Architect baselines are amd64 truth;
its command pins `linux/amd64` and may fail under QEMU on Apple Silicon. Prefer
the CI workflow in that case. Interview generates only its three visual
projects; it does not run the functional/ARIA matrix projects.
