---
name: preparing-e2e-visual-baselines
description: 'Assess whether a completed Network Canvas change can alter rendered pixels, then regenerate, inspect, and adopt only the affected Architect, Interview, and/or Interviewer Playwright PNG baselines locally in the pinned Docker environment. Use during pull-request preparation before changesets and commits, after visual UI changes, or whenever app, interview-runtime, Fresco UI, theme, asset, build, or lockfile changes might invalidate E2E screenshots. Skip generation when semantic diff inspection proves the change is nonvisual.'
---

# Prepare E2E visual baselines

Prevent avoidable release-gate snapshot regeneration by committing intended
Linux PNG baselines with the rendering change.

## Determine affected suites

1. Run the classifier from the repository root:

   ```sh
   node .agents/skills/preparing-e2e-visual-baselines/scripts/classify-visual-changes.mjs
   ```

   It examines committed feature-branch changes plus staged, unstaged, and
   untracked files. Treat its suites as a conservative upper bound.

   If the classifier exits nonzero because it cannot resolve the comparison
   base or merge base, do not trust a partial working-tree classification.
   Fetch the base ref and retry, or treat all three suites as candidates.

2. Inspect the actual diff for each candidate. Generate a suite only if the
   change can alter pixels or the state captured by that suite. Examples that
   normally do **not** require generation include documentation, types alone,
   unit tests, refactors with unchanged render output, CI/release logic, and
   server-only behavior. State the reason when dismissing a candidate.

3. Fail closed when root build configuration, the lockfile, global styling,
   fonts, shared assets, or an ambiguous rendered dependency changed.

The classifier follows the workspace dependency graph. In particular:

- `apps/architect` affects Architect only; `apps/interviewer` affects
  Interviewer only.
- E2E specs, helpers, and configuration under a suite's own `e2e/` directory
  affect only that suite. Committed visual baselines themselves are ignored to
  avoid a regeneration loop.
- `packages/interview` affects Interview and both host apps.
- `packages/fresco-ui` affects all three when the changed component/style is
  rendered there.
- Shared theme/build/lockfile changes require review for all three.

Do not regenerate a suite merely because another unrelated app changed.

## Generate locally

Before generation, verify that the selected suite's baseline directory has no
pre-existing changes; never overwrite somebody else's PNG work. Ensure Docker
is running, then run only the selected commands:

```sh
pnpm --filter @codaco/architect test:e2e:update-snapshots
pnpm --filter @codaco/interview test:e2e:update-snapshots
pnpm --filter @codaco/interviewer test:e2e:update-snapshots
```

These scripts derive a pinned Playwright Linux image from `pnpm-lock.yaml`.
Never generate committed PNG baselines using host-native Playwright. Architect
also pins snapshot writes to `linux/amd64`; on Apple Silicon, enable Docker
Desktop's Rosetta support. If canonical generation cannot run, report the
blocker instead of writing a noncanonical baseline.

## Inspect and adopt

1. List exactly what changed:

   ```sh
   git status --short
   git diff --stat -- \
     apps/architect/e2e/visual-snapshots \
     packages/interview/e2e/visual-snapshots \
     apps/interviewer/e2e/visual-snapshots
   ```

2. Inspect every changed PNG against its committed predecessor. Verify the
   intended region and scan for shifted layout, fallback fonts, missing assets,
   loading states, clipping, or browser-specific regressions. Use an image
   viewer or a side-by-side/diff composite; filenames and checksums alone are
   insufficient.
3. Keep only images explained by the intended change. Interview Geospatial
   captures contain sub-threshold Mapbox noise and must not be adopted unless
   Geospatial itself intentionally changed.
4. Re-run the selected update command once. Intended baselines should now pass
   without further PNG changes; investigate non-determinism rather than
   repeatedly accepting churn.
5. Include the selected PNGs in the rendering change and record the regenerated
   suites in the PR test plan.

For a release-time visual failure, missing local Docker support, or CI artifact
adoption, invoke `regenerating-e2e-visual-snapshots`.
