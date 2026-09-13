# Studio #1243 resumed delivery

The user resumed implementation on 2026-09-13. The [September 8 pause record](2026-09-08-studio-1243-pause-and-resume.md) remains historical evidence; its instruction to pause and its migration-number reservations are superseded here.

## Verified restart

All saved implementation worktrees and named checkpoint commits survived the pause. Work continues under the persistent `.claude/worktrees/studio-1243/` directory, with one committer per worktree and normal remote checkpoints. Raw logs remain in `evidence/`. No temporary clone or stash is the sole copy of implementation work.

GitHub epic #1243 and children #1250, #1251, #1252, #1258 and #1284 remain open. PRs #1740, #1741, #1745 and #1746 retain their saved heads at restart; their reviews produced additional actionable findings. Current main at restart is `7fd01d2301454225190cbbe1bfe93ff10ae301c7`.

## Integration constraint discovered on resume

Main now contains `0009_protocol_builder_event_log` and `0010_protocol_builder_write_receipts`. Preserve main's numbered migration identities. The unpublished recovery and Registry-flow migrations from the paused stack must be regenerated after main's chain, expected as 0011 and 0012 respectively after verifying the actual latest chain. Do not merely rename old manifests or overwrite main snapshots. Regenerate against the combined schema and verify predecessor upgrades with real PostgreSQL.

Main also moved root guard scripts into area directories and converted them to Vitest. Preserve `scripts/studio/studio-managed-estate.test.mjs` and the current root runner when integrating older branches.

## Active work and evidence

- Lead: inventory review fixes, parent integration, adversarial reviews and PR delivery. Inventory head `2c9996f13519a48e4b78dc872bdc99c358db8cfa` is pushed to PR #1741. Source mappings now bind the reviewed Terraform source; provider versions reject ranges and missing/non-string values. Six regressions failed before the fix; all 149 managed-estate tests pass after main integration. Both review threads were replied to and resolved with code fixes, and current-head review was requested. After the merge hook refreshed workspace dependencies, full Knip reports an Architect/protocol-validation configuration-loading error; do not treat its zero exit code as a passing analysis.
- Sol completed migration checkpoint `d09359615c38a87ca59542bf2f66e15ed00db6ae`, pushed to its dedicated checkpoint branch, covering PR #1740's three findings: immutable artifacts before asynchronous connection, immutable authoring sidecars before awaits, and authoritative Studio-owned authoring options. Meaningful tests reproduced all three findings. Verification passed 509 shared tests, 59 focused PostgreSQL migration tests and 264 Studio migration tests plus types and changed-file static checks. Numbered migrations remain unchanged. The lead is reviewing/integrating this head and reproduced an additional authoring schema/fingerprint consistency gap; that fix remains in progress. Sol now owns the separate Registry specification and Python compatibility gate.
- Sol: Registry integration reached checkpoint `31a359434a35300e9a80d0d9568f4cf3dd315fa6`, merging recovery and storage review branches normally. Full Registry verification passed 400 backend and 12 account tests; shared client tests, typechecks, Registry build and scoped static checks passed. The lead then reproduced and fixed a further configuration ancestor-symlink retargeting race by anchoring writes to the validated canonical path. Lead path-custody fix `0971ac3e2e34ab6489951d3431488ac34a435175` is pushed to the same checkpoint branch. All 22 configuration and 8 storage tests pass, along with Registry types and scoped Knip. Exact-image refresh and PR branch publication remain pending. This agent now owns #1746's five recovery findings in its separate worktree: snapshot locking, evidence freshness, webhook uncertainty metrics, machine-readable receipts and production recovery entrypoints.
- Luna: Studio UI checkpoint is `f0cdc954a30af15275e9cccf3781561783d523b5`, pushed to its existing checkpoint branch. Nine Registry interaction tests, types/build and scoped static checks pass. Six locale/localStorage failures reproduce on the saved baseline; current UI did not introduce them. No browser qualification is claimed. Luna now independently investigates the inventory branch's Knip configuration-load error; no unrelated source patch is authorized by this plan without reviewing its cause and scope.

The lead remains responsible for verifying findings, integration, current-head reviews, required checks, merge queue and post-merge ancestry. Agent test reports are evidence to assess, not automatic approval. Preserve checkpoint provenance and refresh image evidence against immutable Git archives after final dependency integration.

## Remaining sequence

1. Finish, review and land shared migration fixes; complete inventory's current-head review and checks.
2. Integrate Registry corrections and the corrected parent, refresh immutable-image evidence and complete #1745 review rounds.
3. Integrate recovery with main while regenerating its additive migration, then the Studio Registry flow; complete focused PostgreSQL, UI and production-entrypoint evidence and ship the dependent PRs.
4. Finish installer, observability and telemetry integration from their saved checkpoints. Complete Linux Chromium isolation, signed image/SBOM publication, checkout-free install, predecessor upgrade and recovery/restart qualification.
5. Complete the Registry public CC0 specification and inherited OpenAPI/Python compatibility gates.
6. Complete actual managed provisioning, backup/restore, retention, alert delivery, rollback, DNS/TLS and measured cost qualification before closing the epic.

## Access and standing authorization

The $100/month authorization applies only to hosting. Netlify access remains available. No Fly/AWS/B2 CLI or provider credentials were detected at resume; the user has been asked which existing Fly.io, Crunchy Bridge, AWS KMS, Backblaze and Cloudflare accounts/access to use. Account access is needed for live qualification, while implementation continues independently. Never place credentials in chat, Git or diagnostic output.

Approved domains, proposed operator destination, migration window, prerequisite scope and Joshua-only commit attribution remain as documented in the pause record. The user explicitly authorizes merging PRs deemed ready; do not repeat routine approval requests. Use efficient models for independent bounded work and retain durable branches/worktrees rather than temporary implementation directories.
