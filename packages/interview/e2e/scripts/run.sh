#!/usr/bin/env bash
# Run the @codaco/interview e2e suite inside the Playwright Docker image.
#
# Snapshots are font-rendering sensitive, so we always run them in the same
# Linux container regardless of host OS. Mirrors fresco-next/scripts/run-e2e.sh
# in spirit but without the Postgres/testcontainers wiring (the interview
# package is fully self-contained — vite host + asset server in same container).
#
# Usage:
#   ./e2e/scripts/run.sh                    # run all browsers
#   ./e2e/scripts/run.sh --update-snapshots # regenerate visual baselines
#   ./e2e/scripts/run.sh --project=chromium # filter to one browser
#
# For local UI debug iteration (skips Docker):
#   pnpm test:e2e:headed
#
# A named Docker volume backs /workspace/node_modules so `pnpm install
# --frozen-lockfile` inside the container doesn't overwrite the host's
# arm64 binaries (oxide, sharp, swc, etc.). The volume persists between
# runs so subsequent installs are no-ops; wipe with:
#   docker volume rm interview-e2e-node-modules
#
# Build @codaco/interview and its workspace deps before launching the vite
# host. Sibling workspace packages ship dist-only (their package.json `exports`
# point at ./dist/*), so the dist trees must exist before the host can resolve
# them. Turbo's `^build` task wiring handles the dep order.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MONOREPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
cd "$MONOREPO_ROOT"

IMAGE="mcr.microsoft.com/playwright:v1.59.1-noble"

if ! docker info >/dev/null 2>&1; then
  echo "Error: Docker is not running." >&2
  exit 1
fi

docker run --rm \
  -e CI=true \
  -v "$(pwd)":/workspace \
  -v interview-e2e-node-modules:/workspace/node_modules \
  -w /workspace \
  "${IMAGE}" \
  sh -c "set -e \
    && corepack enable \
    && pnpm install --filter '@codaco/interview...' --frozen-lockfile \
    && pnpm turbo build --filter @codaco/interview \
    && pnpm --filter @codaco/interview exec vite build --config e2e/host/vite.config.ts \
    && pnpm --filter @codaco/interview exec playwright test --config=e2e/playwright.config.ts $*"
