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

1. **Visual baselines — assess only.** Run the classifier and diff inspection
   from `preparing-e2e-visual-baselines` ("Determine affected suites") to
   decide whether the branch can move any Architect, Interview, or Interviewer
   PNG baseline. **Never generate PNGs locally — not natively and not in the
   pinned Docker image.** Canonical baselines come only from the
   `Regenerate E2E Visual Snapshots` GitHub Actions workflow: an arm64 host
   runs the amd64 image under emulation and rasterises different pixels, so a
   locally written baseline is contaminated even when it looks right. The
   workflow checks out a pushed ref, so generation happens in step 5, after
   the push. Note the affected suites now.
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

5. **Baselines in CI** — if step 1 found affected suites, invoke
   `regenerating-e2e-visual-snapshots`: dispatch
   `regenerate-e2e-visual-snapshots.yml` against the PR branch once per
   suite, download each artifact, byte-compare it against the committed
   baselines to find what actually changed, inspect every changed image
   (invoke `adopting-a-test-baseline`), and commit only the intended PNGs.
   Push them as a normal commit; that head is what CI and reviewers judge.
   Record the suites and run ids in the test plan. Do not proceed with
   unexplained PNG churn.
6. Capture the PR number from the `gh pr create` output — every command below
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

**Before the first edit, state the rule.** "The finding names a reachable
failure" decides _that_ you change code; it is not sufficient on its own,
because it does not tell you _what_ to change, and taking the finding's own
scope as the answer is what turns one defect into six rounds of narrow fixes.
So, before touching code: write one paragraph stating the general rule this
finding is an instance of, in the terms the code actually works in rather than
the one case the reviewer happened to reach; enumerate the rule's other
instances; give each one an oracle that can fail; then satisfy the rule once,
so every oracle passes. One instance per reviewer-supplied finding is the
reviewer doing the enumeration for you, a round at a time. If the paragraph is
hard to write, that is the finding telling you the rule is not yet understood
— and a narrow fix will not be the last one.

Two words in that step do real work. **Oracle**, not test: a failing test where
the instance is executable, and a runnable probe or a named check where it is
not — a false claim in a doc or changeset is checkable against the thing it
asserts, and this repo would rather have that check than a vacuous assertion
written to satisfy the letter of this rule (Claude Code: invoke
`writing-an-oracle-that-can-fail`). **Instances**, not hunks: start from
`git diff <base>...HEAD`, but a helper you edited has callers the diff never
prints, and an enumeration bounded by changed lines can come back complete with
the defect still reachable — search for the rule's shape across the repo. What
stays inside the diff is the _remedy_: an instance outside it is a scope
question for the user (Claude Code: `finishing-a-refactor` owns the repo-wide
call-site sweep), to raise rather than to fix silently or drop.

**A second finding on the same mechanism means stop fixing instances.** The
trigger is the second finding, not several flat rounds; flat rounds are the
same signal noticed several rounds too late. Recognise it from the reviewer's
opening, which usually asserts the link outright — "Fresh evidence after the
earlier devDependency fix is that…", "the earlier fix does not cover…". Two
findings landing on the same function, guard or helper in consecutive rounds
is the weaker signal: co-location is a prompt to check, not the answer, since
one large function collects unrelated defects. They are the same mechanism when
both violate the same invariant, and if you cannot name the invariant they
share they are two mechanisms — state each. From there, every further narrow
fix is a bet that the reviewer has run out of instances, and that bet has
already lost once. Stop, write the paragraph above, and fix the rule.

**Do not triage on the severity badge alone.** A badge is the reviewer's
confidence, not your severity assessment. Findings badged P2 have included a
deployment gate defeated by one capital letter, a focus controller that was
never mounted so an entire accessibility mechanism was inert, and a sign-out
that could resume after the researcher cancelled it. Read the mechanism, decide
for yourself, and let the badge break ties rather than make decisions.

**Tell the user which threads you resolved _without_ changing code**, so they
can overrule you. Never let a no-action resolution pass silently.

### Ending the review loop

Every push that triggers the reviewer is a round, and the loop ends only when
a round run against your current head leaves nothing you must act on. The
number of rounds is therefore mostly yours to set: by how often you push, and
by whether each push leaves the reviewer less to find than it had before.

- **One push per round.** Fix everything a round raised, verify, push once. A
  push per finding is a round per finding.
- **Look for the sibling before pushing.** The triage step above, applied to
  the round as a whole: every fix in the push should be a rule you can state,
  whose other instances you have already enumerated and covered. The reviewer
  reads your fix and probes around it — "after the X fix, Y still…" is how it
  opens — so a fix scoped to the one guard, screen or call site a finding
  names reliably draws the same defect in the next round. Stay inside the
  diff: a fix that would reach files this PR never touched is a scope
  question for the user, not a reviewer response.
- **Re-read your fixes as a set.** A fix is code the reviewer has not seen,
  and fixes create findings: in this repo's longest review loops, between a
  fifth and a half of all findings describe what an earlier fix broke or left
  open. After changing any guard, re-read every guard on that path together
  and ask what their combination does.
- **Prefer the fix that leaves fewer surfaces — not fewer lines.** "Less to
  review" counts the distinct places a rule is enforced, not the size of the
  diff. A three-line guard bolted beside an existing one is the cheap change
  and the wrong one: it is a new surface carrying the same hole one step over,
  which the reviewer reaches next round. One rule replacing several call sites
  is more lines and less to review, and is the fix to prefer.

**Terminating.** A clean round leaves no review and no thread — the reviewer
reacts with a thumbs-up on the PR instead — so before concluding anything,
confirm a verdict exists for your current head:

```bash
gh api repos/{owner}/{repo}/issues/<number>/reactions   # dated after your last push
```

Do not stop at a round count. Shrinking rounds mean you are converging; keep
going. Flat rounds in which most findings trace back to your own fixes mean
the fixes are the problem — but by then the second finding on that mechanism
is several rounds behind you, so the trigger that governs is the one in
_Triaging a finding_, not this one. If you are already here, stop patching:
state the rule, give every instance of it an oracle, fix it once, push once.
Do not end the loop by deferring real defects to follow-up issues — this
repository's standing rule is that what you discover lands in the same PR. When
it ends, say so, listing what you resolved without code changes.

**What the history shows.** The reviewer reads the whole diff each round,
re-raises only what was left unfixed, and returns a handful of findings at a
time — never more than nine in the PRs checked, whatever the diff's size — so
one round never shows everything it will eventually find; on the app-shell PR,
code present when it opened was first flagged four rounds later. Diff size does
not set the round count. The largest diff in sixty PRs was down to two
findings by its fifth round (8, 6, 4, 2); a one-file spec ran thirteen rounds,
every fix growing the document and a third of the findings landing on text
the previous fix had added; a nine-file CI change took twenty-two rounds of
one to three findings each, half of them about the previous fix; the Fresco
hotfix lane ran twenty rounds, of which the last six were one defect family —
which workspace packages a hotfix must rebuild and vendor, given that the image
installs published artifacts for everything it does not vendor — answered five
times narrowly, one reachable way to ship a stale artifact per round (an
importer's direct lockfile edges, then the transitive graph beneath them, then
npm aliases inside that graph, then propagation through workspace build
dependencies, then edges rather than snapshot membership plus the app's
optional dependencies), where one paragraph defining a changed build input,
written at round fifteen, would have produced the round-twenty code in a single
push. Auditing the whole diff yourself finds real defects but does not shorten
the loop — the one documented sweep fixed twenty-six and the reviewer's rate
was unchanged for the eight rounds after — and splitting the PR is not an exit
for the same reason.

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

| Mistake                                                              | Do instead                                                                                        |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Opening the PR then ending the turn                                  | Move straight into Phase 2 monitoring — that's the point of this skill.                           |
| Busy-polling with `sleep` in a loop                                  | Use available wakeup/automation tooling when present, or report pending state.                    |
| Applying every review comment verbatim                               | Verify the feedback before implementing.                                                          |
| Triaging by severity badge instead of mechanism                      | Read what actually breaks; badges are confidence, not severity.                                   |
| Leaving a thread unresolved because it needed no fix                 | Reply with the evidence and resolve it — unresolved threads hold `BLOCKED`.                       |
| Force-pushing to satisfy a check                                     | Fix root cause and push a normal commit; don't rewrite history reflexively.                       |
| Generating PNG baselines locally (native or Docker)                  | Dispatch the CI regeneration workflow against the pushed branch and adopt from its artifact.      |
| Merging once checks go green                                         | Merging is the user's call — report readiness, don't merge automatically.                         |
| Re-guessing the same fix after two failed attempts                   | Stop and hand back to the user with the failure history.                                          |
| Pushing after each individual fix                                    | Fix everything a round raised, then push once — each push is a round.                             |
| Fixing only the instance a finding names                             | State the rule it instances, enumerate the rule's other instances, give each an oracle, fix once. |
| Treating no new review as a clean round                              | Look for the reviewer's thumbs-up on the PR, dated after your last push.                          |
| Fixing another instance after a second finding on the same mechanism | The second finding is the trigger, not the fifth — specify the mechanism and fix the rule.        |
| Deferring real defects to end the loop                               | Fix them here; flat rounds mean the fixes need rethinking, not a lower bar.                       |
