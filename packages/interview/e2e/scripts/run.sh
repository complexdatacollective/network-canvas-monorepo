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

# Pin the Playwright Docker image to the exact @playwright/test version the
# lockfile resolves to: the image's bundled browser binaries must match the JS
# runner's version. @playwright/test, playwright, and this image are three
# separate version pins that must stay in lock-step or the run crashes ("two
# different versions of @playwright/test", or missing browser binaries). The two
# npm pins are grouped in .github/dependabot.yml so they bump together; deriving
# the tag here keeps the image in step automatically instead of being a third,
# dependabot-invisible pin. (cd to MONOREPO_ROOT above put pnpm-lock.yaml in cwd.)
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

# Forwarded args are spliced into the container's `sh -c` string, so each one
# must be shell-quoted or characters like the `|` in `-g "A|B"` are re-parsed
# as shell syntax inside the container (a pipe to a nonexistent command, which
# EPIPE-crashes the Playwright reporter).
FORWARDED_ARGS=""
for arg in "$@"; do
  FORWARDED_ARGS="${FORWARDED_ARGS} $(printf '%q' "$arg")"
done

docker run --rm \
  -e CI=true \
  -e PW_WORKERS \
  -v "$(pwd)":/workspace \
  -v interview-e2e-node-modules:/workspace/node_modules \
  -w /workspace \
  "${IMAGE}" \
  sh -c "set -e \
    && corepack enable \
    && pnpm install --filter '@codaco/interview...' --frozen-lockfile \
    && pnpm turbo build --filter @codaco/interview \
    && pnpm --filter @codaco/interview exec vite build --config e2e/host/vite.config.ts \
    && pnpm --filter @codaco/interview exec playwright test --config=e2e/playwright.config.ts${FORWARDED_ARGS}"
