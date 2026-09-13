# Managed collector pause checkpoint

- Paused at: 2026-09-13T20:15:48Z UTC
- PR branch head before this task: `checkpoint/studio-1243-managed-collector-runtime` at `fb7d13a264c77e7bfd4dae72c25702b2b995f677`
- Durable WIP branch: `wip/studio-1243-managed-collector-vitest-selection`
- WIP commit: `c0c888e6e4e0cf0a95c7d6f7049f58cbc0a4e90e` (`test(studio): run collector node suites through wrapper`)
- Attribution: Joshua Melville `<joshua@northwestern.edu>`

## Reproduced finding

Running Vitest against the two `node:test` collector files at the original PR head exited 1 after executing their Node tests. Vitest reported `No test suite found` for both `scripts/studio/studio-managed-log-collector.test.mjs` and `scripts/studio/studio-managed-log-collector-image.test.mjs`. This confirms current-head review thread database ID `4000731660`.

## Preserved WIP correction

The WIP excludes those two Node-runner suites from direct Vitest discovery, adds the image suite to the existing Vitest-owned observability wrapper, serializes the spawned Node suites, and asserts output from both collector and image suites so exclusion cannot silently remove execution.

The correction is coherent and `git diff --check` passed before commit, but it is deliberately recorded as **unverified** because the user paused work before post-change checks completed. The first post-change attempt triggered a dependency reinstall from the image build; it was interrupted after registry DNS failures. The commit hook subsequently restored dependencies from the local pnpm content-addressable store and formatted the two files, but no post-change test result was obtained.

## Checks remaining

1. Run the targeted Vitest wrapper with local loopback permission and confirm both output sentinels pass.
2. Prove the runner oracle fails when either excluded Node suite is removed from the wrapper, then restore it.
3. Run `pnpm test:scripts` or the exact `//#test:scripts` Turbo task.
4. Run relevant CI workflow guards, lint/format, typecheck, and Knip.
5. Rebuild the collector runtime and repeat the offline container/image smoke checks.
6. Only after all checks pass, transplant or fast-forward the correction onto the PR branch and push that PR branch. Do not mutate review threads from this checkpoint.

## Delivery audit artifacts

- `evidence/live-delivery-audit-2000.json`
- `evidence/live-delivery-audit-2000.md`

The audit snapshots were captured at `2026-09-13T20:06:12Z` for the monorepo and `2026-09-13T20:06:16Z` for specifications. They are point-in-time evidence because active source integration can advance heads.
