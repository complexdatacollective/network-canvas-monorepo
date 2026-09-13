# Installer image build inputs

CI run `34759587674` failed while bundling `src/configure.ts`: Turbo's pruned
workspace omitted `deployment/installer/configuration-files.json`, which lives
outside the server package but is imported by the configure implementation.
The builder now copies that exact file from the same pruner stage before Vite
runs, alongside the already explicit shared build plugins.

The real local Docker build completed, including both Vite builds and the
production dependency deployment. The resulting local arm64 manifest is
`sha256:b2e21cff7216db8fc4918693bba04c4b73f15cd0c06876738e056e0b770ad684`.
The five installer archive/configuration tests also passed. This locally built
image has not been published and is not release qualification evidence; the
signed release lane still requires the final reviewed commit and Linux checks.

## Heartbeat verification after Linux CI

Run 34762719817 exposed two tests using 60 ms and 150 ms leases, shorter than shared PostgreSQL/runner scheduling latency. The tests now observe an actual lease expiry extension in PostgreSQL before trying a second claimant. They preserve PostgreSQL microsecond precision by comparing the original timestamp text, use six-second leases, and release held work in finally blocks. This changes test scheduling rather than production lease behavior. Both tests fail with renewal timers disabled and pass restored; the complete invitation and Registry intent suites pass 41/41, with types, lint and Knip also passing.

The telemetry failure is separately confirmed as ENOENT from the kernel observer on the Linux runner. An internal Docker network on the local kernel successfully produced readiness and both TCP/UDP controls. A dedicated durable kernel-observer worktree is implementing a qualification-only Netlink-compatible observer; the local pass is not Linux browser qualification.
