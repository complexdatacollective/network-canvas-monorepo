# ARM64-canonical E2E visual baselines

**Date:** 2026-07-31
**Status:** Implemented; baseline candidates require visual approval

## Decision

Architect, Interview, and Interviewer pixel snapshots use Linux ARM64 as their
single rendering platform. Both normal release-gate comparison jobs and the
focused regeneration workflow run on GitHub's native `ubuntu-24.04-arm`
runner. They install Playwright's native ARM64 browsers and execute directly on
the host; Docker is not part of either CI path. The repository no longer routes
Interview E2E through privately owned self-hosted hardware.

This keeps generation and comparison on the same architecture, removes the
single-slot availability/watchdog path, and makes the canonical environment
available to every trusted CI run without a repository-administration token.
The existing screenshot tolerances are unchanged.

## Local Docker behavior

Docker is reserved for local snapshot regeneration. Each local E2E wrapper asks
the Docker daemon for its server architecture and selects the matching
Playwright image platform:

- `arm64` or `aarch64` maps to `linux/arm64`;
- `amd64` or `x86_64` maps to `linux/amd64`;
- unknown architectures fail before a container starts.

Node modules, pnpm store, and Turbo cache volumes include the normalized
architecture suffix. Apple Silicon therefore runs the native Playwright ARM64
image and cannot reuse native binaries installed by an amd64 container.

Pixel capture helpers accept and write committed baselines only when
`process.platform` is `linux` and `process.arch` is `arm64`. Other developers
can still run functional E2E coverage, but the run logs an explicit skip for
pixel comparison instead of comparing against an incompatible baseline.

## Adoption gate

The architecture migration intentionally separates generating candidates from
adopting them:

1. Run every focused capture twice on hosted ARM64.
2. Run every focused capture twice locally on Apple Silicon.
3. Hash-compare complete candidate sets within and across environments.
4. Produce a baseline/candidate/diff view for every byte-changed PNG.
5. Adopt no PNG until every visual difference has explicit human approval.
