---
name: creating-a-changeset
description: 'Use when finishing a change and preparing to open a PR in the network-canvas monorepo — to decide whether a changeset is needed and author it in the correct lane. Keywords: changeset, do I need a changeset, release notes, pnpm changeset, version bump, before opening a PR, releasable change.'
---

# Creating a Changeset

## When a changeset is needed

Add a changeset when the change is **consumer- or participant-visible** in a
released package or app:

- A published library under `packages/*` (e.g. `@codaco/interview`,
  `@codaco/protocol-validation`) — any behaviour/API/type change consumers see.
- A gated product: `@codaco/architect`, `@codaco/interviewer`,
  `@codaco/documentation`, or `networkcanvas.com`.

Skip it for repository-docs-only, test-only, CI/tooling-only, or internal
refactors with no consumer-visible effect. Content changes to the released
Documentation or Website products are consumer-visible and do need a changeset.
Don't add an empty changeset just to have one.

## Release lanes — never mix separately gated products

Architect and Interviewer use the normal Changesets lane alongside libraries.
A single changeset may target one or both apps, one or more libraries, or any
combination of those normal-lane packages.

Documentation and Website keep independent gated release PRs. CI (`pnpm
check:changesets`) rejects either product mixed with the normal lane or with the
other gated product because `changeset version` hard-errors on ignored and
non-ignored packages in one file. If one feature affects multiple lanes, run
`pnpm changeset` once per lane.

| Lane                                  | Bump type          | Ships via                                           |
| ------------------------------------- | ------------------ | --------------------------------------------------- |
| Libraries, Architect, and Interviewer | Real semver impact | "Version Packages" PR → npm and/or Netlify + GitHub |
| Documentation                         | Real semver impact | "Release Documentation" PR → Netlify + tag          |
| Website                               | Real semver impact | "Release Website" PR → Netlify + tag                |

## How to author

1. Run `pnpm changeset`.
2. Select the package(s). Libraries, Architect, and Interviewer may share a
   normal-lane changeset; do not combine Documentation or Website with another
   lane.
3. Choose the bump type. It drives the released semver for libraries and apps.
4. Write the summary as **reader-facing release notes** — it becomes the
   changelog / GitHub release text. For app-facing entries use the
   participant-appropriate tone described in `developing-in-network-canvas`.
5. Commit the generated `.changeset/*.md` with your PR.

## Notes

- Gated-product changesets live in `.changeset/` like everyone else; the normal
  release intentionally leaves them alone until that product's release PR
  consumes them.
- Full model: `docs/superpowers/specs/2026-08-03-stable-app-release-design.md`
  and each app's `RELEASING.md`.
