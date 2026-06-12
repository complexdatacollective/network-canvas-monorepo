#!/usr/bin/env bash
# Regenerate the interface screenshots inside the pinned Playwright Docker
# image. Screenshots are font-rendering sensitive, so canonical (committable)
# output must always be produced in the same Linux container regardless of
# host OS. Mirrors packages/interview/e2e/scripts/run.sh.
#
# Usage:
#   ./scripts/run-docker.sh            # regenerate screenshots + manifest
#
# A named Docker volume backs /workspace/node_modules so `pnpm install`
# inside the container doesn't overwrite the host's binaries (oxide, sharp,
# swc, etc.). Wipe with:
#   docker volume rm interface-images-node-modules
#
# STORYBOOK_MAPBOX_TOKEN (if set) is forwarded so the Geospatial story can render
# its map at storybook build time.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MONOREPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
cd "$MONOREPO_ROOT"

IMAGE="mcr.microsoft.com/playwright:v1.60.0-noble"

if ! docker info >/dev/null 2>&1; then
  echo "Error: Docker is not running." >&2
  exit 1
fi

docker run --rm \
  -e CI=true \
  -e STORYBOOK_MAPBOX_TOKEN="${STORYBOOK_MAPBOX_TOKEN:-}" \
  -v "$(pwd)":/workspace \
  -v interface-images-node-modules:/workspace/node_modules \
  -w /workspace \
  "${IMAGE}" \
  sh -c "set -e \
    && corepack enable \
    && pnpm install --filter '@codaco/interface-images...' --frozen-lockfile \
    && pnpm exec turbo run generate --filter=@codaco/interface-images"
