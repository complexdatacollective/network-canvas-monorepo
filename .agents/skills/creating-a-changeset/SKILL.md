---
name: creating-a-changeset
description: 'Use when finishing a change and preparing to open a PR in the network-canvas monorepo — to decide whether a changeset is needed and author it in the correct lane. Keywords: changeset, do I need a changeset, release notes, pnpm changeset, version bump, before opening a PR, releasable change, unreleased bug, never shipped.'
---

# Creating a Changeset

## When a changeset is needed

Add a changeset when the change is **consumer- or participant-visible** in a
released package or app:

- A published library under `packages/*` (e.g. `@codaco/interview`,
  `@codaco/protocol-validation`) — any behaviour/API/type change consumers see.
- A released app or product: `@codaco/architect`,
  `@codaco/background-creator`, `fresco`, `@codaco/interviewer`,
  `@codaco/documentation`, `networkcanvas.com`, or a Studio package
  (`@codaco/studio-client`, `@codaco/studio-server`, `@codaco/studio-rpc`,
  `@codaco/studio-sync`).

Skip it for repository-docs-only, test-only, CI/tooling-only, internal
refactors with no consumer-visible effect, or a fix for a defect that never
shipped (verify that — see below). Content changes to the released
Documentation or Website products are consumer-visible and do need a changeset.
Don't add an empty changeset just to have one.

## Before writing one for a fix: was the bug ever released?

A changeset is a release note, so a note for a defect nobody could encounter
describes a version that never existed. When the change is a **fix**, establish
whether the behaviour it corrects reached a release before deciding.

Verify it; do not assume from the calendar. "Landed recently" is not
"unreleased" — a package can ship several times a week — and the answer differs
per package, because each has its own tags. Find the commit that introduced the
behaviour you are fixing, then ask which of that package's releases contain it:

```sh
# What introduced it — `git log -S` finds the commit that added the code
git log -S 'the-telltale-code' --oneline -- path/to/file.tsx

# Then, per affected package: did that commit ship?
shipped_in() { # shipped_in <commit> <package>
  local tags
  git fetch --tags --quiet || {
    echo "$2: CANNOT TELL — tag fetch failed, local tags may be stale"
    return 2
  }
  tags=$(git tag --list "$2@*" --contains "$1") || {
    echo "$2: CANNOT TELL — is '$1' a valid commit?"
    return 2
  }
  if [ -n "$tags" ]; then
    echo "$2: SHIPPED in $(echo $tags)"
  else
    echo "$2: unreleased"
  fi
}

shipped_in 839aefd11 '@codaco/fresco-ui'
```

- **Shipped in any affected package** → write the changeset, naming at least
  the packages whose released versions carry the defect.
- **Unreleased everywhere** → no changeset. Say so in the PR description, with
  the introducing commit, so a reviewer reads the omission as a decision rather
  than an oversight.
- **The pending changeset describes the behaviour you just changed** → edit
  that changeset rather than adding a second one. Two notes about one shipped
  behaviour read as two changes.
- **A Studio package** → this question does not apply. The Studio lane has no
  tags and no deploy lane yet (its release PR "records versions and changelogs
  only"), so nothing Studio has reached anyone, and its changesets exist to
  build the changelog its first release will carry. Write them regardless.

Two things about the shape of that function, both learned the hard way:

- It asks **which releases contain the commit**, not "what is the newest tag".
  Naming the newest tag needs version ordering, and version ordering is where
  this goes wrong. `git tag --list '<pkg>@*' | tail -1` is lexicographic, so
  `…@6.10.0` sorts before `…@6.9.0` — today it answers
  `@codaco/protocol-validation@9.0.0` when the newest release is `12.1.1`. Even
  `--sort=-version:refname` puts `pkg@1.0.0-rc.1` above `pkg@1.0.0`, which is
  not academic while Architect ships `-beta` tags. `--contains` needs no order.
- **Every failure is a refusal, never a "no".** A mistyped commit exits 129, an
  unreachable remote exits 128, and a stale local tag set would answer
  "unreleased" with total confidence. Each one returns `CANNOT TELL` instead,
  because the wrong answer here is the silent one: a release note that needed
  writing and never got written.

This is about the defect, not the diff. A fix that also changes behaviour
beyond restoring the original intent still needs a changeset for that part.

## Release lanes — never mix separately gated products

Architect, Background Creator, Fresco, and Interviewer use the normal Changesets
lane alongside libraries. A single changeset may target any combination of
those normal-lane packages.

Documentation, Website, and Studio keep independent gated release PRs. CI
(`pnpm check:changesets`) rejects any gated product mixed with the normal lane
or with another gated lane because `changeset version` hard-errors on ignored
and non-ignored packages in one file. If one feature affects multiple lanes,
run `pnpm changeset` once per lane.

The Studio lane spans all four Studio workspace packages —
`@codaco/studio-client`, `@codaco/studio-server`, `@codaco/studio-rpc`, and
`@codaco/studio-sync` — so one Studio changeset may name any combination of
them.

| Lane                                                          | Bump type          | Ships via                                        |
| ------------------------------------------------------------- | ------------------ | ------------------------------------------------ |
| Libraries, Architect, Background Creator, Fresco, Interviewer | Real semver impact | "Version Packages" PR → npm and/or app release   |
| Documentation                                                 | Real semver impact | "Release Documentation" PR → Netlify + tag       |
| Website                                                       | Real semver impact | "Release Website" PR → Netlify + tag             |
| Studio                                                        | Real semver impact | "Release Studio" PR → versions + changelogs only |

## How to author

1. Run `pnpm changeset`.
2. Select the package(s). Normal-lane libraries and apps may share a changeset;
   Studio packages may share a Studio changeset. Do not combine Documentation,
   Website, or Studio with another lane.
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
