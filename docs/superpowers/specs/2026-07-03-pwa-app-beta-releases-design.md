# PWA apps (architect-web & interviewer-v8) — changeset-driven beta releases

**Date:** 2026-07-03
**Status:** Implemented (PR #747)

## Problem

`@codaco/architect-web` and `@codaco/interviewer-v8` are becoming released,
offline-first PWAs hosted on Netlify. We want them to participate in a
changeset-driven release flow that mirrors the library packages: a contributor
writes a changeset, a bot opens a PR summarising the pending changes and the new
version, and **merging that PR is the release gate** — it deploys the app to
Netlify production and cuts a GitHub release with generated notes.

Two constraints shape the whole design:

1. **The apps must stay on a `-beta.N` prerelease line** ("beta for now"),
   independently of the library packages, which continuously cut **stable**
   releases to npm and are consumed externally (e.g. Fresco).
2. **The library release train must not be disturbed.** The monorepo publishes
   nine mature packages (`@codaco/protocol-validation` 11.7.0,
   `@codaco/shared-consts` 5.3.0, `@codaco/interview` 1.2.0, `@codaco/fresco-ui`
   2.14.0, …) via `changesets/action` on every push to `main`, with ~25
   changesets pending at any time.

## Why not changesets pre-release mode

Changesets' prerelease mode (`changeset pre enter`) is **repo-global** — a single
`.changeset/pre.json` switch. While active, every package that gets versioned is
tagged `-beta` and, if published, goes to npm under the `beta` dist-tag instead
of `latest`. Because the apps are beta _open-endedly_, we would be in pre mode
indefinitely, which would freeze the entire published-library stable release
train that external consumers depend on. Per-package pre mode is a long-standing
unsupported feature request in changesets. Alternative tools that _do_ support
per-package prerelease (release-please, Nx Release, Lerna) were considered and
rejected: swapping the whole monorepo's release system to fix a **cosmetic**
version string on two **private** (never-published) apps is disproportionate —
the `-beta.N` on a private, deploy-only app is communicative, not a dependency
constraint anything resolves.

## Verified changesets behaviour (@changesets/cli 2.31.0, the pinned version)

The design depends on how `changeset version` (run by the library `release` job
on every push to `main`) treats changesets that reference an **ignored** package.
This was reproduced in an isolated throwaway workspace against the exact pinned
CLI version:

| Scenario                                               | Result                                                                                                                                                      |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Changeset references **only** an ignored package       | **Left untouched** — file preserved in `.changeset/`, no version bump, no CHANGELOG written. Non-ignored changesets in the same run are consumed normally.  |
| Changeset **mixes** an ignored + a non-ignored package | **Hard error, exit 1**: `"Mixed changesets that contain both ignored and not ignored packages are not allowed"`. Aborts the entire `changeset version` run. |

**Consequences that drive the design:**

- Keeping the two apps in the `ignore` list means the library `changeset version`
  walks past their changesets and **preserves them** for our own tooling to
  consume. This is the load-bearing mechanism — app changesets can live in
  `.changeset/` and be authored with the real `pnpm changeset` CLI.
- A single changeset that mixes an app and a library **breaks the library
  release**. This must be prevented by a CI guard (see Part B).

## Decisions

1. **Start versions:** both apps → `8.0.0-beta.0`
   (`@codaco/architect-web` from `7.0.0-beta.1`, `@codaco/interviewer-v8` from
   `8.0.0-alpha.14`). Both remain `private: true` and remain in
   `.changeset/config.json` `ignore`.
2. **Authoring:** real `pnpm changeset` CLI, changesets in `.changeset/` — **no
   separate directory**. (`ignore` only affects `version`/`publish`, so the app
   packages still appear in the `changeset add` picker.)
3. **Version semantics — "per-app pre mode, by hand":** the base version
   (`8.0.0`) is human-controlled in `package.json`; the release tooling only ever
   increments the `-beta.N` counter. A changeset's `major`/`minor`/`patch` type is
   **not** used to move the base while in beta — it only **categorises** the entry
   in the generated notes/changelog. Graduating out of beta later is a one-line
   manual `package.json` edit and is **out of scope** here.
4. **Release gate:** a bot-maintained **"Release apps" PR** (sibling of the
   library "Version Packages" PR), separate from it. Merging it releases.
5. **Production deploy becomes release-gated:** the every-push
   `deploy-architect-prod` / `deploy-interviewer-v8-prod` jobs are **removed**; PR
   preview deploys are kept. Production updates only when a Release apps PR merges.
6. **Documentation is a first-class deliverable** and takes precedence (per user).
7. **A project skill (`creating-a-changeset`)** guides contributors through
   authoring the correct changeset — right lane, bump type, no-mixing — when
   preparing a PR.

## Design

### Part A — Versions & config

- `apps/architect-web/package.json`: `version` → `8.0.0-beta.0`.
- `apps/interviewer-v8/package.json`: `version` → `8.0.0-beta.0`.
- Both keep `"private": true`.
- `.changeset/config.json`: both apps **stay** in `ignore` (already present). No
  change to the library flow.

### Part B — App-changeset authoring lane + isolation guard

- Contributors run `pnpm changeset`, select an app, and get a normal
  `.changeset/*.md` file. Library `changeset version` preserves it (verified).
- **Guard (hard CI failure in the `quality` job):** a root check (e.g.
  `scripts/check-changeset-app-isolation.mjs`, wired as a `//#` turbo task or a
  step in the `quality` job) scans every `.changeset/*.md`; if any single
  changeset references an app package **together with** a non-app package, it
  fails with a message telling the author to split it into an app-only changeset
  and a library-only one. App-only and library-only changesets both pass.
  - Because `quality` must pass before merge, a mixed changeset can never reach
    the post-merge library `release` job (where it would abort `changeset
version`).
  - A changeset referencing **both apps** (both ignored) is _not_ "mixed" and is
    allowed; the version tool consumes it for both apps in one PR run.

### Part C — The "Release apps" PR bot (mirrors `changesets/action`'s version step)

New workflow job, runs on **push to `main`**:

1. Read pending app changesets from `.changeset/` using changesets' own parser
   (`@changesets/read` / `@changesets/parse`), filtered to the two app package
   names. ("Manually parse it" = reuse the real parser, not hand-rolled markdown.)
2. **No app changesets pending** → ensure the release branch/PR is torn down; exit.
3. **Some pending** → on branch `changeset-release/apps` (recreated from `main`
   each run), invoke the version script (`scripts/version-beta-apps.mjs`):
   - For each app with pending changesets: increment the `-beta.N` counter of the
     current `package.json` version (semver prerelease bump; base untouched);
     prepend a `CHANGELOG.md` section for the new version, entries grouped by the
     changeset's `major`/`minor`/`patch` type; delete the consumed changeset files.
   - Emit a machine-readable summary (app → old → new version + rendered entries)
     for the PR body.
4. Force-push `changeset-release/apps` and **open or update** the PR
   (`peter-evans/create-pull-request` or `gh`). PR body = a summary table
   (`architect-web: 8.0.0-beta.0 → 8.0.0-beta.1`, `interviewer-v8: …`) plus the
   aggregated changelog entries. The PR stays continuously in sync as more app
   changesets land — exactly like the library "Version Packages" PR.

One **combined** PR covers both apps; if only one app has pending changesets, only
that app appears.

### Part D — Release on merge (mirrors the existing `detect-legacy-release.sh`)

New job, runs on **push to `main`** (`fetch-depth: 2`):

1. For each app, compare `apps/<app>/package.json` `version` at `HEAD` vs `HEAD^`.
   Release **only** on a Release-apps-PR bot increment — the same `X.Y.Z` base with
   the `-beta.N` counter advanced (`beta.M → beta.N`, N > M). The initial
   `8.0.0-beta.0` seed and any manual base change (e.g. `8.x → 9.0.0-beta.0`) are
   setup edits, not releases, so they do not fire. Comparing versions (not commit
   messages) is robust to the PR merge strategy. A git-tag check makes re-runs
   idempotent.
2. On such an increment → for that app:
   - Guard against re-release: skip if git tag `@codaco/<app>@<version>` already
     exists.
   - Build the app and its workspace deps, and **deploy to Netlify production**
     (`netlify-cli … deploy --prod`), reusing the exact build/deploy steps the
     current prod jobs use:
     - architect-web: `turbo run build --filter=@codaco/architect-web`, deploy
       `apps/architect-web/dist`, site `NETLIFY_SITE_ID_ARCHITECT`.
     - interviewer-v8: `turbo run build --filter=@codaco/interviewer-v8^...` then
       `pnpm --filter=@codaco/interviewer-v8 build:web` (keeps the PWA precache
       assertion), deploy `apps/interviewer-v8/dist`, site
       `NETLIFY_SITE_ID_INTERVIEWER`.
   - Create the **GitHub release + tag** `@codaco/<app>@<version>`, notes taken
     from the top (`## <version>`) section of the app's `CHANGELOG.md`.

### Part E — Remove every-push production deploy

- Delete `deploy-architect-prod` and `deploy-interviewer-v8-prod` from
  `.github/workflows/ci-and-release.yml`. Production is now owned by Part D.
- **Keep** `deploy-architect-preview` and `deploy-interviewer-v8-preview` (PR
  previews) and the `detect` flags that gate them, unchanged.

### Part F — Documentation (takes precedence)

- **Rewrite** `apps/interviewer-v8/RELEASING.md` — it currently states "Deploys
  are continuous, not versioned. There is no release step and no version bump to
  make," which is the opposite of the new model. Describe: authoring an app
  changeset, the Release apps PR, merge-to-release, Netlify prod deploy, GitHub
  release, and the `-beta.N` scheme.
- **Create** `apps/architect-web/RELEASING.md` (none exists) covering the same.
- **Update** root `CLAUDE.md` release/changeset guidance to describe the two
  lanes: `.changeset/` library changesets (published via `changesets/action`) vs
  app changesets (preserved, released via the Release apps PR), the
  no-mixed-changesets rule, and the `-beta.N` / human-controlled-base scheme.
- **Note** the app lane in `.changeset/README.md`.

### Part G — Contributor skill: `creating-a-changeset`

New project skill at `.claude/skills/creating-a-changeset/SKILL.md`, matching the
repo's existing project-skill format (`name`/`description` frontmatter + concise,
trigger-oriented body). Its `description` fires when finishing a change and
preparing to open a PR ("do I need a changeset", "before opening a pull request",
"release notes"). It guides the author through:

1. **Whether a changeset is needed.** Consumer-/participant-visible change to a
   published package or an app → yes. Docs-only, test-only, CI/tooling-only, or an
   internal refactor with no consumer-visible effect → usually no (state this
   explicitly so contributors don't add empty noise).
2. **Pick the lane — never mix:**
   - **Library packages** (`packages/*`, published) → `pnpm changeset`, choose the
     package(s); bump type = real semver impact on consumers; ships via the
     "Version Packages" PR to npm.
   - **Apps** (`@codaco/architect-web`, `@codaco/interviewer-v8`) → `pnpm
changeset`, choose the app; bump type only **categorises** the notes (base is
     fixed, `-beta.N` auto-increments); ships via the "Release apps" PR to Netlify
     production + a GitHub release.
   - **Hard rule:** a single changeset must not list an app _and_ a library — CI
     (Part B) rejects it. Write two separate changesets. The skill is the
     front-line way authors avoid that error before CI catches it.
3. **Write the summary as reader-facing release notes** — it becomes the
   changelog / GitHub release text; app-facing entries follow the repo's
   participant-appropriate tone (see `developing-in-network-canvas`).
4. **Commit the `.changeset/*.md`** with the PR.

Cross-references `developing-in-network-canvas` and complements the Part B
isolation guard.

## Contributor & release flow (end to end)

1. Contributor changes an app; the `creating-a-changeset` skill guides them to run
   `pnpm changeset`, select the app, and write the summary. (Library changes get
   their own separate changeset as today.)
2. On merge to `main`, the bot opens/updates the **Release apps** PR showing
   `…-beta.N → …-beta.(N+1)` and the accumulated notes.
3. When ready to release, a maintainer **merges the Release apps PR**. That merge:
   bumps `package.json`, finalises `CHANGELOG.md`, removes the consumed
   changesets, deploys the app(s) to Netlify production, and cuts the GitHub
   release(s).

## Out of scope

- **Graduating to stable** (`8.0.0-beta.N` → `8.0.0`): a deliberate future manual
  `package.json` edit; not automated here.
- Any change to the library (`changesets/action`) flow, or to the legacy desktop
  apps' release path.

## Risks & open implementation details

- **Release apps PR & CI retrigger:** PRs opened by the default `GITHUB_TOKEN` do
  not trigger `on: pull_request` workflows. The Release apps PR is mechanical
  (version/changelog only — no app source changes), so absent pre-merge CI is
  acceptable; the post-merge release runs on the `push` event regardless. If
  pre-merge CI on that PR is wanted, create it with a PAT / GitHub App token.
- **`changesets/action` co-existence:** the library version job and our bot run on
  the same `push` to `main` but operate on disjoint changesets, branches
  (`changeset-release/main` vs `changeset-release/apps`), and packages — no
  conflict. Confirm during implementation that `changesets/action` does not open
  an empty "Version Packages" PR when only app (ignored) changesets are pending.
- **Multi-app changeset:** a changeset naming both apps is consumed once and
  contributes an entry to each app's changelog in the same PR run — verify the
  version script handles this without double-processing.
- **Netlify prerequisite:** `NETLIFY_SITE_ID_INTERVIEWER` must be set (see
  `apps/interviewer-v8/RELEASING.md`); `NETLIFY_SITE_ID_ARCHITECT` already exists.
- **Skill scope (guidance, not enforcement):** `creating-a-changeset` guides an
  agent (Claude) preparing a PR; it does not enforce anything for a human opening
  a PR directly on GitHub. If enforcement across _all_ PRs is wanted, that's a
  separate CI addition (the changesets bot, or a "PR touches a releasable package
  but has no changeset" check) — out of scope unless requested.
