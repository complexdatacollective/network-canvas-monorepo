---
name: shipping-a-pull-request
description: Use when a change in this repo is implemented and verified (types, lint, knip, and relevant tests pass) and it's time to open a pull request — opens the PR using the repo's own conventions, then watches it until it's mergeable, fixing CI failures and addressing review feedback as they arrive. Keywords: open a PR, ship this, create pull request, done with the change, watch CI, respond to review, fix CI failures, address PR comments, PR is red.
---

# Shipping a Pull Request

## Overview

Two phases: **open** the PR correctly, then **stay attached to it** until it's
mergeable — CI green, no unresolved review feedback. Don't open a PR and walk
away; a red check or a review comment left unanswered is unfinished work.

**Precondition:** verification already passed (types, lint, `knip`, tests) per
this repo's `CLAUDE.md` — that document also authorizes committing and opening
the PR without asking first once verified. If verification hasn't run yet, do
that first; this skill starts from "ready to ship."

## Phase 1 — Open the PR

1. **Changeset** — invoke `creating-a-changeset` to decide whether one is
   needed and, if so, author it in the correct lane (library vs app). Commit it
   with the rest of the change.
2. **Commit** — stage the relevant files (never `-A`/`.`) and commit with a
   message describing _why_, following this repo's commit conventions (no
   `Co-Authored-By: Claude`, per the user's global instructions).
3. **Push and open the PR**:

   ```bash
   git push -u origin <branch>
   gh pr create --title "..." --body "$(cat <<'EOF'
   ## Summary
   - ...

   ## Test plan
   - [ ] ...
   EOF
   )"
   ```

   Look for a PR template (`pull_request_template.md` or
   `.github/PULL_REQUEST_TEMPLATE/`) first and follow it if one exists. Keep the
   title under ~70 characters; put detail in the body.

4. Capture the PR number from the `gh pr create` output — every command below
   needs it.

## Phase 2 — Monitor until mergeable

Loop the two checks below until both are clear, fixing anything that surfaces.
Use `ScheduleWakeup` between polls instead of a busy `sleep` loop — cache-window
timing (60–270s while checks are actively running) applies here, same as any
other "wait on external state" polling.

### Check CI

```bash
gh pr checks <number> --json name,state,bucket,link
```

- All `bucket: pass` (or `skipping`) → CI is clear.
- Any `bucket: fail` → pull the failing job's log and diagnose the _root
  cause_ (invoke `systematic-debugging` if it's not immediately obvious — don't
  guess-and-check):
  ```bash
  gh run view <run-id> --log-failed
  ```
  Fix, re-verify locally (the same types/lint/knip/test commands from
  `CLAUDE.md`), commit, push. The push re-triggers CI — go back to polling.
- Any `bucket: pending` → not done yet, reschedule a check.

### Check review feedback

```bash
gh pr view <number> --json reviews,latestReviews,mergeStateStatus
gh api repos/{owner}/{repo}/pulls/<number>/comments
```

- A review with `state: CHANGES_REQUESTED`, or unresolved inline comments →
  invoke `receiving-code-review` before touching code: verify each piece of
  feedback is technically correct rather than implementing it reflexively.
  Apply the fixes that hold up, reply to (or resolve) the threads, push.
- `APPROVED` with no unresolved threads and CI green → the PR is mergeable.
  Report this to the user and stop — **do not merge it yourself**; merging is
  a hard-to-reverse, outward-facing action that needs explicit confirmation
  each time, not implied by having opened the PR.

### Stopping conditions

- **Done:** checks green, reviews approved (or no review requested), no
  unresolved comments. Tell the user it's ready to merge.
- **Blocked on a human:** a reviewer asks a question, requests a design change
  you're not confident about, or the failure isn't something a code fix
  resolves (flaky infra, missing permissions, a merge-queue rule). Surface it
  and stop polling rather than looping indefinitely.
- **Repeated failure:** the same check fails after a fix and a re-push more
  than twice — stop and hand back to the user with what you tried, instead of
  guessing again.

## Common mistakes

| Mistake                                            | Do instead                                                                    |
| -------------------------------------------------- | ----------------------------------------------------------------------------- |
| Opening the PR then ending the turn                | Move straight into Phase 2 monitoring — that's the point of this skill.       |
| Busy-polling with `sleep` in a loop                | Use `ScheduleWakeup` so the loop survives across turns without burning cache. |
| Applying every review comment verbatim             | Run `receiving-code-review` first — verify before implementing.               |
| Force-pushing to satisfy a check                   | Fix root cause and push a normal commit; don't rewrite history reflexively.   |
| Merging once checks go green                       | Merging is the user's call — report readiness, don't merge automatically.     |
| Re-guessing the same fix after two failed attempts | Stop and hand back to the user with the failure history.                      |
