# Stable Architect and Interviewer releases

**Date:** 2026-08-03
**Status:** Implemented

## Goal

Graduate Architect and Interviewer from the `8.0.0-beta.N` line to stable
`8.0.0`, return both private apps to the repository's normal Changesets CLI
workflow, and deploy every released app version to its Netlify production site.

## Release topology

| Lane              | Packages                                                          | Generated branch                  |
| ----------------- | ----------------------------------------------------------------- | --------------------------------- |
| Normal Changesets | publishable libraries, `@codaco/architect`, `@codaco/interviewer` | `changeset-release/main`          |
| Documentation     | `@codaco/documentation`                                           | `changeset-release/documentation` |
| Website           | `networkcanvas.com`                                               | `changeset-release/website`       |

Architect and Interviewer remain `private: true`. Changesets versions private
packages but does not publish or tag them. The repository makes that behavior
explicit with `privatePackages.version: true` and `privatePackages.tag: false`.
Publishable libraries continue to publish to npm from the same Version Packages
PR.

The graduation changeset requests a patch release for both prerelease packages.
Changesets resolves `8.0.0-beta.13` and `8.0.0-beta.12` to the stable `8.0.0`
release rather than advancing to `8.0.1`.

## Production deployment

Merging the Version Packages PR changes each released app's version on `main`.
The per-app release detector accepts stable semver only and checks for the
corresponding `<package>@<version>` tag. An untagged version is built and
deployed with `netlify deploy --prod` to `NETLIFY_SITE_ID_ARCHITECT` or
`NETLIFY_SITE_ID_INTERVIEWER`. The GitHub release and tag are created only after
the production deploy succeeds, so a failed or dropped run is retried on the
next push to `main`.

Stable app GitHub releases are not prereleases and advance the repository's
latest release pointer.

## Release verification

The normal `changeset-release/main` PR runs Architect, Interview, and
Interviewer E2E because it may version any combination of libraries and apps.
Chromatic release seeding reads version changes for both `packages/*` and the
two app manifests from the same branch. The retired `changeset-release/apps`
branch is no longer a trusted release, snapshot, E2E, or Chromatic ref.
