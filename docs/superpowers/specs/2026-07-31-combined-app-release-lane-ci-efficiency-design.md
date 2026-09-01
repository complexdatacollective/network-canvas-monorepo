# Combined current-app release lane and cross-branch E2E reuse

**Date:** 2026-07-31
**Status:** Superseded on 2026-08-03

> Architect and Interviewer now use stable semver in the normal
> `changeset-release/main` lane. See
> `2026-08-03-stable-app-release-design.md` for the current design.

## Goal

Release Architect and Interviewer through one generated gate so their shared
`@codaco/interview` validation is not duplicated, while retaining a separate
library release lane and independent Documentation and Website gates.

## Release topology

| Lane          | Packages                                   | Generated branch                  |
| ------------- | ------------------------------------------ | --------------------------------- |
| Current apps  | `@codaco/architect`, `@codaco/interviewer` | `changeset-release/apps`          |
| Libraries     | publishable `packages/*`                   | `changeset-release/main`          |
| Documentation | `@codaco/documentation`                    | `changeset-release/documentation` |
| Website       | `networkcanvas.com`                        | `changeset-release/website`       |

The app version helper receives both current-app package names on every run. It
versions only apps with pending changesets and consumes a changeset only when
every package named by that file belongs to the selected lane. A shared
Architect+Interviewer changeset is therefore consumed once and contributes to
both changelogs. A partial invocation cannot delete it.

The changeset guard permits Architect and Interviewer in one file. It still
rejects a gated product mixed with a publishable library, and rejects products
from independent product lanes in one file.

Post-merge detection, production deployment, tags, and GitHub releases remain
per product. Combining the release PR does not couple deployment failure or
force an unchanged app to release.

## App-specific E2E selection

The combined branch has a fail-closed maximum of all three suites, but a normal
pull-request run derives its required suites from version fields changed
between the PR base and tip:

| Version movement | Required suites                    |
| ---------------- | ---------------------------------- |
| Architect only   | `architect-e2e`, `interview-e2e`   |
| Interviewer only | `interviewer-e2e`, `interview-e2e` |
| Both apps        | all three                          |

Workflow dispatches run all three. Missing history, an unreadable manifest, an
unknown version rule, or any Git error also runs all three. Merge groups use the
same per-manifest rules, so an Architect-only release does not acquire
Interviewer E2E merely because both products share a generated branch.

The policy job must check out full history and provide the pull request's base
SHA as well as its real head SHA. A shallow checkout or synthetic merge SHA is
not sufficient for this comparison.

## Cross-branch equivalence reuse

The app and library lanes can require the same suite at equivalent source
states. For every required suite, the policy queries each generated branch
capable of running it and takes that branch's newest conclusive native
pull-request verdict. It never walks past a same-branch failure to an older
success.

Each verdict is compared with the candidate head using the suite relevance
closure. Verdicts with relevant differences do not describe the candidate.
Among the remaining equivalent verdicts, the globally newest verdict is
authoritative: it must be a success. This prevents an older green on one lane
from hiding a newer equivalent failure on another.

All trust guards remain fail-closed:

- only same-repository generated-branch runs qualify;
- every relevant Actions API response must be complete and readable;
- the current and candidate commits must be fetchable;
- the suite subject must exist in the discovered workspace graph;
- root configuration, workflows, scripts, lockfiles, unknown paths, and
  relevance-closure changes force a fresh run;
- rename detection stays disabled so moving a relevant file into an inert path
  cannot hide its source.

## Migration

`changeset-release/architect` and `changeset-release/interviewer` are no longer
trusted release refs. The workflow closes their superseded PRs and removes their
generated branches after establishing the combined app PR. Pending source
changes are unaffected because release branches contain only generated
version/changelog changes; pending changesets on `main` are reproposed through
`changeset-release/apps`.

## General CI efficiency changes

Five support checks now share one checkout, dependency setup, and local Turbo
cache server: knip, changeset isolation, repository-script tests, shared-package
builds, and typechecking. A representative warm run spent 37–41 seconds setting
up each former job while the actual checks took approximately 10, 1, 2, 3, and
32 seconds respectively. Consolidation therefore reduces about five runner
minutes to roughly 90 seconds. It remains off the critical path: representative
lint and test jobs took about four and six-and-a-half minutes.

Root lint now starts `oxlint` and `oxfmt --check` concurrently. On the same
checkout, a full sequential run took 71.49 seconds and the concurrent runner
took 66.00 seconds, a 7.7% wall-clock improvement. Pull requests pass only
changed supported files to those tools; merge groups retain the full check.
Changes to lint, formatting, TypeScript, dependency, workspace, Turbo, shared
theme, or CI configuration fail closed to a full repository run.
