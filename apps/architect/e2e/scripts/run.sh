#!/usr/bin/env bash
# Run the @codaco/architect e2e suite inside the pinned Playwright Docker image.
# Visual snapshots are font-sensitive, so baselines must be generated here, never
# on the host. The image tag is derived from pnpm-lock.yaml so it stays in
# lock-step with the @playwright/test / playwright catalog pins.
#
#   ./e2e/scripts/run.sh                    # run all specs
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
  -v architect-e2e-node-modules:/workspace/node_modules \
  -w /workspace \
  "${IMAGE}" \
  sh -c "set -e \
    && corepack enable \
    && pnpm install --filter '@codaco/architect...' --frozen-lockfile \
    && pnpm turbo run build --filter=@codaco/architect \
    && pnpm --filter @codaco/architect exec playwright test --config=e2e/playwright.config.ts $*"
