# Independent product release gates

**Date:** 2026-07-15
**Status:** Partially superseded on 2026-07-31

> Architect and Interviewer were recombined into one
> `changeset-release/apps` gate to eliminate duplicate shared-runtime E2E work.
> Documentation, Website, libraries, and post-merge per-product deployments
> remain independent. This document records the earlier topology; see
> `2026-07-31-combined-app-release-lane-ci-efficiency-design.md` for the current
> design.

## Goal

Architect, Interviewer, Documentation, and networkcanvas.com must be releasable
independently. Merging one generated release PR must never version or deploy any
other product. The existing library and classic-desktop release lanes remain
unchanged.

## Design

The `product-release-pr` job runs a four-entry matrix on every push to `main`:

| Product       | Package                 | Generated branch                  | Release PR title      |
| ------------- | ----------------------- | --------------------------------- | --------------------- |
| Architect     | `@codaco/architect`     | `changeset-release/architect`     | Release Architect     |
| Interviewer   | `@codaco/interviewer`   | `changeset-release/interviewer`   | Release Interviewer   |
| Documentation | `@codaco/documentation` | `changeset-release/documentation` | Release Documentation |
| Website       | `networkcanvas.com`     | `changeset-release/website`       | Release Website       |

Each matrix entry runs the existing version helper with a required `--package`
argument. It reads and consumes changesets for only that package, versions only
that package, writes only that changelog, and maintains only that branch. A
per-product concurrency group serialises branch maintenance across overlapping
pushes to `main`.

Post-merge detection and deployment are isolated per product. Each release job
builds and deploys only the product whose version moved.

## Changeset invariant

A changeset may contain multiple libraries, but it may contain at most one gated
product. Product-plus-library changesets remain invalid because Changesets rejects
ignored and publishable packages in the same file. Multi-product changesets are
now also invalid because the first merged product PR would remove the shared file
from `main`, causing another product's refreshed PR to lose its release entry.

`pnpm check:changesets` enforces both rules. Existing multi-product changesets are
split mechanically into one file per product without changing their bump types or
release-note text.

## Release verification

The release E2E allowlist contains the library branch and all four product
branches. Each generated branch still runs Architect, Interview, and Interviewer
E2E, and a version-changing merge-group run repeats those suites against the exact
commit that can enter `main`. Snapshot-only failures from any generated branch
accumulate in one serialized `e2e-snapshots/main` PR against `main`. Merging it
refreshes all generated release branches and reruns their independent gates.
The Interviewer About capture masks the release-specific version value while
asserting its semver text separately, keeping the shared PNG canonical across
product branches without losing functional coverage.

## Migration

`changeset-release/apps` is retired. On the first push to `main` after this change,
CI closes any open combined release PR and snapshot child targeting that branch,
explaining that pending changesets will be reproposed through the independent
gates. It does not delete either branch.

`networkcanvas.com` now follows the same stable release gate as Documentation:
its generated release PR versions the site, and merging that PR deploys it to
Netlify production before tagging `networkcanvas.com@<version>`. The classic
Architect and Interviewer release jobs remain version/tag driven and continue
to publish to their external repositories.

## Addendum — 2026-08-11: Background Creator release lane

Background Creator (`@codaco/background-creator`) follows the stable app model
that superseded the beta release gates described above. It is versioned through
the normal `changeset-release/main` PR and deployed by its own production job.
It has no dedicated E2E suite; its full Vite build runs in the pull-request
quality gate instead. See `apps/background-creator/RELEASING.md` and
`docs/superpowers/specs/2026-08-03-stable-app-release-design.md`.
