#!/usr/bin/env bash
# Run the @codaco/interviewer e2e suite inside the Playwright Docker image so
# visual baselines are font-rendering-stable regardless of host OS. Mirrors
# packages/interview/e2e/scripts/run.sh.
#
# Usage:
#   ./e2e/scripts/run.sh                    # run
#   ./e2e/scripts/run.sh --update-snapshots # regenerate visual baselines
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MONOREPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
cd "$MONOREPO_ROOT"

PW_VERSION="$(grep -oE '@playwright/test@[0-9]+\.[0-9]+\.[0-9]+' pnpm-lock.yaml | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | sort -uV | tail -1 || true)"
if [ -z "$PW_VERSION" ]; then
  echo "Error: could not determine @playwright/test version from pnpm-lock.yaml" >&2
  exit 1
fi
IMAGE="mcr.microsoft.com/playwright:v${PW_VERSION}-noble"

if ! docker info >/dev/null 2>&1; then
  echo "Error: Docker is not running." >&2
  exit 1
fi

docker run --rm \
  -e CI=true \
  -v "$(pwd)":/workspace \
  -v interviewer-e2e-node-modules:/workspace/node_modules \
  -w /workspace \
  "${IMAGE}" \
  sh -c "set -e \
    && corepack enable \
    && pnpm install --filter '@codaco/interviewer...' --frozen-lockfile \
    && pnpm --filter @codaco/interviewer build:web \
    && pnpm --filter @codaco/interviewer exec playwright test --config=e2e/playwright.config.ts $*"
