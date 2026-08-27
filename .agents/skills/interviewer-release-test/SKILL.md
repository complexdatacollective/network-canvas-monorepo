---
name: interviewer-release-test
description: Run the agent-driven release smoke test of the deployed Interviewer PWA and report its release verdict. Use before approving an Interviewer release, when asked to release-test or smoke-test Interviewer, or to re-check the dev deployment after a fix lands on main. Keywords: release test, smoke test, release verdict, interviewer.networkcanvas.dev, pre-release check.
---

# Interviewer release smoke test

## Overview

The multi-agent workflow at `.claude/workflows/interviewer-release-test.js`
(workflow name `interviewer-release-test-workflow`) drives the deployed
Interviewer dev site — `https://interviewer.networkcanvas.dev`, which tracks
`main` and is **not** production — through every core user journey with
headless Playwright: a preflight gate, seven journeys in isolated browser
profiles, independent verification of every reported failure, and a
deterministic verdict. This skill is the procedure for one run: launch, wait,
report, follow up. It deliberately covers what the Playwright E2E suite does
not (service worker and offline behaviour, the full 30-stage Sample Protocol,
the export format matrix, the security wizard). (Codex: the run needs Claude
Code's Workflow tool — run this command from Claude Code.)

## Launch (Claude Code)

1. Collect options from the request; all are optional:
   - `url` — target a Netlify preview instead of the dev site. Required
     whenever certifying: the release candidate's own deployment is the
     target — the Version Packages PR's deploy preview for a normal release
     (the dev site serves `main`'s pre-bump version until that PR merges),
     or a deployment of the hotfix branch for a hotfix (e.g. its PR's
     preview). The bare dev site is for ad-hoc `main` health checks.
   - `journeys` — a subset of: `protocol-management`,
     `conduct-sample-interview`, `session-management`, `data-export`,
     `security-vault`, `pwa-offline`, `settings-and-chrome`. A subset run
     returns `coverage: "partial"` and **never certifies a release** — use
     it for diagnosis and iteration, then run the full suite to certify.
   - `model` — `haiku` | `sonnet` | `opus` | `fable` for preflight and the
     journeys; failure verifiers stay pinned regardless.
   - `expectedVersion` — the exact version the targeted deployment's tree
     ships (for a Version Packages preview, the bumped version in that PR).
     Required when certifying, and always passed together with the matching
     `url`: the workflow refuses in code to certify a deployment serving a
     different version, and a run WITHOUT it returns `certifying: false`
     with a "not release-certifying" banner — only a full-coverage, pinned
     run certifies.
2. Invoke the Workflow tool:
   `Workflow({ name: 'interviewer-release-test-workflow', args: { url, expectedVersion, journeys, model } })`
   (equivalently `scriptPath: '<repo-root>/.claude/workflows/interviewer-release-test.js'`).
   Requirements: a checkout of this monorepo with `pnpm install` done;
   preflight installs Playwright's chromium if missing.
3. A full run takes roughly 25–40 minutes in the background. Wait for its
   completion notification — never predict or fabricate results. If this
   session cannot run workflows, say so; do not simulate the test.

## Report

Lead with the verdict, then render the returned `summaryMarkdown`:

- `PASS` / `PASS_WITH_ISSUES` — releasable ONLY when
  `result.certifying === true` (full coverage, pinned with
  `expectedVersion`); otherwise the verdict is diagnostic and approving a
  release from it is not permitted. List verifier-confirmed minor findings
  so they can be tracked; they do not block.
- `BLOCK` — do not release. Name each blocking failure with its
  reproduction steps and evidence path (under the returned `workDir`),
  drawing from BOTH result fields: `confirmedFailures` (independently
  reproduced) and `unverifiedFailures` (no verifier adjudicated them —
  present these explicitly as unverified, never as confirmed; they block at
  blocker/major severity until verified).
- `INCOMPLETE` — do not certify the release. If a journey **died**, resume
  with `Workflow({ scriptPath, resumeFromRunId })` so completed journeys
  replay from cache. If a journey **completed but reported inconsistently**
  (wrong check count or numbering, an impermissible skip, a misreported
  key), a resume replays the same cached malformed result — instead rerun
  those journeys fresh with `args: { journeys: [...] }` to diagnose, then
  run the full suite again to certify.
- `BLOCKED` — preflight failed (target unreachable, tooling missing); fix
  and rerun.

## Follow up

- Spin off a follow-up task for each confirmed app defect, carrying the
  run's root-cause analysis and reproduction steps.
- Findings in deployment infrastructure (edge caching, headers, DNS) belong
  to whoever owns the deployment config — report them; do not file code
  tasks.
- A failure the verifier ruled an automation-issue is a harness lesson: if
  it is durable, encode it into the workflow's KNOWN APP QUIRKS list in the
  same change.
- Never merge a Version Packages PR that releases Interviewer over a
  `BLOCK` verdict.
