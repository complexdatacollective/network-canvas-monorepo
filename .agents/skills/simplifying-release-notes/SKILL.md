---
name: simplifying-release-notes
description: 'Use before merging the Version Packages PR (changeset-release/main), or when its "Refuse a release PR whose app release notes are still generated" check fails, to rewrite the staged Architect, Interviewer and Fresco release notes into short, grouped, user-facing summaries. Keywords: release notes, simplify release notes, user-facing changelog, Version Packages PR, changeset-release/main, GitHub release body, update dialog, check-app-release-notes.'
---

# Simplifying Release Notes

Changesets writes each app's new `## <version>` section in `CHANGELOG.md` for
maintainers: one entry per changeset, each prefixed with a commit hash, often
several paragraphs long, plus an "Updated dependencies" list.
`scripts/release/release-notes.mjs` publishes that section as the app's GitHub
release body, and Architect and Interviewer show it to researchers in their
update dialog. Before the Version Packages PR merges, rewrite it for the people
who use the apps.

The `version-packages-freshness` job's step **Refuse a release PR whose app
release notes are still generated** (`scripts/release/check-app-release-notes.mjs`)
fails while any app whose version the release changes still carries the
generated section. Every push to `main` regenerates `changeset-release/main`
and discards the rewrite, so the check turns red again and you re-apply it.

## Scope

- Only the new `## <version>` section of `apps/architect`, `apps/interviewer`
  and `apps/fresco`, and only for apps whose `package.json` version the release
  changes. Find them with
  `git diff origin/main...origin/changeset-release/main -- 'apps/*/package.json'`.
- Leave earlier versions' sections and every library changelog as generated.

## Instructions

1. **Tidy up and simplify, in user-facing terms.** Write for researchers and
   participants, not maintainers. Drop commit hashes, the "Updated
   dependencies" list, package exports and API changes, type signatures and
   internal refactors that change nothing a user sees. Third-party updates
   become one "Updated third-party libraries." line.
2. **Group similar items with short summaries.** Several entries on one theme
   become one bullet with a bold lead-in (for example, seven
   "language X is now available" entries become one **Seven new languages.**
   bullet). Bug fixes go in one list under `### Bug fixes`, each fix summarised
   in a few words, one line each.
3. **Use these headings**, omitting any that would be empty:
   - Fresco only, first, when the release changes how it is deployed: a
     section named for what changed (for example `### Docker deployments`).
     Its first line says plainly whether **existing** deployments need to do
     anything, then which setups are unaffected, then what new deployments
     need.
   - `### New features`
   - `### Interview changes` (Architect: `### Interview changes (seen in
Preview)`), opening with one sentence that these are shared with the
     other two apps.
   - `### Data, security and privacy` (Fresco: `### Data safety and privacy`)
     when there are such changes.
   - `### Bug fixes`
4. **Scope each claim to the app.** The three apps share many changesets, but
   a changeset's effect can differ by app or apply to only one. Read the
   changeset text for which app it describes, and leave a claim out of an
   app's notes when it does not apply there.
5. **Claim only what ships.** Check every claim against its changeset, and
   check anything behavioural, security-related or about deployment against
   the code on `changeset-release/main`. Summaries overstate easily; these
   were caught in the 2026-10 release:
   - "the passphrase is now checked when it's entered": it is checked only
     against answers the interview has already protected, and any passphrase
     is accepted before that (`verifyPassphrase.ts`).
   - "Docker deployments now use Garage": only the bundled-storage compose
     file changed; external S3 and UploadThing deployments did not, and
     existing MinIO deployments need do nothing.
   - Unreadable interviews and unreadable protocols had different
     consequences and needed separate bullets.
   - "Netlify previews no longer touch the live database": previews stopped
     migrating it, but still connect to it when they share its settings.
6. **Respect the update dialog's markdown.** Architect and Interviewer notes
   render through fresco-ui's `RenderMarkdown` with headings, paragraphs,
   lists, links, bold and italic only. Code formatting is shown as plain text,
   and a literal `<...>` is parsed as HTML and disappears. Write those two
   apps' notes without backticks or angle brackets; describe the thing
   instead. Fresco's notes appear only on GitHub, so code formatting for file
   and variable names is fine there.

## Delivering

1. Branch from `origin/changeset-release/main` and replace only the new
   sections. Open a PR into `changeset-release/main` (or push to it when the
   maintainer asks) and ask the maintainer to review the wording; it ships to
   users.
2. Preview each GitHub release body with
   `node scripts/release/release-notes.mjs --app apps/<app> --pkg <name> --version <version>`
   (package names: `@codaco/architect`, `@codaco/interviewer`, `fresco`).
3. Confirm the merge check passes:
   `node scripts/release/check-app-release-notes.mjs --base origin/main`.
4. Keep a copy of each rewritten section outside the branch. If `main` moves
   before the release merges, the branch is regenerated: re-apply the copy,
   then add any entries the regeneration brought in.
