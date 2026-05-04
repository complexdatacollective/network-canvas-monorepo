#!/usr/bin/env bash
set -euo pipefail

# Run @codaco/interview e2e suite in Docker for snapshot determinism.
# Mirrors Fresco's tests/e2e/scripts/run-e2e.sh in spirit.

# Resolve to the monorepo root so the full workspace (lockfile, sibling
# packages, pnpm-workspace.yaml) is available inside the container.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MONOREPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
cd "$MONOREPO_ROOT"

export CI=true
docker run --rm \
  -v "$(pwd)":/workspace \
  -w /workspace \
  -p 4101:4101 \
  -p 4200:4200 \
  mcr.microsoft.com/playwright:v1.59.1-jammy \
  bash -c "pnpm install --frozen-lockfile && pnpm --filter @codaco/interview test:e2e $*"
