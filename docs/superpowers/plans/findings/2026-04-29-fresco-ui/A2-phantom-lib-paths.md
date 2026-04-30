# A2: Resolve phantom `lib/dnd` / `lib/dialogs` / `lib/form` / `lib/collection` git-status entries

**Date:** 2026-04-29
**Repo inspected:** `~/Projects/fresco-next`
**Disposition: DONE — migration may proceed.** The "phantom" entries are not in-flight work; they are deletions already committed on the active feature branch `reorganise-ui`. The current working tree is clean.

---

## Summary

The plan brief flagged that `git status` showed modifications/deletions under `lib/dnd`, `lib/dialogs`, `lib/form`, and `lib/collection` while `ls lib/` showed none of those directories. Investigation shows:

- The current branch is **`reorganise-ui`** (HEAD `ade5abadf`), **not** `next` (HEAD `9bae07047`).
- The status output quoted in the brief was a comparison against `next` (or a stale snapshot), not the current working tree. **The current working tree is clean** — `git status` reports `nothing to commit, working tree clean`.
- The single commit on top of `next`, `ade5abadf "reorganise UI components ready for migration to package"`, **deletes** all of `lib/dnd`, `lib/dialogs`, `lib/form`, `lib/collection` and many `components/*` files (180 files deleted, 0 added or modified in those four directories).
- That commit is exactly the prep work the migration is built on top of. There is no separate in-flight branch or stash that intends to *introduce* these paths.
- Two stashes exist; neither touches the suspect paths.

There is no risk of conflicting in-flight work on the suspect paths.

---

## Step 1 — git status for suspect paths (current working tree)

```
$ cd ~/Projects/fresco-next && git status --short | grep -E "lib/(dnd|dialogs|form|collection)" || echo "none"
none
```

```
$ git status | head -10
On branch reorganise-ui
Your branch is up to date with 'origin/reorganise-ui'.

nothing to commit, working tree clean
```

The status entries cited in the plan prompt are not present in the current working tree. They appear to have been captured at session-start before the working tree was committed/cleaned, when HEAD was effectively `next` for status purposes.

## Step 2 — `ls` vs `git ls-files` per path

```
=== lib/dnd ===
ls: lib/dnd: No such file or directory
--- git ls-files ---
=== lib/dialogs ===
ls: lib/dialogs: No such file or directory
--- git ls-files ---
=== lib/form ===
ls: lib/form: No such file or directory
--- git ls-files ---
=== lib/collection ===
ls: lib/collection: No such file or directory
--- git ls-files ---
```

Neither on disk nor tracked at HEAD. Consistent: the directories don't exist on `reorganise-ui`.

## Step 3 — stashes (read-only)

```
$ git stash list
stash@{0}: WIP on (no branch): aa0fb6f04 refactor: package owns InterviewExportInput; PrismaInterviewRepository parses NcNetwork
stash@{1}: On next: stash non-NavigationBar changes
```

Neither stash touches the suspect paths:

```
$ git stash show -p stash@{0} | grep -E "^(diff|rename|---|\+\+\+).*lib/(dnd|dialogs|form|collection)"
(no matches)

$ git stash show -p stash@{1} | grep -E "^(diff|rename|---|\+\+\+).*lib/(dnd|dialogs|form|collection)"
(no matches)
```

The visible top of `stash@{0}` is unrelated `lib/network-exporters/formatters/csv/__tests__/mockObjects.ts` work. `stash@{1}` is a NavigationBar-related stash on `next`.

## Step 4 — local branches that carry the suspect paths

```
$ git branch -a --sort=-committerdate | head -20
* reorganise-ui
  remotes/origin/reorganise-ui
  remotes/origin/feature/download-protocols
  next
  remotes/origin/next
  remotes/origin/fix/confirm-password-show
+ refactor/interviewer-api-contract
  remotes/origin/refactor/interviewer-api-contract
  remotes/origin/refactor/mapbox-search-token
  remotes/origin/performance/mapbox-search
  remotes/origin/fix/firefox-cat-bin-flash
  remotes/origin/fix/categorical-bin-expanded-sizing
  remotes/origin/fix/unique-validation-self-match
  remotes/origin/fix/categorical-bin-falsy-value
  remotes/origin/fix/preview-upload-direct-to-ut-v2
  remotes/origin/fix/preview-upload-direct-to-ut
  refactor/e2e-simplify
  remotes/origin/refactor/e2e-simplify
  remotes/origin/fix/date-pickers
  remotes/origin/fix/video-audio-webkit
```

Per-branch presence of the suspect dirs:

| branch                              | lib/dnd | lib/dialogs | lib/form | lib/collection |
|-------------------------------------|---------|-------------|----------|----------------|
| `reorganise-ui` (HEAD `ade5abadf`)  | absent  | absent      | absent   | absent         |
| `next` (HEAD `9bae07047`)           | 15 files| 16 files    | 88 files | 61 files       |
| `refactor/interviewer-api-contract` | present | present     | present  | present        |
| `refactor/e2e-simplify`             | present | present     | present  | present        |

These branches "carry" the paths simply because they branched from a commit prior to the deletion commit. They are not introducing new code under those paths.

## Step 5 — what the deletion commit actually does

```
$ git log -1 --oneline ade5abadf
ade5abadf reorganise UI components ready for migration to package
```

```
$ git diff --name-status next..HEAD -- lib/dnd lib/dialogs lib/form lib/collection \
    | awk '{print $1}' | sort | uniq -c
 180 D
```

100% of the diff against `next` for those four paths is deletions (`D`). No additions, no renames, no modifications. The commit message itself states the intent: *"reorganise UI components ready for migration to package"* — i.e. it is the prep step for the very migration this finding is part of.

## Disposition

**DONE.** No in-flight work is competing for `lib/dnd`, `lib/dialogs`, `lib/form`, or `lib/collection`. The migration plan's targets are unaffected by these git-status entries. The plan prompt's session-start status was simply stale relative to the now-committed reorganisation.

Coordination notes for downstream phases:

- Branches `next`, `refactor/interviewer-api-contract`, and `refactor/e2e-simplify` still contain the legacy `lib/{dnd,dialogs,form,collection}` trees. Any merge of `reorganise-ui` (or its successor migration commits) into those branches will produce large delete-vs-modify reconciliations. This is expected, not blocking, but should be planned for at merge time.
- `stash@{1}` ("On next: stash non-NavigationBar changes") sits on top of `next`'s pre-deletion tree. If that stash is ever popped, do it on `next`, not on `reorganise-ui`.
- `stash@{0}` is on a detached HEAD (`aa0fb6f04`) and unrelated to the suspect paths.
