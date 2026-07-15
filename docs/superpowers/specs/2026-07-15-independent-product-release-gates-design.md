# Independent product release gates

**Date:** 2026-07-15
**Status:** Implemented by this change

## Goal

Architect, Interviewer, and Documentation must be releasable independently.
Merging one generated release PR must never version or deploy either of the other
products. The existing library and classic-desktop release lanes remain unchanged.

## Design

The `product-release-pr` job runs a three-entry matrix on every push to `main`:

| Product       | Package                 | Generated branch                  | Release PR title      |
| ------------- | ----------------------- | --------------------------------- | --------------------- |
| Architect     | `@codaco/architect`     | `changeset-release/architect`     | Release Architect     |
| Interviewer   | `@codaco/interviewer`   | `changeset-release/interviewer`   | Release Interviewer   |
| Documentation | `@codaco/documentation` | `changeset-release/documentation` | Release Documentation |

Each matrix entry runs the existing version helper with a required `--package`
argument. It reads and consumes changesets for only that package, versions only
that package, writes only that changelog, and maintains only that branch. A
per-product concurrency group serialises branch maintenance across overlapping
pushes to `main`.

The post-merge detection and deployment jobs were already isolated per product.
They continue to build and deploy only the product whose version moved.

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

The release E2E allowlist contains the library branch and all three product
branches. Each generated branch still runs Architect, Interview, and Interviewer
E2E, and a version-changing merge-group run repeats those suites against the exact
commit that can enter `main`. Snapshot-only failures create a child PR against the
specific failing release branch.

## Migration

`changeset-release/apps` is retired. On the first push to `main` after this change,
CI closes any open combined release PR and snapshot child targeting that branch,
explaining that pending changesets will be reproposed through the independent
gates. It does not delete either branch.

`networkcanvas.com` remains continuously deployed from `main`. The classic
Architect and Interviewer release jobs remain version/tag driven and continue to
publish to their external repositories.
