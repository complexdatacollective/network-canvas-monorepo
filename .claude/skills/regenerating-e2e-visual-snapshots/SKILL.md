---
name: regenerating-e2e-visual-snapshots
description: 'Use when an intentional rendering change requires new committed Playwright visual-baseline PNGs for the Architect, Interview, or Interviewer e2e suites — a toHaveScreenshot failure that is expected, not a regression. Covers dispatching the manual regeneration workflow on a branch, downloading its artifact, and adopting only the intended baselines. Keywords: visual snapshot, visual baseline, toHaveScreenshot, pixel diff, update-snapshots, regenerate, e2e-visual-snapshots artifact, amd64, workflow_dispatch, visual-snapshots directory.'
---

# Regenerating e2e visual snapshots

Committed visual baselines are **amd64-truth**: CI captures them on
`ubuntu-latest`, and other architectures (Apple Silicon in particular) render
different glyph widths, so PNGs regenerated on a local machine will not match
CI. Never regenerate pixel baselines with host-local browsers, and do not
assume a local Docker run is safe either — it is only CI-faithful under
`linux/amd64`, and amd64 emulation on Apple Silicon commonly cannot run the
build at all (QEMU segfaults; see the architect suite's run.sh notes). The
canonical route is the manual
`Regenerate E2E Visual Snapshots` workflow
(`.github/workflows/regenerate-e2e-visual-snapshots.yml`), which runs ONLY the
selected suite's capture code and uploads the results as an artifact; it does
not run functional tests or quality jobs.

Note this workflow is also triggered automatically when a generated release
PR fails on snapshots only — that path opens the shared PNG-only snapshot PR.
Dispatch it manually when the rendering change is on a branch you are
shipping, so the new baselines land in the same PR as the change.

## Recipe

1. **Push the branch containing the rendering change**, then dispatch the
   workflow against it (`suite` is one of `architect`, `interview`,
   `interviewer`):

   ```bash
   gh workflow run regenerate-e2e-visual-snapshots.yml \
     --ref <branch> -f suite=interview
   ```

2. **Wait for the run and download its artifact** (named
   `e2e-visual-snapshots-<suite>`, retained 14 days):

   ```bash
   # filter by branch — the newest run may be someone else's dispatch
   gh run list --workflow=regenerate-e2e-visual-snapshots.yml \
     --branch <branch> --limit 1 --json databaseId --jq '.[0].databaseId'
   gh run watch <run-id> --exit-status
   gh run download <run-id> -n e2e-visual-snapshots-interview -d /tmp/snapshots
   ```

   The artifact contains repo-relative paths, so `<artifact>/<baseline dir>`
   mirrors the committed layout:

   | suite       | baseline dir                                                                |
   | ----------- | --------------------------------------------------------------------------- |
   | architect   | `apps/architect/e2e/visual-snapshots/chromium/`                             |
   | interview   | `packages/interview/e2e/visual-snapshots/{chromium,firefox,webkit}-matrix/` |
   | interviewer | `apps/interviewer/e2e/visual-snapshots/chromium/`                           |

3. **Diff against the committed baselines and adopt only intended changes.**
   The workflow re-captures EVERY snapshot in the suite, so most artifact
   files are byte-identical to the committed ones — copy over only the files
   your change actually affects:

   Run the loop from the suite's `visual-snapshots/` parent so it covers every
   browser directory at once (a `CHANGED` line for a file with no committed
   counterpart is a NEW snapshot; a committed PNG absent from the artifact
   belongs to a removed test — delete it deliberately):

   ```bash
   cd <suite>/e2e/visual-snapshots
   for f in $(cd /tmp/snapshots/<suite>/e2e/visual-snapshots && find . -name '*.png'); do
     cmp -s "$f" /tmp/snapshots/<suite>/e2e/visual-snapshots/"$f" || echo "CHANGED: $f"
   done
   ```

   Interview's map-based **Geospatial snapshots come back byte-different on
   every run** — sub-threshold Mapbox render noise that still passes
   `toHaveScreenshot`. Do not adopt them unless you intentionally changed the
   Geospatial interface.

4. **Inspect every image you adopt** (open/Read each PNG) before committing:
   confirm it shows exactly the intended change and nothing else. Unexplained
   diffs are regressions to fix, not baselines to accept.

## Gotchas

- A changed file you did NOT expect means either your change has a wider blast
  radius than you thought, or it is capture noise (see Geospatial above) —
  decide which before adopting anything.
- Interview ARIA snapshots are a different mechanism: regenerate those locally
  with the targeted matrix commands in `verifying-an-interface-change`, not
  with this workflow.
- Do not confuse these e2e PNGs with `@codaco/interface-images` (committed
  WebP stage thumbnails, generated locally via `generate:interface-images`).
- The dispatched run needs no special permissions beyond `gh` auth with
  `actions: write` on the repo; the artifact download works with plain read
  access.
