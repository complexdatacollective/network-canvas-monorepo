# Studio platform foundation delivery checkpoint

Epic #1243 remains incomplete. This document records delivery evidence and durable work ownership after recovery of the local worktrees on 2026-09-08.

## Durable workflow

Long-lived implementation work lives in named Git worktrees under the persistent repository workspace, never in `/tmp`. Each coherent increment receives a commit attributed to Joshua Melville and a remote checkpoint. Checkpoint branches preserve unfinished work; they are not evidence of release readiness. Raw test logs stay in the persistent evidence directory. Reviewed, sanitized results belong in this plan and the relevant PR. No secrets or live credentials belong in either Git or logs.

The primary agent verifies actual agent status and uses the three available subagent slots for independent bounded tasks. Dependencies and privileged test commands are unblocked centrally when an implementation agent cannot run them. Separate worktrees and PostgreSQL ports prevent concurrent edits or fixture collisions. No worktree is removed until its commits are reachable from a remote branch and all uncommitted work has been preserved.

## Current delivery

| Work | Evidence | Remaining gate |
| --- | --- | --- |
| Managed estate/cost model PR #1734 | Merged as `4869147db0357807fa6565e4bbd2b978aa788d2c`; reviewed head verified as an ancestor of main | Live provider qualification remains separate |
| Fly preparation PR #1735 | Head `f958397a84d7f6822b2f444c4b5ca854c3e07075`; 142 local scoped tests passed; clean current-head Codex review | Required CI, merge queue, ancestry verification |
| Managed ingress PR #1736 | Head `4213bc6512f262de05dd2b531a32bf14e0ca1084`; 119 local scoped tests passed; clean current-head Codex review | Required CI, merge queue, ancestry verification |
| PII PR #1718 | Existing head `44f1b488480fe77a74a750dd6e71188020b2239d` | Four legacy-key/docs findings and alert retry finding, fresh verification/review |
| KMS PR #1723 | Reconstructed read-only backup custody fix checkpoint `a68b57920d8d7e80d3022c5d5eee586cc94246ff`; 13 PostgreSQL backup and 6 shell tests passed; old writer-reopening script failed the key-rotation regression | Built-image restore qualification and final current-head review |
| Alert preferences | Reconstructed source, migration artifacts, 14 alert tests, 6 migration artifact tests, 68 route tests | Types/lint/Knip, adversarial test evidence, canonical migration integration |
| Recovery authorization | Restored committed foundation `492a77636463d7ae90339aebcae77b7d1f8eaaa7` | Reconstruct and verify signed selective reauthorization; integration/restore drills |
| Telemetry qualification | Checkpoint `b782cb98d314ecdb6695250ade95942c7e6b1251` adds a broader process-level network guard and positive controls | Current-image run and adversarial coverage review |

## Remote recovery references

The `checkpoint/studio-1243-*` branches preserve combined, recovery, telemetry, alert preferences, alert retry and KMS work. Deployment and PII PR branches preserve their reviewed heads. These references must be updated as further work is committed. The combined branch also retains the New Relic sender/usage-reader implementation; it has not yet completed canonical integration or live validation.

## Completion still required

Canonical integration of encryption, Registry, shared PostgreSQL administration, alerts and recovery must pass current-head reviews and checks. Self-host qualification requires signed distributable images, authenticated restore including keys and objects, safe restart, predecessor upgrade and realistic recovery timing. Managed hosting requires actual provider access, provisioning, backups, deployment/rollback, DNS/TLS and verified costs within the authorized $100 per month hosting budget. Observability requires working collectors, independent retention, budget controls, alert routing and demonstrated delivery. Infrastructure estimates or unit tests alone do not satisfy these operational criteria.

Temporary directories were removed during the local interruption; the removal mechanism has not been established. Shared Git commits survived, while some uncommitted changes and commits in independent temporary clones required reconstruction. Old test claims are retained only as historical context; reconstructed changes receive fresh verification.
