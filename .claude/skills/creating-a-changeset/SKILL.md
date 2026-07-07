---
name: creating-a-changeset
description: Use when finishing a change and preparing to open a PR in the network-canvas monorepo — to decide whether a changeset is needed and author it in the correct lane. Keywords: changeset, do I need a changeset, release notes, pnpm changeset, version bump, before opening a PR, releasable change.
---

# Creating a Changeset

## When a changeset is needed

Add a changeset when the change is **consumer- or participant-visible** in a
released package or app:

- A published library under `packages/*` (e.g. `@codaco/interview`,
  `@codaco/protocol-validation`) — any behaviour/API/type change consumers see.
- An app: `@codaco/architect` or `@codaco/interviewer`.

Skip it for docs-only, test-only, CI/tooling-only, or internal refactors with no
consumer-visible effect. Don't add an empty changeset just to have one.

## Two lanes — never mix them

**A single changeset must target either libraries or an app, never both.** CI
(`pnpm check:changesets`) rejects a mixed changeset, because `changeset version`
hard-errors on it and would break the library release. If one PR changes both,
run `pnpm changeset` twice and write two files.

|           | Library packages (`packages/*`)        | Apps (`architect`, `interviewer`)                                         |
| --------- | -------------------------------------- | ------------------------------------------------------------------------- |
| Bump type | Real semver impact (major/minor/patch) | Only **categorises** the notes — base is fixed, `-beta.N` auto-increments |
| Ships via | The "Version Packages" PR → npm        | The "Release apps (beta)" PR → Netlify prod + GitHub release              |

## How to author

1. Run `pnpm changeset`.
2. Select the package(s) — for an app, select only that app (plus optionally the
   other app; never a library alongside it).
3. Choose the bump type. For libraries this drives the released version; for apps
   it only groups the entry under Major/Minor/Patch changes.
4. Write the summary as **reader-facing release notes** — it becomes the
   changelog / GitHub release text. For app-facing entries use the
   participant-appropriate tone described in `developing-in-network-canvas`.
5. Commit the generated `.changeset/*.md` with your PR.

## Notes

- App changesets live in `.changeset/` like everyone else; the library release
  intentionally leaves them alone (the apps are in the changeset `ignore` list)
  until the "Release apps" PR consumes them.
- Full model: `docs/superpowers/specs/2026-07-03-pwa-app-beta-releases-design.md`
  and each app's `RELEASING.md`.
