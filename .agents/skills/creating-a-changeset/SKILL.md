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

## Release lanes — never mix across them

**A single changeset must target one release lane:** either one or more libraries,
current apps (Architect and/or Interviewer), Documentation, or Website. CI
(`pnpm check:changesets`) rejects a gated product mixed with a library because
`changeset version` hard-errors on it. It also rejects products from different
gated lanes in one file. Architect and Interviewer may share a changeset because
they share the combined apps release PR. If one feature affects multiple lanes,
run `pnpm changeset` once per lane.

| Lane                         | Bump type                                    | Ships via                                  |
| ---------------------------- | -------------------------------------------- | ------------------------------------------ |
| Libraries                    | Real semver impact                           | "Version Packages" PR → npm                |
| Architect and/or Interviewer | Categorises notes; `-beta.N` auto-increments | "Release apps" PR → Netlify + GitHub       |
| Documentation                | Real semver impact                           | "Release Documentation" PR → Netlify + tag |
| Website                      | Real semver impact                           | "Release Website" PR → Netlify + tag       |

## How to author

1. Run `pnpm changeset`.
2. Select the package(s). Multiple libraries may share a changeset. Architect
   and Interviewer may share one changeset; do not combine any other lanes.
3. Choose the bump type. For libraries this drives the released version; for apps
   it only groups the entry under Major/Minor/Patch changes.
4. Write the summary as **reader-facing release notes** — it becomes the
   changelog / GitHub release text. For app-facing entries use the
   participant-appropriate tone described in `developing-in-network-canvas`.
5. Commit the generated `.changeset/*.md` with your PR.

## Notes

- Gated-product changesets live in `.changeset/` like everyone else; the library
  release intentionally leaves them alone until that product's release PR
  consumes them.
- Full model: `docs/superpowers/specs/2026-07-03-pwa-app-beta-releases-design.md`
  and each app's `RELEASING.md`.
