---
name: shipping-a-pull-request
description: "Use when a change in this repo is implemented and verified (types, lint, knip, and relevant tests pass) and it's time to open a pull request — opens the PR using the repo's own conventions, then watches it until it's mergeable, fixing CI failures and addressing review feedback as they arrive. Keywords: open a PR, ship this, create pull request, done with the change, watch CI, respond to review, fix CI failures, address PR comments, PR is red."
---

# Shipping a Pull Request

## Overview

Two phases: **open** the PR correctly, then **stay attached to it** until it's
mergeable — CI green, no unresolved review feedback. Don't open a PR and walk
away; a red check or a review comment left unanswered is unfinished work.

**Precondition:** verification already passed (types, lint, `knip`, tests) per
this repo's `AGENTS.md`/`CLAUDE.md` (the same file) — that document also
authorizes committing and opening the PR without asking first once verified.
If verification hasn't run yet, do that first; this skill starts from "ready
to ship."

## Phase 1 — Open the PR

1. **Visual baselines** — invoke `preparing-e2e-visual-baselines` to inspect
   the complete branch and working-tree diff. If pixels or captured UI state
   may have changed, regenerate and visually inspect only the affected
   Architect, Interview, and/or Interviewer baselines in pinned Docker before
   staging. Record the suites in the test plan. Do not proceed with unexplained
   PNG churn.
2. **Changeset** — invoke `creating-a-changeset` to decide whether one is
   needed and, if so, author it in the correct lane (library vs app). Commit it
   with the rest of the change.
3. **Commit** — stage the relevant files (never `-A`/`.`) and commit with a
   message describing _why_, following this repo's commit conventions. Do not
   add AI co-author trailers unless the user explicitly requests them.
4. **Push and open the PR**:

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

5. Capture the PR number from the `gh pr create` output — every command below
   needs it.

## Phase 2 — Monitor until mergeable

Loop the two checks below until both are clear, fixing anything that surfaces.
Use your harness's wakeup/scheduling tooling between polls (Claude Code:
`ScheduleWakeup` or a background watcher; Codex: automation/thread-wakeup
tooling), or report pending external state and stop, rather than running a
busy `sleep` loop. Poll at reasonable intervals while checks are actively
running.

### Check CI

```bash
gh pr checks <number> --json name,state,bucket,link
```

- All `bucket: pass` (or `skipping`) → CI is clear.
- Any `bucket: fail` → pull the failing job's log and diagnose the _root
  cause_ (Claude Code: invoke `superpowers:systematic-debugging` if it's not
  immediately obvious). Do not guess-and-check:
  ```bash
  gh run view <run-id> --log-failed
  ```
  Fix, re-verify locally (the same types/lint/knip/test commands from
  `AGENTS.md`), commit, push. The push re-triggers CI — go back to polling.
- Any `bucket: pending` → not done yet, reschedule a check.

### Check review feedback

```bash
gh pr view <number> --json reviews,latestReviews,mergeStateStatus
gh api repos/{owner}/{repo}/pulls/<number>/comments
```

- A review with `state: CHANGES_REQUESTED`, or unresolved inline comments →
  take a code-review stance before touching code (Claude Code: invoke
  `superpowers:receiving-code-review`): verify each piece of feedback is
  technically correct rather than implementing it reflexively. Then triage it
  by the rules below, reply to and resolve every thread, and push.
- `APPROVED` with no unresolved threads and CI green → the PR is mergeable.
  Report this to the user and stop — **do not merge it yourself**; merging is
  a hard-to-reverse, outward-facing action that needs explicit confirmation
  each time, not implied by having opened the PR.

### Triaging a finding: fix, or reply and resolve

Every thread gets a reply and gets resolved — an unresolved bot thread holds
the PR in `BLOCKED` regardless of merit. What varies is whether code changes.

**Verify first, always.** Roughly a third of automated findings are wrong or
overstated, and a wrong finding that gets "fixed" is worse than one left alone.
Prove it against the real source, the real library, or a runnable probe. Also
check provenance: `git diff <base>...HEAD -- <file>` tells you whether the
finding is about your change or pre-existing debt the diff merely revealed.

**Change the code when** the finding names a failure a user can reach, however
it is badged; when it shows a claim you made — in a comment, a doc, a changeset
— to be false; or when it touches a boundary where the failure is silent:
tenancy, authorization, deployment gating, focus and announcement, data loss.

**Reply and resolve without changing code when** you can disprove it with
evidence; when it is already handled elsewhere and you can name where; when it
is a preference with no reachable failure; or when it is real but belongs to
another PR — say which, and why the split is right.

**Do not triage on the severity badge alone.** A badge is the reviewer's
confidence, not your severity assessment. Findings badged P2 have included a
deployment gate defeated by one capital letter, a focus controller that was
never mounted so an entire accessibility mechanism was inert, and a sign-out
that could resume after the researcher cancelled it. Read the mechanism, decide
for yourself, and let the badge break ties rather than make decisions.

**Tell the user which threads you resolved _without_ changing code**, so they
can overrule you. Never let a no-action resolution pass silently.

### Breaking a review spiral

A spiral is not the reviewer repeating itself. Each push triggers a fresh
round, and on a large diff each round samples findings the previous rounds
never mentioned — about code that has not changed. Fixing does not deplete the
pool, so "keep fixing until the reviewer goes quiet" has no fixed point.

Diagnose by origin, not by round count. For each finding ask which population
it belongs to:

- **Exposed by the last push** — `git diff <previous head>..<current head>`
  touches the mechanism it names. Ordinary review of new work; always act.
- **Resampled** — about code that was already in the diff during an earlier
  round and went unmentioned then. The reviewer is still discovering the
  original diff.

A round that is mostly resampled means you are nowhere near the end, however
many rounds you have done. Reacting to it a few findings at a time is the
spiral.

Three moves break it, and all three raise quality rather than trading it away:

1. **Sweep once instead of reacting N times.** After the first round, stop
   reacting and audit the whole diff yourself, in parallel, along the
   dimensions the reviewer uses. Emptying the pool deliberately is faster than
   having it sampled back at you six at a time.
2. **Fix the family, not the instance.** A finding is one sample of a class.
   Told that one screen is missing a contract, check every screen; told one
   guard is wrong, check every guard. An instance-level fix guarantees its
   sibling arrives next round — and reaching for the class is how a fix that
   merely satisfies a reviewer becomes one that removes the defect.
3. **One push per round, never one per finding.** Each push starts a round.

**Do not break a spiral by deferring real defects to follow-up issues.** That
trades quality for speed, and this repository's standing rule is that what you
discover lands in the same PR. Front-load the thoroughness instead.

**Terminating.** The loop ends when a round produces no finding that both names
a reachable failure and concerns code this PR introduced — not when the reviewer
falls silent, and not at a round budget. Say so explicitly, listing what you
resolved without code changes.

**When the diff is the problem.** If two rounds _after_ your own sweep are still
surfacing confirmed defects in code the PR introduced, it is too large to
converge under review. Say that to the user and offer to split it. That is the
quality-preserving exit; deferral is not.

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

| Mistake                                              | Do instead                                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------------------------ |
| Opening the PR then ending the turn                  | Move straight into Phase 2 monitoring — that's the point of this skill.        |
| Busy-polling with `sleep` in a loop                  | Use available wakeup/automation tooling when present, or report pending state. |
| Applying every review comment verbatim               | Verify the feedback before implementing.                                       |
| Triaging by severity badge instead of mechanism      | Read what actually breaks; badges are confidence, not severity.                |
| Leaving a thread unresolved because it needed no fix | Reply with the evidence and resolve it — unresolved threads hold `BLOCKED`.    |
| Force-pushing to satisfy a check                     | Fix root cause and push a normal commit; don't rewrite history reflexively.    |
| Merging once checks go green                         | Merging is the user's call — report readiness, don't merge automatically.      |
| Re-guessing the same fix after two failed attempts   | Stop and hand back to the user with the failure history.                       |
| Fixing only the file a finding names                 | Fix every instance of the class; the sibling arrives next round otherwise.     |
| Pushing after each individual fix                    | Batch a round's fixes into one push — each push starts a new review round.     |
| Reacting round after round on a large diff           | Sweep the whole diff yourself once, in parallel, then respond.                 |
| Deferring real defects to escape a review spiral     | Front-load the sweep; if it still won't converge, offer to split the PR.       |
